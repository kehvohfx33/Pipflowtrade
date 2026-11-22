import { store } from '../db/store.ts';
import { AppId, RiskSettingsRecord } from '../types.ts';

export interface RiskValidationInput {
  userId: string;
  appId: AppId;
  stake: number;
  availableBalance: number;
  mode: 'DEMO' | 'REAL';
}

export interface RiskValidationResult {
  allowed: boolean;
  reasons: string[];
  settings: RiskSettingsRecord;
  todayStats: {
    tradesToday: number;
    dailyLoss: number;
    consecutiveLosses: number;
    openExposure: number;
  };
}

export function validateTradeAgainstRisk(input: RiskValidationInput): RiskValidationResult {
  const db = store.snapshot();
  const settings = db.risk_settings.find((r) => r.userId === input.userId);
  if (!settings) {
    throw new Error('Risk settings not initialized for user');
  }

  const reasons: string[] = [];
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const userTrades = db.trades
    .filter((t) => t.userId === input.userId)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const todayTrades = userTrades.filter((t) => t.openedAt >= todayIso);
  const dailyLoss = todayTrades.reduce((acc, t) => {
    const p = Number(t.profit ?? 0);
    return p < 0 ? acc + Math.abs(p) : acc;
  }, 0);

  let consecutiveLosses = 0;
  for (const t of userTrades) {
    if (t.status === 'LOST') consecutiveLosses += 1;
    else if (t.status === 'WON') break;
  }

  const openExposure = userTrades
    .filter((t) => t.status === 'OPEN')
    .reduce((acc, t) => acc + Number(t.stake), 0);

  if (settings.emergencyStopActive) {
    reasons.push('Emergency stop is currently active. Disable emergency stop in Risk Settings before trading.');
  }

  if (!Number.isFinite(input.stake) || input.stake <= 0) {
    reasons.push('Stake must be greater than zero.');
  }

  if (input.stake > Number(settings.maxStake)) {
    reasons.push(`Stake (${input.stake.toFixed(2)}) exceeds maximum allowed stake (${Number(settings.maxStake).toFixed(2)}).`);
  }

  if (input.stake > input.availableBalance) {
    reasons.push(`Insufficient account balance (${input.availableBalance.toFixed(2)}) for stake (${input.stake.toFixed(2)}).`);
  }

  if (dailyLoss >= Number(settings.maxDailyLoss)) {
    reasons.push(`Daily loss limit (${Number(settings.maxDailyLoss).toFixed(2)}) has been reached.`);
  }

  if (todayTrades.length >= settings.maxTradesPerDay) {
    reasons.push(`Maximum daily trade count (${settings.maxTradesPerDay}) has been reached.`);
  }

  if (consecutiveLosses >= settings.maxConsecutiveLosses) {
    reasons.push(`Maximum consecutive losses (${settings.maxConsecutiveLosses}) reached.`);
  }

  if (openExposure + input.stake > Number(settings.maxExposure)) {
    reasons.push(
      `Total exposure (${(openExposure + input.stake).toFixed(2)}) would exceed limit (${Number(settings.maxExposure).toFixed(2)}).`
    );
  }

  if (input.mode === 'REAL') {
    const tradingPrefs = db.trading_preferences.find((tp) => tp.userId === input.userId);
    if (!tradingPrefs?.realMoneyRiskAcknowledged) {
      reasons.push('Real-money trading requires explicit risk acknowledgement in Onboarding or Account Settings.');
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    settings,
    todayStats: {
      tradesToday: todayTrades.length,
      dailyLoss,
      consecutiveLosses,
      openExposure,
    },
  };
}
