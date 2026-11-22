import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CreditCard,
  DollarSign,
  Download,
  FileEdit,
  LineChart,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

type AdminTab =
  | 'overview'
  | 'users'
  | 'balances'
  | 'apps'
  | 'trading'
  | 'bots'
  | 'commissions'
  | 'plans'
  | 'cms'
  | 'security'
  | 'system';

const APP_IDS: Array<'bot' | 'trader' | 'charts' | 'options'> = ['bot', 'trader', 'charts', 'options'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN', 'APP_MANAGER', 'SUPPORT', 'AUDITOR'];

export const AdminPage: React.FC = () => {
  const { navigate, setAdminModalOpen, showToast } = useApp();
  const [adminSession, setAdminSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Core Admin Datasets
  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [balances, setBalances] = useState<any[]>([]);
  const [derivAccounts, setDerivAccounts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  // Extended Enterprise Datasets
  const [contracts, setContracts] = useState<any[]>([]);
  const [contractSummary, setContractSummary] = useState<any>(null);
  const [tradeModeFilter, setTradeModeFilter] = useState('ALL');
  const [tradeAppFilter, setTradeAppFilter] = useState('ALL');
  const [bots, setBots] = useState<any[]>([]);
  const [botLogs, setBotLogs] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionSummary, setCommissionSummary] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [cmsContent, setCmsContent] = useState<any>(null);
  const [admins, setAdmins] = useState<any[]>([]);
  const [sessionsData, setSessionsData] = useState<{ userSessions: any[]; adminSessions: any[] }>({
    userSessions: [],
    adminSessions: [],
  });
  const [systemInfo, setSystemInfo] = useState<any>(null);

  // Sub-tabs & Form States
  const [balanceView, setBalanceView] = useState<'deriv' | 'demo_wallet'>('deriv');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [entryType, setEntryType] = useState<
    'CREDIT' | 'DEBIT' | 'SET_BALANCE' | 'RESET' | 'FREEZE' | 'UNFREEZE'
  >('CREDIT');
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [adjusting, setAdjusting] = useState(false);

  // App Editing Drafts
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [appDraft, setAppDraft] = useState<any>(null);

  // Commission Form
  const [commForm, setCommForm] = useState({
    appId: 'trader',
    source: 'PARTNER_REPORT',
    amount: '0.00',
    status: 'CONFIRMED',
    notes: '',
  });

  // New Admin Form
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', role: 'SUPPORT' });

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const [
        dash,
        usr,
        bal,
        logs,
        tkt,
        trd,
        bt,
        com,
        pln,
        cnt,
        adm,
        ses,
        sys,
      ] = await Promise.all([
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/balances'),
        apiFetch('/api/admin/audit-logs'),
        apiFetch('/api/admin/tickets'),
        apiFetch(`/api/admin/trading/contracts?mode=${tradeModeFilter}&appId=${tradeAppFilter}`),
        apiFetch('/api/admin/bots'),
        apiFetch('/api/admin/commissions'),
        apiFetch('/api/admin/plans'),
        apiFetch('/api/admin/content'),
        apiFetch('/api/admin/admins'),
        apiFetch('/api/admin/sessions'),
        apiFetch('/api/admin/system'),
      ]);

      setDashboard(dash);
      setUsers(usr.users || []);
      setBalances(bal.balances || []);
      setDerivAccounts(bal.derivAccounts || []);
      setAuditLogs(logs.logs || []);
      setTickets(tkt.tickets || []);
      setContracts(trd.contracts || []);
      setContractSummary(trd.summary || null);
      setBots(bt.bots || []);
      setCommissions(com.records || []);
      setCommissionSummary(com.summary || null);
      setPlans(pln.plans || []);
      setCmsContent(cnt.content || null);
      setAdmins(adm.admins || []);
      setSessionsData({
        userSessions: ses.userSessions || [],
        adminSessions: ses.adminSessions || [],
      });
      setSystemInfo(sys);

      if (!selectedUserId && usr.users?.length > 0) {
        setSelectedUserId(usr.users[0].id);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to load admin console data.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    apiFetch('/api/admin/session')
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
    apiFetch<{ entries: any[] }>(`/api/admin/balances/${selectedUserId}/history`)
      .then((res) => setLedgerHistory(res.entries || []))
      .catch(() => {});
  }, [selectedUserId, adminSession]);

  useEffect(() => {
    if (!adminSession) return;
    apiFetch(`/api/admin/trading/contracts?mode=${tradeModeFilter}&appId=${tradeAppFilter}`)
      .then((res) => {
        setContracts(res.contracts || []);
        setContractSummary(res.summary || null);
      })
      .catch(() => {});
  }, [tradeModeFilter, tradeAppFilter, adminSession]);

  const handleAdminLogout = async () => {
    await apiFetch('/api/admin/logout', { method: 'POST' });
    setAdminSession(null);
    navigate('/');
    showToast('info', 'Administrator logged out.');
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const next = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, reason: `Admin status change to ${next}` }),
      });
      await loadAll();
      showToast('success', `User status updated to ${next}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Status update failed.');
    }
  };

  const handleAssignUserPlan = async (userId: string, planId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ planId }),
      });
      await loadAll();
      showToast('success', 'User membership plan updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to assign plan.');
    }
  };

  const handleToggleUserAppRestriction = async (
    userId: string,
    currentRestricted: string[],
    appId: string
  ) => {
    const next = currentRestricted.includes(appId)
      ? currentRestricted.filter((x) => x !== appId)
      : [...currentRestricted, appId];
    try {
      await apiFetch(`/api/admin/users/${userId}/app-restrictions`, {
        method: 'PATCH',
        body: JSON.stringify({ restrictedApps: next }),
      });
      await loadAll();
      showToast('info', `Updated app restrictions for user.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update app restrictions.');
    }
  };

  const handleSyncUserDerivBalance = async (userId: string) => {
    try {
      const res = await apiFetch<any>(`/api/admin/balances/${userId}/sync-deriv`, {
        method: 'POST',
      });
      await loadAll();
      showToast(
        'success',
        `Synced Deriv ${res.derivLoginId} (${res.accountType}): ${Number(res.balance).toFixed(2)} ${res.currency}`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to sync Deriv balance.');
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setAdjusting(true);
    try {
      await apiFetch('/api/admin/balances/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          entryType,
          amount: ['RESET', 'FREEZE', 'UNFREEZE'].includes(entryType) ? 0 : Number(amount),
          currency: 'USD',
          reason,
        }),
      });
      setReason('');
      await loadAll();
      const hist = await apiFetch<{ entries: any[] }>(`/api/admin/balances/${selectedUserId}/history`);
      setLedgerHistory(hist.entries || []);
      showToast('success', 'PIPFLOWTRADE Simulated Demo Wallet updated atomically.');
    } catch (err: any) {
      showToast('error', err?.message || 'Ledger adjustment rejected.');
    } finally {
      setAdjusting(false);
    }
  };

  const handleReverseEntry = async (entryId: string) => {
    if (!selectedUserId) return;
    try {
      await apiFetch('/api/admin/balances/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          entryType: 'REVERSAL',
          reverseEntryId: entryId,
          reason: `Reversal of entry ${entryId}`,
        }),
      });
      await loadAll();
      const hist = await apiFetch<{ entries: any[] }>(`/api/admin/balances/${selectedUserId}/history`);
      setLedgerHistory(hist.entries || []);
      showToast('info', 'Ledger entry reversed while preserving original immutable record.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to reverse entry.');
    }
  };

  const handleProbeApp = async (appId: string) => {
    try {
      await apiFetch(`/api/applications/${appId}/health`);
      await loadAll();
      showToast('info', `Health probe completed for ${appId}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Health probe failed.');
    }
  };

  const handleSaveAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppId || !appDraft) return;
    try {
      await apiFetch(`/api/admin/applications/${editingAppId}`, {
        method: 'PATCH',
        body: JSON.stringify(appDraft),
      });
      setEditingAppId(null);
      setAppDraft(null);
      await loadAll();
      showToast('success', 'Application registry updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update application config.');
    }
  };

  const handleBotAction = async (
    botId: string,
    action: 'SUSPEND' | 'STOP' | 'ENABLE' | 'EMERGENCY_STOP'
  ) => {
    try {
      await apiFetch(`/api/admin/bots/${botId}/action`, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason: `Admin action: ${action}` }),
      });
      await loadAll();
      showToast('success', `Bot action ${action} executed.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Bot action failed.');
    }
  };

  const handleViewBotLogs = async (botId: string) => {
    try {
      const res = await apiFetch<{ logs: any[] }>(`/api/admin/bots/${botId}/logs`);
      setBotLogs(res.logs || []);
    } catch {
      setBotLogs([]);
    }
  };

  const handleLogCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/commissions', {
        method: 'POST',
        body: JSON.stringify({
          ...commForm,
          amount: Number(commForm.amount),
          currency: 'USD',
        }),
      });
      setCommForm({ ...commForm, amount: '0.00', notes: '' });
      await loadAll();
      showToast('success', 'Commission record logged.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to log commission.');
    }
  };

  const handleUpdatePlan = async (plan: any) => {
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify(plan),
      });
      await loadAll();
      showToast('success', `Updated plan: ${plan.name}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update plan.');
    }
  };

  const handleSaveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmsContent) return;
    try {
      await apiFetch('/api/admin/content', {
        method: 'PATCH',
        body: JSON.stringify(cmsContent),
      });
      await loadAll();
      showToast('success', 'Website CMS content published cleanly.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to publish CMS content.');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(newAdmin),
      });
      setNewAdmin({ email: '', password: '', role: 'SUPPORT' });
      await loadAll();
      showToast('success', 'Administrator account provisioned.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create administrator.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiFetch(`/api/admin/sessions/${sessionId}/revoke`, { method: 'POST' });
      await loadAll();
      showToast('info', 'Session revoked.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to revoke session.');
    }
  };

  const handleUpdateTicketStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAll();
      showToast('success', `Ticket marked ${status}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Ticket update failed.');
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center text-sm text-[#8996AA]">
        Verifying administrator session...
      </div>
    );
  }

  if (!adminSession) {
    return (
      <div className="min-h-screen bg-[#050914] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Shield className="w-10 h-10 text-[#EC2698]" />
        <h1 className="font-display text-2xl font-bold">Protected Administration Route</h1>
        <p className="text-sm text-[#8996AA] max-w-md">
          Administrator credentials and role permissions are verified exclusively on the server.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAdminModalOpen(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
          >
            Authenticate Administrator
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm border border-[#17243A] text-[#8996AA] cursor-pointer"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (!searchQ) return true;
    return (
      u.email.toLowerCase().includes(searchQ.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQ.toLowerCase())
    );
  });

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'balances', label: 'Balances', icon: DollarSign },
    { id: 'apps', label: 'Applications', icon: Server },
    { id: 'trading', label: 'Trading', icon: LineChart },
    { id: 'bots', label: 'Bots', icon: Bot },
    { id: 'commissions', label: 'Commissions', icon: CreditCard },
    { id: 'plans', label: 'Plans', icon: Lock },
    { id: 'cms', label: 'Website CMS', icon: FileEdit },
    { id: 'security', label: 'Security & Admins', icon: Shield },
    { id: 'system', label: 'System Health', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#050914] text-[#F4F7FC] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[#17243A] bg-[#070D19] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PipflowLogo size="sm" onClick={() => navigate('/dashboard')} />
          <span className="text-xs font-mono-num text-[#EC2698] font-bold">
            ADMIN ({adminSession.role})
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          <span className="hidden md:inline text-[#8996AA]">{adminSession.email}</span>
          <button
            type="button"
            onClick={loadAll}
            className="p-2 rounded-lg border border-[#17243A] bg-[#0A1220] text-[#8996AA] hover:text-white cursor-pointer"
            aria-label="Refresh admin data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleAdminLogout}
            className="px-3 py-1.5 rounded-lg border border-[#FF1744]/50 text-[#FF1744] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* Scrollable Mobile-Friendly Admin Module Tabs */}
        <div className="overflow-x-auto pb-1">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#070D19] border border-[#17243A] w-max min-w-full sm:min-w-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    tab === item.id
                      ? 'bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white'
                      : 'text-[#8996AA] hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. OVERVIEW */}
        {tab === 'overview' && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {[
                { label: 'Total Users', val: dashboard.metrics.totalUsers },
                { label: 'Active / Verified', val: `${dashboard.metrics.activeUsers} / ${dashboard.metrics.verifiedUsers}` },
                { label: 'Deriv Real / Demo', val: `${dashboard.metrics.realDerivAccounts} / ${dashboard.metrics.demoDerivAccounts}` },
                { label: 'Trades (Real / Demo)', val: `${dashboard.metrics.realTrades} / ${dashboard.metrics.demoTrades}` },
                { label: 'Open / Closed Trades', val: `${dashboard.metrics.openTrades} / ${dashboard.metrics.closedTrades}` },
                { label: 'Running Bots', val: `${dashboard.metrics.runningBots} / ${dashboard.metrics.totalBots}` },
                { label: 'Active User Sessions', val: dashboard.metrics.activeUserSessions },
                { label: 'Active SSO Sessions', val: dashboard.metrics.activeAppSessions },
                { label: 'Confirmed Commissions', val: `$${dashboard.commissionSummary.confirmed}` },
                { label: 'Open Support Tickets', val: dashboard.metrics.openSupportTickets },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-[#17243A] bg-[#0D1728] p-4">
                  <div className="text-[11px] text-[#8996AA]">{m.label}</div>
                  <div className="mt-1 text-xl font-bold font-mono-num text-white">{m.val}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
                <h3 className="font-display font-bold text-sm text-white">App Usage & Maintenance</h3>
                <div className="space-y-2 text-xs">
                  {(dashboard.appUsage || []).map((a: any) => (
                    <div key={a.appId} className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A] flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{a.name}</span>
                        {a.maintenanceMode && <span className="ml-2 text-amber-400 font-mono-num">MAINTENANCE</span>}
                      </div>
                      <div className="font-mono-num text-[#8996AA] flex gap-4">
                        <span>SSO: <strong className="text-white">{a.sessions}</strong></span>
                        <span>Trades: <strong className="text-[#11C9F4]">{a.trades}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
                <h3 className="font-display font-bold text-sm text-white">Platform Integration Health</h3>
                <div className="grid grid-cols-2 gap-2.5 text-xs font-mono-num">
                  <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block">Database</span>
                    <span className="text-[#16D94B] font-bold">{dashboard.systemHealth?.databaseStatus}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block">Deriv WS Feed</span>
                    <span className="text-[#11C9F4] font-bold">{dashboard.systemHealth?.derivWsStatus}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block">Brevo Email</span>
                    <span className="text-white font-bold">
                      {dashboard.systemHealth?.brevoConfigured ? 'CONFIGURED' : 'UNCONFIGURED'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                    <span className="text-[#8996AA] block">Deriv OAuth2</span>
                    <span className="text-white font-bold">
                      {dashboard.systemHealth?.derivOAuthConfigured ? 'CONFIGURED' : 'UNCONFIGURED'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. USER MANAGEMENT */}
        {tab === 'users' && (
          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display font-bold text-base">Registered Users, Plans & App Restrictions</h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#0A1220] border border-[#17243A] text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-[#8996AA] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search email or name..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0A1220] border border-[#17243A] text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#17243A] text-[#8996AA]">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Plan Assignment</th>
                    <th className="py-2 pr-4">Blocked Apps</th>
                    <th className="py-2 pr-4">Deriv Account</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17243A]/60">
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-4">
                        <div className="font-semibold text-white">{u.fullName}</div>
                        <div className="text-[#8996AA]">{u.email}</div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num">
                        <span className={u.status === 'ACTIVE' ? 'text-[#16D94B]' : 'text-[#FF1744]'}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <select
                          value={u.planId || 'plan-starter'}
                          onChange={(e) => handleAssignUserPlan(u.id, e.target.value)}
                          className="px-2 py-1 rounded-lg bg-[#0A1220] border border-[#17243A] text-xs text-white"
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          {APP_IDS.map((id) => {
                            const blocked = (u.restrictedApps || []).includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => handleToggleUserAppRestriction(u.id, u.restrictedApps || [], id)}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono-num border cursor-pointer ${
                                  blocked
                                    ? 'border-[#FF1744] bg-[#FF1744]/15 text-[#FF1744]'
                                    : 'border-[#17243A] bg-[#0A1220] text-[#8996AA]'
                                }`}
                                title={blocked ? `Unblock ${id}` : `Block ${id}`}
                              >
                                {id}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num text-[#8996AA]">
                        {u.activeDerivAccount
                          ? `${u.activeDerivAccount.derivLoginId} (${Number(
                              u.activeDerivAccount.reportedBalance
                            ).toFixed(2)})`
                          : 'None'}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u.id, u.status)}
                          className="px-2.5 py-1 rounded-lg border border-[#17243A] hover:border-[#11C9F4] text-xs cursor-pointer"
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

        {/* 3. BALANCES (REAL/DERIV SYNCED vs SIMULATED DEMO WALLET) */}
        {tab === 'balances' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBalanceView('deriv')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  balanceView === 'deriv'
                    ? 'bg-[#11C9F4] text-[#050914]'
                    : 'bg-[#0D1728] border border-[#17243A] text-[#8996AA]'
                }`}
              >
                Real & Deriv Synced Accounts (Read-Only Authoritative)
              </button>
              <button
                type="button"
                onClick={() => setBalanceView('demo_wallet')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  balanceView === 'demo_wallet'
                    ? 'bg-[#EC2698] text-white'
                    : 'bg-[#0D1728] border border-[#17243A] text-[#8996AA]'
                }`}
              >
                PIPFLOWTRADE Simulated Demo Wallet / Platform Ledger
              </button>
            </div>

            {balanceView === 'deriv' && (
              <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4 overflow-x-auto">
                <div>
                  <h2 className="font-display font-bold text-base text-white">
                    Authoritative Connected Deriv Accounts
                  </h2>
                  <p className="text-xs text-[#8996AA] mt-0.5">
                    Real and Deriv VRTC Demo balances come directly from Deriv API. PIPFLOWTRADE never alters real Deriv balances internally.
                  </p>
                </div>
                {derivAccounts.length === 0 ? (
                  <p className="text-xs text-[#8996AA] py-6">No Deriv accounts connected yet.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#17243A] text-[#8996AA]">
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Deriv Login ID</th>
                        <th className="py-2 pr-4">Account Type</th>
                        <th className="py-2 pr-4 text-right">Synced Balance</th>
                        <th className="py-2 pr-4 text-right">Last Sync</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#17243A]/60">
                      {derivAccounts.map((acc) => (
                        <tr key={acc.id}>
                          <td className="py-2.5 pr-4">
                            <div className="text-white font-semibold">{acc.userName}</div>
                            <div className="text-[#8996AA]">{acc.userEmail}</div>
                          </td>
                          <td className="py-2.5 pr-4 font-mono-num text-[#11C9F4]">{acc.derivLoginId}</td>
                          <td className="py-2.5 pr-4 font-mono-num">
                            <span className={acc.accountType === 'REAL' ? 'text-[#FF1744]' : 'text-[#16D94B]'}>
                              {acc.accountType}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono-num font-bold text-white">
                            {Number(acc.reportedBalance).toFixed(2)} {acc.currency}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono-num text-[#8996AA]">
                            {acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toISOString().slice(0, 19).replace('T', ' ') : '—'}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleSyncUserDerivBalance(acc.userId)}
                              className="px-2.5 py-1 rounded-lg border border-[#17243A] hover:border-[#11C9F4] text-xs cursor-pointer"
                            >
                              Sync from Deriv
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {balanceView === 'demo_wallet' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleAdjustBalance}
                  className="lg:col-span-5 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4"
                >
                  <div>
                    <h2 className="font-display font-bold text-base text-white">
                      Simulated Demo Wallet Adjustment
                    </h2>
                    <p className="text-xs text-[#8996AA] mt-1">
                      Controls ONLY the internal PIPFLOWTRADE Simulated Demo Wallet / Platform Ledger.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8996AA] mb-1">Target User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm text-white"
                    >
                      {balances.map((b) => (
                        <option key={b.userId} value={b.userId}>
                          {b.fullName} — ${Number(b.platformLedgerBalance).toFixed(2)} ({b.ledgerStatus})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#8996AA] mb-1">Operation</label>
                      <select
                        value={entryType}
                        onChange={(e) => setEntryType(e.target.value as any)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm text-white"
                      >
                        <option value="CREDIT">Credit (+)</option>
                        <option value="DEBIT">Debit (-)</option>
                        <option value="SET_BALANCE">Set Balance (=)</option>
                        <option value="RESET">Reset to $0.00</option>
                        <option value="FREEZE">Freeze Wallet</option>
                        <option value="UNFREEZE">Unfreeze Wallet</option>
                      </select>
                    </div>
                    {!['RESET', 'FREEZE', 'UNFREEZE'].includes(entryType) && (
                      <div>
                        <label className="block text-xs text-[#8996AA] mb-1">Amount (USD)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm font-mono-num text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-[#8996AA] mb-1">Audit Reason</label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Demo allocation or fee credit"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={adjusting || !selectedUserId}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
                  >
                    {adjusting ? 'Committing Atomic Entry...' : 'Commit Simulated Wallet Entry'}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3 overflow-x-auto">
                  <h3 className="font-display font-bold text-base text-white">
                    Immutable Simulated Wallet History
                  </h3>
                  {ledgerHistory.length === 0 ? (
                    <p className="text-xs text-[#8996AA]">No ledger entries for selected user.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#17243A] text-[#8996AA]">
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Reason</th>
                          <th className="py-2 pr-3 text-right">Amount</th>
                          <th className="py-2 pr-3 text-right">New Bal</th>
                          <th className="py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#17243A]/60">
                        {ledgerHistory.map((e) => (
                          <tr key={e.id}>
                            <td className="py-2 pr-3 font-mono-num text-[#11C9F4]">{e.entryType}</td>
                            <td className="py-2 pr-3 text-white">{e.reason}</td>
                            <td className="py-2 pr-3 text-right font-mono-num text-[#16D94B]">
                              {Number(e.amount).toFixed(2)}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono-num text-white">
                              {Number(e.newBalance).toFixed(2)}
                            </td>
                            <td className="py-2 text-right">
                              {['CREDIT', 'DEBIT'].includes(e.entryType) && (
                                <button
                                  type="button"
                                  onClick={() => handleReverseEntry(e.id)}
                                  className="text-[11px] text-[#EC2698] hover:underline cursor-pointer"
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
          </div>
        )}

        {/* 4. APPLICATION MANAGEMENT */}
        {tab === 'apps' && dashboard && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboard.applications.map((app: any) => (
                <div key={app.id} className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display font-bold text-base text-white">{app.name}</div>
                      <div className="text-xs font-mono-num text-[#11C9F4]">{app.productionUrl}</div>
                      {app.vercelDeploymentUrl && (
                        <div className="text-[11px] font-mono-num text-[#8996AA]">
                          Vercel Ref: {app.vercelDeploymentUrl}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAppId(app.id);
                          setAppDraft({ ...app });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[#17243A] text-xs text-white hover:border-[#11C9F4] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleProbeApp(app.id)}
                        className="p-1.5 rounded-lg border border-[#17243A] text-[#8996AA] hover:text-white cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#8996AA]">{app.description}</p>
                  <div className="text-[11px] font-mono-num text-[#8996AA] flex flex-wrap gap-3">
                    <span>
                      Health:{' '}
                      <strong className={app.healthStatus === 'ONLINE' ? 'text-[#16D94B]' : 'text-[#FF1744]'}>
                        {app.healthStatus}
                      </strong>
                    </span>
                    <span>Visibility: {app.visibility || 'PUBLIC'}</span>
                    <span>SSO: {app.ssoEnabled ? 'ON' : 'OFF'}</span>
                    <span>Maintenance: {app.maintenanceMode ? 'ON' : 'OFF'}</span>
                  </div>
                </div>
              ))}
            </div>

            {editingAppId && appDraft && (
              <form
                onSubmit={handleSaveAppConfig}
                className="rounded-xl border border-[#11C9F4]/50 bg-[#0D1728] p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-base text-white">
                    Configure Independent Application: {editingAppId.toUpperCase()}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAppId(null);
                      setAppDraft(null);
                    }}
                    className="text-xs text-[#8996AA] hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[#8996AA] mb-1">Display Name</label>
                    <input
                      type="text"
                      value={appDraft.name || ''}
                      onChange={(e) => setAppDraft({ ...appDraft, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8996AA] mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={appDraft.subtitle || ''}
                      onChange={(e) => setAppDraft({ ...appDraft, subtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8996AA] mb-1">Production Subdomain URL (https://)</label>
                    <input
                      type="url"
                      value={appDraft.productionUrl || ''}
                      onChange={(e) => setAppDraft({ ...appDraft, productionUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8996AA] mb-1">Verified Vercel Deployment URL (Optional)</label>
                    <input
                      type="url"
                      value={appDraft.vercelDeploymentUrl || ''}
                      onChange={(e) => setAppDraft({ ...appDraft, vercelDeploymentUrl: e.target.value })}
                      placeholder="https://bot-builder.vercel.app"
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8996AA] mb-1">Visibility</label>
                    <select
                      value={appDraft.visibility || 'PUBLIC'}
                      onChange={(e) => setAppDraft({ ...appDraft, visibility: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                    >
                      <option value="PUBLIC">PUBLIC</option>
                      <option value="PRIVATE">PRIVATE</option>
                      <option value="HIDDEN">HIDDEN</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#8996AA] mb-1">Maintenance Message</label>
                    <input
                      type="text"
                      value={appDraft.maintenanceMessage || ''}
                      onChange={(e) => setAppDraft({ ...appDraft, maintenanceMessage: e.target.value })}
                      placeholder="Scheduled upgrade in progress"
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 text-xs text-[#8996AA]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(appDraft.ssoEnabled)}
                      onChange={(e) => setAppDraft({ ...appDraft, ssoEnabled: e.target.checked })}
                    />
                    <span>SSO Enabled</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(appDraft.maintenanceMode)}
                      onChange={(e) => setAppDraft({ ...appDraft, maintenanceMode: e.target.checked })}
                    />
                    <span>Maintenance Mode</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
                >
                  Save Application Settings
                </button>
              </form>
            )}
          </div>
        )}

        {/* 5. TRADING MANAGEMENT */}
        {tab === 'trading' && (
          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base">Consolidated Multi-App Trading Monitor</h2>
                {contractSummary && (
                  <p className="text-xs font-mono-num text-[#8996AA] mt-0.5">
                    Real Trades: {contractSummary.realCount} (${contractSummary.realStakeVolume}) · Demo Trades:{' '}
                    {contractSummary.demoCount} (${contractSummary.demoStakeVolume})
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <select
                  value={tradeModeFilter}
                  onChange={(e) => setTradeModeFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                >
                  <option value="ALL">All Environments</option>
                  <option value="REAL">REAL</option>
                  <option value="DEMO">DEMO</option>
                </select>
                <select
                  value={tradeAppFilter}
                  onChange={(e) => setTradeAppFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                >
                  <option value="ALL">All Applications</option>
                  {APP_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#17243A] text-[#8996AA]">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">App</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 pr-3">Symbol / Type</th>
                    <th className="py-2 pr-3 text-right">Stake</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17243A]/60">
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#8996AA]">
                        No contracts recorded matching filters.
                      </td>
                    </tr>
                  ) : (
                    contracts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-3 text-white">{c.userEmail}</td>
                        <td className="py-2 pr-3 font-mono-num text-[#11C9F4]">{c.appId.toUpperCase()}</td>
                        <td className="py-2 pr-3 font-mono-num">
                          <span className={c.mode === 'REAL' ? 'text-[#FF1744]' : 'text-[#16D94B]'}>{c.mode}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono-num text-white">
                          {c.symbol} · {c.contractType}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono-num text-white">
                          {Number(c.stake).toFixed(2)} {c.currency}
                        </td>
                        <td className="py-2 pr-3 font-mono-num text-[#8996AA]">{c.status}</td>
                        <td className="py-2 text-right font-mono-num text-[#8996AA]">
                          {new Date(c.openedAt).toISOString().slice(0, 19).replace('T', ' ')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. BOT MANAGEMENT */}
        {tab === 'bots' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 overflow-x-auto space-y-3">
              <h2 className="font-display font-bold text-base">Bot Strategies & Emergency Kill Switches</h2>
              {bots.length === 0 ? (
                <p className="text-xs text-[#8996AA]">No user bot strategies registered yet.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#17243A] text-[#8996AA]">
                      <th className="py-2 pr-3">Bot Name</th>
                      <th className="py-2 pr-3">Owner</th>
                      <th className="py-2 pr-3">Market</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17243A]/60">
                    {bots.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2.5 pr-3 text-white font-semibold">{b.name}</td>
                        <td className="py-2.5 pr-3 text-[#8996AA]">{b.userEmail}</td>
                        <td className="py-2.5 pr-3 font-mono-num text-[#11C9F4]">
                          {b.symbol} ({b.environment})
                        </td>
                        <td className="py-2.5 pr-3 font-mono-num">{b.status}</td>
                        <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleViewBotLogs(b.id)}
                            className="px-2 py-1 rounded border border-[#17243A] text-[#8996AA] hover:text-white cursor-pointer"
                          >
                            Logs ({b.logsCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBotAction(b.id, b.status === 'SUSPENDED' ? 'ENABLE' : 'SUSPEND')}
                            className="px-2 py-1 rounded border border-[#17243A] text-white cursor-pointer"
                          >
                            {b.status === 'SUSPENDED' ? 'Enable' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBotAction(b.id, 'EMERGENCY_STOP')}
                            className="px-2 py-1 rounded border border-[#FF1744]/50 text-[#FF1744] cursor-pointer"
                          >
                            Emergency Stop
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {botLogs.length > 0 && (
              <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-4 space-y-2 text-xs">
                <h3 className="font-semibold text-white">Selected Bot Execution Logs</h3>
                {botLogs.map((l) => (
                  <div key={l.id} className="font-mono-num text-[#8996AA]">
                    [{l.createdAt.slice(0, 19)}] <strong className="text-[#11C9F4]">{l.level}</strong>: {l.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7. COMMISSION REPORTING */}
        {tab === 'commissions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleLogCommission}
              className="lg:col-span-4 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3"
            >
              <h2 className="font-display font-bold text-base text-white">Log Verified Commission Report</h2>
              <p className="text-xs text-[#8996AA]">
                Strictly separates Estimated vs Confirmed / Deriv Partner Reports. Zero fabricated data.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[#8996AA] mb-1">App</label>
                  <select
                    value={commForm.appId}
                    onChange={(e) => setCommForm({ ...commForm, appId: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                  >
                    {APP_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#8996AA] mb-1">Source</label>
                  <select
                    value={commForm.source}
                    onChange={(e) => setCommForm({ ...commForm, source: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                  >
                    <option value="PARTNER_REPORT">PARTNER_REPORT</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="ESTIMATED">ESTIMATED</option>
                  </select>
                </div>
              </div>
              <div className="text-xs">
                <label className="block text-[#8996AA] mb-1">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={commForm.amount}
                  onChange={(e) => setCommForm({ ...commForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white font-mono-num"
                />
              </div>
              <div className="text-xs">
                <label className="block text-[#8996AA] mb-1">Partner Statement Reference / Notes</label>
                <input
                  type="text"
                  value={commForm.notes}
                  onChange={(e) => setCommForm({ ...commForm, notes: e.target.value })}
                  placeholder="Deriv Partner Payout Batch ID"
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
              >
                Record Commission Entry
              </button>
            </form>

            <div className="lg:col-span-8 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4 overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-base text-white">Commission Ledger</h3>
                  {commissionSummary && (
                    <p className="text-xs font-mono-num text-[#8996AA]">
                      Estimated: ${commissionSummary.estimatedTotal} · Confirmed/Partner: $
                      {commissionSummary.confirmedTotal} · Pending: {commissionSummary.pendingReconciliation}
                    </p>
                  )}
                </div>
                <a
                  href="/api/admin/commissions/export"
                  className="px-3 py-1.5 rounded-lg border border-[#17243A] bg-[#0A1220] text-xs text-white inline-flex items-center gap-1.5 hover:border-[#11C9F4]"
                >
                  <Download className="w-3.5 h-3.5 text-[#11C9F4]" />
                  <span>Export CSV</span>
                </a>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#17243A] text-[#8996AA]">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">App</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17243A]/60">
                  {commissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#8996AA]">
                        No commission records yet.
                      </td>
                    </tr>
                  ) : (
                    commissions.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-3 font-mono-num text-[#8996AA]">{c.periodDate}</td>
                        <td className="py-2 pr-3 font-mono-num text-[#11C9F4]">{c.appId.toUpperCase()}</td>
                        <td className="py-2 pr-3 font-mono-num text-white">{c.source}</td>
                        <td className="py-2 pr-3 text-right font-mono-num text-[#16D94B]">
                          ${Number(c.amount).toFixed(2)}
                        </td>
                        <td className="py-2 text-[#8996AA]">{c.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. MEMBERSHIP PLANS */}
        {tab === 'plans' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-base text-white">{p.name}</span>
                  <span className="font-mono-num text-[#11C9F4]">${p.priceMonthly}/mo</span>
                </div>
                <p className="text-[#8996AA]">{p.description}</p>
                <div className="space-y-2 pt-2 border-t border-[#17243A]">
                  <div className="text-[#8996AA]">Allowed Applications:</div>
                  <div className="flex flex-wrap gap-2">
                    {APP_IDS.map((id) => {
                      const has = (p.allowedApps || []).includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            const nextApps = has
                              ? p.allowedApps.filter((x: string) => x !== id)
                              : [...(p.allowedApps || []), id];
                            handleUpdatePlan({ ...p, allowedApps: nextApps });
                          }}
                          className={`px-2.5 py-1 rounded border font-mono-num cursor-pointer ${
                            has
                              ? 'border-[#16D94B] bg-[#16D94B]/15 text-[#16D94B]'
                              : 'border-[#17243A] text-[#8996AA]'
                          }`}
                        >
                          {id}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono-num text-[11px] text-[#8996AA]">
                  <div>Max Trades/Day: {p.maxDailyTrades}</div>
                  <div>Max Bots: {p.maxBots}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 9. WEBSITE CMS */}
        {tab === 'cms' && cmsContent && (
          <form onSubmit={handleSaveCms} className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4">
            <h2 className="font-display font-bold text-base text-white">Website Content & CMS Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[#8996AA] mb-1">Hero Top Label</label>
                <input
                  type="text"
                  value={cmsContent.heroLabel || ''}
                  onChange={(e) => setCmsContent({ ...cmsContent, heroLabel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
              </div>
              <div>
                <label className="block text-[#8996AA] mb-1">Deriv Sign-Up Referral URL</label>
                <input
                  type="url"
                  value={cmsContent.derivSignupUrl || ''}
                  onChange={(e) => setCmsContent({ ...cmsContent, derivSignupUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white font-mono-num"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[#8996AA] mb-1">Hero Supporting Description</label>
                <textarea
                  rows={2}
                  value={cmsContent.heroDescription || ''}
                  onChange={(e) => setCmsContent({ ...cmsContent, heroDescription: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-[#8996AA] mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(cmsContent.announcement?.enabled)}
                    onChange={(e) =>
                      setCmsContent({
                        ...cmsContent,
                        announcement: { ...cmsContent.announcement, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enable Homepage Announcement Banner</span>
                </label>
                <input
                  type="text"
                  value={cmsContent.announcement?.text || ''}
                  onChange={(e) =>
                    setCmsContent({
                      ...cmsContent,
                      announcement: { ...cmsContent.announcement, text: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-[#8996AA] mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(cmsContent.maintenanceNotice?.enabled)}
                    onChange={(e) =>
                      setCmsContent({
                        ...cmsContent,
                        maintenanceNotice: { ...cmsContent.maintenanceNotice, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enable Global Maintenance Notice</span>
                </label>
                <input
                  type="text"
                  value={cmsContent.maintenanceNotice?.message || ''}
                  onChange={(e) =>
                    setCmsContent({
                      ...cmsContent,
                      maintenanceNotice: { ...cmsContent.maintenanceNotice, message: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
            >
              Publish Website Content
            </button>
          </form>
        )}

        {/* 10. SECURITY, ADMINS, SESSIONS, TICKETS & AUDIT LOGS */}
        {tab === 'security' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <form
                onSubmit={handleCreateAdmin}
                className="lg:col-span-4 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3 text-xs"
              >
                <h3 className="font-display font-bold text-base text-white">Provision Role-Based Admin</h3>
                <input
                  type="email"
                  required
                  placeholder="Admin Email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
                <input
                  type="password"
                  required
                  minLength={10}
                  placeholder="Password (10+ chars)"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                />
                <select
                  value={newAdmin.role}
                  onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#17243A] text-white"
                >
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg font-semibold bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white cursor-pointer"
                >
                  Create Admin Account
                </button>
              </form>

              <div className="lg:col-span-8 rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3 overflow-x-auto">
                <h3 className="font-display font-bold text-base text-white">Administrators & Active Sessions</h3>
                <div className="space-y-2 text-xs">
                  {admins.map((a) => (
                    <div key={a.id} className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A] flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{a.email}</span>{' '}
                        <span className="font-mono-num text-[#11C9F4]">({a.role})</span>
                      </div>
                      <span className={a.status === 'ACTIVE' ? 'text-[#16D94B]' : 'text-[#FF1744]'}>{a.status}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-[#17243A] space-y-2 text-xs">
                  <div className="font-semibold text-[#8996AA]">
                    Active Sessions ({sessionsData.userSessions.length + sessionsData.adminSessions.length})
                  </div>
                  {[...sessionsData.adminSessions, ...sessionsData.userSessions].slice(0, 12).map((s) => (
                    <div key={s.id} className="p-2 rounded-lg bg-[#0A1220] border border-[#17243A] flex items-center justify-between">
                      <span className="font-mono-num text-white">
                        [{s.kind}] {s.email} · {s.ipAddress || 'unknown IP'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        className="text-[#FF1744] hover:underline cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {tickets.length > 0 && (
              <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-3">
                <h3 className="font-display font-bold text-base text-white">Support Tickets</h3>
                <div className="space-y-2 text-xs">
                  {tickets.map((t) => (
                    <div key={t.id} className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-white">{t.subject}</div>
                        <div className="text-[#8996AA]">{t.email} — {t.message}</div>
                      </div>
                      <select
                        value={t.status}
                        onChange={(e) => handleUpdateTicketStatus(t.id, e.target.value)}
                        className="px-2 py-1 rounded bg-[#0D1728] border border-[#17243A] text-white"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 overflow-x-auto">
              <h2 className="font-display font-bold text-base mb-4">Administrator Security Audit Log</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#17243A] text-[#8996AA]">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Admin</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 text-right">Timestamp (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17243A]/60">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4 font-mono-num text-[#11C9F4]">{log.action}</td>
                      <td className="py-2 pr-4 text-white">{log.adminEmail}</td>
                      <td className="py-2 pr-4 font-mono-num text-[#8996AA]">
                        {log.targetType} {log.targetId ? `(${log.targetId.slice(0, 8)}...)` : ''}
                      </td>
                      <td className="py-2 text-right font-mono-num text-[#8996AA]">
                        {new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 11. SYSTEM HEALTH & ENVIRONMENT AUDIT */}
        {tab === 'system' && systemInfo && (
          <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4">
            <h2 className="font-display font-bold text-base text-white">
              Render Runtime & Integration Configuration Audit (Safe Boolean View)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-num">
              <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                <span className="text-[#8996AA] block">Node Version</span>
                <span className="text-white">{systemInfo.runtime?.nodeVersion}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                <span className="text-[#8996AA] block">Environment</span>
                <span className="text-[#11C9F4]">{systemInfo.runtime?.nodeEnv}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                <span className="text-[#8996AA] block">Uptime (s)</span>
                <span className="text-white">{systemInfo.runtime?.uptimeSeconds}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A]">
                <span className="text-[#8996AA] block">Deriv WS</span>
                <span className="text-[#16D94B]">{systemInfo.runtime?.derivFeedStatus}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs font-mono-num">
              {Object.entries(systemInfo.integrations || {}).map(([key, val]) => (
                <div
                  key={key}
                  className="p-3 rounded-lg bg-[#0A1220] border border-[#17243A] flex items-center justify-between"
                >
                  <span className="text-[#8996AA]">{key}</span>
                  <span
                    className={
                      val === true
                        ? 'text-[#16D94B] font-bold'
                        : val === false
                        ? 'text-[#FF1744] font-bold'
                        : 'text-white'
                    }
                  >
                    {typeof val === 'boolean' ? (val ? 'SET' : 'MISSING') : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
