import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { addDecimal, store, subtractDecimal } from '../db/store.ts';
import {
  decryptSecret,
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../security/crypto.ts';
import {
  AuthenticatedRequest,
  getCookieOptions,
  rateLimit,
  requireAdminAuth,
} from '../middleware/security.ts';
import { derivMarketFeed, executeEphemeralDerivCall } from '../services/deriv-ws.ts';
import { realtimeHub } from '../services/realtime.ts';
import { AdminRole, AppId, LedgerAdjustmentType } from '../types.ts';

const router = Router();
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function recordAudit(params: {
  adminId: string | null;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  const db = store.snapshot();
  db.admin_audit_logs.unshift({
    id: crypto.randomUUID(),
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details || {},
    ipAddress: params.ipAddress || null,
    createdAt: new Date().toISOString(),
  });
}

// 1. Private Administrator Authentication
router.post('/authenticate', rateLimit('admin_auth', 8, 15 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { email, password, mfaCode } = req.body as {
      email?: string;
      password?: string;
      mfaCode?: string;
    };

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Administrator email and password are required.' });
    }

    const db = store.snapshot();
    if (db.administrator_accounts.length === 0) {
      return res.status(503).json({
        error:
          'No administrator account is provisioned on this server. Configure ADMIN_EMAIL and ADMIN_PASSWORD environment variables.',
      });
    }

    const admin = db.administrator_accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!admin || admin.status !== 'ACTIVE' || !verifyPassword(password, admin.passwordHash)) {
      await store.transaction(() => {
        recordAudit({
          adminId: admin?.id || null,
          adminEmail: cleanEmail,
          action: 'ADMIN_LOGIN_FAILED',
          targetType: 'administrator_accounts',
          targetId: admin?.id || null,
          ipAddress: req.ip || null,
        });
      });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    const envMfaSecret = process.env.ADMIN_MFA_SECRET?.trim();
    if (admin.mfaEnabled && envMfaSecret) {
      if (!mfaCode || mfaCode.trim() !== envMfaSecret) {
        return res.status(401).json({
          error: 'Administrator MFA verification code is required or invalid.',
          mfaRequired: true,
        });
      }
    }

    const rawAdminToken = generateSecureToken(32);
    await store.transaction((txDb) => {
      const ts = new Date().toISOString();
      const target = txDb.administrator_accounts.find((a) => a.id === admin.id)!;
      target.lastAuthenticatedAt = ts;
      target.updatedAt = ts;

      txDb.administrator_sessions.push({
        id: crypto.randomUUID(),
        adminId: admin.id,
        tokenHash: hashToken(rawAdminToken),
        mfaVerified: Boolean(!admin.mfaEnabled || envMfaSecret),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString(),
        revokedAt: null,
        createdAt: ts,
      });

      recordAudit({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'ADMIN_LOGIN_SUCCESS',
        targetType: 'administrator_sessions',
        targetId: admin.id,
        ipAddress: req.ip || null,
      });
    });

    res.cookie('pipflow_admin_sid', rawAdminToken, getCookieOptions(ADMIN_SESSION_TTL_MS, true));
    return res.json({
      authenticated: true,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        mfaEnabled: admin.mfaEnabled,
      },
    });
  } catch (err) {
    console.error('[private-admin/authenticate] Error:', err);
    return res.status(500).json({ error: 'Administrator authentication failed.' });
  }
});

router.post('/logout', requireAdminAuth(), async (req: AuthenticatedRequest, res: Response) => {
  await store.transaction((db) => {
    const target = db.administrator_sessions.find((s) => s.id === req.adminSessionId);
    if (target) target.revokedAt = new Date().toISOString();
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'ADMIN_LOGOUT',
      targetType: 'administrator_sessions',
      targetId: req.adminSessionId || null,
      ipAddress: req.ip || null,
    });
  });
  res.clearCookie('pipflow_admin_sid', { path: '/' });
  return res.json({ success: true });
});

router.get('/session', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    authenticated: true,
    admin: {
      id: req.adminAccount!.id,
      email: req.adminAccount!.email,
      role: req.adminAccount!.role,
      mfaEnabled: req.adminAccount!.mfaEnabled,
      lastAuthenticatedAt: req.adminAccount!.lastAuthenticatedAt,
    },
  });
});

// 2. Admin Dashboard Overview (Genuine DB Metrics & Health)
router.get('/dashboard', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const now = Date.now();
  const connectedDeriv = db.connected_deriv_accounts.filter((d) => d.connectionStatus === 'CONNECTED');
  const openTrades = db.trades.filter((t) => t.status === 'OPEN').length;
  const closedTrades = db.trades.filter((t) => t.status !== 'OPEN').length;
  const realTrades = db.trades.filter((t) => t.mode === 'REAL').length;
  const demoTrades = db.trades.filter((t) => t.mode === 'DEMO').length;

  const appUsage = (['bot', 'trader', 'charts', 'options'] as AppId[]).map((appId) => {
    const sessions = db.application_sessions.filter((s) => s.appId === appId).length;
    const trades = db.trades.filter((t) => t.appId === appId).length;
    const appReg = db.application_registry.find((a) => a.id === appId);
    return {
      appId,
      name: appReg?.name || appId,
      sessions,
      trades,
      healthStatus: appReg?.healthStatus || 'UNKNOWN',
      maintenanceMode: Boolean(appReg?.maintenanceMode),
    };
  });

  const commissionSummary = {
    estimated: db.commission_records
      .filter((c) => c.source === 'ESTIMATED')
      .reduce((sum, c) => sum + Number(c.amount || 0), 0)
      .toFixed(2),
    confirmed: db.commission_records
      .filter((c) => c.source === 'CONFIRMED' || c.source === 'PARTNER_REPORT')
      .reduce((sum, c) => sum + Number(c.amount || 0), 0)
      .toFixed(2),
    pendingCount: db.commission_records.filter((c) => c.status === 'PENDING').length,
    totalRecords: db.commission_records.length,
  };

  return res.json({
    metrics: {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.status === 'ACTIVE').length,
      suspendedUsers: db.users.filter((u) => u.status === 'SUSPENDED').length,
      verifiedUsers: db.users.filter((u) => u.emailVerified).length,
      connectedDerivAccounts: connectedDeriv.length,
      realDerivAccounts: connectedDeriv.filter((d) => d.accountType === 'REAL').length,
      demoDerivAccounts: connectedDeriv.filter((d) => d.accountType === 'DEMO').length,
      activeUserSessions: db.user_sessions.filter(
        (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now
      ).length,
      activeAppSessions: db.application_sessions.filter(
        (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now
      ).length,
      totalTrades: db.trades.length,
      openTrades,
      closedTrades,
      realTrades,
      demoTrades,
      runningBots: db.bot_strategies.filter((b) => b.status === 'RUNNING').length,
      totalBots: db.bot_strategies.length,
      openSupportTickets: db.support_tickets.filter((t) => t.status === 'OPEN').length,
    },
    appUsage,
    commissionSummary,
    systemHealth: {
      databaseStatus: 'ONLINE',
      derivWsStatus: derivMarketFeed.status,
      brevoConfigured: Boolean(process.env.BREVO_API_KEY?.trim()),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      derivOAuthConfigured: Boolean(process.env.DERIV_APP_ID?.trim()),
    },
    applications: db.application_registry,
    recentAuditLogs: db.admin_audit_logs.slice(0, 25),
  });
});

// 3. User Management (with plan + app restriction controls)
router.get('/users', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || '').trim().toUpperCase();
  const db = store.snapshot();

  const users = db.users
    .map((u) => {
      const profile = db.user_profiles.find((p) => p.userId === u.id);
      const roles = db.user_roles.filter((r) => r.userId === u.id).map((r) => r.role);
      const derivAccounts = db.connected_deriv_accounts.filter(
        (d) => d.userId === u.id && d.connectionStatus !== 'DISCONNECTED'
      );
      const ledgerAccount = db.platform_ledger_accounts.find(
        (l) => l.userId === u.id && l.currency === 'USD'
      );
      const ledgerBalance = ledgerAccount
        ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
        : null;
      const sub = db.user_subscriptions.find((s) => s.userId === u.id && s.status === 'ACTIVE');
      const plan =
        (sub ? db.plans.find((p) => p.id === sub.planId) : null) ||
        db.plans.find((p) => p.slug === 'starter');
      const restrictedApps = db.application_registry
        .filter((a) => Array.isArray(a.restrictedUserIds) && a.restrictedUserIds.includes(u.id))
        .map((a) => a.id);

      return {
        id: u.id,
        email: u.email,
        fullName: profile?.fullName || u.email,
        status: u.status,
        emailVerified: u.emailVerified,
        onboardingCompleted: u.onboardingCompleted,
        roles,
        planId: plan?.id || 'plan-starter',
        planName: plan?.name || 'Starter Workspace',
        planExpiresAt: sub?.expiresAt || null,
        restrictedApps,
        connectedDerivCount: derivAccounts.length,
        activeDerivAccount: derivAccounts.find((a) => a.isActive) || derivAccounts[0] || null,
        platformLedgerBalance: ledgerBalance?.availableBalance || '0.00000000',
        platformLedgerStatus: ledgerAccount?.status || 'ACTIVE',
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      };
    })
    .filter((u) => {
      if (statusFilter && statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });

  return res.json({ users });
});

router.get('/users/:id', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const profile = db.user_profiles.find((p) => p.userId === user.id);
  const roles = db.user_roles.filter((r) => r.userId === user.id);
  const derivAccounts = db.connected_deriv_accounts.filter((d) => d.userId === user.id);
  const riskSettings = db.risk_settings.find((r) => r.userId === user.id);
  const ledgerAccount = db.platform_ledger_accounts.find((l) => l.userId === user.id && l.currency === 'USD');
  const ledgerBalance = ledgerAccount
    ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
    : null;
  const recentTrades = db.trades.filter((t) => t.userId === user.id).slice(0, 20);
  const sessions = db.user_sessions.filter((s) => s.userId === user.id && !s.revokedAt);

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      onboardingCompleted: user.onboardingCompleted,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    profile,
    roles,
    derivAccounts,
    riskSettings,
    platformLedgerBalance: ledgerBalance?.availableBalance || '0.00000000',
    platformLedgerStatus: ledgerAccount?.status || 'ACTIVE',
    recentTrades,
    sessions,
  });
});

router.patch('/users/:id/status', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { status, reason } = req.body as { status?: 'ACTIVE' | 'SUSPENDED'; reason?: string };
  if (!status || !['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
  }

  const user = store.snapshot().users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await store.transaction((db) => {
    const ts = new Date().toISOString();
    const target = db.users.find((u) => u.id === user.id)!;
    target.status = status;
    target.updatedAt = ts;

    if (status === 'SUSPENDED') {
      for (const s of db.user_sessions) {
        if (s.userId === user.id && !s.revokedAt) s.revokedAt = ts;
      }
      for (const b of db.bot_strategies) {
        if (b.userId === user.id && b.status === 'RUNNING') {
          b.status = 'STOPPED';
          b.updatedAt = ts;
        }
      }
    }

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      targetType: 'users',
      targetId: user.id,
      details: { reason: reason || null },
      ipAddress: req.ip || null,
    });
  });

  if (status === 'SUSPENDED') {
    realtimeHub.emitToUser(user.id, 'session:revoked', { reason: 'suspended' });
  }

  return res.json({ success: true, status });
});

router.patch('/users/:id/role', requireAdminAuth(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { role } = req.body as { role?: 'USER' | 'SUPPORT' | 'ADMIN' };
  if (!role || !['USER', 'SUPPORT', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Permitted roles: USER, SUPPORT, ADMIN.' });
  }
  const user = store.snapshot().users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await store.transaction((db) => {
    const ts = new Date().toISOString();
    db.user_roles = db.user_roles.filter((r) => r.userId !== user.id);
    db.user_roles.push({
      id: crypto.randomUUID(),
      userId: user.id,
      role,
      assignedBy: req.adminAccount!.id,
      createdAt: ts,
    });
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'USER_ROLE_UPDATED',
      targetType: 'user_roles',
      targetId: user.id,
      details: { role },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ success: true, role });
});

router.patch('/users/:id/plan', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { planId, expiresAt } = req.body as { planId?: string; expiresAt?: string | null };
  const db = store.snapshot();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const plan = db.plans.find((p) => p.id === planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  await store.transaction((txDb) => {
    const ts = new Date().toISOString();
    for (const s of txDb.user_subscriptions) {
      if (s.userId === user.id && s.status === 'ACTIVE') {
        s.status = 'CANCELLED';
        s.updatedAt = ts;
      }
    }
    txDb.user_subscriptions.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expiresAt: expiresAt || null,
      assignedByAdminId: req.adminAccount!.id,
      createdAt: ts,
      updatedAt: ts,
    });
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'USER_PLAN_ASSIGNED',
      targetType: 'user_subscriptions',
      targetId: user.id,
      details: { planId: plan.id, planName: plan.name, expiresAt: expiresAt || null },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ success: true, planId: plan.id });
});

router.patch('/users/:id/app-restrictions', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'APP_MANAGER']), async (req: AuthenticatedRequest, res: Response) => {
  const { restrictedApps } = req.body as { restrictedApps?: AppId[] };
  if (!Array.isArray(restrictedApps)) {
    return res.status(400).json({ error: 'restrictedApps array is required.' });
  }
  const user = store.snapshot().users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await store.transaction((txDb) => {
    const ts = new Date().toISOString();
    for (const app of txDb.application_registry) {
      const current = new Set(app.restrictedUserIds || []);
      if (restrictedApps.includes(app.id)) {
        current.add(user.id);
      } else {
        current.delete(user.id);
      }
      app.restrictedUserIds = Array.from(current);
      app.updatedAt = ts;
    }
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'USER_APP_RESTRICTIONS_UPDATED',
      targetType: 'application_registry',
      targetId: user.id,
      details: { restrictedApps },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ success: true, restrictedApps });
});

// 4. Dual Balance Controls (Deriv Sync Read-Only vs PIPFLOWTRADE Demo Wallet Ledger)
router.get('/balances', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const list = db.users.map((u) => {
    const profile = db.user_profiles.find((p) => p.userId === u.id);
    const ledgerAccount = db.platform_ledger_accounts.find((l) => l.userId === u.id && l.currency === 'USD');
    const ledgerBalance = ledgerAccount
      ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
      : null;
    const derivList = db.connected_deriv_accounts.filter(
      (d) => d.userId === u.id && d.connectionStatus !== 'DISCONNECTED'
    );
    const activeDeriv = derivList.find((d) => d.isActive) || derivList[0] || null;
    const realDeriv = derivList.find((d) => d.accountType === 'REAL') || null;
    const demoDeriv = derivList.find((d) => d.accountType === 'DEMO') || null;

    return {
      userId: u.id,
      email: u.email,
      fullName: profile?.fullName || u.email,
      ledgerAccountId: ledgerAccount?.id || null,
      currency: ledgerAccount?.currency || 'USD',
      ledgerStatus: ledgerAccount?.status || 'ACTIVE',
      platformLedgerBalance: ledgerBalance?.availableBalance || '0.00000000',
      derivLoginId: activeDeriv?.derivLoginId || null,
      derivAccountType: activeDeriv?.accountType || null,
      derivReportedBalance: activeDeriv?.reportedBalance || null,
      realDerivLoginId: realDeriv?.derivLoginId || null,
      realDerivBalance: realDeriv?.reportedBalance || null,
      realDerivLastSync: realDeriv?.lastSyncedAt || null,
      demoDerivLoginId: demoDeriv?.derivLoginId || null,
      demoDerivBalance: demoDeriv?.reportedBalance || null,
      demoDerivLastSync: demoDeriv?.lastSyncedAt || null,
      updatedAt: ledgerBalance?.updatedAt || u.updatedAt,
    };
  });

  const derivAccounts = db.connected_deriv_accounts
    .filter((d) => d.connectionStatus !== 'DISCONNECTED')
    .map((d) => {
      const u = db.users.find((user) => user.id === d.userId);
      const profile = db.user_profiles.find((p) => p.userId === d.userId);
      return {
        ...d,
        userEmail: u?.email || d.userId,
        userName: profile?.fullName || u?.email || d.userId,
      };
    });

  return res.json({ balances: list, derivAccounts });
});

router.post('/balances/adjust', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, entryType, amount, currency, reason, reverseEntryId } = req.body as {
      userId?: string;
      entryType?: LedgerAdjustmentType;
      amount?: number | string;
      currency?: string;
      reason?: string;
      reverseEntryId?: string;
    };

    const allowedTypes: LedgerAdjustmentType[] = [
      'CREDIT',
      'DEBIT',
      'SET_BALANCE',
      'RESET',
      'FREEZE',
      'UNFREEZE',
      'REVERSAL',
    ];
    if (!userId || !entryType || !allowedTypes.includes(entryType)) {
      return res.status(400).json({ error: 'Valid userId and adjustment type are required.' });
    }
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 4) {
      return res.status(400).json({ error: 'A detailed adjustment reason (min 4 characters) is required for audit compliance.' });
    }

    const cleanCurrency = (currency || 'USD').toUpperCase();
    const db = store.snapshot();
    const targetUser = db.users.find((u) => u.id === userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    let numericAmount = Number(amount ?? 0);

    if (entryType === 'REVERSAL') {
      const orig = db.platform_ledger_entries.find((e) => e.id === reverseEntryId && e.userId === userId);
      if (!orig) {
        return res.status(404).json({ error: 'Original ledger entry to reverse was not found.' });
      }
      const alreadyReversed = db.platform_ledger_entries.some((e) => e.reversedEntryId === orig.id);
      if (alreadyReversed) {
        return res.status(409).json({ error: 'This ledger entry has already been reversed.' });
      }
      numericAmount = Number(orig.amount);
    }

    if ((entryType === 'CREDIT' || entryType === 'DEBIT' || entryType === 'REVERSAL') && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      return res.status(400).json({ error: 'Adjustment amount must be greater than zero.' });
    }
    if (entryType === 'SET_BALANCE' && (!Number.isFinite(numericAmount) || numericAmount < 0)) {
      return res.status(400).json({ error: 'Target balance must be zero or positive.' });
    }

    const entryResult = await store.transaction((txDb) => {
      const ts = new Date().toISOString();
      let ledgerAcc = txDb.platform_ledger_accounts.find(
        (l) => l.userId === userId && l.currency === cleanCurrency
      );
      if (!ledgerAcc) {
        ledgerAcc = {
          id: crypto.randomUUID(),
          userId,
          currency: cleanCurrency,
          status: 'ACTIVE',
          createdAt: ts,
        };
        txDb.platform_ledger_accounts.push(ledgerAcc);
        txDb.platform_ledger_balances.push({
          ledgerAccountId: ledgerAcc.id,
          availableBalance: '0.00000000',
          updatedAt: ts,
        });
      }

      const balRow = txDb.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAcc!.id)!;
      const prevBal = balRow.availableBalance;
      let newBal = prevBal;
      let loggedAmount = numericAmount;

      if (entryType === 'FREEZE') {
        ledgerAcc.status = 'FROZEN';
        loggedAmount = 0;
      } else if (entryType === 'UNFREEZE') {
        ledgerAcc.status = 'ACTIVE';
        loggedAmount = 0;
      } else {
        if (ledgerAcc.status === 'FROZEN') {
          throw new Error('This PIPFLOWTRADE Simulated Demo Wallet is currently FROZEN. Unfreeze it before altering balance.');
        }
        if (entryType === 'CREDIT') {
          newBal = addDecimal(prevBal, numericAmount);
        } else if (entryType === 'DEBIT') {
          newBal = subtractDecimal(prevBal, numericAmount);
        } else if (entryType === 'SET_BALANCE') {
          newBal = numericAmount.toFixed(8);
          loggedAmount = Math.abs(numericAmount - Number(prevBal));
        } else if (entryType === 'RESET') {
          newBal = '0.00000000';
          loggedAmount = Number(prevBal);
        } else if (entryType === 'REVERSAL') {
          const orig = txDb.platform_ledger_entries.find((e) => e.id === reverseEntryId);
          newBal = orig?.entryType === 'DEBIT' ? addDecimal(prevBal, numericAmount) : subtractDecimal(prevBal, numericAmount);
        }
      }

      if (Number(newBal) < 0) {
        throw new Error(`Insufficient platform demo wallet balance (${Number(prevBal).toFixed(2)} ${cleanCurrency}) for debit.`);
      }

      const requestId = crypto.randomUUID();
      txDb.balance_adjustment_requests.unshift({
        id: requestId,
        userId,
        ledgerAccountId: ledgerAcc.id,
        requestedByAdminId: req.adminAccount!.id,
        entryType,
        amount: loggedAmount.toFixed(8),
        currency: cleanCurrency,
        reason: cleanReason,
        referenceEntryId: reverseEntryId || null,
        status: 'APPROVED',
        createdAt: ts,
      });

      txDb.balance_approvals.unshift({
        id: crypto.randomUUID(),
        adjustmentRequestId: requestId,
        approvedByAdminId: req.adminAccount!.id,
        decision: 'APPROVED',
        notes: cleanReason,
        createdAt: ts,
      });

      const entry = {
        id: crypto.randomUUID(),
        ledgerAccountId: ledgerAcc.id,
        userId,
        adminId: req.adminAccount!.id,
        adminEmail: req.adminAccount!.email,
        adjustmentRequestId: requestId,
        entryType,
        amount: loggedAmount.toFixed(8),
        currency: cleanCurrency,
        previousBalance: prevBal,
        newBalance: newBal,
        reason: cleanReason,
        reversedEntryId: reverseEntryId || null,
        createdAt: ts,
      };
      txDb.platform_ledger_entries.unshift(entry);
      balRow.availableBalance = newBal;
      balRow.updatedAt = ts;

      const delta = Number(newBal) - Number(prevBal);
      txDb.transactions.unshift({
        id: crypto.randomUUID(),
        userId,
        source: 'PLATFORM_LEDGER',
        referenceId: entry.id,
        actionType: `LEDGER_${entryType}`,
        amount: delta.toFixed(8),
        currency: cleanCurrency,
        balanceAfter: newBal,
        description: `Simulated Demo Wallet ${entryType}: ${cleanReason}`,
        createdAt: ts,
      });

      txDb.notifications.unshift({
        id: crypto.randomUUID(),
        userId,
        category: 'LEDGER',
        title: `Platform Demo Wallet ${entryType}`,
        message: `${entryType}: ${cleanReason}. Platform Demo Wallet balance: ${Number(newBal).toFixed(2)} ${cleanCurrency}.`,
        isRead: false,
        metadata: { entryId: entry.id, newBalance: newBal, status: ledgerAcc.status },
        createdAt: ts,
      });

      recordAudit({
        adminId: req.adminAccount!.id,
        adminEmail: req.adminAccount!.email,
        action: `LEDGER_${entryType}`,
        targetType: 'platform_ledger_entries',
        targetId: entry.id,
        details: {
          userId,
          amount: loggedAmount.toFixed(8),
          currency: cleanCurrency,
          previousBalance: prevBal,
          newBalance: newBal,
          walletStatus: ledgerAcc.status,
          reason: cleanReason,
          reversedEntryId: reverseEntryId || null,
        },
        ipAddress: req.ip || null,
      });

      return entry;
    });

    realtimeHub.emitToUser(userId, 'balance:ledger_updated', {
      currency: entryResult.currency,
      availableBalance: entryResult.newBalance,
      entry: entryResult,
    });

    return res.json({ success: true, entry: entryResult });
  } catch (err: any) {
    console.error('[private-admin/balances/adjust] Error:', err);
    return res.status(400).json({ error: err?.message || 'Unable to process platform demo wallet adjustment.' });
  }
});

router.post('/balances/:userId/sync-deriv', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = store.snapshot();
    const userId = req.params.userId;
    const derivAccount =
      db.connected_deriv_accounts.find(
        (d) => d.userId === userId && d.isActive && d.connectionStatus === 'CONNECTED'
      ) ||
      db.connected_deriv_accounts.find(
        (d) => d.userId === userId && d.connectionStatus === 'CONNECTED'
      );

    if (!derivAccount) {
      return res.status(404).json({ error: 'No connected Deriv account found for this user.' });
    }

    const tokenRow = db.encrypted_deriv_tokens.find((t) => t.derivAccountId === derivAccount.id);
    if (!tokenRow) {
      return res.status(400).json({ error: 'Encrypted Deriv credentials missing for this user.' });
    }

    const derivToken = decryptSecret({
      ciphertext: tokenRow.ciphertext,
      iv: tokenRow.iv,
      authTag: tokenRow.authTag,
    });

    const resp = await executeEphemeralDerivCall(
      { balance: 1, account: derivAccount.derivLoginId },
      derivToken,
      15000,
      {
        accountId: derivAccount.derivLoginId,
        accountType: derivAccount.accountType,
        authMethod: tokenRow.authMethod,
      }
    );

    const liveBalance = Number(resp?.balance?.balance ?? resp?.authorize?.balance ?? derivAccount.reportedBalance);
    const currency = String(resp?.balance?.currency || derivAccount.currency);
    const ts = new Date().toISOString();

    await store.transaction((txDb) => {
      const target = txDb.connected_deriv_accounts.find((a) => a.id === derivAccount.id);
      if (target) {
        target.reportedBalance = liveBalance.toFixed(8);
        target.currency = currency;
        target.lastSyncedAt = ts;
        target.updatedAt = ts;
      }
      recordAudit({
        adminId: req.adminAccount!.id,
        adminEmail: req.adminAccount!.email,
        action: 'DERIV_BALANCE_SYNCED',
        targetType: 'connected_deriv_accounts',
        targetId: derivAccount.id,
        details: { userId, loginId: derivAccount.derivLoginId, liveBalance, currency },
        ipAddress: req.ip || null,
      });
    });

    realtimeHub.emitToUser(userId, 'balance:deriv_synced', {
      derivAccountId: derivAccount.id,
      derivLoginId: derivAccount.derivLoginId,
      balance: liveBalance.toFixed(8),
      currency,
    });

    return res.json({
      success: true,
      derivLoginId: derivAccount.derivLoginId,
      accountType: derivAccount.accountType,
      currency,
      balance: liveBalance.toFixed(8),
      lastSyncedAt: ts,
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Unable to sync balance from Deriv API.' });
  }
});

router.get('/balances/:userId/history', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const entries = store
    .snapshot()
    .platform_ledger_entries.filter((e) => e.userId === req.params.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ entries });
});

// 5. Application Registry & Governance
router.get('/applications', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ applications: store.snapshot().application_registry });
});

router.patch('/applications/:appId', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'APP_MANAGER']), async (req: AuthenticatedRequest, res: Response) => {
  const appId = req.params.appId as AppId;
  const {
    name,
    subtitle,
    description,
    productionUrl,
    vercelProjectRef,
    vercelDeploymentUrl,
    visibility,
    maintenanceMode,
    maintenanceMessage,
    ssoEnabled,
    iframeCompatible,
    planRestrictions,
    healthCheckEnabled,
  } = req.body as Record<string, any>;

  const app = store.snapshot().application_registry.find((a) => a.id === appId);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  await store.transaction((db) => {
    const target = db.application_registry.find((a) => a.id === appId)!;
    if (typeof name === 'string' && name.trim()) target.name = name.trim();
    if (typeof subtitle === 'string') target.subtitle = subtitle.trim();
    if (typeof description === 'string' && description.trim()) target.description = description.trim();
    if (typeof productionUrl === 'string' && productionUrl.startsWith('https://')) {
      target.productionUrl = productionUrl.trim();
    }
    if (typeof vercelProjectRef === 'string' && vercelProjectRef.trim()) {
      target.vercelProjectRef = vercelProjectRef.trim();
    }
    if (vercelDeploymentUrl === null || vercelDeploymentUrl === '') {
      target.vercelDeploymentUrl = null;
    } else if (typeof vercelDeploymentUrl === 'string' && vercelDeploymentUrl.startsWith('https://')) {
      target.vercelDeploymentUrl = vercelDeploymentUrl.trim();
    }
    if (visibility && ['PUBLIC', 'PRIVATE', 'HIDDEN'].includes(visibility)) {
      target.visibility = visibility;
    }
    if (typeof maintenanceMode === 'boolean') target.maintenanceMode = maintenanceMode;
    if (typeof maintenanceMessage === 'string') target.maintenanceMessage = maintenanceMessage.trim() || null;
    if (typeof ssoEnabled === 'boolean') target.ssoEnabled = ssoEnabled;
    if (typeof iframeCompatible === 'boolean') target.iframeCompatible = iframeCompatible;
    if (Array.isArray(planRestrictions)) target.planRestrictions = planRestrictions;
    if (typeof healthCheckEnabled === 'boolean') target.healthCheckEnabled = healthCheckEnabled;
    target.updatedAt = new Date().toISOString();

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'APP_CONFIG_UPDATED',
      targetType: 'application_registry',
      targetId: appId,
      details: {
        name: target.name,
        productionUrl: target.productionUrl,
        visibility: target.visibility,
        maintenanceMode: target.maintenanceMode,
        ssoEnabled: target.ssoEnabled,
      },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ application: store.snapshot().application_registry.find((a) => a.id === appId) });
});

// 6. Consolidated Multi-App Trading Management
router.get('/trading/contracts', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const appId = String(req.query.appId || '').trim();
  const mode = String(req.query.mode || '').trim().toUpperCase();
  const status = String(req.query.status || '').trim().toUpperCase();
  const userId = String(req.query.userId || '').trim();
  const contractType = String(req.query.contractType || '').trim().toUpperCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  const contracts = db.trades
    .map((t) => {
      const user = db.users.find((u) => u.id === t.userId);
      return {
        ...t,
        userEmail: user?.email || t.userId,
      };
    })
    .filter((t) => {
      if (appId && appId !== 'ALL' && t.appId !== appId) return false;
      if (mode && mode !== 'ALL' && t.mode !== mode) return false;
      if (status && status !== 'ALL' && t.status !== status) return false;
      if (userId && t.userId !== userId) return false;
      if (contractType && contractType !== 'ALL' && t.contractType !== contractType) return false;
      if (q) {
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.userEmail.toLowerCase().includes(q) ||
          String(t.derivContractId || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  return res.json({
    contracts: contracts.slice(0, 300),
    summary: {
      total: contracts.length,
      realCount: contracts.filter((c) => c.mode === 'REAL').length,
      demoCount: contracts.filter((c) => c.mode === 'DEMO').length,
      openCount: contracts.filter((c) => c.status === 'OPEN').length,
      realStakeVolume: contracts
        .filter((c) => c.mode === 'REAL')
        .reduce((s, c) => s + Number(c.stake || 0), 0)
        .toFixed(2),
      demoStakeVolume: contracts
        .filter((c) => c.mode === 'DEMO')
        .reduce((s, c) => s + Number(c.stake || 0), 0)
        .toFixed(2),
    },
  });
});

// 7. Bot Management & Emergency Controls
router.get('/bots', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const bots = db.bot_strategies.map((b) => {
    const user = db.users.find((u) => u.id === b.userId);
    const logsCount = db.bot_execution_logs.filter((l) => l.botId === b.id).length;
    return {
      ...b,
      userEmail: user?.email || b.userId,
      logsCount,
    };
  });
  return res.json({ bots });
});

router.patch('/bots/:id/action', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'APP_MANAGER']), async (req: AuthenticatedRequest, res: Response) => {
  const { action, reason } = req.body as {
    action?: 'SUSPEND' | 'STOP' | 'ENABLE' | 'EMERGENCY_STOP';
    reason?: string;
  };
  if (!action || !['SUSPEND', 'STOP', 'ENABLE', 'EMERGENCY_STOP'].includes(action)) {
    return res.status(400).json({ error: 'Valid action (SUSPEND, STOP, ENABLE, EMERGENCY_STOP) is required.' });
  }
  const bot = store.snapshot().bot_strategies.find((b) => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot strategy not found.' });

  await store.transaction((txDb) => {
    const ts = new Date().toISOString();
    const target = txDb.bot_strategies.find((b) => b.id === bot.id)!;
    if (action === 'SUSPEND') target.status = 'SUSPENDED';
    if (action === 'STOP' || action === 'EMERGENCY_STOP') target.status = 'STOPPED';
    if (action === 'ENABLE') target.status = 'IDLE';
    target.updatedAt = ts;

    if (action === 'EMERGENCY_STOP') {
      const risk = txDb.risk_settings.find((r) => r.userId === target.userId);
      if (risk) {
        risk.emergencyStopActive = true;
        risk.updatedAt = ts;
      }
    }

    txDb.bot_execution_logs.unshift({
      id: crypto.randomUUID(),
      botId: target.id,
      userId: target.userId,
      level: action === 'ENABLE' ? 'INFO' : 'WARN',
      message: `Admin (${req.adminAccount!.email}) executed ${action}${reason ? `: ${reason}` : '.'}`,
      createdAt: ts,
    });

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: `BOT_${action}`,
      targetType: 'bot_strategies',
      targetId: target.id,
      details: { userId: target.userId, reason: reason || null },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ success: true });
});

router.get('/bots/:id/logs', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const logs = store
    .snapshot()
    .bot_execution_logs.filter((l) => l.botId === req.params.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ logs });
});

// 8. Commission Reporting (No invented revenues: separates Estimated / Confirmed / Partner Reports)
router.get('/commissions', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const appFilter = String(req.query.appId || '').trim();
  const sourceFilter = String(req.query.source || '').trim().toUpperCase();

  const records = db.commission_records
    .filter((c) => {
      if (appFilter && appFilter !== 'ALL' && c.appId !== appFilter) return false;
      if (sourceFilter && sourceFilter !== 'ALL' && c.source !== sourceFilter) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json({
    records,
    summary: {
      estimatedTotal: records
        .filter((r) => r.source === 'ESTIMATED')
        .reduce((s, r) => s + Number(r.amount || 0), 0)
        .toFixed(2),
      confirmedTotal: records
        .filter((r) => r.source === 'CONFIRMED' || r.source === 'PARTNER_REPORT')
        .reduce((s, r) => s + Number(r.amount || 0), 0)
        .toFixed(2),
      pendingReconciliation: records.filter((r) => r.status === 'PENDING').length,
      byApp: (['bot', 'trader', 'charts', 'options'] as AppId[]).map((id) => ({
        appId: id,
        total: records
          .filter((r) => r.appId === id)
          .reduce((s, r) => s + Number(r.amount || 0), 0)
          .toFixed(2),
        count: records.filter((r) => r.appId === id).length,
      })),
    },
  });
});

router.post('/commissions', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { userId, appId, tradeId, source, amount, currency, status, periodDate, notes } = req.body as Record<string, any>;
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount < 0) {
    return res.status(400).json({ error: 'Commission amount must be a valid non-negative number.' });
  }
  const cleanSource = ['ESTIMATED', 'CONFIRMED', 'PARTNER_REPORT'].includes(source) ? source : 'PARTNER_REPORT';
  const cleanStatus = ['PENDING', 'CONFIRMED', 'RECONCILED'].includes(status) ? status : 'CONFIRMED';
  const cleanApp: AppId = ['bot', 'trader', 'charts', 'options'].includes(appId) ? appId : 'trader';

  const record = await store.transaction((txDb) => {
    const item = {
      id: crypto.randomUUID(),
      userId: userId || null,
      appId: cleanApp,
      tradeId: tradeId || null,
      source: cleanSource,
      amount: numAmount.toFixed(2),
      currency: String(currency || 'USD').toUpperCase(),
      status: cleanStatus,
      periodDate: periodDate || new Date().toISOString().slice(0, 10),
      notes: String(notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    txDb.commission_records.unshift(item);
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'COMMISSION_RECORD_LOGGED',
      targetType: 'commission_records',
      targetId: item.id,
      details: item,
      ipAddress: req.ip || null,
    });
    return item;
  });

  return res.status(201).json({ record });
});

router.get('/commissions/export', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const records = store.snapshot().commission_records;
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['ID', 'Period Date', 'App ID', 'Source', 'Status', 'Amount', 'Currency', 'User ID', 'Trade ID', 'Notes', 'Created At']
      .map(esc)
      .join(','),
    ...records.map((r) =>
      [
        r.id,
        r.periodDate,
        r.appId,
        r.source,
        r.status,
        r.amount,
        r.currency,
        r.userId || '',
        r.tradeId || '',
        r.notes,
        r.createdAt,
      ]
        .map(esc)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pipflowtrade-commissions.csv"');
  return res.send(lines.join('\n'));
});

// 9. Membership Plans & Subscriptions
router.get('/plans', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  return res.json({ plans: db.plans, subscriptions: db.user_subscriptions });
});

router.post('/plans', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { name, slug, description, priceMonthly, allowedApps, maxDailyTrades, maxBots } = req.body as Record<string, any>;
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Plan name is required.' });
  }
  const ts = new Date().toISOString();
  const plan = await store.transaction((txDb) => {
    const p = {
      id: `plan-${crypto.randomUUID().slice(0, 8)}`,
      name: String(name).trim(),
      slug: String(slug || name).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      description: String(description || '').trim(),
      priceMonthly: Math.max(0, Number(priceMonthly) || 0).toFixed(2),
      currency: 'USD',
      allowedApps: Array.isArray(allowedApps) ? allowedApps : (['bot', 'trader', 'charts', 'options'] as AppId[]),
      maxDailyTrades: Math.max(1, Number(maxDailyTrades) || 100),
      maxBots: Math.max(0, Number(maxBots) || 5),
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    };
    txDb.plans.push(p);
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'PLAN_CREATED',
      targetType: 'plans',
      targetId: p.id,
      details: p,
      ipAddress: req.ip || null,
    });
    return p;
  });
  return res.status(201).json({ plan });
});

router.patch('/plans/:id', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { name, description, priceMonthly, allowedApps, maxDailyTrades, maxBots, isActive } = req.body as Record<string, any>;
  const existing = store.snapshot().plans.find((p) => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Plan not found.' });

  const updated = await store.transaction((txDb) => {
    const p = txDb.plans.find((pl) => pl.id === existing.id)!;
    if (typeof name === 'string' && name.trim()) p.name = name.trim();
    if (typeof description === 'string') p.description = description.trim();
    if (priceMonthly !== undefined && Number.isFinite(Number(priceMonthly))) {
      p.priceMonthly = Math.max(0, Number(priceMonthly)).toFixed(2);
    }
    if (Array.isArray(allowedApps)) p.allowedApps = allowedApps;
    if (Number.isFinite(Number(maxDailyTrades))) p.maxDailyTrades = Math.max(1, Number(maxDailyTrades));
    if (Number.isFinite(Number(maxBots))) p.maxBots = Math.max(0, Number(maxBots));
    if (typeof isActive === 'boolean') p.isActive = isActive;
    p.updatedAt = new Date().toISOString();

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'PLAN_UPDATED',
      targetType: 'plans',
      targetId: p.id,
      details: { name: p.name, priceMonthly: p.priceMonthly, allowedApps: p.allowedApps, isActive: p.isActive },
      ipAddress: req.ip || null,
    });
    return p;
  });

  return res.json({ plan: updated });
});

// 10. Website CMS Management
router.get('/content', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ content: store.snapshot().website_content });
});

router.patch('/content', requireAdminAuth(['SUPER_ADMIN', 'ADMIN', 'APP_MANAGER']), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as Record<string, any>;
  const updated = await store.transaction((txDb) => {
    const c = txDb.website_content;
    if (typeof body.heroLabel === 'string') c.heroLabel = body.heroLabel.trim();
    if (typeof body.heroTitle === 'string') c.heroTitle = body.heroTitle.trim();
    if (typeof body.heroHighlight === 'string') c.heroHighlight = body.heroHighlight.trim();
    if (typeof body.heroDescription === 'string') c.heroDescription = body.heroDescription.trim();
    if (typeof body.primaryCtaLabel === 'string') c.primaryCtaLabel = body.primaryCtaLabel.trim();
    if (typeof body.secondaryCtaLabel === 'string') c.secondaryCtaLabel = body.secondaryCtaLabel.trim();
    if (typeof body.derivSignupUrl === 'string' && body.derivSignupUrl.startsWith('https://')) {
      c.derivSignupUrl = body.derivSignupUrl.trim();
    }
    if (typeof body.derivSignupLabel === 'string') c.derivSignupLabel = body.derivSignupLabel.trim();
    if (body.announcement && typeof body.announcement === 'object') {
      c.announcement = { ...c.announcement, ...body.announcement };
    }
    if (body.maintenanceNotice && typeof body.maintenanceNotice === 'object') {
      c.maintenanceNotice = { ...c.maintenanceNotice, ...body.maintenanceNotice };
    }
    if (Array.isArray(body.capabilities)) c.capabilities = body.capabilities;
    if (Array.isArray(body.faqs)) c.faqs = body.faqs;
    if (body.footer && typeof body.footer === 'object') {
      c.footer = { ...c.footer, ...body.footer };
    }
    if (body.seo && typeof body.seo === 'object') {
      c.seo = { ...c.seo, ...body.seo };
    }
    c.updatedAt = new Date().toISOString();

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'WEBSITE_CONTENT_UPDATED',
      targetType: 'website_content',
      targetId: 'global',
      details: { derivSignupUrl: c.derivSignupUrl, announcementEnabled: c.announcement.enabled },
      ipAddress: req.ip || null,
    });
    return c;
  });

  return res.json({ content: updated });
});

// 11. Role-Based Admin, Session & Security Management
router.get('/admins', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const admins = store.snapshot().administrator_accounts.map((a) => ({
    id: a.id,
    email: a.email,
    role: a.role,
    status: a.status,
    mfaEnabled: a.mfaEnabled,
    lastAuthenticatedAt: a.lastAuthenticatedAt,
    createdAt: a.createdAt,
  }));
  return res.json({ admins });
});

router.post('/admins', requireAdminAuth(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, role } = req.body as { email?: string; password?: string; role?: AdminRole };
  const cleanEmail = (email || '').trim().toLowerCase();
  const validRoles: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN', 'APP_MANAGER', 'SUPPORT', 'AUDITOR'];
  if (!cleanEmail || !password || password.length < 10) {
    return res.status(400).json({ error: 'Valid admin email and 10+ character password required.' });
  }
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid admin role.' });
  }
  if (store.snapshot().administrator_accounts.some((a) => a.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({ error: 'An administrator with this email already exists.' });
  }

  const created = await store.transaction((txDb) => {
    const ts = new Date().toISOString();
    const acc = {
      id: crypto.randomUUID(),
      userId: null,
      email: cleanEmail,
      passwordHash: hashPassword(password),
      role,
      mfaEnabled: Boolean(process.env.ADMIN_MFA_SECRET?.trim()),
      mfaSecretEncrypted: null,
      status: 'ACTIVE' as const,
      lastAuthenticatedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    txDb.administrator_accounts.push(acc);
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'ADMIN_CREATED',
      targetType: 'administrator_accounts',
      targetId: acc.id,
      details: { email: cleanEmail, role },
      ipAddress: req.ip || null,
    });
    return {
      id: acc.id,
      email: acc.email,
      role: acc.role,
      status: acc.status,
      mfaEnabled: acc.mfaEnabled,
      createdAt: acc.createdAt,
    };
  });

  return res.status(201).json({ admin: created });
});

router.patch('/admins/:id', requireAdminAuth(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const { role, status } = req.body as { role?: AdminRole; status?: 'ACTIVE' | 'SUSPENDED' };
  const target = store.snapshot().administrator_accounts.find((a) => a.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Administrator account not found.' });

  await store.transaction((txDb) => {
    const a = txDb.administrator_accounts.find((x) => x.id === target.id)!;
    if (role) a.role = role;
    if (status && ['ACTIVE', 'SUSPENDED'].includes(status)) a.status = status;
    a.updatedAt = new Date().toISOString();
    if (a.status === 'SUSPENDED') {
      for (const s of txDb.administrator_sessions) {
        if (s.adminId === a.id && !s.revokedAt) s.revokedAt = new Date().toISOString();
      }
    }
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'ADMIN_UPDATED',
      targetType: 'administrator_accounts',
      targetId: a.id,
      details: { role: a.role, status: a.status },
      ipAddress: req.ip || null,
    });
  });
  return res.json({ success: true });
});

router.get('/sessions', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const now = Date.now();
  const userSessions = db.user_sessions
    .filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now)
    .map((s) => {
      const u = db.users.find((user) => user.id === s.userId);
      return {
        id: s.id,
        kind: 'USER' as const,
        email: u?.email || s.userId,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };
    });
  const adminSessions = db.administrator_sessions
    .filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now)
    .map((s) => {
      const a = db.administrator_accounts.find((adm) => adm.id === s.adminId);
      return {
        id: s.id,
        kind: 'ADMIN' as const,
        email: a?.email || s.adminId,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };
    });
  return res.json({ userSessions, adminSessions });
});

router.post('/sessions/:id/revoke', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const ts = new Date().toISOString();
  let revokedUserId: string | null = null;
  await store.transaction((txDb) => {
    const us = txDb.user_sessions.find((s) => s.id === req.params.id);
    if (us && !us.revokedAt) {
      us.revokedAt = ts;
      revokedUserId = us.userId;
    }
    const as = txDb.administrator_sessions.find((s) => s.id === req.params.id);
    if (as && !as.revokedAt) {
      as.revokedAt = ts;
    }
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'SESSION_REVOKED',
      targetType: 'sessions',
      targetId: req.params.id,
      ipAddress: req.ip || null,
    });
  });
  if (revokedUserId) {
    realtimeHub.emitToUser(revokedUserId, 'session:revoked', { reason: 'admin_revoked' });
  }
  return res.json({ success: true });
});

router.get('/audit-logs', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ logs: store.snapshot().admin_audit_logs.slice(0, 300) });
});

router.get('/tickets', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ tickets: store.snapshot().support_tickets });
});

router.patch('/tickets/:id', requireAdminAuth(), async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body as { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' };
  if (!status || !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid ticket status.' });
  }
  await store.transaction((db) => {
    const ticket = db.support_tickets.find((t) => t.id === req.params.id);
    if (ticket) {
      ticket.status = status;
      ticket.updatedAt = new Date().toISOString();
    }
    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'SUPPORT_TICKET_UPDATED',
      targetType: 'support_tickets',
      targetId: req.params.id,
      details: { status },
      ipAddress: req.ip || null,
    });
  });
  return res.json({ success: true });
});

// 12. System Settings & Safe Environment Audit (NEVER leaks secrets)
router.get('/system', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const envCheck = (key: string) => Boolean(process.env[key] && process.env[key]!.trim().length > 0);
  return res.json({
    runtime: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      derivFeedStatus: derivMarketFeed.status,
      databaseRecords: {
        users: db.users.length,
        trades: db.trades.length,
        ledgerEntries: db.platform_ledger_entries.length,
        auditLogs: db.admin_audit_logs.length,
        botStrategies: db.bot_strategies.length,
      },
    },
    integrations: {
      DATABASE_URL: envCheck('DATABASE_URL'),
      JWT_SECRET: envCheck('JWT_SECRET'),
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
      TOKEN_ENCRYPTION_KEY: envCheck('TOKEN_ENCRYPTION_KEY'),
      SSO_SIGNING_SECRET: envCheck('SSO_SIGNING_SECRET') || envCheck('BOT_GATE_JWT_SECRET'),
      DERIV_APP_ID: envCheck('DERIV_APP_ID') || envCheck('VITE_DERIV_APP_ID'),
      DERIV_OAUTH_REDIRECT_URI: envCheck('DERIV_OAUTH_REDIRECT_URI'),
      DERIV_WS_URL: envCheck('DERIV_WS_URL'),
      BREVO_API_KEY: envCheck('BREVO_API_KEY'),
      GEMINI_API_KEY: envCheck('GEMINI_API_KEY'),
      ADMIN_EMAIL: envCheck('ADMIN_EMAIL'),
      ADMIN_PASSWORD: envCheck('ADMIN_PASSWORD'),
      ADMIN_MFA_SECRET: envCheck('ADMIN_MFA_SECRET'),
      ADMIN_PRIVATE_SLUG: envCheck('ADMIN_PRIVATE_SLUG'),
    },
    applications: db.application_registry,
  });
});

export default router;
