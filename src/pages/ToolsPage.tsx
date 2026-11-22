import React, { useState } from 'react';
import { CheckCircle2, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const ToolsPage: React.FC = () => {
  const { session, refreshSession, showToast } = useApp();
  const rs = session.riskSettings;

  const [maxStake, setMaxStake] = useState(String(Number(rs?.maxStake || 25)));
  const [maxDailyLoss, setMaxDailyLoss] = useState(String(Number(rs?.maxDailyLoss || 100)));
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(String(rs?.maxTradesPerDay || 50));
  const [stopLossLimit, setStopLossLimit] = useState(String(Number(rs?.stopLossLimit || 50)));
  const [takeProfitTarget, setTakeProfitTarget] = useState(String(Number(rs?.takeProfitTarget || 250)));
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(String(rs?.maxConsecutiveLosses || 5));
  const [maxExposure, setMaxExposure] = useState(String(Number(rs?.maxExposure || 200)));
  const [sessionLimit, setSessionLimit] = useState(String(rs?.sessionTimeLimitMinutes || 240));
  const [saving, setSaving] = useState(false);

  const [testStake, setTestStake] = useState('10');
  const [testResult, setTestResult] = useState<{ allowed: boolean; reasons: string[] } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/risk/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          maxStake: Number(maxStake),
          maxDailyLoss: Number(maxDailyLoss),
          maxTradesPerDay: Number(maxTradesPerDay),
          stopLossLimit: Number(stopLossLimit),
          takeProfitTarget: Number(takeProfitTarget),
          maxConsecutiveLosses: Number(maxConsecutiveLosses),
          maxExposure: Number(maxExposure),
          sessionTimeLimitMinutes: Number(sessionLimit),
        }),
      });
      await refreshSession();
      showToast('success', 'Shared risk management limits saved across all 4 applications.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save risk limits.');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyStop = async () => {
    try {
      const next = !rs?.emergencyStopActive;
      await apiFetch('/api/risk/settings', {
        method: 'PATCH',
        body: JSON.stringify({ emergencyStopActive: next }),
      });
      await refreshSession();
      showToast(next ? 'error' : 'success', next ? 'Emergency Stop ACTIVE' : 'Emergency Stop Cleared');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to toggle Emergency Stop.');
    }
  };

  const handleValidateTest = async () => {
    try {
      const res = await apiFetch<{ allowed: boolean; reasons: string[] }>('/api/risk/validate', {
        method: 'POST',
        body: JSON.stringify({ appId: 'trader', stake: Number(testStake) }),
      });
      setTestResult(res);
    } catch (err: any) {
      showToast('error', err?.message || 'Validation request failed.');
    }
  };

  return (
    <WorkspaceLayout title="Risk Management & Trading Tools">
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Shared Cross-Application Risk Guard
            </h2>
            <p className="text-xs sm:text-sm text-[#8492A6] mt-1">
              These limits apply uniformly across Bot, Trader, Charts, and Options.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEmergencyStop}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer ${
              rs?.emergencyStopActive
                ? 'bg-[#FF1744] text-white'
                : 'border border-[#FF1744] bg-[#FF1744]/10 text-[#FF1744]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>
              {rs?.emergencyStopActive ? 'EMERGENCY STOP ACTIVE (Click to Clear)' : 'Activate Emergency Stop'}
            </span>
          </button>
        </div>

        <form onSubmit={handleSave} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Max Stake (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.35"
                value={maxStake}
                onChange={(e) => setMaxStake(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Max Daily Loss (USD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Max Trades Per Day</label>
              <input
                type="number"
                min="1"
                value={maxTradesPerDay}
                onChange={(e) => setMaxTradesPerDay(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Stop-Loss Limit (USD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={stopLossLimit}
                onChange={(e) => setStopLossLimit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Take-Profit Target (USD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={takeProfitTarget}
                onChange={(e) => setTakeProfitTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Max Consecutive Losses</label>
              <input
                type="number"
                min="1"
                value={maxConsecutiveLosses}
                onChange={(e) => setMaxConsecutiveLosses(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Max Open Exposure (USD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={maxExposure}
                onChange={(e) => setMaxExposure(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8492A6] mb-1">Session Limit (Minutes)</label>
              <input
                type="number"
                min="5"
                value={sessionLimit}
                onChange={(e) => setSessionLimit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Risk Policy'}</span>
            </button>
          </div>
        </form>

        {/* Pre-trade Risk Simulator */}
        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#20F000]" />
            <h3 className="font-display font-bold text-sm text-white">Pre-Trade Risk Validator</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              step="0.5"
              value={testStake}
              onChange={(e) => setTestStake(e.target.value)}
              className="w-36 px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
            />
            <button
              type="button"
              onClick={handleValidateTest}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0D1728] border border-[#00C8FF]/50 text-[#00C8FF] cursor-pointer"
            >
              Check Stake Against Risk Policy
            </button>
          </div>

          {testResult && (
            <div
              className={`rounded-xl p-3 text-xs ${
                testResult.allowed
                  ? 'border border-[#20F000]/40 bg-[#20F000]/10 text-[#20F000]'
                  : 'border border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]'
              }`}
            >
              {testResult.allowed ? (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Stake permitted under active risk rules.
                </span>
              ) : (
                <ul className="list-disc pl-4 space-y-1">
                  {testResult.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
};
