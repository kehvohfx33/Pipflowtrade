import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { store } from '../db/store.ts';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../security/crypto.ts';
import {
  AuthenticatedRequest,
  getCookieOptions,
  rateLimit,
  requireAuth,
} from '../middleware/security.ts';
import { sendTransactionalEmail } from '../services/email.ts';
import { realtimeHub } from '../services/realtime.ts';

const router = Router();

export function getSessionTtlMs(): number {
  const raw = process.env.JWT_EXPIRES_IN?.trim() || '7d';
  const match = raw.match(/^(\d+)([smhd])?$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const val = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const mult =
    unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 1000;
  return Math.max(60000, val * mult);
}

const SESSION_TTL_MS = getSessionTtlMs();

function ensureUserRecords(userId: string, fullName: string, ts: string) {
  const db = store.snapshot();
  if (!db.user_profiles.some((p) => p.userId === userId)) {
    db.user_profiles.push({
      id: crypto.randomUUID(),
      userId,
      fullName,
      avatarUrl: null,
      country: null,
      timezone: 'UTC',
      phone: null,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  if (!db.user_roles.some((r) => r.userId === userId)) {
    db.user_roles.push({
      id: crypto.randomUUID(),
      userId,
      role: 'USER',
      assignedBy: null,
      createdAt: ts,
    });
  }
  if (!db.account_preferences.some((a) => a.userId === userId)) {
    db.account_preferences.push({
      id: crypto.randomUUID(),
      userId,
      emailNotifications: true,
      tradeAlerts: true,
      riskAlerts: true,
      compactTerminal: false,
      updatedAt: ts,
    });
  }
  if (!db.trading_preferences.some((t) => t.userId === userId)) {
    db.trading_preferences.push({
      id: crypto.randomUUID(),
      userId,
      defaultApplication: 'trader',
      preferredMode: 'DEMO',
      defaultMarket: 'R_100',
      realMoneyRiskAcknowledged: false,
      riskAcknowledgedAt: null,
      updatedAt: ts,
    });
  }
  if (!db.risk_settings.some((r) => r.userId === userId)) {
    db.risk_settings.push({
      id: crypto.randomUUID(),
      userId,
      maxStake: '25.00000000',
      maxDailyLoss: '100.00000000',
      maxTradesPerDay: 50,
      stopLossLimit: '50.00000000',
      takeProfitTarget: '250.00000000',
      maxConsecutiveLosses: 5,
      maxExposure: '200.00000000',
      sessionTimeLimitMinutes: 240,
      emergencyStopActive: false,
      updatedAt: ts,
    });
  }
  if (!db.platform_ledger_accounts.some((l) => l.userId === userId && l.currency === 'USD')) {
    const ledgerAccountId = crypto.randomUUID();
    db.platform_ledger_accounts.push({
      id: ledgerAccountId,
      userId,
      currency: 'USD',
      status: 'ACTIVE',
      createdAt: ts,
    });
    db.platform_ledger_balances.push({
      ledgerAccountId,
      availableBalance: '0.00000000',
      updatedAt: ts,
    });
  }
}

export function buildUserSessionPayload(userId: string) {
  const db = store.snapshot();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  const profile = db.user_profiles.find((p) => p.userId === userId);
  const roles = db.user_roles.filter((r) => r.userId === userId).map((r) => r.role);
  const accountPrefs = db.account_preferences.find((p) => p.userId === userId);
  const tradingPrefs = db.trading_preferences.find((p) => p.userId === userId);
  const riskSettings = db.risk_settings.find((r) => r.userId === userId);
  const derivAccounts = db.connected_deriv_accounts
    .filter((d) => d.userId === userId && d.connectionStatus !== 'DISCONNECTED')
    .map((d) => ({
      id: d.id,
      derivLoginId: d.derivLoginId,
      accountType: d.accountType,
      currency: d.currency,
      reportedBalance: d.reportedBalance,
      landingCompany: d.landingCompany,
      isActive: d.isActive,
      connectionStatus: d.connectionStatus,
      lastSyncedAt: d.lastSyncedAt,
    }));

  const ledgerAccount = db.platform_ledger_accounts.find((l) => l.userId === userId && l.currency === 'USD');
  const ledgerBalance = ledgerAccount
    ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
    : null;

  const unreadNotifications = db.notifications.filter((n) => n.userId === userId && !n.isRead).length;

  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep: user.onboardingStep,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    profile,
    roles,
    accountPreferences: accountPrefs,
    tradingPreferences: tradingPrefs,
    riskSettings,
    derivAccounts,
    activeDerivAccount: derivAccounts.find((a) => a.isActive) || derivAccounts[0] || null,
    platformLedger: {
      currency: ledgerAccount?.currency || 'USD',
      availableBalance: ledgerBalance?.availableBalance || '0.00000000',
      updatedAt: ledgerBalance?.updatedAt || user.createdAt,
    },
    unreadNotifications,
  };
}

router.post('/register', rateLimit('auth_register', 10, 15 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, confirmPassword, acceptTerms, acceptRiskDisclosure } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      acceptTerms?: boolean;
      acceptRiskDisclosure?: boolean;
    };

    const cleanName = (fullName || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (!acceptTerms || !acceptRiskDisclosure) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Risk Disclosure to register.' });
    }

    const existing = store.snapshot().users.find((u) => u.email === cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const rawSessionToken = generateSecureToken(32);
    const rawVerifyToken = generateSecureToken(24);
    const csrfToken = generateSecureToken(24);

    const userId = await store.transaction((db) => {
      const ts = new Date().toISOString();
      const id = crypto.randomUUID();
      db.users.push({
        id,
        email: cleanEmail,
        passwordHash: hashPassword(password),
        status: 'ACTIVE',
        emailVerified: false,
        emailVerificationTokenHash: hashToken(rawVerifyToken),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        onboardingCompleted: false,
        onboardingStep: 1,
        lastLoginAt: ts,
        createdAt: ts,
        updatedAt: ts,
      });

      ensureUserRecords(id, cleanName, ts);

      db.user_sessions.push({
        id: crypto.randomUUID(),
        userId: id,
        tokenHash: hashToken(rawSessionToken),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        revokedAt: null,
        createdAt: ts,
      });

      db.notifications.unshift({
        id: crypto.randomUUID(),
        userId: id,
        category: 'SECURITY',
        title: 'Welcome to PIPFLOWTRADE.SITE',
        message: 'Your PIPFLOWTRADE workspace account is active. Complete onboarding and connect your Deriv account to begin.',
        isRead: false,
        metadata: {},
        createdAt: ts,
      });

      return id;
    });

    const appUrl = process.env.APP_URL || 'https://pipflowtrade.site';
    const emailResult = await sendTransactionalEmail({
      to: cleanEmail,
      subject: 'Verify your PIPFLOWTRADE.SITE account',
      html: `<p>Welcome ${cleanName},</p><p>Verify your email using token: <strong>${rawVerifyToken}</strong> or visit ${appUrl}/auth?verify=${rawVerifyToken}</p>`,
    });

    res.cookie('pipflow_sid', rawSessionToken, getCookieOptions(SESSION_TTL_MS, true));
    res.cookie('pipflow_csrf', csrfToken, getCookieOptions(SESSION_TTL_MS, false));

    return res.status(201).json({
      ...buildUserSessionPayload(userId),
      emailVerification: {
        sent: emailResult.sent,
        message: emailResult.sent
          ? 'Verification email sent.'
          : 'Account created. Configure BREVO_API_KEY for outbound verification emails, or verify directly in Account Settings.',
      },
    });
  } catch (err) {
    console.error('[auth/register] Error:', err);
    return res.status(500).json({ error: 'Unable to complete registration. Please try again.' });
  }
});

router.post('/login', rateLimit('auth_login', 15, 15 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = store.snapshot().users.find((u) => u.email === cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed login attempts. Please try again later.',
      });
    }

    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) {
      await store.transaction((db) => {
        const target = db.users.find((u) => u.id === user.id);
        if (!target) return;
        target.failedLoginAttempts += 1;
        if (target.failedLoginAttempts >= 5) {
          target.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        target.updatedAt = new Date().toISOString();
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const rawSessionToken = generateSecureToken(32);
    const csrfToken = generateSecureToken(24);

    await store.transaction((db) => {
      const ts = new Date().toISOString();
      const target = db.users.find((u) => u.id === user.id)!;
      target.failedLoginAttempts = 0;
      target.lockedUntil = null;
      target.lastLoginAt = ts;
      target.updatedAt = ts;

      db.user_sessions.push({
        id: crypto.randomUUID(),
        userId: user.id,
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

    return res.json(buildUserSessionPayload(user.id));
  } catch (err) {
    console.error('[auth/login] Error:', err);
    return res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = req.cookies?.pipflow_sid as string | undefined;
    if (token || req.authUser) {
      const tokenHash = token ? hashToken(token) : null;
      await store.transaction((db) => {
        const ts = new Date().toISOString();
        for (const sess of db.user_sessions) {
          if ((tokenHash && sess.tokenHash === tokenHash) || (req.authUser && sess.userId === req.authUser.id)) {
            if (!sess.revokedAt) sess.revokedAt = ts;
          }
        }
        if (req.authUser) {
          for (const appSess of db.application_sessions) {
            if (appSess.userId === req.authUser.id && !appSess.revokedAt) {
              appSess.revokedAt = ts;
            }
          }
        }
      });
    }

    if (req.authUser) {
      realtimeHub.emitToUser(req.authUser.id, 'session:revoked', { reason: 'logout' });
    }

    res.clearCookie('pipflow_sid', { path: '/' });
    res.clearCookie('pipflow_csrf', { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[auth/logout] Error:', err);
    return res.status(500).json({ error: 'Failed to log out cleanly.' });
  }
});

router.post('/forgot-password', rateLimit('auth_forgot', 5, 15 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const user = store.snapshot().users.find((u) => u.email === cleanEmail);
    let emailSent = false;

    if (user) {
      const resetToken = generateSecureToken(24);
      await store.transaction((db) => {
        const target = db.users.find((u) => u.id === user.id);
        if (!target) return;
        target.passwordResetTokenHash = hashToken(resetToken);
        target.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        target.updatedAt = new Date().toISOString();
      });

      const appUrl = process.env.APP_URL || 'https://pipflowtrade.site';
      const result = await sendTransactionalEmail({
        to: cleanEmail,
        subject: 'PIPFLOWTRADE.SITE Password Reset',
        html: `<p>Use this reset token to set a new password (valid for 1 hour): <strong>${resetToken}</strong></p><p>${appUrl}/auth?reset=${resetToken}</p>`,
      });
      emailSent = result.sent;
    }

    return res.json({
      success: true,
      emailConfigured: emailSent,
      message: 'If an account matches that email, password recovery instructions have been processed.',
    });
  } catch (err) {
    console.error('[auth/forgot-password] Error:', err);
    return res.status(500).json({ error: 'Unable to process password recovery request.' });
  }
});

router.post('/reset-password', rateLimit('auth_reset', 10, 15 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { token, newPassword, confirmPassword } = req.body as {
      token?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!token || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Valid reset token and matching 8+ character password are required.' });
    }

    const tokenHash = hashToken(token.trim());
    const now = Date.now();
    const user = store
      .snapshot()
      .users.find(
        (u) =>
          u.passwordResetTokenHash === tokenHash &&
          u.passwordResetExpiresAt &&
          new Date(u.passwordResetExpiresAt).getTime() > now
      );

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    await store.transaction((db) => {
      const ts = new Date().toISOString();
      const target = db.users.find((u) => u.id === user.id)!;
      target.passwordHash = hashPassword(newPassword);
      target.passwordResetTokenHash = null;
      target.passwordResetExpiresAt = null;
      target.failedLoginAttempts = 0;
      target.lockedUntil = null;
      target.updatedAt = ts;

      for (const s of db.user_sessions) {
        if (s.userId === user.id && !s.revokedAt) s.revokedAt = ts;
      }
    });

    return res.json({ success: true, message: 'Password updated. You may now log in with your new password.' });
  } catch (err) {
    console.error('[auth/reset-password] Error:', err);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
});

router.post('/verify-email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: 'Verification token is required.' });
    const tokenHash = hashToken(token.trim());
    const user = store.snapshot().users.find((u) => u.emailVerificationTokenHash === tokenHash);
    if (!user) return res.status(400).json({ error: 'Invalid verification token.' });

    await store.transaction((db) => {
      const target = db.users.find((u) => u.id === user.id)!;
      target.emailVerified = true;
      target.emailVerificationTokenHash = null;
      target.updatedAt = new Date().toISOString();
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[auth/verify-email] Error:', err);
    return res.status(500).json({ error: 'Email verification failed.' });
  }
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Provide your current password and matching 8+ character new password.' });
    }
    if (!verifyPassword(currentPassword, req.authUser!.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await store.transaction((db) => {
      const target = db.users.find((u) => u.id === req.authUser!.id)!;
      target.passwordHash = hashPassword(newPassword);
      target.updatedAt = new Date().toISOString();
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('[auth/change-password] Error:', err);
    return res.status(500).json({ error: 'Unable to change password.' });
  }
});

router.get('/session', (req: AuthenticatedRequest, res: Response) => {
  if (!req.authUser) {
    return res.json({ authenticated: false, user: null });
  }
  const payload = buildUserSessionPayload(req.authUser.id);
  return res.json({ authenticated: true, ...payload });
});

router.post('/onboarding', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      step,
      completed,
      defaultApplication,
      preferredMode,
      defaultMarket,
      emailNotifications,
      tradeAlerts,
      riskAlerts,
      realMoneyRiskAcknowledged,
    } = req.body as {
      step?: number;
      completed?: boolean;
      defaultApplication?: 'bot' | 'trader' | 'charts' | 'options';
      preferredMode?: 'DEMO' | 'REAL';
      defaultMarket?: string;
      emailNotifications?: boolean;
      tradeAlerts?: boolean;
      riskAlerts?: boolean;
      realMoneyRiskAcknowledged?: boolean;
    };

    await store.transaction((db) => {
      const ts = new Date().toISOString();
      const user = db.users.find((u) => u.id === req.authUser!.id)!;
      if (typeof step === 'number') user.onboardingStep = Math.max(1, Math.min(6, step));
      if (typeof completed === 'boolean') user.onboardingCompleted = completed;
      user.updatedAt = ts;

      const tp = db.trading_preferences.find((t) => t.userId === user.id);
      if (tp) {
        if (defaultApplication) tp.defaultApplication = defaultApplication;
        if (preferredMode) tp.preferredMode = preferredMode;
        if (defaultMarket) tp.defaultMarket = defaultMarket;
        if (realMoneyRiskAcknowledged) {
          tp.realMoneyRiskAcknowledged = true;
          tp.riskAcknowledgedAt = ts;
        }
        tp.updatedAt = ts;
      }

      const ap = db.account_preferences.find((a) => a.userId === user.id);
      if (ap) {
        if (typeof emailNotifications === 'boolean') ap.emailNotifications = emailNotifications;
        if (typeof tradeAlerts === 'boolean') ap.tradeAlerts = tradeAlerts;
        if (typeof riskAlerts === 'boolean') ap.riskAlerts = riskAlerts;
        ap.updatedAt = ts;
      }
    });

    return res.json(buildUserSessionPayload(req.authUser!.id));
  } catch (err) {
    console.error('[auth/onboarding] Error:', err);
    return res.status(500).json({ error: 'Failed to save onboarding progress.' });
  }
});

export { ensureUserRecords };
export default router;
