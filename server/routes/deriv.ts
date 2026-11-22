import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { store } from '../db/store.ts';
import {
  decryptSecret,
  encryptSecret,
  generateSecureToken,
  hashPassword,
  hashToken,
} from '../security/crypto.ts';
import {
  AuthenticatedRequest,
  getCookieOptions,
  rateLimit,
  requireAuth,
} from '../middleware/security.ts';
import {
  derivMarketFeed,
  executeEphemeralDerivCall,
  fetchDerivAccountsViaRest,
  getDerivAppId,
} from '../services/deriv-ws.ts';
import { validateTradeAgainstRisk } from '../services/risk.ts';
import { realtimeHub } from '../services/realtime.ts';
import { buildUserSessionPayload, ensureUserRecords, getSessionTtlMs } from './auth.ts';
import { AppId, TradingMode } from '../types.ts';

const router = Router();
const SESSION_TTL_MS = getSessionTtlMs();

function inferAccountType(loginId: string, isVirtual?: number | boolean): TradingMode {
  if (isVirtual === 1 || isVirtual === true || loginId.toUpperCase().startsWith('VRTC')) {
    return 'DEMO';
  }
  return 'REAL';
}

async function persistAuthorizedDerivAccounts(params: {
  userId: string;
  accounts: Array<{
    loginId: string;
    token: string;
    currency: string;
    isVirtual?: boolean;
    landingCompany?: string;
    balance?: number;
    scopes?: string[];
    authMethod?: 'OAUTH_PKCE' | 'LEGACY_WS';
  }>;
}) {
  const ts = new Date().toISOString();
  await store.transaction((db) => {
    const hasActiveAlready = db.connected_deriv_accounts.some(
      (a) => a.userId === params.userId && a.isActive && a.connectionStatus === 'CONNECTED'
    );

    params.accounts.forEach((acc, idx) => {
      const accountType = inferAccountType(acc.loginId, acc.isVirtual);
      let existing = db.connected_deriv_accounts.find(
        (d) => d.userId === params.userId && d.derivLoginId === acc.loginId
      );

      if (!existing) {
        existing = {
          id: crypto.randomUUID(),
          userId: params.userId,
          derivLoginId: acc.loginId,
          accountType,
          currency: acc.currency || 'USD',
          reportedBalance: Number(acc.balance ?? 0).toFixed(8),
          landingCompany: acc.landingCompany || null,
          isActive: !hasActiveAlready && idx === 0,
          connectionStatus: 'CONNECTED',
          lastSyncedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        };
        db.connected_deriv_accounts.push(existing);
      } else {
        existing.accountType = accountType;
        existing.currency = acc.currency || existing.currency;
        if (typeof acc.balance === 'number') {
          existing.reportedBalance = acc.balance.toFixed(8);
        }
        existing.landingCompany = acc.landingCompany || existing.landingCompany;
        existing.connectionStatus = 'CONNECTED';
        existing.lastSyncedAt = ts;
        existing.updatedAt = ts;
        if (!hasActiveAlready && idx === 0) {
          existing.isActive = true;
        }
      }

      const enc = encryptSecret(acc.token);
      const existingToken = db.encrypted_deriv_tokens.find((t) => t.derivAccountId === existing!.id);
      const scopes = acc.scopes?.join(',') || process.env.DERIV_OAUTH_SCOPE || 'read,trade,trading_information';
      const authMethod = acc.authMethod || 'LEGACY_WS';
      if (!existingToken) {
        db.encrypted_deriv_tokens.push({
          id: crypto.randomUUID(),
          derivAccountId: existing.id,
          userId: params.userId,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          scopes,
          authMethod,
          createdAt: ts,
          updatedAt: ts,
        });
      } else {
        existingToken.ciphertext = enc.ciphertext;
        existingToken.iv = enc.iv;
        existingToken.authTag = enc.authTag;
        existingToken.scopes = scopes;
        existingToken.authMethod = authMethod;
        existingToken.updatedAt = ts;
      }
    });

    db.notifications.unshift({
      id: crypto.randomUUID(),
      userId: params.userId,
      category: 'CONNECTION',
      title: 'Deriv Account Connected',
      message: `Verified and encrypted ${params.accounts.length} Deriv account${params.accounts.length > 1 ? 's' : ''}.`,
      isRead: false,
      metadata: { loginIds: params.accounts.map((a) => a.loginId) },
      createdAt: ts,
    });
  });
}

function resolveOAuthClientId(): string | null {
  return process.env.DERIV_OAUTH_CLIENT_ID?.trim() || getDerivAppId();
}

function resolveDerivOAuthEndpoints(): {
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  isModernOidc: boolean;
} {
  const isStaging =
    process.env.DERIV_ENV?.trim().toLowerCase() === 'staging' ||
    (process.env.DERIV_OAUTH_URL || '').includes('staging');

  const defaultAuth = isStaging
    ? 'https://staging-auth.deriv.com/oauth2/auth'
    : 'https://auth.deriv.com/oauth2/auth';
  const defaultToken = isStaging
    ? 'https://staging-auth.deriv.com/oauth2/token'
    : 'https://auth.deriv.com/oauth2/token';
  const defaultUserInfo = isStaging
    ? 'https://staging-auth.deriv.com/userinfo'
    : 'https://auth.deriv.com/userinfo';

  let rawAuth = process.env.DERIV_OAUTH_URL?.trim() || defaultAuth;
  try {
    const parsed = new URL(rawAuth);
    // Deriv retired oauth.deriv.com/oauth2/authorize (it now 302-redirects to deriv.com marketing homepage)
    // and auth.deriv.com/oauth2/authorize returns 404; official endpoint is /oauth2/auth.
    if (
      parsed.hostname === 'oauth.deriv.com' ||
      parsed.hostname === 'deriv.com' ||
      parsed.hostname === 'www.deriv.com'
    ) {
      rawAuth = defaultAuth;
    } else if (
      (parsed.hostname === 'auth.deriv.com' || parsed.hostname === 'staging-auth.deriv.com') &&
      (parsed.pathname === '/' || parsed.pathname === '/oauth2/authorize')
    ) {
      parsed.pathname = '/oauth2/auth';
      rawAuth = parsed.toString();
    }
  } catch {
    rawAuth = defaultAuth;
  }

  const finalParsed = new URL(rawAuth);
  const isModernOidc =
    finalParsed.hostname === 'auth.deriv.com' || finalParsed.hostname === 'staging-auth.deriv.com';

  return {
    authUrl: rawAuth,
    tokenUrl: process.env.DERIV_TOKEN_URL?.trim() || defaultToken,
    userinfoUrl: process.env.DERIV_USERINFO_URL?.trim() || defaultUserInfo,
    isModernOidc,
  };
}

function resolveDerivOAuthScope(): string {
  const raw = process.env.DERIV_OAUTH_SCOPE?.trim();
  if (!raw) return 'trade';

  const modernValid = new Set([
    'trade',
    'account_manage',
    'payment',
    'application_read',
    'openid',
    'offline',
    'offline_access',
  ]);
  const mapped = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s === 'payments' ? 'payment' : s))
    .filter((s) => modernValid.has(s));

  return mapped.length > 0 ? Array.from(new Set(mapped)).join(' ') : 'trade';
}

function resolveRedirectUri(req: Request): string {
  const configuredRedirect = process.env.DERIV_OAUTH_REDIRECT_URI?.trim();
  if (configuredRedirect) return configuredRedirect;
  const baseOrigin =
    process.env.APP_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    `${req.protocol}://${req.get('host')}`;
  return `${baseOrigin.replace(/\/$/, '')}/api/deriv/callback`;
}

// 1. Official Deriv OAuth2 Redirect Initiation (PKCE via auth.deriv.com/oauth2/auth)
router.get('/authorize', async (req: AuthenticatedRequest, res: Response) => {
  const clientId = resolveOAuthClientId();
  if (!clientId) {
    return res.status(503).json({
      error: 'Deriv OAuth2 is not configured on this server (missing DERIV_APP_ID / DERIV_OAUTH_CLIENT_ID).',
      configurationRequired: ['DERIV_APP_ID', 'DERIV_OAUTH_REDIRECT_URI'],
      alternativeSupported: true,
      message:
        'Configure DERIV_APP_ID (your Deriv OAuth2 Client ID) in environment variables, or connect an official Deriv API token via Settings / Auth.',
    });
  }

  const state = generateSecureToken(24);
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const redirectUri = resolveRedirectUri(req);
  const intent = req.authUser ? 'CONNECT' : 'LOGIN';

  await store.transaction((db) => {
    const nowMs = Date.now();
    const ts = new Date(nowMs).toISOString();
    db.oauth_states = db.oauth_states.filter((s) => new Date(s.expiresAt).getTime() > nowMs);
    db.oauth_states.push({
      state,
      userId: req.authUser?.id || null,
      intent,
      codeVerifier,
      redirectUri,
      createdAt: ts,
      expiresAt: new Date(nowMs + 10 * 60 * 1000).toISOString(),
    });
  });

  const { authUrl, isModernOidc } = resolveDerivOAuthEndpoints();
  const url = new URL(authUrl);

  if (isModernOidc) {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', resolveDerivOAuthScope());
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  } else {
    url.searchParams.set('app_id', clientId);
    url.searchParams.set('l', 'EN');
    url.searchParams.set('brand', 'deriv');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
  }

  return res.json({ redirectUrl: url.toString(), state });
});

// 2. Official Deriv OAuth2 Callback (reusable for /api/deriv/callback, /auth/callback, /oauth/callback, and /)
export async function handleDerivOAuthCallback(req: AuthenticatedRequest, res: Response) {
  try {
    if (typeof req.query.error === 'string' && req.query.error) {
      const desc = typeof req.query.error_description === 'string' ? req.query.error_description : req.query.error;
      return res.redirect(`/#/auth?oauth_error=${encodeURIComponent(desc)}`);
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const db = store.snapshot();
    const stateRecord = state
      ? db.oauth_states.find((s) => s.state === state && new Date(s.expiresAt).getTime() > Date.now())
      : undefined;

    if (state && !stateRecord) {
      return res.redirect('/#/auth?oauth_error=Invalid+or+expired+Deriv+OAuth+state.+Please+try+again.');
    }

    let verifiedAccounts: Array<{
      loginId: string;
      token: string;
      currency: string;
      isVirtual?: boolean;
      landingCompany?: string;
      balance?: number;
      scopes?: string[];
      authMethod: 'OAUTH_PKCE' | 'LEGACY_WS';
    }> = [];
    let derivEmail = '';
    let derivFullName = '';

    // Branch A: Modern Deriv OAuth2 Authorization Code + PKCE (`auth.deriv.com`)
    if (typeof req.query.code === 'string' && req.query.code) {
      const clientId = resolveOAuthClientId();
      if (!clientId) {
        return res.redirect('/#/auth?oauth_error=DERIV_APP_ID+is+not+configured');
      }

      const { tokenUrl, userinfoUrl } = resolveDerivOAuthEndpoints();
      const redirectUri = stateRecord?.redirectUri || resolveRedirectUri(req);
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: req.query.code,
        redirect_uri: redirectUri,
        client_id: clientId,
      });
      if (stateRecord?.codeVerifier) {
        bodyParams.set('code_verifier', stateRecord.codeVerifier);
      }
      if (process.env.DERIV_CLIENT_SECRET?.trim()) {
        bodyParams.set('client_secret', process.env.DERIV_CLIENT_SECRET.trim());
      }

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyParams.toString(),
      });
      const tokenJson = (await tokenRes.json().catch(() => ({}))) as any;
      if (!tokenRes.ok || !tokenJson?.access_token) {
        const msg = tokenJson?.error_description || tokenJson?.error || `Deriv OAuth code exchange failed (${tokenRes.status})`;
        return res.redirect(`/#/auth?oauth_error=${encodeURIComponent(msg)}`);
      }

      const accessToken = String(tokenJson.access_token);
      const restAccounts = await fetchDerivAccountsViaRest(accessToken);
      if (restAccounts.length === 0) {
        return res.redirect('/#/auth?oauth_error=No+Deriv+accounts+returned+from+Deriv+API');
      }

      // Optional OIDC userinfo lookup for real email/full name (official endpoint is /userinfo)
      try {
        const userinfoRes = await fetch(userinfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userinfoRes.ok) {
          const ui = (await userinfoRes.json()) as any;
          if (ui?.email) derivEmail = String(ui.email).toLowerCase();
          if (ui?.name) derivFullName = String(ui.name);
        }
      } catch {
        // userinfo is optional
      }

      const scopes = typeof tokenJson.scope === 'string' ? tokenJson.scope.split(/\s+/).filter(Boolean) : undefined;
      verifiedAccounts = restAccounts.map((a: any) => {
        const loginId = String(a.account_id || a.loginid || a.id);
        const isDemo = Boolean(
          a.account_type === 'demo' || a.is_virtual || loginId.toUpperCase().startsWith('VRTC')
        );
        return {
          loginId,
          token: accessToken,
          currency: String(a.currency || 'USD'),
          isVirtual: isDemo,
          landingCompany: a.landing_company ? String(a.landing_company) : undefined,
          balance: typeof a.balance === 'number' || typeof a.balance === 'string' ? Number(a.balance) : 0,
          scopes,
          authMethod: 'OAUTH_PKCE' as const,
        };
      });
    } else {
      // Branch B: Classic Deriv OAuth2 (`acct1`, `token1`, `cur1` ...)
      const rawAccounts: Array<{ loginId: string; token: string; currency: string }> = [];
      for (let i = 1; i <= 15; i += 1) {
        const acct = req.query[`acct${i}`];
        const tok = req.query[`token${i}`];
        const cur = req.query[`cur${i}`];
        if (typeof acct === 'string' && typeof tok === 'string' && acct && tok) {
          rawAccounts.push({
            loginId: acct,
            token: tok,
            currency: typeof cur === 'string' && cur ? cur : 'USD',
          });
        }
      }

      if (rawAccounts.length === 0) {
        return res.redirect('/#/auth?oauth_error=No+Deriv+accounts+returned+from+authorization');
      }

      const primaryAuth = await executeEphemeralDerivCall({ authorizeOnly: true }, rawAccounts[0].token);
      const derivAuth = primaryAuth?.authorize;
      if (!derivAuth?.loginid) {
        return res.redirect('/#/auth?oauth_error=Deriv+token+verification+failed');
      }

      derivEmail = String(derivAuth.email || '').toLowerCase();
      derivFullName = String(derivAuth.fullname || '');

      verifiedAccounts = rawAccounts.map((ra, idx) => ({
        loginId: ra.loginId,
        token: ra.token,
        currency: ra.currency,
        isVirtual: ra.loginId.startsWith('VRTC') || (idx === 0 && Boolean(derivAuth.is_virtual)),
        landingCompany: idx === 0 ? String(derivAuth.landing_company_name || '') : undefined,
        balance: idx === 0 ? Number(derivAuth.balance ?? 0) : undefined,
        scopes: Array.isArray(derivAuth.scopes) ? derivAuth.scopes : undefined,
        authMethod: 'LEGACY_WS' as const,
      }));
    }

    const primaryLoginId = verifiedAccounts[0].loginId;
    if (!derivEmail) {
      derivEmail = `${primaryLoginId.toLowerCase()}@deriv-oauth.local`;
    }
    if (!derivFullName) {
      derivFullName = primaryLoginId;
    }

    let targetUserId = req.authUser?.id || stateRecord?.userId || null;

    if (!targetUserId) {
      const linked = db.connected_deriv_accounts.find(
        (d) => verifiedAccounts.some((va) => va.loginId === d.derivLoginId)
      );
      if (linked) {
        targetUserId = linked.userId;
      } else {
        const byEmail = db.users.find((u) => u.email === derivEmail);
        if (byEmail) {
          targetUserId = byEmail.id;
        } else {
          targetUserId = await store.transaction((txDb) => {
            const ts = new Date().toISOString();
            const uid = crypto.randomUUID();
            txDb.users.push({
              id: uid,
              email: derivEmail,
              passwordHash: hashPassword(generateSecureToken(32)),
              status: 'ACTIVE',
              emailVerified: !derivEmail.endsWith('@deriv-oauth.local'),
              emailVerificationTokenHash: null,
              passwordResetTokenHash: null,
              passwordResetExpiresAt: null,
              failedLoginAttempts: 0,
              lockedUntil: null,
              onboardingCompleted: false,
              onboardingStep: 3,
              lastLoginAt: ts,
              createdAt: ts,
              updatedAt: ts,
            });
            ensureUserRecords(uid, derivFullName, ts);
            return uid;
          });
        }
      }

      const rawSessionToken = generateSecureToken(32);
      const csrfToken = generateSecureToken(24);
      await store.transaction((txDb) => {
        const ts = new Date().toISOString();
        txDb.user_sessions.push({
          id: crypto.randomUUID(),
          userId: targetUserId!,
          tokenHash: hashToken(rawSessionToken),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
          revokedAt: null,
          createdAt: ts,
        });
      });
      res.cookie('pipflow_sid', rawSessionToken, getCookieOptions(SESSION_TTL_MS, true));
      res.cookie('pipflow_csrf', csrfToken, getCookieOptions(SESSION_TTL_MS, false));
    }

    if (state) {
      await store.transaction((txDb) => {
        txDb.oauth_states = txDb.oauth_states.filter((s) => s.state !== state);
      });
    }

    await persistAuthorizedDerivAccounts({ userId: targetUserId, accounts: verifiedAccounts });

    const userRecord = store.snapshot().users.find((u) => u.id === targetUserId);
    const dest = userRecord?.onboardingCompleted ? '/#/dashboard' : '/#/onboarding';
    return res.redirect(dest);
  } catch (err: any) {
    console.error('[deriv/callback] Error:', err);
    return res.redirect(`/#/auth?oauth_error=${encodeURIComponent(err?.message || 'Deriv OAuth callback error')}`);
  }
}

router.get('/callback', handleDerivOAuthCallback);

// 3. Connect Official Deriv API Token (Verified Live via Deriv WebSocket `authorize`)
router.post('/connect-token', rateLimit('deriv_token', 10, 15 * 60 * 1000), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { apiToken } = req.body as { apiToken?: string };
    const cleanToken = (apiToken || '').trim();
    if (cleanToken.length < 8) {
      return res.status(400).json({ error: 'Please provide a valid Deriv API token from app.deriv.com/account/api-token.' });
    }

    const authResp = await executeEphemeralDerivCall({ authorizeOnly: true }, cleanToken);
    const auth = authResp?.authorize;
    if (!auth?.loginid) {
      return res.status(401).json({ error: 'Deriv rejected the API token.' });
    }

    let userId = req.authUser?.id || null;
    if (!userId) {
      const db = store.snapshot();
      const linked = db.connected_deriv_accounts.find((d) => d.derivLoginId === auth.loginid);
      const email = String(auth.email || `${auth.loginid.toLowerCase()}@deriv-user.local`).toLowerCase();
      if (linked) {
        userId = linked.userId;
      } else {
        const existingUser = db.users.find((u) => u.email === email);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          userId = await store.transaction((txDb) => {
            const ts = new Date().toISOString();
            const uid = crypto.randomUUID();
            txDb.users.push({
              id: uid,
              email,
              passwordHash: hashPassword(generateSecureToken(32)),
              status: 'ACTIVE',
              emailVerified: Boolean(auth.email),
              emailVerificationTokenHash: null,
              passwordResetTokenHash: null,
              passwordResetExpiresAt: null,
              failedLoginAttempts: 0,
              lockedUntil: null,
              onboardingCompleted: false,
              onboardingStep: 3,
              lastLoginAt: ts,
              createdAt: ts,
              updatedAt: ts,
            });
            ensureUserRecords(uid, String(auth.fullname || auth.loginid), ts);
            return uid;
          });
        }
      }

      const rawSessionToken = generateSecureToken(32);
      const csrfToken = generateSecureToken(24);
      await store.transaction((txDb) => {
        txDb.user_sessions.push({
          id: crypto.randomUUID(),
          userId: userId!,
          tokenHash: hashToken(rawSessionToken),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
          revokedAt: null,
          createdAt: new Date().toISOString(),
        });
      });
      res.cookie('pipflow_sid', rawSessionToken, getCookieOptions(SESSION_TTL_MS, true));
      res.cookie('pipflow_csrf', csrfToken, getCookieOptions(SESSION_TTL_MS, false));
    }

    const accountList = Array.isArray(auth.account_list) && auth.account_list.length > 0
      ? auth.account_list
          .filter((a: any) => !a.is_disabled)
          .map((a: any) => ({
            loginId: String(a.loginid),
            token: cleanToken,
            currency: String(a.currency || auth.currency || 'USD'),
            isVirtual: Boolean(a.is_virtual),
            landingCompany: String(a.landing_company_name || auth.landing_company_name || ''),
            balance: a.loginid === auth.loginid ? Number(auth.balance ?? 0) : undefined,
            scopes: Array.isArray(auth.scopes) ? auth.scopes : undefined,
          }))
      : [
          {
            loginId: String(auth.loginid),
            token: cleanToken,
            currency: String(auth.currency || 'USD'),
            isVirtual: Boolean(auth.is_virtual),
            landingCompany: String(auth.landing_company_name || ''),
            balance: Number(auth.balance ?? 0),
            scopes: Array.isArray(auth.scopes) ? auth.scopes : undefined,
          },
        ];

    await persistAuthorizedDerivAccounts({ userId, accounts: accountList });
    realtimeHub.emitToUser(userId, 'deriv:connected', { loginId: auth.loginid });

    return res.json(buildUserSessionPayload(userId));
  } catch (err: any) {
    console.error('[deriv/connect-token] Error:', err);
    return res.status(400).json({ error: err?.message || 'Unable to verify Deriv API token.' });
  }
});

// 4. List Connected Deriv Accounts
router.get('/accounts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const accounts = store
    .snapshot()
    .connected_deriv_accounts.filter(
      (a) => a.userId === req.authUser!.id && a.connectionStatus !== 'DISCONNECTED'
    );
  return res.json({ accounts });
});

// 5. Refresh Authoritative Deriv Balance Live from Deriv API
router.get('/balance', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = store.snapshot();
    const active =
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.isActive && a.connectionStatus === 'CONNECTED'
      ) ||
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.connectionStatus === 'CONNECTED'
      );

    if (!active) {
      return res.json({ connected: false, balance: null, message: 'No connected Deriv account.' });
    }

    const tokenRow = db.encrypted_deriv_tokens.find((t) => t.derivAccountId === active.id);
    if (!tokenRow) {
      return res.status(400).json({ error: 'Encrypted Deriv credentials missing for this account.' });
    }

    const derivToken = decryptSecret({
      ciphertext: tokenRow.ciphertext,
      iv: tokenRow.iv,
      authTag: tokenRow.authTag,
    });

    const resp = await executeEphemeralDerivCall(
      { balance: 1, account: active.derivLoginId },
      derivToken,
      15000,
      {
        accountId: active.derivLoginId,
        accountType: active.accountType,
        authMethod: tokenRow.authMethod,
      }
    );
    const liveBalance = Number(resp?.balance?.balance ?? resp?.authorize?.balance ?? active.reportedBalance);
    const currency = String(resp?.balance?.currency || active.currency);

    await store.transaction((txDb) => {
      const target = txDb.connected_deriv_accounts.find((a) => a.id === active.id);
      if (target) {
        target.reportedBalance = liveBalance.toFixed(8);
        target.currency = currency;
        target.lastSyncedAt = new Date().toISOString();
        target.updatedAt = new Date().toISOString();
      }
    });

    realtimeHub.emitToUser(req.authUser!.id, 'balance:deriv_synced', {
      derivAccountId: active.id,
      derivLoginId: active.derivLoginId,
      balance: liveBalance.toFixed(8),
      currency,
    });

    return res.json({
      connected: true,
      derivAccountId: active.id,
      derivLoginId: active.derivLoginId,
      accountType: active.accountType,
      currency,
      balance: liveBalance.toFixed(8),
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[deriv/balance] Error:', err);
    return res.status(502).json({ error: err?.message || 'Unable to sync balance from Deriv.' });
  }
});

// 6. Select Active Deriv Account (Demo / Real switching)
router.post('/select-account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { derivAccountId } = req.body as { derivAccountId?: string };
    const db = store.snapshot();
    const target = db.connected_deriv_accounts.find(
      (a) => a.id === derivAccountId && a.userId === req.authUser!.id && a.connectionStatus === 'CONNECTED'
    );
    if (!target) {
      return res.status(404).json({ error: 'Deriv account not found.' });
    }

    if (target.accountType === 'REAL') {
      const prefs = db.trading_preferences.find((p) => p.userId === req.authUser!.id);
      if (!prefs?.realMoneyRiskAcknowledged) {
        return res.status(403).json({
          error: 'Real-money trading requires risk acknowledgement first. Please acknowledge financial risk in Onboarding or Account Settings.',
          requiresRiskAcknowledgement: true,
        });
      }
    }

    await store.transaction((txDb) => {
      const ts = new Date().toISOString();
      for (const acc of txDb.connected_deriv_accounts) {
        if (acc.userId === req.authUser!.id) {
          acc.isActive = acc.id === target.id;
          acc.updatedAt = ts;
        }
      }
      const tp = txDb.trading_preferences.find((p) => p.userId === req.authUser!.id);
      if (tp) {
        tp.preferredMode = target.accountType;
        tp.updatedAt = ts;
      }
    });

    return res.json(buildUserSessionPayload(req.authUser!.id));
  } catch (err) {
    console.error('[deriv/select-account] Error:', err);
    return res.status(500).json({ error: 'Unable to switch Deriv account.' });
  }
});

// 7. Disconnect Deriv Account
router.post('/disconnect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { derivAccountId } = req.body as { derivAccountId?: string };
    await store.transaction((db) => {
      const ts = new Date().toISOString();
      for (const acc of db.connected_deriv_accounts) {
        if (acc.userId === req.authUser!.id && (!derivAccountId || acc.id === derivAccountId)) {
          acc.connectionStatus = 'DISCONNECTED';
          acc.isActive = false;
          acc.updatedAt = ts;
        }
      }
      db.encrypted_deriv_tokens = db.encrypted_deriv_tokens.filter(
        (t) => !(t.userId === req.authUser!.id && (!derivAccountId || t.derivAccountId === derivAccountId))
      );
      db.notifications.unshift({
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        category: 'CONNECTION',
        title: 'Deriv Account Disconnected',
        message: 'Encrypted Deriv credentials were revoked and removed.',
        isRead: false,
        metadata: {},
        createdAt: ts,
      });
    });

    return res.json(buildUserSessionPayload(req.authUser!.id));
  } catch (err) {
    console.error('[deriv/disconnect] Error:', err);
    return res.status(500).json({ error: 'Unable to disconnect Deriv account.' });
  }
});

// 8. Public Market Candles & Active Symbols (Live Deriv API Data)
router.get('/candles', async (req: Request, res: Response) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : 'R_100';
    const granularity = Math.min(86400, Math.max(60, Number(req.query.granularity) || 60));
    const count = Math.min(500, Math.max(20, Number(req.query.count) || 120));

    derivMarketFeed.ensureSymbolSubscribed(symbol);
    const resp = await derivMarketFeed.request({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      granularity,
      style: 'candles',
    });

    return res.json({
      symbol,
      granularity,
      candles: Array.isArray(resp?.candles) ? resp.candles : [],
      feedStatus: derivMarketFeed.status,
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Unable to retrieve Deriv candle data.' });
  }
});

router.get('/ticks/latest', (_req: Request, res: Response) => {
  return res.json({
    feedStatus: derivMarketFeed.status,
    ticks: derivMarketFeed.getLatestTicks(),
  });
});

// Cached Deriv active symbols list with verified fallback
let cachedSymbols: Array<{ symbol: string; display_name: string; market: string; submarket_display_name?: string }> = [];
let symbolsFetchedAt = 0;

const VERIFIED_CORE_SYMBOLS = [
  { symbol: 'R_100', display_name: 'Volatility 100 Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: 'R_50', display_name: 'Volatility 50 Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: 'R_25', display_name: 'Volatility 25 Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: 'R_10', display_name: 'Volatility 10 Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index', market: 'synthetic_index', submarket_display_name: 'Continuous Indices' },
  { symbol: 'frxEURUSD', display_name: 'EUR/USD', market: 'forex', submarket_display_name: 'Major Pairs' },
  { symbol: 'frxGBPUSD', display_name: 'GBP/USD', market: 'forex', submarket_display_name: 'Major Pairs' },
  { symbol: 'frxUSDJPY', display_name: 'USD/JPY', market: 'forex', submarket_display_name: 'Major Pairs' },
  { symbol: 'cryBTCUSD', display_name: 'BTC/USD', market: 'cryptocurrency', submarket_display_name: 'Crypto' },
];

router.get('/symbols', async (_req: Request, res: Response) => {
  if (cachedSymbols.length > 0 && Date.now() - symbolsFetchedAt < 5 * 60 * 1000) {
    return res.json({ symbols: cachedSymbols, source: 'deriv_cache' });
  }
  try {
    const resp = await derivMarketFeed.request({ active_symbols: 'brief', product_type: 'basic' }, 8000);
    if (Array.isArray(resp?.active_symbols) && resp.active_symbols.length > 0) {
      cachedSymbols = resp.active_symbols
        .filter((s: any) => !s.is_trading_suspended)
        .slice(0, 60)
        .map((s: any) => ({
          symbol: String(s.symbol),
          display_name: String(s.display_name || s.symbol),
          market: String(s.market || 'synthetic_index'),
          submarket_display_name: s.submarket_display_name ? String(s.submarket_display_name) : undefined,
        }));
      symbolsFetchedAt = Date.now();
      return res.json({ symbols: cachedSymbols, source: 'deriv_live' });
    }
  } catch {
    // Fall back to verified core Deriv symbols when upstream active_symbols query is unavailable
  }
  return res.json({ symbols: VERIFIED_CORE_SYMBOLS, source: 'deriv_core_registry' });
});

router.get('/portfolio', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = store.snapshot();
    const active =
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.isActive && a.connectionStatus === 'CONNECTED'
      ) ||
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.connectionStatus === 'CONNECTED'
      );

    if (!active) {
      return res.json({ connected: false, contracts: [], localOpenTrades: [] });
    }

    const tokenRow = db.encrypted_deriv_tokens.find((t) => t.derivAccountId === active.id);
    if (!tokenRow) {
      return res.json({ connected: false, contracts: [], localOpenTrades: [] });
    }

    const derivToken = decryptSecret({
      ciphertext: tokenRow.ciphertext,
      iv: tokenRow.iv,
      authTag: tokenRow.authTag,
    });

    const portfolioResp = await executeEphemeralDerivCall(
      { portfolio: 1 },
      derivToken,
      15000,
      {
        accountId: active.derivLoginId,
        accountType: active.accountType,
        authMethod: tokenRow.authMethod,
      }
    );

    const contracts = Array.isArray(portfolioResp?.portfolio?.contracts)
      ? portfolioResp.portfolio.contracts
      : [];

    return res.json({
      connected: true,
      derivLoginId: active.derivLoginId,
      accountType: active.accountType,
      contracts,
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Unable to fetch open Deriv portfolio.' });
  }
});

// 9. Risk-Validated Trade Proposal & Execution via Authenticated Deriv API
router.post('/trade/execute', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { appId, symbol, contractType, stake, duration, durationUnit } = req.body as {
      appId?: AppId;
      symbol?: string;
      contractType?: string;
      stake?: number;
      duration?: number;
      durationUnit?: 't' | 's' | 'm' | 'h' | 'd';
    };

    const targetApp: AppId = appId || 'trader';
    const cleanSymbol = (symbol || 'R_100').trim();
    const cleanContract = (contractType || 'CALL').trim().toUpperCase();
    const numStake = Number(stake);
    const numDuration = Number(duration || 5);
    const unit = durationUnit || 't';

    const db = store.snapshot();
    const appReg = db.application_registry.find((a) => a.id === targetApp);
    if (appReg?.maintenanceMode) {
      return res.status(503).json({
        error: appReg.maintenanceMessage || `${appReg.name} is temporarily paused for maintenance.`,
      });
    }
    if (appReg && Array.isArray(appReg.restrictedUserIds) && appReg.restrictedUserIds.includes(req.authUser!.id)) {
      return res.status(403).json({ error: `Your account is restricted from executing via ${appReg.name}.` });
    }

    const active =
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.isActive && a.connectionStatus === 'CONNECTED'
      ) ||
      db.connected_deriv_accounts.find(
        (a) => a.userId === req.authUser!.id && a.connectionStatus === 'CONNECTED'
      );

    if (!active) {
      return res.status(400).json({ error: 'Connect an active Deriv account before executing trades.' });
    }

    const tokenRow = db.encrypted_deriv_tokens.find((t) => t.derivAccountId === active.id);
    if (!tokenRow) {
      return res.status(400).json({ error: 'No encrypted Deriv token found for active account.' });
    }

    const riskCheck = validateTradeAgainstRisk({
      userId: req.authUser!.id,
      appId: targetApp,
      stake: numStake,
      availableBalance: Number(active.reportedBalance),
      mode: active.accountType,
    });

    if (!riskCheck.allowed) {
      await store.transaction((txDb) => {
        txDb.notifications.unshift({
          id: crypto.randomUUID(),
          userId: req.authUser!.id,
          category: 'RISK',
          title: 'Trade Blocked by Risk Guard',
          message: riskCheck.reasons[0],
          isRead: false,
          metadata: { reasons: riskCheck.reasons, appId: targetApp },
          createdAt: new Date().toISOString(),
        });
      });
      return res.status(403).json({
        error: riskCheck.reasons[0],
        reasons: riskCheck.reasons,
      });
    }

    const derivToken = decryptSecret({
      ciphertext: tokenRow.ciphertext,
      iv: tokenRow.iv,
      authTag: tokenRow.authTag,
    });

    const accountHint = {
      accountId: active.derivLoginId,
      accountType: active.accountType,
      authMethod: tokenRow.authMethod,
    };

    // Step A: Request authoritative proposal from Deriv
    const proposalResp = await executeEphemeralDerivCall(
      {
        proposal: 1,
        amount: numStake,
        basis: 'stake',
        contract_type: cleanContract,
        currency: active.currency,
        duration: numDuration,
        duration_unit: unit,
        symbol: cleanSymbol,
      },
      derivToken,
      15000,
      accountHint
    );

    const proposal = proposalResp?.proposal;
    if (!proposal?.id) {
      return res.status(502).json({ error: 'Deriv did not return a valid contract proposal.' });
    }

    // Step B: Execute buy on Deriv
    const buyResp = await executeEphemeralDerivCall(
      {
        buy: proposal.id,
        price: numStake,
      },
      derivToken,
      15000,
      accountHint
    );

    const buy = buyResp?.buy;
    if (!buy?.contract_id) {
      return res.status(502).json({ error: 'Deriv did not confirm contract execution.' });
    }

    const ts = new Date().toISOString();
    const tradeId = crypto.randomUUID();
    const balanceAfter = Number(buy.balance_after ?? Number(active.reportedBalance) - numStake);

    await store.transaction((txDb) => {
      const targetAcc = txDb.connected_deriv_accounts.find((a) => a.id === active.id);
      if (targetAcc) {
        targetAcc.reportedBalance = balanceAfter.toFixed(8);
        targetAcc.lastSyncedAt = ts;
        targetAcc.updatedAt = ts;
      }

      txDb.trades.unshift({
        id: tradeId,
        userId: req.authUser!.id,
        derivAccountId: active.id,
        appId: targetApp,
        derivContractId: String(buy.contract_id),
        symbol: cleanSymbol,
        contractType: cleanContract,
        stake: Number(buy.buy_price ?? numStake).toFixed(8),
        payout: Number(buy.payout ?? proposal.payout ?? 0).toFixed(8),
        profit: null,
        currency: active.currency,
        mode: active.accountType,
        status: 'OPEN',
        openedAt: ts,
        settledAt: null,
      });

      txDb.transactions.unshift({
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        source: 'DERIV',
        referenceId: String(buy.contract_id),
        actionType: `TRADE_${cleanContract}`,
        amount: (-Number(buy.buy_price ?? numStake)).toFixed(8),
        currency: active.currency,
        balanceAfter: balanceAfter.toFixed(8),
        description: `${cleanContract} on ${cleanSymbol} via ${targetApp.toUpperCase()}`,
        createdAt: ts,
      });

      txDb.notifications.unshift({
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        category: 'TRADE',
        title: `Contract #${buy.contract_id} Opened`,
        message: `${cleanContract} ${cleanSymbol} for ${Number(buy.buy_price ?? numStake).toFixed(2)} ${active.currency} (${active.accountType})`,
        isRead: false,
        metadata: { contractId: buy.contract_id, appId: targetApp },
        createdAt: ts,
      });
    });

    realtimeHub.emitToUser(req.authUser!.id, 'trade:executed', {
      tradeId,
      contractId: buy.contract_id,
      balanceAfter: balanceAfter.toFixed(8),
    });

    return res.json({
      success: true,
      tradeId,
      contractId: buy.contract_id,
      buyPrice: buy.buy_price,
      payout: buy.payout,
      balanceAfter: balanceAfter.toFixed(8),
      currency: active.currency,
    });
  } catch (err: any) {
    console.error('[deriv/trade/execute] Error:', err);
    return res.status(502).json({ error: err?.message || 'Trade execution failed at Deriv.' });
  }
});

export default router;
