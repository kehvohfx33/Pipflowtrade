import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { LiveCandleChart } from '../components/LiveCandleChart.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface AppWorkspacePageProps {
  appId: 'bot' | 'trader' | 'charts' | 'options';
}

interface AuthLaunchData {
  appId: string;
  appName: string;
  productionUrl: string;
  launchUrl: string;
  iframeCompatible: boolean;
}

interface HealthProbe {
  probe: {
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    latencyMs: number;
    iframeCompatible: boolean;
    error: string | null;
  };
}

export const AppWorkspacePage: React.FC<AppWorkspacePageProps> = ({ appId }) => {
  const { session, ticks, subscribeSymbol, refreshSession, showToast } = useApp();
  const [launchData, setLaunchData] = useState<AuthLaunchData | null>(null);
  const [health, setHealth] = useState<HealthProbe['probe'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'vercel' | 'native'>('vercel');

  // Native Deriv WebSocket Execution & Chart Controls (works live with real Deriv API)
  const [symbol, setSymbol] = useState(session.tradingPreferences?.defaultMarket || 'R_100');
  const [contractType, setContractType] = useState<'CALL' | 'PUT'>('CALL');
  const [stake, setStake] = useState('1.00');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [executing, setExecuting] = useState(false);
  const [botXml, setBotXml] = useState(
    `<xml xmlns="https://developers.google.com/blockly/xml">\n  <block type="trade_definition" id="pipflow_strategy">\n    <field name="MARKET">synthetic_index</field>\n    <field name="SYMBOL">R_100</field>\n    <field name="STAKE">1.00</field>\n    <field name="DURATION">5</field>\n  </block>\n</xml>`
  );

  useEffect(() => {
    subscribeSymbol(symbol);
  }, [symbol, subscribeSymbol]);

  const loadAppContext = async () => {
    setLoading(true);
    try {
      const [authRes, healthRes] = await Promise.all([
        apiFetch<AuthLaunchData>(`/api/apps/${appId}/authorize`, { method: 'POST' }),
        apiFetch<HealthProbe>(`/api/apps/${appId}/health`),
      ]);
      setLaunchData(authRes);
      setHealth(healthRes.probe);
      if (healthRes.probe.status === 'OFFLINE' || !healthRes.probe.iframeCompatible) {
        setViewMode('native');
      } else {
        setViewMode('vercel');
      }
    } catch (err: any) {
      showToast('error', err?.message || `Unable to authorize ${appId} application.`);
      setViewMode('native');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const handleToggleEmergencyStop = async () => {
    if (!session.riskSettings) return;
    try {
      const next = !session.riskSettings.emergencyStopActive;
      await apiFetch('/api/risk/settings', {
        method: 'PATCH',
        body: JSON.stringify({ emergencyStopActive: next }),
      });
      await refreshSession();
      showToast(next ? 'error' : 'success', next ? 'Emergency Stop ACTIVATED' : 'Emergency Stop Cleared');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update Emergency Stop.');
    }
  };

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setExecuting(true);
    try {
      const res = await apiFetch<any>('/api/deriv/trade/execute', {
        method: 'POST',
        body: JSON.stringify({
          appId,
          symbol,
          contractType,
          stake: Number(stake),
          duration: Number(duration),
          durationUnit,
        }),
      });
      await refreshSession();
      showToast(
        'success',
        `Contract #${res.contractId} executed (${res.buyPrice} ${res.currency}). New Balance: ${Number(
          res.balanceAfter
        ).toFixed(2)} ${res.currency}`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Trade rejected.');
    } finally {
      setExecuting(false);
    }
  };

  const activeTick = ticks[symbol];
  const appLabels: Record<typeof appId, string> = {
    bot: 'Bot Builder (bot.pipflowtrade.site)',
    trader: 'Deriv Trader (trader.pipflowtrade.site)',
    charts: 'Smart Charts (charts.pipflowtrade.site)',
    options: 'Options Terminal (options.pipflowtrade.site)',
  };

  return (
    <WorkspaceLayout title={appLabels[appId]}>
      <div className="space-y-4">
        {/* Unified App Control & Health Bar */}
        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-3.5 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-white">
              Vercel Target:{' '}
              <span className="font-mono-num text-[#00C8FF]">
                {launchData?.productionUrl || `https://${appId}.pipflowtrade.site`}
              </span>
            </span>
            {health && (
              <span
                className={`font-mono-num font-semibold ${
                  health.status === 'ONLINE'
                    ? 'text-[#20F000]'
                    : health.status === 'DEGRADED'
                    ? 'text-amber-400'
                    : 'text-[#FF1744]'
                }`}
              >
                {health.status} ({health.latencyMs}ms)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex p-0.5 rounded-lg bg-[#050914] border border-[#1D2B40] text-xs">
              <button
                type="button"
                onClick={() => setViewMode('vercel')}
                className={`px-3 py-1 rounded-md cursor-pointer ${
                  viewMode === 'vercel' ? 'bg-[#00C8FF] text-[#050914] font-semibold' : 'text-[#8492A6]'
                }`}
              >
                Vercel App Embed
              </button>
              <button
                type="button"
                onClick={() => setViewMode('native')}
                className={`px-3 py-1 rounded-md cursor-pointer ${
                  viewMode === 'native' ? 'bg-[#00C8FF] text-[#050914] font-semibold' : 'text-[#8492A6]'
                }`}
              >
                Deriv WS Terminal
              </button>
            </div>

            {launchData?.launchUrl && (
              <a
                href={launchData.launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-[#1D2B40] bg-[#050914] hover:border-[#00C8FF] text-xs text-white inline-flex items-center gap-1.5"
              >
                <span>Open Standalone SSO</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#00C8FF]" />
              </a>
            )}

            <button
              type="button"
              onClick={loadAppContext}
              className="p-1.5 rounded-lg border border-[#1D2B40] bg-[#050914] text-[#8492A6] hover:text-white cursor-pointer"
              aria-label="Retry health check"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleToggleEmergencyStop}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                session.riskSettings?.emergencyStopActive
                  ? 'bg-[#FF1744] text-white'
                  : 'border border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{session.riskSettings?.emergencyStopActive ? 'STOPPED' : 'Emergency Stop'}</span>
            </button>
          </div>
        </div>

        {/* Upstream Probe Warning when Vercel origin is unreachable or blocks iframe */}
        {health && (health.status === 'OFFLINE' || !health.iframeCompatible) && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold">
                  {health.status === 'OFFLINE'
                    ? `Upstream Vercel host (${launchData?.productionUrl}) is currently unreachable (${health.error}).`
                    : `Upstream Vercel host (${launchData?.productionUrl}) restricts iframe embedding via X-Frame-Options/CSP.`}
                </span>{' '}
                Use <strong>Open Standalone SSO</strong> once DNS/Vercel is deployed, or operate via the
                live <strong>Deriv WS Terminal</strong> below.
              </div>
            </div>
          </div>
        )}

        {/* Mode 1: Embedded Independent Vercel App (Preserves Original Template & SSO) */}
        {viewMode === 'vercel' && launchData && (
          <div className="rounded-xl border border-[#1D2B40] bg-[#050914] overflow-hidden h-[calc(100vh-230px)] min-h-[540px]">
            <iframe
              key={launchData.launchUrl}
              src={launchData.launchUrl}
              title={launchData.appName}
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        )}

        {/* Mode 2: Real-Time Deriv WebSocket Terminal & Risk-Gated Execution */}
        {viewMode === 'native' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 rounded-xl border border-[#1D2B40] bg-[#0B1220] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(['R_100', 'R_50', '1HZ100V', 'frxEURUSD', 'frxXAUUSD'] as const).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSymbol(sym)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono-num cursor-pointer ${
                        symbol === sym
                          ? 'bg-[#00C8FF] text-[#050914] font-semibold'
                          : 'bg-[#050914] border border-[#1D2B40] text-[#8492A6]'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
                <div className="text-sm font-mono-num font-bold text-[#20F000]">
                  {activeTick
                    ? `${symbol}: ${activeTick.quote.toFixed(activeTick.pip_size ?? 2)}`
                    : 'Streaming Deriv Feed...'}
                </div>
              </div>

              <LiveCandleChart symbol={symbol} granularity={60} height={420} liveTick={activeTick} />

              {appId === 'bot' && (
                <div className="pt-2 border-t border-[#1D2B40] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Editable Deriv Bot XML Strategy Inspector
                    </span>
                    <span className="text-[11px] text-[#8492A6]">
                      Validated against Risk Limits before execution
                    </span>
                  </div>
                  <textarea
                    value={botXml}
                    onChange={(e) => setBotXml(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl bg-[#050914] border border-[#1D2B40] p-3 text-xs font-mono-num text-[#00C8FF] focus:outline-none focus:border-[#00C8FF]"
                  />
                </div>
              )}
            </div>

            <div className="xl:col-span-4 rounded-xl border border-[#1D2B40] bg-[#0D1728] p-5 space-y-4">
              <div>
                <h3 className="font-display font-bold text-base text-white">
                  {appId === 'bot'
                    ? 'Bot Strategy Execution Guard'
                    : appId === 'options'
                    ? 'Deriv Options Order Ticket'
                    : 'Deriv Trade Execution Ticket'}
                </h3>
                <p className="text-xs text-[#8492A6] mt-0.5">
                  Executes real proposals via Deriv API after server-side Risk Engine checks.
                </p>
              </div>

              {!session.activeDerivAccount && (
                <div className="rounded-xl border border-[#FF1744]/40 bg-[#FF1744]/10 p-3 text-xs text-[#FF1744]">
                  Connect a Deriv account in Account Settings to authorize live contract execution.
                </div>
              )}

              <form onSubmit={handleExecuteTrade} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setContractType('CALL')}
                    className={`py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                      contractType === 'CALL'
                        ? 'bg-[#20F000] text-[#050914]'
                        : 'bg-[#050914] border border-[#1D2B40] text-[#8492A6]'
                    }`}
                  >
                    RISE / CALL
                  </button>
                  <button
                    type="button"
                    onClick={() => setContractType('PUT')}
                    className={`py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                      contractType === 'PUT'
                        ? 'bg-[#FF1744] text-white'
                        : 'bg-[#050914] border border-[#1D2B40] text-[#8492A6]'
                    }`}
                  >
                    FALL / PUT
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-[#8492A6] mb-1">
                    Stake ({session.activeDerivAccount?.currency || 'USD'}) · Max{' '}
                    {Number(session.riskSettings?.maxStake || 25).toFixed(2)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.35"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#8492A6] mb-1">Duration</label>
                    <input
                      type="number"
                      min="1"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8492A6] mb-1">Unit</label>
                    <select
                      value={durationUnit}
                      onChange={(e) => setDurationUnit(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
                    >
                      <option value="t">Ticks</option>
                      <option value="s">Seconds</option>
                      <option value="m">Minutes</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    executing ||
                    !session.activeDerivAccount ||
                    Boolean(session.riskSettings?.emergencyStopActive)
                  }
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {appId === 'bot' ? <Play className="w-4 h-4" /> : null}
                  <span>
                    {executing
                      ? 'Submitting to Deriv...'
                      : session.riskSettings?.emergencyStopActive
                      ? 'Halted (Emergency Stop Active)'
                      : `Execute ${contractType} Contract`}
                  </span>
                </button>
              </form>

              {session.riskSettings?.emergencyStopActive && (
                <button
                  type="button"
                  onClick={handleToggleEmergencyStop}
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-[#20F000]/50 text-[#20F000] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Clear Emergency Stop
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
};
