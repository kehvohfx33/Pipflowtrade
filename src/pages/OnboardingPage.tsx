import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Bot,
  CheckCircle2,
  KeyRound,
  Layers,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const OnboardingPage: React.FC = () => {
  const { session, navigate, refreshSession, showToast } = useApp();
  const [step, setStep] = useState<number>(session.user?.onboardingStep || 1);
  const [derivToken, setDerivToken] = useState('');
  const [defaultApp, setDefaultApp] = useState<'bot' | 'trader' | 'charts' | 'options'>(
    session.tradingPreferences?.defaultApplication || 'trader'
  );
  const [preferredMode, setPreferredMode] = useState<'DEMO' | 'REAL'>(
    session.tradingPreferences?.preferredMode || 'DEMO'
  );
  const [defaultMarket, setDefaultMarket] = useState(
    session.tradingPreferences?.defaultMarket || 'R_100'
  );
  const [emailNotifications, setEmailNotifications] = useState(
    session.accountPreferences?.emailNotifications ?? true
  );
  const [tradeAlerts, setTradeAlerts] = useState(session.accountPreferences?.tradeAlerts ?? true);
  const [riskAck, setRiskAck] = useState(
    session.tradingPreferences?.realMoneyRiskAcknowledged ?? false
  );
  const [busy, setBusy] = useState(false);

  const saveStep = async (nextStep: number, complete = false) => {
    setBusy(true);
    try {
      await apiFetch('/api/auth/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          step: nextStep,
          completed: complete,
          defaultApplication: defaultApp,
          preferredMode,
          defaultMarket,
          emailNotifications,
          tradeAlerts,
          realMoneyRiskAcknowledged: riskAck,
        }),
      });
      await refreshSession();
      if (complete) {
        showToast('success', 'Onboarding complete. Welcome to your PIPFLOWTRADE workspace.');
        navigate('/dashboard');
      } else {
        setStep(nextStep);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save onboarding step.');
    } finally {
      setBusy(false);
    }
  };

  const handleDerivOAuth = async () => {
    try {
      const resp = await apiFetch<{ redirectUrl: string }>('/api/deriv/authorize');
      window.location.href = resp.redirectUrl;
    } catch (err: any) {
      showToast('info', err?.message || 'Use your official Deriv API token below if OAuth app ID is not yet set.');
    }
  };

  const handleTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/deriv/connect-token', {
        method: 'POST',
        body: JSON.stringify({ apiToken: derivToken }),
      });
      await refreshSession();
      setDerivToken('');
      showToast('success', 'Deriv account connected and encrypted.');
      setStep(3);
    } catch (err: any) {
      showToast('error', err?.message || 'Deriv token verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAccount = async (derivAccountId: string) => {
    setBusy(true);
    try {
      await apiFetch('/api/deriv/select-account', {
        method: 'POST',
        body: JSON.stringify({ derivAccountId }),
      });
      await refreshSession();
      showToast('success', 'Active Deriv account selected.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to select account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col">
      <header className="border-b border-[#1D2B40] bg-[#0B1220] px-4 sm:px-6 h-16 flex items-center justify-between">
        <PipflowLogo size="sm" onClick={() => navigate('/dashboard')} />
        <div className="text-xs font-mono-num text-[#8492A6]">
          Step {step} of 6
        </div>
      </header>

      <div className="w-full bg-[#0B1220] h-1">
        <div
          className="h-full bg-gradient-to-r from-[#00C8FF] to-[#ED168F] transition-all"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </div>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-6 sm:p-8 shadow-2xl">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-[#00C8FF]">SCREEN 1 · WELCOME</p>
                <h1 className="font-display text-2xl font-bold mt-1">
                  Welcome to PIPFLOWTRADE.SITE
                </h1>
                <p className="text-sm text-[#8492A6] mt-2">
                  Your central trading workspace connects four independently hosted Deriv
                  applications under one authenticated session and shared risk guard.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: 'Bot Builder', desc: 'Visual XML blocks & automated strategy runner', icon: Bot },
                  { name: 'Deriv Trader', desc: 'Multi-contract real-time execution terminal', icon: TrendingUp },
                  { name: 'Smart Charts', desc: 'Candlestick analysis & technical indicators', icon: BarChart2 },
                  { name: 'Options Terminal', desc: 'Duration, stake & payout contract engine', icon: Layers },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.name} className="p-4 rounded-xl border border-[#1D2B40] bg-[#050914]">
                      <Icon className="w-5 h-5 text-[#00C8FF] mb-2" />
                      <div className="font-semibold text-sm text-white">{item.name}</div>
                      <div className="text-xs text-[#8492A6] mt-1">{item.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-[#00C8FF]">SCREEN 2 · CONNECT DERIV</p>
                <h2 className="font-display text-2xl font-bold mt-1">Connect Your Deriv Account</h2>
                <p className="text-sm text-[#8492A6] mt-2">
                  Demo (VRTC) accounts let you test strategies safely with virtual funds. Real
                  accounts execute live Deriv trades under your Risk Management settings.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDerivOAuth}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white cursor-pointer"
              >
                Authorize via Official Deriv OAuth2
              </button>

              <form onSubmit={handleTokenConnect} className="space-y-3 pt-2 border-t border-[#1D2B40]">
                <label className="block text-xs font-medium text-[#8492A6]">
                  Or paste an official Deriv API Token (from app.deriv.com/account/api-token)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 text-[#8492A6] absolute left-3 top-3" />
                    <input
                      type="password"
                      value={derivToken}
                      onChange={(e) => setDerivToken(e.target.value)}
                      placeholder="Deriv API Token"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !derivToken.trim()}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#20F000] text-[#050914] disabled:opacity-50 cursor-pointer"
                  >
                    Connect
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-[#00C8FF]">SCREEN 3 · ACCOUNT SELECTION</p>
                <h2 className="font-display text-2xl font-bold mt-1">Select Active Deriv Account</h2>
                <p className="text-sm text-[#8492A6] mt-1">
                  Choose which authorized Deriv account is active by default across the workspace.
                </p>
              </div>

              {session.derivAccounts.length === 0 ? (
                <div className="p-4 rounded-xl border border-[#1D2B40] bg-[#050914] text-sm text-[#8492A6]">
                  No Deriv account connected yet. You can continue now and connect one anytime from
                  Account Settings or Step 2.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {session.derivAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => handleSelectAccount(acc.id)}
                      className={`w-full p-4 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                        acc.isActive
                          ? 'border-[#20F000] bg-[#20F000]/10'
                          : 'border-[#1D2B40] bg-[#050914] hover:border-[#00C8FF]/50'
                      }`}
                    >
                      <div>
                        <div className="font-mono-num font-semibold text-white">
                          {acc.derivLoginId} · {acc.accountType}
                        </div>
                        <div className="text-xs text-[#8492A6]">
                          {acc.landingCompany || 'Deriv'} · {acc.currency}
                        </div>
                      </div>
                      <div className="font-mono-num font-bold text-[#20F000]">
                        {Number(acc.reportedBalance).toFixed(2)} {acc.currency}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-[#00C8FF]">SCREEN 4 · TRADING PREFERENCES</p>
                <h2 className="font-display text-2xl font-bold mt-1">Configure Workspace Defaults</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">Default Application</label>
                  <select
                    value={defaultApp}
                    onChange={(e) => setDefaultApp(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                  >
                    <option value="trader">Deriv Trader</option>
                    <option value="bot">Bot Builder</option>
                    <option value="charts">Smart Charts</option>
                    <option value="options">Options Terminal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">Preferred Trading Mode</label>
                  <select
                    value={preferredMode}
                    onChange={(e) => setPreferredMode(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                  >
                    <option value="DEMO">Demo (VRTC Virtual)</option>
                    <option value="REAL">Real Account (Requires Risk Ack)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">Default Market Symbol</label>
                  <select
                    value={defaultMarket}
                    onChange={(e) => setDefaultMarket(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                  >
                    <option value="R_100">Volatility 100 Index (R_100)</option>
                    <option value="R_50">Volatility 50 Index (R_50)</option>
                    <option value="1HZ100V">Volatility 100 (1s) Index</option>
                    <option value="frxEURUSD">EUR/USD</option>
                    <option value="frxXAUUSD">Gold / USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2.5 text-sm text-[#8492A6] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="accent-[#00C8FF]"
                  />
                  <span>Enable email security & account notifications</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-[#8492A6] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tradeAlerts}
                    onChange={(e) => setTradeAlerts(e.target.checked)}
                    className="accent-[#00C8FF]"
                  />
                  <span>Enable real-time trade execution & risk guard alerts</span>
                </label>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-[#FF1744] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-[#FF1744]">SCREEN 5 · RISK ACKNOWLEDGEMENT</p>
                  <h2 className="font-display text-2xl font-bold mt-1">Financial Risk Disclosure</h2>
                </div>
              </div>

              <div className="rounded-xl border border-[#FF1744]/40 bg-[#FF1744]/5 p-4 text-xs sm:text-sm text-[#8492A6] space-y-2 leading-relaxed">
                <p>
                  Trading options, CFDs, and automated bots on Deriv involves significant risk of
                  losing your capital. Never trade funds you cannot afford to lose.
                </p>
                <p>
                  Real-money execution is disabled until you explicitly acknowledge this risk.
                  Demo (VRTC) accounts remain available at all times.
                </p>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-[#1D2B40] bg-[#050914] cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskAck}
                  onChange={(e) => setRiskAck(e.target.checked)}
                  className="mt-1 accent-[#20F000]"
                />
                <span className="text-sm text-white">
                  I understand the financial risks of Deriv trading and acknowledge that all trades
                  are governed by my configured Risk Management limits.
                </span>
              </label>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-[#20F000]/15 border border-[#20F000]/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-[#20F000]" />
              </div>
              <div>
                <p className="text-xs font-medium text-[#20F000]">SCREEN 6 · READY</p>
                <h2 className="font-display text-2xl font-bold mt-1">Workspace Configured</h2>
                <p className="text-sm text-[#8492A6] mt-2 max-w-md mx-auto">
                  Your PIPFLOWTRADE profile, Deriv connection preferences, and shared risk rules are
                  saved. You can revisit onboarding anytime from Account Settings.
                </p>
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          <div className="mt-8 pt-5 border-t border-[#1D2B40] flex items-center justify-between">
            <button
              type="button"
              disabled={step === 1 || busy}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-[#1D2B40] text-[#8492A6] hover:text-white disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>

            {step < 6 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => saveStep(step + 1, false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => saveStep(6, true)}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#20F000] text-[#050914] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                <span>Enter Main Dashboard</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
