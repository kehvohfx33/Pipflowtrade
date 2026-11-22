import React, { useEffect, useState } from 'react';
import {
  Activity,
  DollarSign,
  LogOut,
  RefreshCw,
  Search,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

type AdminTab = 'overview' | 'users' | 'ledger' | 'apps' | 'audit';

export const AdminPage: React.FC = () => {
  const { navigate, setAdminModalOpen, showToast } = useApp();
  const [adminSession, setAdminSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<AdminTab>('overview');

  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [balances, setBalances] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Ledger Adjustment form
  const [selectedUserId, setSelectedUserId] = useState('');
  const [entryType, setEntryType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [adjusting, setAdjusting] = useState(false);

  const loadAll = async () => {
    try {
      const [dash, usr, bal, logs] = await Promise.all([
        apiFetch('/api/private-admin/dashboard'),
        apiFetch('/api/private-admin/users'),
        apiFetch('/api/private-admin/balances'),
        apiFetch('/api/private-admin/audit-logs'),
      ]);
      setDashboard(dash);
      setUsers(usr.users || []);
      setBalances(bal.balances || []);
      setAuditLogs(logs.logs || []);
      if (!selectedUserId && usr.users?.length > 0) {
        setSelectedUserId(usr.users[0].id);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to load admin console data.');
    }
  };

  useEffect(() => {
    apiFetch('/api/private-admin/session')
      .then((res) => {
        setAdminSession(res.admin);
        return loadAll();
      })
      .catch(() => {
        setAdminSession(null);
        setAdminModalOpen(true);
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedUserId || !adminSession) return;
    apiFetch<{ entries: any[] }>(`/api/private-admin/balances/${selectedUserId}/history`)
      .then((res) => setLedgerHistory(res.entries || []))
      .catch(() => {});
  }, [selectedUserId, adminSession]);

  const handleAdminLogout = async () => {
    await apiFetch('/api/private-admin/logout', { method: 'POST' });
    setAdminSession(null);
    navigate('/');
    showToast('info', 'Administrator logged out.');
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const next = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiFetch(`/api/private-admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, reason: `Admin status change to ${next}` }),
      });
      await loadAll();
      showToast('success', `User status updated to ${next}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Status update failed.');
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setAdjusting(true);
    try {
      await apiFetch('/api/private-admin/balances/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          entryType,
          amount: Number(amount),
          currency: 'USD',
          reason,
        }),
      });
      setReason('');
      await loadAll();
      const hist = await apiFetch<{ entries: any[] }>(
        `/api/private-admin/balances/${selectedUserId}/history`
      );
      setLedgerHistory(hist.entries || []);
      showToast('success', 'Platform ledger adjustment committed atomically.');
    } catch (err: any) {
      showToast('error', err?.message || 'Ledger adjustment rejected.');
    } finally {
      setAdjusting(false);
    }
  };

  const handleReverseEntry = async (entryId: string) => {
    if (!selectedUserId) return;
    try {
      await apiFetch('/api/private-admin/balances/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          entryType: 'REVERSAL',
          reverseEntryId: entryId,
          reason: `Reversal of entry ${entryId}`,
        }),
      });
      await loadAll();
      const hist = await apiFetch<{ entries: any[] }>(
        `/api/private-admin/balances/${selectedUserId}/history`
      );
      setLedgerHistory(hist.entries || []);
      showToast('info', 'Ledger entry reversed while preserving original immutable record.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to reverse entry.');
    }
  };

  const handleProbeApp = async (appId: string) => {
    await apiFetch(`/api/apps/${appId}/health`);
    await loadAll();
    showToast('info', `Health probe completed for ${appId}.`);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center text-sm text-[#8492A6]">
        Verifying administrator session...
      </div>
    );
  }

  if (!adminSession) {
    return (
      <div className="min-h-screen bg-[#050914] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Shield className="w-10 h-10 text-[#ED168F]" />
        <h1 className="font-display text-2xl font-bold">Protected Administration Route</h1>
        <p className="text-sm text-[#8492A6] max-w-md">
          Administrator credentials are verified exclusively on the server.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAdminModalOpen(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white cursor-pointer"
          >
            Authenticate Administrator
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm border border-[#1D2B40] text-[#8492A6] cursor-pointer"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      !searchQ ||
      u.email.toLowerCase().includes(searchQ.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col">
      <header className="border-b border-[#1D2B40] bg-[#0B1220] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PipflowLogo size="sm" onClick={() => navigate('/dashboard')} />
          <span className="text-xs font-mono-num text-[#ED168F] font-bold">
            PRIVATE ADMIN ({adminSession.role})
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="hidden sm:inline text-[#8492A6]">{adminSession.email}</span>
          <button
            type="button"
            onClick={handleAdminLogout}
            className="px-3 py-1.5 rounded-lg border border-[#FF1744]/50 text-[#FF1744] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Admin Logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2 p-1 rounded-xl bg-[#0B1220] border border-[#1D2B40] w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'users', label: 'User Management', icon: Users },
            { id: 'ledger', label: 'Platform Ledger', icon: DollarSign },
            { id: 'apps', label: 'Applications', icon: Server },
            { id: 'audit', label: 'Audit Logs', icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as AdminTab)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  tab === item.id
                    ? 'bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white'
                    : 'text-[#8492A6] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {tab === 'overview' && dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Registered Users', val: dashboard.metrics.totalUsers },
              { label: 'Active Users', val: dashboard.metrics.activeUsers },
              { label: 'Suspended Users', val: dashboard.metrics.suspendedUsers },
              { label: 'Connected Deriv Accounts', val: dashboard.metrics.connectedDerivAccounts },
              { label: 'Active User Sessions', val: dashboard.metrics.activeUserSessions },
              { label: 'Active App SSO Sessions', val: dashboard.metrics.activeAppSessions },
              { label: 'Executed Deriv Trades', val: dashboard.metrics.totalTrades },
              { label: 'Open Support Tickets', val: dashboard.metrics.openSupportTickets },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-4">
                <div className="text-xs text-[#8492A6]">{m.label}</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-white">{m.val}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display font-bold text-base">Registered Users</h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#8492A6] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search email or name..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-xs text-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Deriv Account</th>
                    <th className="py-2 pr-4 text-right">Platform Ledger</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2B40]/60">
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-4">
                        <div className="font-semibold text-white">{u.fullName}</div>
                        <div className="text-[#8492A6]">{u.email}</div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num">
                        <span className={u.status === 'ACTIVE' ? 'text-[#20F000]' : 'text-[#FF1744]'}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num text-[#8492A6]">
                        {u.activeDerivAccount
                          ? `${u.activeDerivAccount.derivLoginId} (${Number(
                              u.activeDerivAccount.reportedBalance
                            ).toFixed(2)})`
                          : 'None'}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num text-[#00C8FF]">
                        ${Number(u.platformLedgerBalance).toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u.id, u.status)}
                          className="px-2.5 py-1 rounded-lg border border-[#1D2B40] hover:border-[#00C8FF] text-xs cursor-pointer"
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'ledger' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleAdjustBalance}
              className="lg:col-span-5 rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-4"
            >
              <div>
                <h2 className="font-display font-bold text-base text-white">
                  Platform Ledger Adjustment
                </h2>
                <p className="text-xs text-[#8492A6] mt-1">
                  Adjusts ONLY the internal PIPFLOWTRADE Platform Ledger. Authoritative Deriv
                  balances are never altered.
                </p>
              </div>

              <div>
                <label className="block text-xs text-[#8492A6] mb-1">Target User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                >
                  {balances.map((b) => (
                    <option key={b.userId} value={b.userId}>
                      {b.fullName} ({b.email}) — Ledger: ${Number(b.platformLedgerBalance).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">Entry Type</label>
                  <select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                  >
                    <option value="CREDIT">CREDIT (+)</option>
                    <option value="DEBIT">DEBIT (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#8492A6] mb-1">Audit Reason</label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Promotional credit or fee rebate"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={adjusting || !selectedUserId}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white cursor-pointer"
              >
                {adjusting ? 'Committing Atomic Entry...' : 'Commit Ledger Adjustment'}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3 overflow-x-auto">
              <h3 className="font-display font-bold text-base text-white">
                Immutable User Ledger History
              </h3>
              {ledgerHistory.length === 0 ? (
                <p className="text-xs text-[#8492A6]">No ledger entries for selected user.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Reason</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3 text-right">New Bal</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D2B40]/60">
                    {ledgerHistory.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-3 font-mono-num text-[#00C8FF]">{e.entryType}</td>
                        <td className="py-2 pr-3 text-white">{e.reason}</td>
                        <td className="py-2 pr-3 text-right font-mono-num text-[#20F000]">
                          {Number(e.amount).toFixed(2)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono-num text-white">
                          {Number(e.newBalance).toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {e.entryType !== 'REVERSAL' && (
                            <button
                              type="button"
                              onClick={() => handleReverseEntry(e.id)}
                              className="text-[11px] text-[#ED168F] hover:underline cursor-pointer"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'apps' && dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dashboard.applications.map((app: any) => (
              <div key={app.id} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display font-bold text-base text-white">{app.name}</div>
                    <div className="text-xs font-mono-num text-[#00C8FF]">{app.productionUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleProbeApp(app.id)}
                    className="p-2 rounded-lg border border-[#1D2B40] text-[#8492A6] hover:text-white cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs font-mono-num text-[#8492A6] flex flex-wrap gap-4">
                  <span>
                    Health:{' '}
                    <strong className={app.healthStatus === 'ONLINE' ? 'text-[#20F000]' : 'text-[#FF1744]'}>
                      {app.healthStatus}
                    </strong>
                  </span>
                  <span>SSO: {app.ssoEnabled ? 'ENABLED' : 'DISABLED'}</span>
                  <span>Iframe: {app.iframeCompatible ? 'ALLOWED' : 'BLOCKED'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'audit' && (
          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 overflow-x-auto">
            <h2 className="font-display font-bold text-base mb-4">Administrator Security Audit Log</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Admin</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 text-right">Timestamp (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2B40]/60">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 font-mono-num text-[#00C8FF]">{log.action}</td>
                    <td className="py-2 pr-4 text-white">{log.adminEmail}</td>
                    <td className="py-2 pr-4 font-mono-num text-[#8492A6]">
                      {log.targetType} {log.targetId ? `(${log.targetId.slice(0, 8)}...)` : ''}
                    </td>
                    <td className="py-2 text-right font-mono-num text-[#8492A6]">
                      {new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
