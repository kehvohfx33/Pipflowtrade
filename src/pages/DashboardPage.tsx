import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bot,
  Layers,
  RefreshCw,
  Shield,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { AppRoute, useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface TxSummary {
  id: string;
  source: 'DERIV' | 'PLATFORM_LEDGER';
  actionType: string;
  amount: string;
  currency: string;
  description: string;
  createdAt: string;
}

export const DashboardPage: React.FC = () => {
  const { session, navigate, refreshSession, derivFeedStatus, showToast } = useApp();
  const [syncingBalance, setSyncingBalance] = useState(false);
  const [togglingStop, setTogglingStop] = useState(false);
  const [transactions, setTransactions] = useState<TxSummary[]>([]);

  useEffect(() => {
    apiFetch<{ transactions: TxSummary[] }>('/api/user/transactions')
      .then((res) => setTransactions((res.transactions || []).slice(0, 8)))
      .catch(() => {});
  }, [session.activeDerivAccount?.reportedBalance, session.platformLedger?.availableBalance]);

  const handleSyncDerivBalance = async () => {
    setSyncingBalance(true);
    try {
      const resp = await apiFetch<{ balance: string; currency: string }>('/api/deriv/balance');
      await refreshSession();
      showToast('success', `Synced Deriv balance: ${Number(resp.balance).toFixed(2)} ${resp.currency}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to sync balance from Deriv.');
    } finally {
      setSyncingBalance(false);
    }
  };

  const handleToggleEmergencyStop = async () => {
    if (!session.riskSettings) return;
    setTogglingStop(true);
    try {
      const nextState = !session.riskSettings.emergencyStopActive;
      await apiFetch('/api/risk/settings', {
        method: 'PATCH',
        body: JSON.stringify({ emergencyStopActive: nextState }),
      });
      await refreshSession();
      showToast(
        nextState ? 'error' : 'success',
        nextState ? 'Emergency Stop activated across all apps.' : 'Emergency Stop cleared.'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update Emergency Stop.');
    } finally {
      setTogglingStop(false);
    }
  };

  const activeDeriv = session.activeDerivAccount;
  const risk = session.riskSettings;

  const appShortcuts: Array<{
    id: string;
    name: string;
    url: string;
    desc: string;
    route: AppRoute;
    icon: React.ComponentType<any>;
    color: string;
  }> = [
    {
      id: 'bot',
      name: 'Bot Builder',
      url: 'bot.pipflowtrade.site',
      desc: 'Automated XML block strategies & stake controls',
      route: '/app/bot',
      icon: Bot,
      color: 'text-[#00C8FF]',
    },
    {
      id: 'trader',
      name: 'Deriv Trader',
      url: 'trader.pipflowtrade.site',
      desc: 'Real-time market execution & contract monitor',
      route: '/app/trader',
      icon: TrendingUp,
      color: 'text-[#20F000]',
    },
    {
      id: 'charts',
      name: 'Smart Charts',
      url: 'charts.pipflowtrade.site',
      desc: 'Multi-timeframe candlesticks & indicators',
      route: '/app/charts',
      icon: BarChart2,
      color: 'text-[#ED168F]',
    },
    {
      id: 'options',
      name: 'Options Terminal',
      url: 'options.pipflowtrade.site',
      desc: 'Duration, stake & payout contract proposals',
      route: '/app/options',
      icon: Layers,
      color: 'text-[#00C8FF]',
    },
  ];

  return (
    <WorkspaceLayout title="Main Dashboard">
      <div className="space-y-6">
        {/* Welcome & Connection Banner */}
        <div className="rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#00C8FF]">UNIFIED DERIV WORKSPACE</p>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
              Welcome back, {session.profile?.fullName || session.user?.email}
            </h2>
            <p className="text-xs sm:text-sm text-[#8492A6] mt-1">
              Deriv Feed: <span className="text-white font-mono-num">{derivFeedStatus}</span> · Mode:{' '}
              <span
                className={`font-semibold ${
                  activeDeriv?.accountType === 'REAL' ? 'text-[#FF1744]' : 'text-[#20F000]'
                }`}
              >
                {activeDeriv ? activeDeriv.accountType : 'NO DERIV ACCOUNT'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeDeriv && (
              <button
                type="button"
                onClick={handleSyncDerivBalance}
                disabled={syncingBalance}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#1D2B40] bg-[#050914] hover:border-[#00C8FF]/50 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingBalance ? 'animate-spin' : ''}`} />
                <span>{syncingBalance ? 'Syncing Deriv...' : 'Sync Deriv Balance'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleEmergencyStop}
              disabled={togglingStop}
              className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
                risk?.emergencyStopActive
                  ? 'bg-[#FF1744] text-white'
                  : 'border border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744] hover:bg-[#FF1744]/20'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{risk?.emergencyStopActive ? 'Emergency Stop: ON' : 'Emergency Stop'}</span>
            </button>
          </div>
        </div>

        {/* Authoritative Deriv Balance vs Separate Platform Ledger Balance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5">
            <div className="flex items-center justify-between text-xs text-[#8492A6]">
              <span>Authoritative Deriv Balance</span>
              <span className="font-mono-num text-[#20F000]">
                {activeDeriv ? activeDeriv.derivLoginId : 'Not Linked'}
              </span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-white">
              {activeDeriv
                ? `${Number(activeDeriv.reportedBalance).toFixed(2)} ${activeDeriv.currency}`
                : '—'}
            </div>
            <p className="mt-2 text-[11px] text-[#8492A6]">
              Reported directly by Deriv API. Cannot be altered by PIPFLOWTRADE.
            </p>
          </div>

          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5">
            <div className="flex items-center justify-between text-xs text-[#8492A6]">
              <span>PIPFLOWTRADE Platform Ledger</span>
              <Wallet className="w-4 h-4 text-[#00C8FF]" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#00C8FF]">
              {Number(session.platformLedger?.availableBalance || 0).toFixed(2)}{' '}
              {session.platformLedger?.currency || 'USD'}
            </div>
            <p className="mt-2 text-[11px] text-[#8492A6]">
              Separate internal platform ledger recorded independently of Deriv.
            </p>
          </div>

          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5">
            <div className="flex items-center justify-between text-xs text-[#8492A6]">
              <span>Risk Guard Thresholds</span>
              <Shield className="w-4 h-4 text-[#ED168F]" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono-num">
              <div>
                <span className="text-[#8492A6] block">Max Stake</span>
                <span className="text-white font-semibold">${Number(risk?.maxStake || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[#8492A6] block">Max Daily Loss</span>
                <span className="text-white font-semibold">${Number(risk?.maxDailyLoss || 0).toFixed(2)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="mt-3 text-xs font-semibold text-[#00C8FF] hover:underline cursor-pointer"
            >
              Configure Risk Rules →
            </button>
          </div>
        </div>

        {/* Four Independent Trading Applications */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Trading Applications
            </h3>
            <span className="text-xs text-[#8492A6]">Single Sign-On Active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {appShortcuts.map((app) => {
              const Icon = app.icon;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => navigate(app.route)}
                  className="text-left rounded-xl border border-[#1D2B40] bg-[#0D1728] p-5 hover:border-[#00C8FF]/60 transition-colors cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Icon className={`w-5 h-5 ${app.color}`} />
                      <span className="text-[11px] font-mono-num text-[#8492A6]">{app.url}</span>
                    </div>
                    <div className="font-display font-bold text-base text-white">{app.name}</div>
                    <p className="text-xs text-[#8492A6] mt-1 leading-relaxed">{app.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#1D2B40] flex items-center justify-between text-xs font-semibold text-[#00C8FF]">
                    <span>Launch Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Activity & Transactions */}
        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#00C8FF]" />
              <h3 className="font-display font-bold text-base text-white">
                Recent Account Activity & Ledger Events
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="text-xs font-semibold text-[#00C8FF] hover:underline cursor-pointer"
            >
              View Full History
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8492A6]">
              No trading or platform ledger transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 pr-4 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium text-right">Timestamp (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2B40]/60">
                  {transactions.map((tx) => {
                    const pos = Number(tx.amount) >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-[#0D1728]/60">
                        <td className="py-2.5 pr-4 font-mono-num text-[#00C8FF]">{tx.source}</td>
                        <td className="py-2.5 pr-4 font-mono-num text-white">{tx.actionType}</td>
                        <td className="py-2.5 pr-4 text-[#8492A6] max-w-xs truncate">
                          {tx.description}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-mono-num font-semibold ${
                            pos ? 'text-[#20F000]' : 'text-[#FF1744]'
                          }`}
                        >
                          {pos ? '+' : ''}
                          {Number(tx.amount).toFixed(2)} {tx.currency}
                        </td>
                        <td className="py-2.5 text-right font-mono-num text-[#8492A6]">
                          {new Date(tx.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
};
