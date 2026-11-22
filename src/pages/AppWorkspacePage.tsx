import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Save,
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
  vercelDeploymentUrl?: string | null;
  launchUrl: string;
  fallbackLaunchUrl?: string | null;
  expiresInSeconds: number;
}

interface HealthProbe {
  probe: {
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    latencyMs: number;
    iframeCompatible: boolean;
    error: string | null;
  };
}

interface BotStrategy {
  id: string;
  name: string;
  symbol: string;
  environment: 'DEMO' | 'REAL';
  status: 'IDLE' | 'RUNNING' | 'SUSPENDED' | 'STOPPED';
  stake: string;
  userAuthorizedExecution: boolean;
  updatedAt: string;
}

export const AppWorkspacePage: React.FC<AppWorkspacePageProps> = ({ appId }) => {
  const { session, ticks, subscribeSymbol, refreshSession, showToast } = useApp();
  const [launchData, setLaunchData] = useState<AuthLaunchData | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthProbe['probe'] | null>(null);
  const [loading, setLoading] = useState(true);

  // Live Deriv WS Terminal & Execution State
  const [symbol, setSymbol] = useState(session.tradingPreferences?.defaultMarket || 'R_100');
  const [granularity, setGranularity] = useState(60);
  const [symbols, setSymbols] = useState<Array<{ symbol: string; display_name: string }>>([]);
  const [contractType, setContractType] = useState<'CALL' | 'PUT'>('CALL');
  const [stake, setStake] = useState('1.00');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [executing, setExecuting] = useState(false);
  const [portfolioContracts, setPortfolioContracts] = useState<any[]>([]);

  // Bot Strategy Persistence (for appId === 'bot')
  const [botName, setBotName] = useState('Momentum Guard XML');
  const [userAuthorizedExecution, setUserAuthorizedExecution] = useState(false);
  const [botXml, setBotXml] = useState(
    `<xml xmlns="https://developers.google.com/blockly/xml">\n  <block type="trade_definition" id="pipflow_strategy">\n    <field name="MARKET">synthetic_index</field>\n    <field name="SYMBOL">R_100</field>\n    <field name="STAKE">1.00</field>\n    <field name="DURATION">5</field>\n  </block>\n</xml>`
  );
  const [savedBots, setSavedBots] = useState<BotStrategy[]>([]);
  const [savingBot, setSavingBot] = useState(false);

  useEffect(() => {
    subscribeSymbol(symbol);
  }, [symbol, subscribeSymbol]);

  const loadPortfolioAndBots = async () => {
    apiFetch<{ symbols: Array<{ symbol: string; display_name: string }> }>('/api/deriv/symbols')
      .then((res) => setSymbols(res.symbols || []))
      .catch(() => {});
    if (session.activeDerivAccount) {
      apiFetch<{ contracts: any[] }>('/api/deriv/portfolio')
        .then((res) => setPortfolioContracts(res.contracts || []))
        .catch(() => {});
    }
    if (appId === 'bot') {
      apiFetch<{ bots: BotStrategy[] }>('/api/trading/bots')
        .then((res) => setSavedBots(res.bots || []))
        .catch(() => {});
    }
  };

  const loadAppContext = async () => {
    setLoading(true);
    setLaunchError(null);
    try {
      const [authRes, healthRes] = await Promise.all([
        apiFetch<AuthLaunchData>(`/api/applications/${appId}/authorize`, { method: 'POST' }),
        apiFetch<HealthProbe>(`/api/applications/${appId}/health`),
      ]);
      setLaunchData(authRes);
      setHealth(healthRes.probe);
    } catch (err: any) {
      setLaunchError(err?.message || `Unable to authorize ${appId} application.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppContext();
    loadPortfolioAndBots();
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
      loadPortfolioAndBots();
      showToast(
        'success',
        `Contract #${res.contractId} executed (${res.buyPrice} ${res.currency}). Balance: ${Number(
          res.balanceAfter
        ).toFixed(2)} ${res.currency}`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Trade rejected.');
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveBot = async () => {
    setSavingBot(true);
    try {
      await apiFetch('/api/trading/bots', {
        method: 'POST',
        body: JSON.stringify({
          name: botName,
          strategyType: 'XML_BLOCK_STRATEGY',
          symbol,
          xmlContent: botXml,
          stake: Number(stake),
          environment: session.activeDerivAccount?.accountType || 'DEMO',
          userAuthorizedExecution,
        }),
      });
      showToast('success', 'Bot strategy saved cleanly with risk controls.');
      loadPortfolioAndBots();
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save bot strategy.');
    } finally {
      setSavingBot(false);
    }
  };

  const handleBotStatus = async (botId: string, status: 'IDLE' | 'RUNNING' | 'STOPPED') => {
    try {
      await apiFetch(`/api/trading/bots/${botId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, userAuthorizedExecution: true }),
      });
      showToast('success', `Bot strategy status set to ${status}.`);
      loadPortfolioAndBots();
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update bot status.');
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
        {/* Independent Standalone SSO Launcher Bar (Default Architecture — Never Forces Iframes) */}
        <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-semibold text-white">
                Independent Vercel Application:{' '}
                <span className="font-mono-num text-[#11C9F4]">
                  {launchData?.productionUrl || `https://${appId}.pipflowtrade.site`}
                </span>
              </span>
              {health && (
                <span
                  className={`font-mono-num font-semibold ${
                    health.status === 'ONLINE'
                      ? 'text-[#16D94B]'
                      : health.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-[#FF1744]'
                  }`}
                >
                  {health.status} ({health.latencyMs}ms)
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8996AA]">
              Independent Vercel deployments launch via verified 90s SSO without embedding cross-origin iframes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {launchData?.launchUrl && (
              <a
                href={launchData.launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <span>Open Standalone SSO App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {launchData?.fallbackLaunchUrl && (
              <a
                href={launchData.fallbackLaunchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-[#17243A] bg-[#0A1220] hover:border-[#11C9F4] text-xs text-white inline-flex items-center gap-1.5"
              >
                <span>Vercel Deployment URL</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#11C9F4]" />
              </a>
            )}
            <button
              type="button"
              onClick={loadAppContext}
              className="p-2 rounded-lg border border-[#17243A] bg-[#0A1220] text-[#8996AA] hover:text-white cursor-pointer"
              aria-label="Refresh SSO and health check"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleToggleEmergencyStop}
              className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
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

        {launchError && (
          <div className="rounded-xl border border-[#FF1744]/40 bg-[#FF1744]/10 p-3.5 flex items-center gap-2.5 text-xs text-[#FF1744]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{launchError}</span>
          </div>
        )}

        {/* Integrated Real-Time Deriv WebSocket Terminal & Risk-Gated Execution */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 rounded-xl border border-[#17243A] bg-[#0D1728] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(symbols.length > 0
                  ? symbols.slice(0, 6)
                  : [
                      { symbol: 'R_100', display_name: 'Volatility 100' },
                      { symbol: 'R_50', display_name: 'Volatility 50' },
                      { symbol: '1HZ100V', display_name: 'Volatility 100 (1s)' },
                      { symbol: 'frxEURUSD', display_name: 'EUR/USD' },
                    ]
                ).map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => setSymbol(item.symbol)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono-num cursor-pointer ${
                      symbol === item.symbol
                        ? 'bg-[#11C9F4] text-[#050914] font-semibold'
                        : 'bg-[#0A1220] border border-[#17243A] text-[#8996AA]'
                    }`}
                  >
                    {item.symbol}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1">
                  {[
                    { label: '1m', val: 60 },
                    { label: '5m', val: 300 },
                    { label: '15m', val: 900 },
                    { label: '1h', val: 3600 },
                  ].map((tf) => (
                    <button
                      key={tf.label}
                      type="button"
                      onClick={() => setGranularity(tf.val)}
                      className={`px-2 py-1 rounded text-[11px] font-mono-num cursor-pointer ${
                        granularity === tf.val
                          ? 'bg-[#101C30] text-[#11C9F4] border border-[#11C9F4]'
                          : 'text-[#8996AA]'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm font-mono-num font-bold text-[#16D94B]">
                {activeTick
                  ? `${symbol}: ${activeTick.quote.toFixed(activeTick.pip_size ?? 2)}`
                  : 'Streaming Deriv Feed...'}
              </div>
            </div>

            <LiveCandleChart symbol={symbol} granularity={granularity} height={390} liveTick={activeTick} />

            {appId === 'bot' && (
              <div className="pt-3 border-t border-[#17243A] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#11C9F4]" />
                    <span className="text-xs font-semibold text-white">
                      Deriv Bot XML Strategy Manager
                    </span>
                  </div>
                  <input
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    className="px-3 py-1 rounded-lg bg-[#0A1220] border border-[#17243A] text-xs text-white"
                    placeholder="Strategy Name"
                  />
                </div>
                <textarea
                  value={botXml}
                  onChange={(e) => setBotXml(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl bg-[#050914] border border-[#17243A] p-3 text-xs font-mono-num text-[#11C9F4] focus:outline-none focus:border-[#11C9F4]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-[#8996AA] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userAuthorizedExecution}
                      onChange={(e) => setUserAuthorizedExecution(e.target.checked)}
                    />
                    <span>I explicitly authorize execution within my Risk Guard limits</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveBot}
                    disabled={savingBot}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#101C30] border border-[#11C9F4]/50 text-[#11C9F4] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingBot ? 'Saving...' : 'Save Bot Strategy'}</span>
                  </button>
                </div>

                {savedBots.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <div className="text-[11px] font-semibold text-[#8996AA]">SAVED STRATEGIES</div>
                    {savedBots.map((b) => (
                      <div
                        key={b.id}
                        className="p-2.5 rounded-lg bg-[#0A1220] border border-[#17243A] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-white">{b.name}</span>{' '}
                          <span className="font-mono-num text-[#8996AA]">
                            ({b.symbol} · ${b.stake} · {b.environment})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono-num">
                          <span
                            className={
                              b.status === 'RUNNING'
                                ? 'text-[#16D94B]'
                                : b.status === 'SUSPENDED'
                                ? 'text-[#FF1744]'
                                : 'text-[#8996AA]'
                            }
                          >
                            {b.status}
                          </span>
                          {b.status !== 'RUNNING' && b.status !== 'SUSPENDED' && (
                            <button
                              type="button"
                              onClick={() => handleBotStatus(b.id, 'RUNNING')}
                              className="p-1 rounded border border-[#16D94B]/40 text-[#16D94B] cursor-pointer"
                              title="Start bot"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                          )}
                          {b.status === 'RUNNING' && (
                            <button
                              type="button"
                              onClick={() => handleBotStatus(b.id, 'STOPPED')}
                              className="p-1 rounded border border-[#FF1744]/40 text-[#FF1744] cursor-pointer"
                              title="Stop bot"
                            >
                              <Pause className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="xl:col-span-4 space-y-4">
            <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-5 space-y-4">
              <div>
                <h3 className="font-display font-bold text-base text-white">
                  {appId === 'bot'
                    ? 'Bot Strategy Execution Guard'
                    : appId === 'options'
                    ? 'Deriv Options Order Ticket'
                    : 'Deriv Trade Execution Ticket'}
                </h3>
                <p className="text-xs text-[#8996AA] mt-0.5">
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
                        ? 'bg-[#16D94B] text-[#050914]'
                        : 'bg-[#0A1220] border border-[#17243A] text-[#8996AA]'
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
                        : 'bg-[#0A1220] border border-[#17243A] text-[#8996AA]'
                    }`}
                  >
                    FALL / PUT
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-[#8996AA] mb-1">
                    Stake ({session.activeDerivAccount?.currency || 'USD'}) · Max{' '}
                    {Number(session.riskSettings?.maxStake || 25).toFixed(2)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.35"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm font-mono-num text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#8996AA] mb-1">Duration</label>
                    <input
                      type="number"
                      min="1"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8996AA] mb-1">Unit</label>
                    <select
                      value={durationUnit}
                      onChange={(e) => setDurationUnit(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0A1220] border border-[#17243A] text-sm text-white"
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
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-[#16D94B]/50 text-[#16D94B] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Clear Emergency Stop
                </button>
              )}
            </div>

            {/* Live Open Deriv Portfolio Contracts */}
            <div className="rounded-xl border border-[#17243A] bg-[#0D1728] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Live Deriv Open Portfolio</span>
                <span className="font-mono-num text-[#11C9F4]">{portfolioContracts.length}</span>
              </div>
              {portfolioContracts.length === 0 ? (
                <p className="text-[11px] text-[#8996AA]">
                  No open contracts currently held at Deriv for the active account.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs font-mono-num">
                  {portfolioContracts.map((c: any) => (
                    <div
                      key={c.contract_id}
                      className="p-2 rounded-lg bg-[#0A1220] border border-[#17243A] flex items-center justify-between"
                    >
                      <span className="text-white">
                        #{c.contract_id} · {c.contract_type}
                      </span>
                      <span className="text-[#16D94B]">
                        {Number(c.buy_price || 0).toFixed(2)} {c.currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
};
