import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bot,
  ExternalLink,
  Layers,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  TrendingUp,
  UserCheck,
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

interface RegistryApp {
  id: 'bot' | 'trader' | 'charts' | 'options';
  name: string;
  subtitle?: string;
  description: string;
  productionUrl: string;
  vercelProjectRef?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  ssoEnabled: boolean;
  userAccessible?: boolean;
  restrictionReason?: string | null;
}

export const DashboardPage: React.FC = () => {
  const { session, navigate, refreshSession, derivFeedStatus, showToast } = useApp();
  const [syncingBalance, setSyncingBalance] = useState(false);
  const [togglingStop, setTogglingStop] = useState(false);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TxSummary[]>([]);
  const [apps, setApps] = useState<RegistryApp[]>([]);

  useEffect(() => {
    apiFetch<{ transactions: TxSummary[] }>('/api/user/transactions')
      .then((res) => setTransactions((res.transactions || []).slice(0, 8)))
      .catch(() => {});
    apiFetch<{ apps: RegistryApp[] }>('/api/applications')
      .then((res) => setApps(res.apps || []))
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

  const handleSwitchDerivAccount = async (derivAccountId: string) => {
    setSwitchingAccount(derivAccountId);
    try {
      await apiFetch('/api/deriv/select-account', {
        method: 'POST',
        body: JSON.stringify({ derivAccountId }),
      });
      await refreshSession();
      showToast('success', 'Active Deriv account updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to switch Deriv account.');
    } finally {
      setSwitchingAccount(null);
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

  const handleLaunchStandaloneSso = async (appId: string) => {
    setLaunchingAppId(appId);
    try {
      const auth = await apiFetch<{ launchUrl: string; appName: string }>(
        `/api/applications/${appId}/authorize`,
        { method: 'POST' }
      );
      window.location.assign(auth.launchUrl);
    } catch (err: any) {
      showToast('error', err?.message || `Unable to launch ${appId} with SSO.`);
    } finally {
      setLaunchingAppId(null);
    }
  };

  const activeDeriv = session.activeDerivAccount;
  const risk = session.riskSettings;
  const demoStats = session.tradingStats?.demo || { total: 0, open: 0, closed: 0, wins: 0, losses: 0, profitLoss: '0.00' };
  const realStats = session.tradingStats?.real || { total: 0, open: 0, closed: 0, wins: 0, losses: 0, profitLoss: '0.00' };

  const iconMap: Record<string, { icon: React.ComponentType<any>; color: string }> = {
    bot: { icon: Bot, color: 'text-[#11C9F4]' },
    trader: { icon: TrendingUp, color: 'text-[#16D94B]' },
    charts: { icon: BarChart2, color: 'text-[#EC2698]' },
    options: { icon: Layers, color: 'text-[#2589F5]' },
  };

  const displayName = session.profile?.fullName || session.user?.email || 'Trader';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <WorkspaceLayout title="Main Dashboard">
      <div className="space-y-6">
        {/* Account Overview Header Card */}
        <div className="rounded-2xl border border-[#17243A] bg-[#0D1728] p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#11C9F4] to-[#EC2698] flex items-center justify-center font-display font-bold text-lg text-white shrink-0">
              {initials || 'PF'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-[#11C9F4]">ACCOUNT OVERVIEW</span>
                <span className="text-[#8996AA]">·</span>
                <span className="font-mono-num text-[#16D94B]">{session.user?.status || 'ACTIVE'}</span>
                <span className="text-[#8996AA]">·</span>
                <span className="font-mono-num text-white">
                  Plan: {session.subscription?.planName || 'Starter Workspace'}
                </span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-0.5">
                {displayName}
              </h2>
              <p className="text-xs text-[#8996AA] mt-0.5 font-mono-num">
                {session.user?.email} · Joined{' '}
                {session.user?.createdAt ? session.user.createdAt.slice(0, 10) : '—'} · Last Login{' '}
                {session.user?.lastLoginAt
                  ? new Date(session.user.lastLoginAt).toISOString().replace('T', ' ').slice(0, 16)
                  : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeDeriv ? (
              <button
                type="button"
                onClick={handleSyncDerivBalance}
                disabled={syncingBalance}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#17243A] bg-[#0A1220] hover:border-[#11C9F4]/50 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingBalance ? 'animate-spin' : ''}`} />
                <span>{syncingBalance ? 'Syncing Deriv...' : 'Sync Deriv Balance'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#11C9F4] text-[#050914] inline-flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Connect Deriv Account</span>
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

        {/* Strict Dual-Balance Separation: Authoritative Deriv vs PIPFLOWTRADE Simulated Wallet */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5">
            <div className="flex items-center justify-between text-xs text-[#8996AA]">
              <span>Authoritative Deriv Balance ({activeDeriv?.accountType || 'UNLINKED'})</span>
              <span className="font-mono-num text-[#16D94B]">
                {activeDeriv ? activeDeriv.derivLoginId : 'Not Linked'}
              </span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-white">
              {activeDeriv
                ? `${Number(activeDeriv.reportedBalance).toFixed(2)} ${activeDeriv.currency}`
                : '—'}
            </div>
            <p className="mt-2 text-[11px] text-[#8996AA]">
              Synced live from Deriv API ({derivFeedStatus}). Never overwritten internally.
            </p>
          </div>

          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5">
            <div className="flex items-center justify-between text-xs text-[#8996AA]">
              <span>PIPFLOWTRADE Simulated Demo Wallet</span>
              <span
                className={`font-mono-num font-semibold ${
                  session.platformLedger?.status === 'FROZEN' ? 'text-[#FF1744]' : 'text-[#11C9F4]'
                }`}
              >
                {session.platformLedger?.status || 'ACTIVE'}
              </span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#11C9F4]">
              {Number(session.platformLedger?.availableBalance || 0).toFixed(2)}{' '}
              {session.platformLedger?.currency || 'USD'}
            </div>
            <p className="mt-2 text-[11px] text-[#8996AA]">
              Platform simulated demo/ledger funds strictly separated from Deriv.
            </p>
          </div>

          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5">
            <div className="flex items-center justify-between text-xs text-[#8996AA]">
              <span>Shared Cross-App Risk Guard</span>
              <Shield className="w-4 h-4 text-[#EC2698]" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono-num">
              <div>
                <span className="text-[#8996AA] block">Max Stake</span>
                <span className="text-white font-semibold">${Number(risk?.maxStake || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[#8996AA] block">Max Daily Loss</span>
                <span className="text-white font-semibold">${Number(risk?.maxDailyLoss || 0).toFixed(2)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="mt-3 text-xs font-semibold text-[#11C9F4] hover:underline cursor-pointer"
            >
              Configure Risk Rules →
            </button>
          </div>
        </div>

        {/* Connected Deriv Accounts Switcher + Real vs Demo Trading Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#11C9F4]" />
                <span>Connected Deriv Accounts</span>
              </h3>
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="text-xs text-[#11C9F4] hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            {session.derivAccounts.length === 0 ? (
              <p className="text-xs text-[#8996AA] py-4">
                No Deriv accounts linked yet. Connect via official Deriv OAuth2 or API token in Account Settings.
              </p>
            ) : (
              <div className="space-y-2">
                {session.derivAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      acc.isActive
                        ? 'border-[#11C9F4]/60 bg-[#101C30]'
                        : 'border-[#17243A] bg-[#0A1220]'
                    }`}
                  >
                    <div>
                      <div className="font-mono-num font-bold text-white flex items-center gap-2">
                        <span>{acc.derivLoginId}</span>
                        <span
                          className={
                            acc.accountType === 'REAL' ? 'text-[#FF1744]' : 'text-[#16D94B]'
                          }
                        >
                          {acc.accountType}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#8996AA] font-mono-num mt-0.5">
                        {Number(acc.reportedBalance).toFixed(2)} {acc.currency}
                      </div>
                    </div>
                    {acc.isActive ? (
                      <span className="text-[11px] font-semibold text-[#11C9F4]">ACTIVE</span>
                    ) : (
                      <button
                        type="button"
                        disabled={switchingAccount === acc.id}
                        onClick={() => handleSwitchDerivAccount(acc.id)}
                        className="px-2.5 py-1 rounded-lg border border-[#17243A] hover:border-[#11C9F4] text-[11px] text-white cursor-pointer"
                      >
                        {switchingAccount === acc.id ? 'Switching...' : 'Switch'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Separated Real vs Demo Trading Statistics */}
          <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: 'Deriv DEMO Trading Stats', data: demoStats, accent: 'text-[#16D94B]' },
              { title: 'Deriv REAL Trading Stats', data: realStats, accent: 'text-[#FF1744]' },
            ].map((block) => (
              <div key={block.title} className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
                <div className={`text-xs font-semibold ${block.accent}`}>{block.title}</div>
                <div className="grid grid-cols-3 gap-2 font-mono-num text-xs">
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Total</span>
                    <span className="text-white font-bold text-sm">{block.data.total}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Open</span>
                    <span className="text-[#11C9F4] font-bold text-sm">{block.data.open}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Closed</span>
                    <span className="text-white font-bold text-sm">{block.data.closed}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Wins</span>
                    <span className="text-[#16D94B] font-bold text-sm">{block.data.wins}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Losses</span>
                    <span className="text-[#FF1744] font-bold text-sm">{block.data.losses}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block text-[11px]">Net P/L</span>
                    <span className="text-white font-bold text-sm">${block.data.profitLoss}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Independent Trading Applications Launcher */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Independent Trading Applications
            </h3>
            <span className="text-xs text-[#8996AA]">
              Launches standalone Vercel subdomains with signed 90s SSO (no forced iframe)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {apps.map((app) => {
              const meta = iconMap[app.id] || { icon: Layers, color: 'text-[#11C9F4]' };
              const Icon = meta.icon;
              const accessible = app.userAccessible !== false && app.ssoEnabled && !app.maintenanceMode;
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 flex flex-col justify-between hover:border-[#11C9F4]/50 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                      <span className="text-[11px] font-mono-num text-[#8996AA]">
                        {app.productionUrl.replace(/^https?:\/\//, '')}
                      </span>
                    </div>
                    <div className="font-display font-bold text-base text-white">{app.name}</div>
                    <p className="text-xs text-[#8996AA] mt-1 leading-relaxed">{app.description}</p>
                    {!accessible && app.restrictionReason && (
                      <div className="mt-2.5 p-2 rounded-lg bg-[#FF1744]/10 border border-[#FF1744]/30 text-[11px] text-[#FF1744] flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        <span>{app.restrictionReason}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#17243A] flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={!accessible || launchingAppId === app.id}
                      onClick={() => handleLaunchStandaloneSso(app.id)}
                      className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      <span>{launchingAppId === app.id ? 'Issuing SSO...' : 'Open Standalone SSO'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/${app.id}` as AppRoute)}
                      className="w-full py-1.5 px-3 rounded-lg text-xs font-medium border border-[#17243A] bg-[#0A1220] text-[#8996AA] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Workspace & Live Terminal</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity & Transactions */}
        <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#11C9F4]" />
              <h3 className="font-display font-bold text-base text-white">
                Recent Account Activity & Ledger Events
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="text-xs font-semibold text-[#11C9F4] hover:underline cursor-pointer"
            >
              View Full History
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8996AA]">
              No trading or platform ledger transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#17243A] text-[#8996AA]">
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 pr-4 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium text-right">Timestamp (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17243A]/60">
                  {transactions.map((tx) => {
                    const pos = Number(tx.amount) >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-[#101C30]/60">
                        <td className="py-2.5 pr-4 font-mono-num text-[#11C9F4]">{tx.source}</td>
                        <td className="py-2.5 pr-4 font-mono-num text-white">{tx.actionType}</td>
                        <td className="py-2.5 pr-4 text-[#8996AA] max-w-xs truncate">
                          {tx.description}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-mono-num font-semibold ${
                            pos ? 'text-[#16D94B]' : 'text-[#FF1744]'
                          }`}
                        >
                          {pos ? '+' : ''}
                          {Number(tx.amount).toFixed(2)} {tx.currency}
                        </td>
                        <td className="py-2.5 text-right font-mono-num text-[#8996AA]">
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
