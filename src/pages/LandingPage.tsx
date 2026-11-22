import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bot,
  CheckCircle2,
  ExternalLink,
  History,
  Layers,
  Menu,
  Shield,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { LiveCandleChart } from '../components/LiveCandleChart.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface PublicStats {
  platformUsers: number;
  connectedDerivAccounts: number;
  executedTrades: number;
  independentApplications: number;
  derivFeedStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  derivOAuthConfigured: boolean;
}

const LEGAL_TOPICS: Record<string, { title: string; body: string }> = {
  about: {
    title: 'About PIPFLOWTRADE.SITE',
    body: 'PIPFLOWTRADE.SITE is an enterprise Deriv trading workspace unifying Bot Builder, Deriv Trader, Smart Charts, and Options Terminal under a single authenticated session, shared risk engine, and transparent ledger.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'Account credentials are hashed with scrypt and unique salts. Authorized Deriv OAuth tokens are encrypted at rest with AES-256-GCM and never exposed to client JavaScript, URLs, or public logs. HTTP-only session cookies and CSRF tokens protect every workspace request.',
  },
  terms: {
    title: 'Terms of Service',
    body: 'By registering on PIPFLOWTRADE.SITE, you agree to abide by Deriv API terms, execute trades responsibly within your configured risk thresholds, and maintain accurate account security.',
  },
  risk: {
    title: 'Risk Disclosure',
    body: 'Trading synthetic indices, forex, and options on Deriv involves substantial risk of financial loss and may not be suitable for all investors. Automated bots and historical charts do not guarantee future returns. Always start with a Demo (VRTC) account before enabling Real-money execution.',
  },
  responsible: {
    title: 'Responsible Trading',
    body: 'PIPFLOWTRADE.SITE includes a cross-application Risk Management Guard enforcing maximum stake, daily loss limits, consecutive loss caps, exposure limits, and an instant Emergency Stop across all four applications.',
  },
  deriv: {
    title: 'Deriv Integration Disclosure',
    body: 'PIPFLOWTRADE.SITE integrates with official Deriv OAuth2 and WebSocket v3 endpoints. Your Deriv-reported account balance remains authoritative at Deriv at all times; any PIPFLOWTRADE platform ledger entries are displayed separately.',
  },
};

export const LandingPage: React.FC = () => {
  const { navigate, ticks, derivFeedStatus, subscribeSymbol, showToast } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [chartSymbol, setChartSymbol] = useState('R_100');
  const [legalModal, setLegalModal] = useState<keyof typeof LEGAL_TOPICS | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    apiFetch<PublicStats>('/api/public/stats')
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    subscribeSymbol(chartSymbol);
  }, [chartSymbol, subscribeSymbol]);

  const handleDerivStart = async () => {
    setOauthLoading(true);
    try {
      const resp = await apiFetch<{ redirectUrl: string }>('/api/deriv/authorize');
      window.location.href = resp.redirectUrl;
    } catch (err: any) {
      showToast(
        'info',
        err?.message || 'Deriv OAuth2 requires DERIV_APP_ID on server; you can connect via Deriv API Token on the sign-in page.'
      );
      navigate('/auth', 'tab=deriv');
    } finally {
      setOauthLoading(false);
    }
  };

  const activeTick = ticks[chartSymbol];

  const appCards = [
    {
      id: 'bot',
      title: 'BOT BUILDER',
      subtitle: 'Editable automated trading strategies.',
      desc: 'Visual block editor, XML strategy import/export, stake & duration rules, and emergency stop controls.',
      domain: 'bot.pipflowtrade.site',
      accent: 'text-[#00C8FF]',
      icon: Bot,
      route: '/app/bot' as const,
    },
    {
      id: 'trader',
      title: 'TRADER',
      subtitle: 'Professional trading interface.',
      desc: 'Real-time Deriv quotes, contract proposals, market selection, and instant execution validation.',
      domain: 'trader.pipflowtrade.site',
      accent: 'text-[#20F000]',
      icon: TrendingUp,
      route: '/app/trader' as const,
    },
    {
      id: 'charts',
      title: 'CHARTS',
      subtitle: 'Live market charts and technical analysis.',
      desc: 'Candlesticks, timeframes, drawing tools, technical indicators, and real-time Deriv price feeds.',
      domain: 'charts.pipflowtrade.site',
      accent: 'text-[#ED168F]',
      icon: BarChart2,
      route: '/app/charts' as const,
    },
    {
      id: 'options',
      title: 'OPTIONS',
      subtitle: 'Deriv options trading interface.',
      desc: 'Duration and stake controls, payout metrics, contract monitoring, and verified settlement results.',
      domain: 'options.pipflowtrade.site',
      accent: 'text-[#00C8FF]',
      icon: Layers,
      route: '/app/options' as const,
    },
  ];

  const features = [
    {
      title: 'AI-Powered Trading Bots',
      desc: 'Run editable automated strategies on bot.pipflowtrade.site with pre-trade balance and risk checks.',
      icon: Bot,
      action: () => navigate('/app/bot'),
    },
    {
      title: 'Real-Time Market Analysis',
      desc: 'Stream live Deriv ticks and multi-timeframe candlestick feeds directly over WebSockets.',
      icon: Activity,
      action: () => navigate('/charts'),
    },
    {
      title: 'Unified Trading Accounts',
      desc: 'Sign in once on PIPFLOWTRADE.SITE and move across all four Vercel applications seamlessly.',
      icon: Shield,
      action: () => navigate('/auth'),
    },
    {
      title: 'Risk Management Tools',
      desc: 'Enforce maximum stake, daily loss caps, consecutive loss limits, and global emergency stop.',
      icon: Sliders,
      action: () => navigate('/tools'),
    },
    {
      title: 'Editable Trading Strategies',
      desc: 'Inspect, configure, import, and export XML bot logic before authorizing live execution.',
      icon: Layers,
      action: () => navigate('/app/bot'),
    },
    {
      title: 'Live Charts',
      desc: 'Analyze Volatility indices and Forex pairs with interactive candlesticks and live price streams.',
      icon: BarChart2,
      action: () => navigate('/charts'),
    },
    {
      title: 'Trading History',
      desc: 'Audit every executed Deriv contract separately from your PIPFLOWTRADE platform ledger.',
      icon: History,
      action: () => navigate('/history'),
    },
    {
      title: 'Demo & Real Trading Modes',
      desc: 'Test on Virtual Demo (VRTC) accounts and switch to Real accounts only after risk acknowledgement.',
      icon: CheckCircle2,
      action: () => navigate('/auth', 'tab=deriv'),
    },
  ];

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col">
      {/* Top Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-40 border-b border-[#1D2B40] bg-[#050914]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <PipflowLogo size="md" onClick={() => navigate('/')} />

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#8492A6]">
            <a href="#features" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#applications" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Applications
            </a>
            <button
              type="button"
              onClick={() => navigate('/charts')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Live Charts
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('about')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => navigate('/support')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#050914] hover:bg-[#00C8FF] hover:text-[#050914] transition-colors whitespace-nowrap shrink-0"
            >
              Login Now
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg border border-[#1D2B40] bg-[#0B1220] text-white"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#1D2B40] bg-[#0B1220] px-4 py-4 space-y-2">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm text-[#8492A6] hover:text-white"
            >
              Platform Features
            </a>
            <a
              href="#applications"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm text-[#8492A6] hover:text-white"
            >
              Trading Applications
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/charts');
              }}
              className="block w-full text-left py-2 text-sm text-[#8492A6] hover:text-white"
            >
              Live Charts
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setLegalModal('about');
              }}
              className="block w-full text-left py-2 text-sm text-[#8492A6] hover:text-white"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/support');
              }}
              className="block w-full text-left py-2 text-sm text-[#8492A6] hover:text-white"
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/auth');
              }}
              className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white"
            >
              Login Now
            </button>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-[#1D2B40]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,200,255,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(237,22,143,0.08),_transparent_50%)] pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-20 text-center">
            <p className="text-xs font-medium tracking-wider text-[#00C8FF] mb-4">
              UNIFIED DERIV MULTI-APPLICATION WORKSPACE · SSO ENABLED
            </p>

            <h1 className="font-display font-extrabold tracking-tight text-balance mx-auto max-w-4xl text-[clamp(2.1rem,4.5vw,3.75rem)] leading-[1.1]">
              WELCOME TO{' '}
              <span className="bg-gradient-to-r from-[#00C8FF] via-white to-[#ED168F] bg-clip-text text-transparent">
                PIPFLOWTRADE.SITE
              </span>
            </h1>

            <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-[#8492A6] leading-relaxed">
              Your all-in-one workspace for automated analysis, smart bots, MT5-inspired charts and
              real-time Deriv market insights.
            </p>

            {/* Primary & Secondary CTAs */}
            <div className="mt-8 flex flex-col items-center gap-3 max-w-md mx-auto">
              <button
                type="button"
                onClick={handleDerivStart}
                disabled={oauthLoading}
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm sm:text-base text-white bg-gradient-to-r from-[#00C8FF] to-[#ED168F] hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[#00C8FF]/10 cursor-pointer disabled:opacity-60"
              >
                <span>{oauthLoading ? 'Connecting to Deriv...' : 'START TRADING NOW (DERIV)'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="w-full py-3 px-6 rounded-xl font-semibold text-sm sm:text-base bg-[#0D1728] border border-[#20F000]/60 text-white hover:bg-[#13223A] transition-colors cursor-pointer"
              >
                EXISTING ACCOUNT LOGIN
              </button>

              <div className="w-full grid grid-cols-2 gap-3 pt-1">
                <a
                  href="https://deriv.com/signup/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-medium bg-[#0B1220] border border-[#1D2B40] hover:border-[#00C8FF]/60 text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <span>Sign Up on Deriv</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#00C8FF]" />
                </a>
                <button
                  type="button"
                  onClick={() => navigate('/charts')}
                  className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-medium bg-[#0B1220] border border-[#1D2B40] hover:border-[#20F000]/60 text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-[#20F000]" />
                  <span>Live Charts</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('/auth', 'tab=register')}
                className="mt-1 py-2 px-5 rounded-lg text-xs font-medium border border-[#1D2B40] bg-[#0B1220] text-[#8492A6] hover:text-white hover:border-[#00C8FF]/50 transition-colors cursor-pointer"
              >
                Email Sign Up
              </button>
            </div>

            {/* Genuine Backend Platform Statistics */}
            <div className="mt-12 pt-8 border-t border-[#1D2B40]/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
              <div className="p-4 rounded-xl bg-[#0D1728]/80 border border-[#1D2B40]">
                <div className="text-xs text-[#8492A6]">Registered Users</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-white">
                  {stats ? stats.platformUsers : '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728]/80 border border-[#1D2B40]">
                <div className="text-xs text-[#8492A6]">Connected Deriv Accounts</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-[#00C8FF]">
                  {stats ? stats.connectedDerivAccounts : '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728]/80 border border-[#1D2B40]">
                <div className="text-xs text-[#8492A6]">Deployed Applications</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-[#20F000]">
                  {stats ? stats.independentApplications : 4}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728]/80 border border-[#1D2B40]">
                <div className="text-xs text-[#8492A6]">Deriv WebSocket Feed</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      derivFeedStatus === 'CONNECTED'
                        ? 'bg-[#20F000]'
                        : derivFeedStatus === 'CONNECTING'
                        ? 'bg-[#00C8FF]'
                        : 'bg-[#FF1744]'
                    }`}
                  />
                  <span className="font-mono-num">{derivFeedStatus}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Market Chart Preview */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-[#1D2B40] bg-[#0B1220] p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                  Live Deriv Market Feed
                </h2>
                <p className="text-xs sm:text-sm text-[#8492A6]">
                  Real-time public candlestick stream directly from Deriv WebSocket v3
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['R_100', 'R_50', '1HZ100V', 'frxEURUSD'] as const).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setChartSymbol(sym)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono-num transition-colors cursor-pointer ${
                      chartSymbol === sym
                        ? 'bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white'
                        : 'bg-[#0D1728] border border-[#1D2B40] text-[#8492A6] hover:text-white'
                    }`}
                  >
                    {sym}
                  </button>
                ))}
                {activeTick && (
                  <div className="px-3 py-1.5 rounded-lg bg-[#050914] border border-[#1D2B40] text-xs font-mono-num text-[#20F000]">
                    {activeTick.quote.toFixed(activeTick.pip_size ?? 2)}
                  </div>
                )}
              </div>
            </div>

            <LiveCandleChart symbol={chartSymbol} granularity={60} height={320} liveTick={activeTick} />
          </div>
        </section>

        {/* Four Independent Trading Application Previews */}
        <section id="applications" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-medium text-[#00C8FF] mb-1">INDEPENDENT VERCEL WORKSPACES</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Four Specialized Deriv Applications
              </h2>
            </div>
            <p className="text-sm text-[#8492A6] max-w-md">
              Hosted independently on Vercel subdomains and unified via central PIPFLOWTRADE.SITE SSO.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {appCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.id}
                  className="rounded-xl border border-[#1D2B40] bg-[#0D1728] p-6 flex flex-col justify-between hover:border-[#00C8FF]/50 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#050914] border border-[#1D2B40] flex items-center justify-center">
                          <Icon className={`w-5 h-5 ${card.accent}`} />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-base text-white">{card.title}</h3>
                          <p className="text-xs text-[#8492A6] font-mono-num">{card.domain}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white mb-1">{card.subtitle}</p>
                    <p className="text-sm text-[#8492A6] leading-relaxed">{card.desc}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#1D2B40] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(card.route)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#00C8FF] hover:text-white transition-colors cursor-pointer"
                    >
                      <span>Open {card.title}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Platform Capabilities Grid */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-medium text-[#ED168F] mb-1">PLATFORM CAPABILITIES</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Engineered for Disciplined Deriv Trading
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <button
                  key={feat.title}
                  type="button"
                  onClick={feat.action}
                  className="text-left rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 hover:border-[#00C8FF]/50 transition-colors cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <Icon className="w-5 h-5 text-[#00C8FF] mb-3" />
                    <h3 className="font-display font-semibold text-base text-white mb-1.5">
                      {feat.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8492A6] leading-relaxed">{feat.desc}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#20F000]">
                    Explore <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1D2B40] bg-[#0B1220] py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <PipflowLogo size="sm" onClick={() => navigate('/')} />
            <p className="text-xs text-[#8492A6] max-w-md leading-relaxed">
              PIPFLOWTRADE.SITE is an independent trading workspace integrated with official Deriv
              OAuth2 and WebSocket APIs. Trading involves financial risk. Always verify account mode
              (Demo vs Real) prior to execution.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold text-white mb-2">Platform & Support</div>
            <button type="button" onClick={() => setLegalModal('about')} className="block text-[#8492A6] hover:text-white">
              About
            </button>
            <button type="button" onClick={() => navigate('/support')} className="block text-[#8492A6] hover:text-white">
              Contact
            </button>
            <button type="button" onClick={() => navigate('/support')} className="block text-[#8492A6] hover:text-white">
              Help Centre
            </button>
            <button type="button" onClick={() => navigate('/charts')} className="block text-[#8492A6] hover:text-white">
              Public Live Charts
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold text-white mb-2">Governance & Disclosures</div>
            <button type="button" onClick={() => setLegalModal('privacy')} className="block text-[#8492A6] hover:text-white">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setLegalModal('terms')} className="block text-[#8492A6] hover:text-white">
              Terms of Service
            </button>
            <button type="button" onClick={() => setLegalModal('risk')} className="block text-[#8492A6] hover:text-white">
              Risk Disclosure
            </button>
            <button type="button" onClick={() => setLegalModal('responsible')} className="block text-[#8492A6] hover:text-white">
              Responsible Trading
            </button>
            <button type="button" onClick={() => setLegalModal('deriv')} className="block text-[#8492A6] hover:text-white">
              Deriv Integration Disclosure
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-[#1D2B40] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8492A6]">
          <span>© {new Date().getFullYear()} PIPFLOWTRADE.SITE. All rights reserved.</span>
          <span>Main Portal: pipflowtrade.site · Apps: bot / trader / charts / options</span>
        </div>
      </footer>

      {/* Legal / Info Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-white">
                {LEGAL_TOPICS[legalModal].title}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg border border-[#1D2B40] text-[#8492A6] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#8492A6] leading-relaxed">{LEGAL_TOPICS[legalModal].body}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#00C8FF] text-[#050914]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
