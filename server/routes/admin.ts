import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { addDecimal, store, subtractDecimal } from '../db/store.ts';
import {
  generateSecureToken,
  hashToken,
  verifyPassword,
} from '../security/crypto.ts';
import {
  AuthenticatedRequest,
  getCookieOptions,
  rateLimit,
  requireAdminAuth,
} from '../middleware/security.ts';
import { realtimeHub } from '../services/realtime.ts';
import { AppId } from '../types.ts';

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

// 1. Private Administrator Authentication (never grants privilege from 20-tap UI alone)
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

// 2. Admin Dashboard Overview (Genuine DB Metrics)
router.get('/dashboard', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const now = Date.now();

  return res.json({
    metrics: {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.status === 'ACTIVE').length,
      suspendedUsers: db.users.filter((u) => u.status === 'SUSPENDED').length,
      connectedDerivAccounts: db.connected_deriv_accounts.filter(
        (d) => d.connectionStatus === 'CONNECTED'
      ).length,
      activeUserSessions: db.user_sessions.filter(
        (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now
      ).length,
      activeAppSessions: db.application_sessions.filter(
        (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now
      ).length,
      totalTrades: db.trades.length,
      openSupportTickets: db.support_tickets.filter((t) => t.status === 'OPEN').length,
    },
    applications: db.application_registry,
    recentAuditLogs: db.admin_audit_logs.slice(0, 20),
  });
});

// 3. User Management
router.get('/users', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
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

      return {
        id: u.id,
        email: u.email,
        fullName: profile?.fullName || u.email,
        status: u.status,
        emailVerified: u.emailVerified,
        onboardingCompleted: u.onboardingCompleted,
        roles,
        connectedDerivCount: derivAccounts.length,
        activeDerivAccount: derivAccounts.find((a) => a.isActive) || derivAccounts[0] || null,
        platformLedgerBalance: ledgerBalance?.availableBalance || '0.00000000',
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      };
    })
    .filter(
      (u) =>
        !q ||
        u.email.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
    );

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
    recentTrades,
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

// 4. Platform Ledger & Financial Adjustments (Never alters real Deriv balance)
router.get('/balances', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const list = db.users.map((u) => {
    const profile = db.user_profiles.find((p) => p.userId === u.id);
    const ledgerAccount = db.platform_ledger_accounts.find((l) => l.userId === u.id && l.currency === 'USD');
    const ledgerBalance = ledgerAccount
      ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
      : null;
    const activeDeriv = db.connected_deriv_accounts.find(
      (d) => d.userId === u.id && d.isActive && d.connectionStatus === 'CONNECTED'
    );

    return {
      userId: u.id,
      email: u.email,
      fullName: profile?.fullName || u.email,
      ledgerAccountId: ledgerAccount?.id || null,
      currency: ledgerAccount?.currency || 'USD',
      platformLedgerBalance: ledgerBalance?.availableBalance || '0.00000000',
      derivLoginId: activeDeriv?.derivLoginId || null,
      derivAccountType: activeDeriv?.accountType || null,
      derivReportedBalance: activeDeriv?.reportedBalance || null,
      updatedAt: ledgerBalance?.updatedAt || u.updatedAt,
    };
  });

  return res.json({ balances: list });
});

router.post('/balances/adjust', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, entryType, amount, currency, reason, reverseEntryId } = req.body as {
      userId?: string;
      entryType?: 'CREDIT' | 'DEBIT' | 'REVERSAL';
      amount?: number | string;
      currency?: string;
      reason?: string;
      reverseEntryId?: string;
    };

    if (!userId || !entryType || !['CREDIT', 'DEBIT', 'REVERSAL'].includes(entryType)) {
      return res.status(400).json({ error: 'Valid userId and entryType (CREDIT, DEBIT, REVERSAL) are required.' });
    }
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 4) {
      return res.status(400).json({ error: 'A detailed adjustment reason (min 4 characters) is required for audit compliance.' });
    }

    const cleanCurrency = (currency || 'USD').toUpperCase();
    const db = store.snapshot();
    const targetUser = db.users.find((u) => u.id === userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    let numericAmount = Number(amount);
    let effectiveDirection: 'CREDIT' | 'DEBIT' = entryType === 'DEBIT' ? 'DEBIT' : 'CREDIT';

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
      effectiveDirection = orig.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Adjustment amount must be greater than zero.' });
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
      const newBal =
        effectiveDirection === 'CREDIT'
          ? addDecimal(prevBal, numericAmount)
          : subtractDecimal(prevBal, numericAmount);

      if (Number(newBal) < 0) {
        throw new Error(`Insufficient platform ledger balance (${Number(prevBal).toFixed(2)} ${cleanCurrency}) for debit.`);
      }

      const requestId = crypto.randomUUID();
      txDb.balance_adjustment_requests.unshift({
        id: requestId,
        userId,
        ledgerAccountId: ledgerAcc.id,
        requestedByAdminId: req.adminAccount!.id,
        entryType,
        amount: numericAmount.toFixed(8),
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
        amount: numericAmount.toFixed(8),
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

      const signedAmount = effectiveDirection === 'CREDIT' ? numericAmount : -numericAmount;
      txDb.transactions.unshift({
        id: crypto.randomUUID(),
        userId,
        source: 'PLATFORM_LEDGER',
        referenceId: entry.id,
        actionType: `LEDGER_${entryType}`,
        amount: signedAmount.toFixed(8),
        currency: cleanCurrency,
        balanceAfter: newBal,
        description: `Platform Ledger ${entryType}: ${cleanReason}`,
        createdAt: ts,
      });

      txDb.notifications.unshift({
        id: crypto.randomUUID(),
        userId,
        category: 'LEDGER',
        title: `Platform Ledger ${entryType}`,
        message: `${effectiveDirection === 'CREDIT' ? '+' : '-'}${numericAmount.toFixed(2)} ${cleanCurrency} (${cleanReason}). New Platform Ledger balance: ${Number(newBal).toFixed(2)} ${cleanCurrency}.`,
        isRead: false,
        metadata: { entryId: entry.id, newBalance: newBal },
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
          amount: numericAmount.toFixed(8),
          currency: cleanCurrency,
          previousBalance: prevBal,
          newBalance: newBal,
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
    return res.status(400).json({ error: err?.message || 'Unable to process platform ledger adjustment.' });
  }
});

router.get('/balances/:userId/history', requireAdminAuth(), (req: AuthenticatedRequest, res: Response) => {
  const entries = store
    .snapshot()
    .platform_ledger_entries.filter((e) => e.userId === req.params.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ entries });
});

router.get('/audit-logs', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ logs: store.snapshot().admin_audit_logs.slice(0, 200) });
});

router.get('/applications', requireAdminAuth(), (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ applications: store.snapshot().application_registry });
});

router.patch('/applications/:appId', requireAdminAuth(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const appId = req.params.appId as AppId;
  const { ssoEnabled, productionUrl } = req.body as { ssoEnabled?: boolean; productionUrl?: string };
  const app = store.snapshot().application_registry.find((a) => a.id === appId);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  await store.transaction((db) => {
    const target = db.application_registry.find((a) => a.id === appId)!;
    if (typeof ssoEnabled === 'boolean') target.ssoEnabled = ssoEnabled;
    if (typeof productionUrl === 'string' && productionUrl.startsWith('https://')) {
      target.productionUrl = productionUrl.trim();
    }
    target.updatedAt = new Date().toISOString();

    recordAudit({
      adminId: req.adminAccount!.id,
      adminEmail: req.adminAccount!.email,
      action: 'APP_CONFIG_UPDATED',
      targetType: 'application_registry',
      targetId: appId,
      details: { ssoEnabled, productionUrl },
      ipAddress: req.ip || null,
    });
  });

  return res.json({ application: store.snapshot().application_registry.find((a) => a.id === appId) });
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

export default router;
