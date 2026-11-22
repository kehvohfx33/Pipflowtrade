import crypto from 'crypto';
import { Router, Response } from 'express';
import { store } from '../db/store.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/security.ts';
import { BotStrategyRecord, TradingMode } from '../types.ts';

const router = Router();

// 1. Consolidated User Trading Overview (Real vs Demo separated)
router.get('/overview', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const userId = req.authUser!.id;
  const userTrades = db.trades
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const summarize = (mode: TradingMode) => {
    const list = userTrades.filter((t) => t.mode === mode);
    const open = list.filter((t) => t.status === 'OPEN').length;
    const closed = list.filter((t) => t.status !== 'OPEN').length;
    const wins = list.filter((t) => t.status === 'WON').length;
    const losses = list.filter((t) => t.status === 'LOST').length;
    const profitLoss = list.reduce((sum, t) => sum + Number(t.profit || 0), 0);
    return {
      mode,
      total: list.length,
      open,
      closed,
      wins,
      losses,
      profitLoss: profitLoss.toFixed(2),
    };
  };

  const bots = db.bot_strategies
    .filter((b) => b.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return res.json({
    demoStats: summarize('DEMO'),
    realStats: summarize('REAL'),
    recentTrades: userTrades.slice(0, 25),
    bots,
  });
});

// 2. Bot Strategies Management (User-Scoped, Explicit Authorization Required)
router.get('/bots', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const bots = db.bot_strategies
    .filter((b) => b.userId === req.authUser!.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return res.json({ bots });
});

router.post('/bots', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      strategyType,
      symbol,
      xmlContent,
      stake,
      environment,
      userAuthorizedExecution,
    } = req.body as {
      name?: string;
      strategyType?: string;
      symbol?: string;
      xmlContent?: string;
      stake?: number | string;
      environment?: TradingMode;
      userAuthorizedExecution?: boolean;
    };

    const cleanName = (name || '').trim();
    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Bot strategy name must be at least 2 characters.' });
    }
    const cleanXml = (xmlContent || '').trim();
    if (cleanXml.length < 10) {
      return res.status(400).json({ error: 'Valid XML strategy payload is required.' });
    }

    const db = store.snapshot();
    const userId = req.authUser!.id;
    const sub = db.user_subscriptions.find((s) => s.userId === userId && s.status === 'ACTIVE');
    const plan =
      (sub ? db.plans.find((p) => p.id === sub.planId) : null) ||
      db.plans.find((p) => p.slug === 'starter');
    const existingCount = db.bot_strategies.filter((b) => b.userId === userId).length;
    if (plan && existingCount >= plan.maxBots) {
      return res.status(403).json({
        error: `Plan limit reached (${plan.maxBots} bots on ${plan.name}).`,
      });
    }

    const activeAccount = db.connected_deriv_accounts.find(
      (a) => a.userId === userId && a.isActive && a.connectionStatus === 'CONNECTED'
    );

    const ts = new Date().toISOString();
    const bot: BotStrategyRecord = {
      id: crypto.randomUUID(),
      userId,
      name: cleanName,
      strategyType: (strategyType || 'XML_AUTOMATION').trim(),
      symbol: (symbol || 'R_100').trim(),
      xmlContent: cleanXml,
      connectedAccountId: activeAccount?.id || null,
      environment: environment === 'REAL' ? 'REAL' : activeAccount?.accountType || 'DEMO',
      status: 'IDLE',
      stake: Math.max(0.35, Number(stake) || 1).toFixed(2),
      userAuthorizedExecution: Boolean(userAuthorizedExecution),
      lastActivityAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };

    await store.transaction((txDb) => {
      txDb.bot_strategies.unshift(bot);
      txDb.bot_execution_logs.unshift({
        id: crypto.randomUUID(),
        botId: bot.id,
        userId,
        level: 'INFO',
        message: `Strategy "${bot.name}" saved on ${bot.symbol} (${bot.environment}).`,
        createdAt: ts,
      });
    });

    return res.status(201).json({ bot });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Unable to save bot strategy.' });
  }
});

router.patch('/bots/:id/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, userAuthorizedExecution } = req.body as {
      status?: 'IDLE' | 'RUNNING' | 'STOPPED';
      userAuthorizedExecution?: boolean;
    };
    if (!status || !['IDLE', 'RUNNING', 'STOPPED'].includes(status)) {
      return res.status(400).json({ error: 'Valid bot status (IDLE, RUNNING, STOPPED) is required.' });
    }

    const db = store.snapshot();
    const bot = db.bot_strategies.find(
      (b) => b.id === req.params.id && b.userId === req.authUser!.id
    );
    if (!bot) {
      return res.status(404).json({ error: 'Bot strategy not found.' });
    }
    if (bot.status === 'SUSPENDED' && status === 'RUNNING') {
      return res.status(403).json({
        error: 'This bot strategy was suspended by an administrator and cannot be started.',
      });
    }

    const risk = db.risk_settings.find((r) => r.userId === req.authUser!.id);
    if (status === 'RUNNING' && risk?.emergencyStopActive) {
      return res.status(403).json({
        error: 'Emergency Stop is active. Clear Emergency Stop in Account Risk Settings before starting a bot.',
      });
    }

    const authorized =
      typeof userAuthorizedExecution === 'boolean'
        ? userAuthorizedExecution
        : bot.userAuthorizedExecution;

    if (status === 'RUNNING' && !authorized) {
      return res.status(403).json({
        error: 'Explicit user execution authorization is required before activating automated execution.',
      });
    }

    const updated = await store.transaction((txDb) => {
      const target = txDb.bot_strategies.find((b) => b.id === bot.id)!;
      const ts = new Date().toISOString();
      target.status = status;
      target.userAuthorizedExecution = authorized;
      target.lastActivityAt = ts;
      target.updatedAt = ts;

      txDb.bot_execution_logs.unshift({
        id: crypto.randomUUID(),
        botId: target.id,
        userId: req.authUser!.id,
        level: status === 'RUNNING' ? 'INFO' : 'WARN',
        message: `User transitioned bot "${target.name}" to ${status}.`,
        createdAt: ts,
      });
      return target;
    });

    return res.json({ bot: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Unable to update bot status.' });
  }
});

router.get('/bots/:id/logs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const bot = db.bot_strategies.find(
    (b) => b.id === req.params.id && b.userId === req.authUser!.id
  );
  if (!bot) {
    return res.status(404).json({ error: 'Bot strategy not found.' });
  }
  const logs = db.bot_execution_logs
    .filter((l) => l.botId === bot.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
  return res.json({ logs });
});

export default router;
