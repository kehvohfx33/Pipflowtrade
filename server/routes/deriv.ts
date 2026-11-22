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
  accounts: Array<{ loginId: string; token: string; currency: string; isVirtual?: boolean; landingCompany?: string; balance?: number; scopes?: string[] }>;
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
      if (!existingToken) {
        db.encrypted_deriv_tokens.push({
          id: crypto.randomUUID(),
          derivAccountId: existing.id,
          userId: params.userId,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          scopes,
          createdAt: ts,
          updatedAt: ts,
        });
      } else {
        existingToken.ciphertext = enc.ciphertext;
        existingToken.iv = enc.iv;
        existingToken.authTag = enc.authTag;
        existingToken.scopes = scopes;
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

// 1. Official Deriv OAuth2 Redirect Initiation
router.get('/authorize', async (req: AuthenticatedRequest, res: Response) => {
  const appId = getDerivAppId();
  if (!appId) {
    return res.status(503).json({
      error: 'Deriv OAuth2 is not configured on this server (missing DERIV_APP_ID).',
      configurationRequired: ['DERIV_APP_ID', 'DERIV_OAUTH_REDIRECT_URI'],
      alternativeSupported: true,
      message:
        'Configure DERIV_APP_ID in environment variables for OAuth2 redirect, or connect an official Deriv API token via Settings / Auth.',
    });
  }

  const state = generateSecureToken(24);
  const intent = req.authUser ? 'CONNECT' : 'LOGIN';
  await store.transaction((db) => {
    const ts = new Date().toISOString();
    db.oauth_states.push({
      state,
      userId: req.authUser?.id || null,
      intent,
      createdAt: ts,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  });

  const oauthBase = process.env.DERIV_OAUTH_URL?.trim() || 'https://oauth.deriv.com/oauth2/authorize';
  const configuredRedirect = process.env.DERIV_OAUTH_REDIRECT_URI?.trim();
  const baseOrigin =
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    `${req.protocol}://${req.get('host')}`;
  const redirectUri = configuredRedirect || `${baseOrigin.replace(/\/$/, '')}/api/deriv/callback`;

  const url = new URL(oauthBase);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('l', 'EN');
  url.searchParams.set('brand', 'deriv');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  return res.json({ redirectUrl: url.toString(), state });
});

// 2. Official Deriv OAuth2 Callback (reusable for /api/deriv/callback, /auth/callback, and root ?)
export async function handleDerivOAuthCallback(req: AuthenticatedRequest, res: Response) {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const db = store.snapshot();

    if (state) {
      const stateRecord = db.oauth_states.find(
        (s) => s.state === state && new Date(s.expiresAt).getTime() > Date.now()
      );
      if (!stateRecord) {
        return res.redirect('/#/auth?oauth_error=Invalid+or+expired+Deriv+OAuth+state');
      }
    }

    // Parse Deriv standard OAuth2 query params: acct1, token1, cur1, acct2, token2, cur2 ...
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

    // Verify primary token live against Deriv WebSocket API
    const primaryAuth = await executeEphemeralDerivCall(
      { authorizeOnly: true },
      rawAccounts[0].token
    );
    const derivAuth = primaryAuth?.authorize;
    if (!derivAuth?.loginid) {
      return res.redirect('/#/auth?oauth_error=Deriv+token+verification+failed');
    }

    const verifiedAccounts = rawAccounts.map((ra, idx) => ({
      loginId: ra.loginId,
      token: ra.token,
      currency: ra.currency,
      isVirtual: ra.loginId.startsWith('VRTC') || (idx === 0 && Boolean(derivAuth.is_virtual)),
      landingCompany: idx === 0 ? String(derivAuth.landing_company_name || '') : undefined,
      balance: idx === 0 ? Number(derivAuth.balance ?? 0) : undefined,
      scopes: Array.isArray(derivAuth.scopes) ? derivAuth.scopes : undefined,
    }));

    let targetUserId = req.authUser?.id || null;
    if (!targetUserId && state) {
      const stateRecord = db.oauth_states.find((s) => s.state === state);
      if (stateRecord?.userId) targetUserId = stateRecord.userId;
    }

    // If logging in directly via Deriv OAuth without an existing PIPFLOWTRADE session
    if (!targetUserId) {
      const linked = db.connected_deriv_accounts.find(
        (d) => d.derivLoginId === derivAuth.loginid
      );
      const derivEmail = String(derivAuth.email || `${derivAuth.loginid.toLowerCase()}@deriv-oauth.local`).toLowerCase();
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
              emailVerified: Boolean(derivAuth.email),
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
            ensureUserRecords(uid, String(derivAuth.fullname || derivAuth.loginid), ts);
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

    const resp = await executeEphemeralDerivCall({ balance: 1, account: active.derivLoginId }, derivToken);
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
      derivToken
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
      derivToken
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
