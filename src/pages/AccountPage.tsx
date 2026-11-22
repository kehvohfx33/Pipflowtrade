import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, RefreshCw, ShieldCheck, Trash2, User } from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const AccountPage: React.FC = () => {
  const { session, refreshSession, navigate, showToast } = useApp();
  const [fullName, setFullName] = useState(session.profile?.fullName || '');
  const [country, setCountry] = useState(session.profile?.country || '');
  const [timezone, setTimezone] = useState(session.profile?.timezone || 'UTC');
  const [defaultApp, setDefaultApp] = useState(session.tradingPreferences?.defaultApplication || 'trader');
  const [riskAck, setRiskAck] = useState(session.tradingPreferences?.realMoneyRiskAcknowledged || false);
  const [emailNotifications, setEmailNotifications] = useState(
    session.accountPreferences?.emailNotifications ?? true
  );
  const [derivToken, setDerivToken] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadSessions = () => {
    apiFetch<{ sessions: any[] }>('/api/user/sessions')
      .then((res) => setSessions(res.sessions || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          country,
          timezone,
          defaultApplication: defaultApp,
          realMoneyRiskAcknowledged: riskAck,
          emailNotifications,
        }),
      });
      await refreshSession();
      showToast('success', 'Profile and preferences updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save profile.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', 'Password changed securely.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectDerivOAuth = async () => {
    try {
      const resp = await apiFetch<{ redirectUrl: string }>('/api/deriv/authorize');
      window.location.href = resp.redirectUrl;
    } catch (err: any) {
      showToast('info', err?.message || 'Use your Deriv API Token below if OAuth app ID is unconfigured.');
    }
  };

  const handleConnectDerivToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/deriv/connect-token', {
        method: 'POST',
        body: JSON.stringify({ apiToken: derivToken }),
      });
      setDerivToken('');
      await refreshSession();
      showToast('success', 'Deriv account connected.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to connect Deriv token.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAccount = async (derivAccountId: string) => {
    try {
      await apiFetch('/api/deriv/select-account', {
        method: 'POST',
        body: JSON.stringify({ derivAccountId }),
      });
      await refreshSession();
      showToast('success', 'Active Deriv account updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to switch Deriv account.');
    }
  };

  const handleDisconnect = async (derivAccountId: string) => {
    try {
      await apiFetch('/api/deriv/disconnect', {
        method: 'POST',
        body: JSON.stringify({ derivAccountId }),
      });
      await refreshSession();
      showToast('info', 'Deriv account disconnected and token removed.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to disconnect account.');
    }
  };

  const handleRevokeSession = async (id: string) => {
    await apiFetch(`/api/user/sessions/${id}/revoke`, { method: 'POST' });
    loadSessions();
    showToast('info', 'Session revoked.');
  };

  return (
    <WorkspaceLayout title="Account, Security & Deriv Connections">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile & Trading Preferences */}
        <form onSubmit={handleSaveProfile} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#00C8FF]" />
              <h2 className="font-display font-bold text-base text-white">Personal Information & Preferences</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="text-xs text-[#00C8FF] hover:underline cursor-pointer"
            >
              Re-open Onboarding
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Email</label>
              <input
                type="text"
                disabled
                value={session.user?.email || ''}
                className="w-full px-3 py-2 rounded-xl bg-[#050914]/60 border border-[#1D2B40] text-sm text-[#8492A6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. United Kingdom"
                className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Default Application</label>
              <select
                value={defaultApp}
                onChange={(e) => setDefaultApp(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
              >
                <option value="trader">Deriv Trader</option>
                <option value="bot">Bot Builder</option>
                <option value="charts">Smart Charts</option>
                <option value="options">Options Terminal</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#8492A6] cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              className="accent-[#00C8FF]"
            />
            <span>Receive email security & trade notifications</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
            <input
              type="checkbox"
              checked={riskAck}
              onChange={(e) => setRiskAck(e.target.checked)}
              className="accent-[#20F000]"
            />
            <span>Acknowledge Real-Money Trading Financial Risk</span>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white cursor-pointer"
          >
            Save Profile & Preferences
          </button>
        </form>

        {/* Connected Deriv Accounts */}
        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#20F000]" />
              <h2 className="font-display font-bold text-base text-white">Connected Deriv Accounts</h2>
            </div>
            <button
              type="button"
              onClick={handleConnectDerivOAuth}
              className="text-xs font-semibold text-[#00C8FF] hover:underline cursor-pointer"
            >
              OAuth2 Connect
            </button>
          </div>

          {session.derivAccounts.length === 0 ? (
            <div className="p-4 rounded-xl border border-[#1D2B40] bg-[#050914] text-xs text-[#8492A6]">
              No Deriv accounts connected yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {session.derivAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                    acc.isActive
                      ? 'border-[#20F000] bg-[#20F000]/10'
                      : 'border-[#1D2B40] bg-[#050914]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-mono-num font-bold text-white">
                      {acc.derivLoginId} ·{' '}
                      <span className={acc.accountType === 'REAL' ? 'text-[#FF1744]' : 'text-[#20F000]'}>
                        {acc.accountType}
                      </span>
                    </div>
                    <div className="text-xs font-mono-num text-[#8492A6]">
                      {Number(acc.reportedBalance).toFixed(2)} {acc.currency}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!acc.isActive && (
                      <button
                        type="button"
                        onClick={() => handleSelectAccount(acc.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#00C8FF] text-[#050914] text-xs font-semibold cursor-pointer"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDisconnect(acc.id)}
                      className="p-1.5 rounded-lg border border-[#FF1744]/40 text-[#FF1744] hover:bg-[#FF1744]/10 cursor-pointer"
                      title="Disconnect Deriv account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleConnectDerivToken} className="pt-3 border-t border-[#1D2B40] flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 text-[#8492A6] absolute left-3 top-2.5" />
              <input
                type="password"
                value={derivToken}
                onChange={(e) => setDerivToken(e.target.value)}
                placeholder="Link via official Deriv API token"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !derivToken.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#20F000] text-[#050914] text-xs font-bold cursor-pointer"
            >
              Link
            </button>
          </form>
        </div>

        {/* Security & Password Change */}
        <form onSubmit={handlePasswordChange} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#ED168F]" />
            <h2 className="font-display font-bold text-base text-white">Change Account Password</h2>
          </div>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#00C8FF]/50 text-[#00C8FF] hover:bg-[#00C8FF]/10 cursor-pointer"
          >
            Update Password
          </button>
        </form>

        {/* Active Sessions */}
        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-white">Active Platform Sessions</h2>
            <button type="button" onClick={loadSessions} className="text-xs text-[#8492A6] hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl border border-[#1D2B40] bg-[#050914] flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="text-white font-mono-num truncate">
                    {s.current ? 'Current Session' : 'Session'} · {s.ipAddress || 'Unknown IP'}
                  </div>
                  <div className="text-[#8492A6] truncate">{s.userAgent || 'Browser'}</div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(s.id)}
                    className="px-2.5 py-1 rounded-lg border border-[#FF1744]/40 text-[#FF1744] shrink-0 cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
};
