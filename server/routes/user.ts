import crypto from 'crypto';
import { Router, Response } from 'express';
import { store } from '../db/store.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/security.ts';
import { validateTradeAgainstRisk } from '../services/risk.ts';
import { realtimeHub } from '../services/realtime.ts';
import { buildUserSessionPayload } from './auth.ts';
import { AppId } from '../types.ts';

const router = Router();

router.get('/user/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json(buildUserSessionPayload(req.authUser!.id));
});

router.patch('/user/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      fullName,
      country,
      timezone,
      phone,
      emailNotifications,
      tradeAlerts,
      riskAlerts,
      compactTerminal,
      defaultApplication,
      defaultMarket,
      realMoneyRiskAcknowledged,
    } = req.body as Record<string, any>;

    await store.transaction((db) => {
      const ts = new Date().toISOString();
      const profile = db.user_profiles.find((p) => p.userId === req.authUser!.id);
      if (profile) {
        if (typeof fullName === 'string' && fullName.trim().length >= 2) profile.fullName = fullName.trim();
        if (typeof country === 'string') profile.country = country.trim() || null;
        if (typeof timezone === 'string' && timezone.trim()) profile.timezone = timezone.trim();
        if (typeof phone === 'string') profile.phone = phone.trim() || null;
        profile.updatedAt = ts;
      }

      const ap = db.account_preferences.find((a) => a.userId === req.authUser!.id);
      if (ap) {
        if (typeof emailNotifications === 'boolean') ap.emailNotifications = emailNotifications;
        if (typeof tradeAlerts === 'boolean') ap.tradeAlerts = tradeAlerts;
        if (typeof riskAlerts === 'boolean') ap.riskAlerts = riskAlerts;
        if (typeof compactTerminal === 'boolean') ap.compactTerminal = compactTerminal;
        ap.updatedAt = ts;
      }

      const tp = db.trading_preferences.find((t) => t.userId === req.authUser!.id);
      if (tp) {
        if (defaultApplication && ['bot', 'trader', 'charts', 'options'].includes(defaultApplication)) {
          tp.defaultApplication = defaultApplication;
        }
        if (typeof defaultMarket === 'string' && defaultMarket.trim()) {
          tp.defaultMarket = defaultMarket.trim();
        }
        if (realMoneyRiskAcknowledged === true && !tp.realMoneyRiskAcknowledged) {
          tp.realMoneyRiskAcknowledged = true;
          tp.riskAcknowledgedAt = ts;
        }
        tp.updatedAt = ts;
      }
    });

    return res.json(buildUserSessionPayload(req.authUser!.id));
  } catch (err) {
    console.error('[user/profile PATCH] Error:', err);
    return res.status(500).json({ error: 'Unable to update user profile.' });
  }
});

router.get('/user/balances', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const derivAccounts = db.connected_deriv_accounts
    .filter((a) => a.userId === req.authUser!.id && a.connectionStatus !== 'DISCONNECTED')
    .map((a) => ({
      id: a.id,
      derivLoginId: a.derivLoginId,
      accountType: a.accountType,
      currency: a.currency,
      reportedBalance: a.reportedBalance,
      isActive: a.isActive,
      lastSyncedAt: a.lastSyncedAt,
    }));

  const ledgerAccount = db.platform_ledger_accounts.find(
    (l) => l.userId === req.authUser!.id && l.currency === 'USD'
  );
  const ledgerBalance = ledgerAccount
    ? db.platform_ledger_balances.find((b) => b.ledgerAccountId === ledgerAccount.id)
    : null;

  return res.json({
    derivAccounts,
    activeDerivAccount: derivAccounts.find((a) => a.isActive) || derivAccounts[0] || null,
    platformLedger: {
      currency: ledgerAccount?.currency || 'USD',
      availableBalance: ledgerBalance?.availableBalance || '0.00000000',
      updatedAt: ledgerBalance?.updatedAt || null,
      note: 'PIPFLOWTRADE Platform Ledger is strictly separate from your authoritative Deriv balance.',
    },
  });
});

router.get('/user/transactions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const transactions = db.transactions
    .filter((t) => t.userId === req.authUser!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  const trades = db.trades
    .filter((t) => t.userId === req.authUser!.id)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 100);

  const ledgerEntries = db.platform_ledger_entries
    .filter((e) => e.userId === req.authUser!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  return res.json({ transactions, trades, ledgerEntries });
});

router.get('/user/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const notifications = store
    .snapshot()
    .notifications.filter((n) => n.userId === req.authUser!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  return res.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.isRead).length,
  });
});

router.post('/user/notifications/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { notificationId } = req.body as { notificationId?: string };
  await store.transaction((db) => {
    for (const n of db.notifications) {
      if (n.userId === req.authUser!.id && (!notificationId || n.id === notificationId)) {
        n.isRead = true;
      }
    }
  });
  return res.json({ success: true });
});

router.get('/user/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const sessions = store
    .snapshot()
    .user_sessions.filter((s) => s.userId === req.authUser!.id && !s.revokedAt)
    .map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === req.authSessionId,
    }));
  return res.json({ sessions });
});

router.post('/user/sessions/:id/revoke', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  await store.transaction((db) => {
    const target = db.user_sessions.find(
      (s) => s.id === req.params.id && s.userId === req.authUser!.id
    );
    if (target) target.revokedAt = new Date().toISOString();
  });
  return res.json({ success: true });
});

// Shared Risk Management Endpoints
router.get('/risk/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const riskSettings = store.snapshot().risk_settings.find((r) => r.userId === req.authUser!.id);
  return res.json({ riskSettings });
});

router.patch('/risk/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as Record<string, any>;
    const updated = await store.transaction((db) => {
      const target = db.risk_settings.find((r) => r.userId === req.authUser!.id);
      if (!target) throw new Error('Risk settings not found');
      const ts = new Date().toISOString();

      const numField = (val: any, min: number, max: number) => {
        const n = Number(val);
        return Number.isFinite(n) && n >= min && n <= max ? n : null;
      };

      const maxStake = numField(body.maxStake, 0.35, 100000);
      if (maxStake !== null) target.maxStake = maxStake.toFixed(8);

      const maxDailyLoss = numField(body.maxDailyLoss, 1, 1000000);
      if (maxDailyLoss !== null) target.maxDailyLoss = maxDailyLoss.toFixed(8);

      const maxTradesPerDay = numField(body.maxTradesPerDay, 1, 5000);
      if (maxTradesPerDay !== null) target.maxTradesPerDay = Math.floor(maxTradesPerDay);

      const stopLossLimit = numField(body.stopLossLimit, 1, 1000000);
      if (stopLossLimit !== null) target.stopLossLimit = stopLossLimit.toFixed(8);

      const takeProfitTarget = numField(body.takeProfitTarget, 1, 10000000);
      if (takeProfitTarget !== null) target.takeProfitTarget = takeProfitTarget.toFixed(8);

      const maxConsecutiveLosses = numField(body.maxConsecutiveLosses, 1, 50);
      if (maxConsecutiveLosses !== null) target.maxConsecutiveLosses = Math.floor(maxConsecutiveLosses);

      const maxExposure = numField(body.maxExposure, 1, 1000000);
      if (maxExposure !== null) target.maxExposure = maxExposure.toFixed(8);

      const sessionLimit = numField(body.sessionTimeLimitMinutes, 5, 1440);
      if (sessionLimit !== null) target.sessionTimeLimitMinutes = Math.floor(sessionLimit);

      if (typeof body.emergencyStopActive === 'boolean') {
        target.emergencyStopActive = body.emergencyStopActive;
        db.notifications.unshift({
          id: crypto.randomUUID(),
          userId: req.authUser!.id,
          category: 'RISK',
          title: body.emergencyStopActive ? 'Emergency Stop Activated' : 'Emergency Stop Cleared',
          message: body.emergencyStopActive
            ? 'All automated and manual trade executions across Bot, Trader, Charts, and Options are halted.'
            : 'Trading execution guard resumed under your configured risk thresholds.',
          isRead: false,
          metadata: {},
          createdAt: ts,
        });
      }

      target.updatedAt = ts;
      return target;
    });

    realtimeHub.emitToUser(req.authUser!.id, 'risk:updated', updated);
    return res.json({ riskSettings: updated });
  } catch (err) {
    console.error('[risk/settings PATCH] Error:', err);
    return res.status(500).json({ error: 'Unable to update risk settings.' });
  }
});

router.post('/risk/validate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { appId, stake } = req.body as { appId?: AppId; stake?: number };
    const db = store.snapshot();
    const active = db.connected_deriv_accounts.find(
      (a) => a.userId === req.authUser!.id && a.isActive && a.connectionStatus === 'CONNECTED'
    );
    const result = validateTradeAgainstRisk({
      userId: req.authUser!.id,
      appId: appId || 'trader',
      stake: Number(stake || 1),
      availableBalance: active ? Number(active.reportedBalance) : 0,
      mode: active?.accountType || 'DEMO',
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Risk validation failed.' });
  }
});

// Support Tickets
router.get('/support/tickets', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tickets = store
    .snapshot()
    .support_tickets.filter((t) => t.userId === req.authUser!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ tickets });
});

router.post('/support/tickets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, subject, category, message } = req.body as {
      email?: string;
      subject?: string;
      category?: string;
      message?: string;
    };

    const cleanEmail = (email || req.authUser?.email || '').trim().toLowerCase();
    const cleanSubject = (subject || '').trim();
    const cleanMessage = (message || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid contact email is required.' });
    }
    if (cleanSubject.length < 3 || cleanMessage.length < 10) {
      return res.status(400).json({ error: 'Please provide a subject and detailed description (10+ chars).' });
    }

    const ticket = await store.transaction((db) => {
      const ts = new Date().toISOString();
      const record = {
        id: crypto.randomUUID(),
        userId: req.authUser?.id || null,
        email: cleanEmail,
        subject: cleanSubject,
        category: (category || 'GENERAL').trim().toUpperCase(),
        message: cleanMessage,
        status: 'OPEN' as const,
        createdAt: ts,
        updatedAt: ts,
      };
      db.support_tickets.unshift(record);
      return record;
    });

    return res.status(201).json({ ticket });
  } catch (err) {
    console.error('[support/tickets POST] Error:', err);
    return res.status(500).json({ error: 'Unable to submit support request.' });
  }
});

export default router;
