import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  History,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Menu,
  Shield,
  Sliders,
  TrendingUp,
  Wallet,
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

interface WebsiteContent {
  brandName: string;
  heroLabel: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  derivSignupUrl: string;
  derivSignupLabel: string;
  liveChartsLabel: string;
  emailSignUpLabel: string;
  announcement: { enabled: boolean; text: string; severity: 'INFO' | 'WARNING' | 'SUCCESS' };
  maintenanceNotice: { enabled: boolean; message: string };
  capabilities: Array<{ id: string; title: string; description: string; iconKey: string; route: string }>;
  faqs: Array<{ id: string; question: string; answer: string }>;
  footer: {
    description: string;
    contactEmail: string;
    supportHours: string;
    copyrightText: string;
  };
}

interface PublicAppRecord {
  id: 'bot' | 'trader' | 'charts' | 'options';
  name: string;
  subtitle?: string;
  description: string;
  productionUrl: string;
  vercelProjectRef?: string;
  healthStatus: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
}

const CAP_ICONS: Record<string, React.ComponentType<any>> = {
  bot: Bot,
  chart: Activity,
  wallet: Wallet,
  shield: Shield,
  key: KeyRound,
  lock: Lock,
  history: History,
  globe: Globe,
};

const LEGAL_TOPICS: Record<string, { title: string; body: string }> = {
  about: {
    title: 'About PIPFLOWTRADE.SITE',
    body: 'PIPFLOWTRADE.SITE is an enterprise Deriv trading workspace unifying Bot Builder (bot.pipflowtrade.site), Deriv Trader (trader.pipflowtrade.site), Smart Charts (charts.pipflowtrade.site), and Options Terminal (options.pipflowtrade.site) under a single authenticated session, shared risk engine, and transparent ledger.',
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
    body: 'PIPFLOWTRADE.SITE integrates with official Deriv OAuth2 and WebSocket v3 endpoints. Your Deriv-reported account balance remains authoritative at Deriv at all times; any PIPFLOWTRADE simulated demo wallet or ledger entries are displayed separately.',
  },
};

const TIMEFRAMES = [
  { label: '1m', granularity: 60 },
  { label: '5m', granularity: 300 },
  { label: '15m', granularity: 900 },
  { label: '1h', granularity: 3600 },
];

export const LandingPage: React.FC = () => {
  const { navigate, ticks, derivFeedStatus, subscribeSymbol, showToast } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [apps, setApps] = useState<PublicAppRecord[]>([]);
  const [chartSymbol, setChartSymbol] = useState('R_100');
  const [granularity, setGranularity] = useState(60);
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');
  const [legalModal, setLegalModal] = useState<keyof typeof LEGAL_TOPICS | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const baselineQuoteRef = useRef<Record<string, number>>({});

  useEffect(() => {
    apiFetch<PublicStats>('/api/public/stats').then(setStats).catch(() => {});
    apiFetch<{ content: WebsiteContent; applications: PublicAppRecord[] }>('/api/public/content')
      .then((res) => {
        if (res.content) setContent(res.content);
        if (Array.isArray(res.applications)) setApps(res.applications);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    subscribeSymbol(chartSymbol);
  }, [chartSymbol, subscribeSymbol]);

  const activeTick = ticks[chartSymbol];
  useEffect(() => {
    if (activeTick && baselineQuoteRef.current[chartSymbol] === undefined) {
      baselineQuoteRef.current[chartSymbol] = activeTick.quote;
    }
  }, [activeTick, chartSymbol]);

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

  const scrollToSection = (id: string) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const baseline = baselineQuoteRef.current[chartSymbol];
  const priceDelta = activeTick && baseline !== undefined ? activeTick.quote - baseline : 0;
  const priceDeltaPct =
    activeTick && baseline ? ((activeTick.quote - baseline) / baseline) * 100 : 0;

  const fallbackApps: PublicAppRecord[] = [
    {
      id: 'bot',
      name: 'BOT BUILDER',
      subtitle: 'Editable strategies',
      description:
        'Visual trading strategy creation, XML import/export, stake configuration, risk controls, and emergency stop.',
      productionUrl: 'https://bot.pipflowtrade.site',
      vercelProjectRef: 'bot-builder',
      healthStatus: 'ONLINE',
    },
    {
      id: 'trader',
      name: 'TRADER',
      subtitle: 'Accumulators & contracts',
      description:
        'Real-time Deriv market quotes, contract proposals, market selection, and instant execution validation.',
      productionUrl: 'https://trader.pipflowtrade.site',
      vercelProjectRef: 'accumulators',
      healthStatus: 'ONLINE',
    },
    {
      id: 'charts',
      name: 'CHARTS',
      subtitle: 'MT5 analysis & indicators',
      description:
        'Candlesticks, timeframes, drawing tools, technical indicators, and real-time Deriv price feeds.',
      productionUrl: 'https://charts.pipflowtrade.site',
      vercelProjectRef: 'charts',
      healthStatus: 'ONLINE',
    },
    {
      id: 'options',
      name: 'OPTIONS',
      subtitle: 'Digits & options',
      description:
        'Duration and stake controls, payout metrics, contract monitoring, and verified settlement results.',
      productionUrl: 'https://options.pipflowtrade.site',
      vercelProjectRef: 'digits',
      healthStatus: 'ONLINE',
    },
  ];

  const displayApps = apps.length > 0 ? apps : fallbackApps;
  const appMeta: Record<string, { icon: React.ComponentType<any>; accent: string }> = {
    bot: { icon: Bot, accent: 'text-[#11C9F4]' },
    trader: { icon: TrendingUp, accent: 'text-[#16D94B]' },
    charts: { icon: BarChart2, accent: 'text-[#EC2698]' },
    options: { icon: Layers, accent: 'text-[#2589F5]' },
  };

  const derivSignupUrl = content?.derivSignupUrl || 'https://deriv.com/signup/';

  return (
    <div id="home-top" className="min-h-screen bg-[#050914] text-[#F4F7FC] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-[#17243A] bg-[#070D19]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <PipflowLogo size="md" onClick={() => scrollToSection('home-top')} />

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#8996AA]">
            <button
              type="button"
              onClick={() => scrollToSection('home-top')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('about')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('applications')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Applications
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Capabilities
            </button>
            <button
              type="button"
              onClick={() => navigate('/charts')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Public Live Charts
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Contact
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#050914] hover:bg-[#11C9F4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Login Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg border border-[#17243A] bg-[#0D1728] text-white hover:border-[#11C9F4]/60 cursor-pointer"
              aria-label="Open navigation menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Full 11-link Responsive Hamburger Menu */}
        {menuOpen && (
          <div className="border-t border-[#17243A] bg-[#070D19] px-4 sm:px-6 py-4">
            <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              <button type="button" onClick={() => scrollToSection('home-top')} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Home
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); setLegalModal('about'); }} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                About
              </button>
              <button type="button" onClick={() => scrollToSection('applications')} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Applications
              </button>
              <button type="button" onClick={() => scrollToSection('features')} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Platform Capabilities
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/charts'); }} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Public Live Charts
              </button>
              <button type="button" onClick={() => scrollToSection('contact')} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Contact
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/auth'); }} className="text-left px-3 py-2 rounded-lg text-[#11C9F4] font-semibold hover:bg-[#0D1728] cursor-pointer">
                Login
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/auth', 'tab=register'); }} className="text-left px-3 py-2 rounded-lg text-[#16D94B] font-semibold hover:bg-[#0D1728] cursor-pointer">
                Register
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/support'); }} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Help Centre
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); setLegalModal('privacy'); }} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Privacy Policy
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); setLegalModal('terms'); }} className="text-left px-3 py-2 rounded-lg text-[#8996AA] hover:text-white hover:bg-[#0D1728] cursor-pointer">
                Terms of Service
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Dynamic CMS Announcement / Maintenance Banners */}
      {content?.maintenanceNotice?.enabled && content.maintenanceNotice.message && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
          {content.maintenanceNotice.message}
        </div>
      )}
      {content?.announcement?.enabled && content.announcement.text && (
        <div className="border-b border-[#17243A] bg-[#0D1728] px-4 py-2 text-center text-xs text-[#11C9F4]">
          {content.announcement.text}
        </div>
      )}

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-[#17243A]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(17,201,244,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(236,38,152,0.09),_transparent_50%)] pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-20 text-center">
            <p className="text-[11px] sm:text-xs font-semibold tracking-wider text-[#11C9F4] mb-4">
              {content?.heroLabel || 'UNIFIED DERIV MULTI-APPLICATION WORKSPACE · SSO ENABLED'}
            </p>

            <h1 className="font-display font-extrabold tracking-tight text-balance mx-auto max-w-4xl text-[clamp(2.1rem,4.5vw,3.75rem)] leading-[1.08]">
              {content?.heroTitle || 'WELCOME TO'}{' '}
              <span className="bg-gradient-to-r from-[#11C9F4] via-[#2589F5] to-[#EC2698] bg-clip-text text-transparent">
                {content?.heroHighlight || 'PIPFLOWTRADE.SITE'}
              </span>
            </h1>

            <p className="mt-5 max-w-2xl mx-auto text-sm sm:text-lg text-[#8996AA] leading-relaxed">
              {content?.heroDescription ||
                'Your all-in-one workspace for automated analysis, smart bots, MT5-inspired charts and real-time Deriv market insights.'}
            </p>

            {/* Primary & Secondary CTAs matching visual layout */}
            <div className="mt-8 flex flex-col items-center gap-3 max-w-md mx-auto">
              <button
                type="button"
                onClick={handleDerivStart}
                disabled={oauthLoading}
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm sm:text-base text-white bg-gradient-to-r from-[#11C9F4] via-[#2589F5] to-[#EC2698] hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[#11C9F4]/10 cursor-pointer disabled:opacity-60"
              >
                <span>{oauthLoading ? 'Connecting to Deriv...' : content?.primaryCtaLabel || 'START TRADING NOW (DERIV)'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="w-full py-3 px-6 rounded-xl font-semibold text-sm sm:text-base bg-[#0D1728] border border-[#16D94B]/60 text-white hover:bg-[#101C30] transition-colors cursor-pointer"
              >
                {content?.secondaryCtaLabel || 'EXISTING ACCOUNT LOGIN'}
              </button>

              <div className="w-full grid grid-cols-2 gap-3 pt-1">
                <a
                  href={derivSignupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-medium bg-[#0A1220] border border-[#17243A] hover:border-[#11C9F4]/60 text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <span>{content?.derivSignupLabel || 'Sign Up on Deriv'}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#11C9F4]" />
                </a>
                <button
                  type="button"
                  onClick={() => navigate('/charts')}
                  className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-medium bg-[#0A1220] border border-[#17243A] hover:border-[#16D94B]/60 text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-[#16D94B]" />
                  <span>{content?.liveChartsLabel || 'Live Charts'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('/auth', 'tab=register')}
                className="mt-1 py-2 px-5 rounded-lg text-xs font-medium border border-[#17243A] bg-[#0A1220] text-[#8996AA] hover:text-white hover:border-[#11C9F4]/50 transition-colors cursor-pointer"
              >
                {content?.emailSignUpLabel || 'Email Sign Up'}
              </button>
            </div>

            {/* Genuine Backend Platform Statistics */}
            <div className="mt-12 pt-8 border-t border-[#17243A]/80 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto text-left">
              <div className="p-4 rounded-xl bg-[#0D1728] border border-[#17243A]">
                <div className="text-xs text-[#8996AA]">Registered Users</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-white">
                  {stats ? stats.platformUsers : '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728] border border-[#17243A]">
                <div className="text-xs text-[#8996AA]">Connected Deriv Accounts</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-[#11C9F4]">
                  {stats ? stats.connectedDerivAccounts : '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728] border border-[#17243A]">
                <div className="text-xs text-[#8996AA]">Deployed Applications</div>
                <div className="mt-1 text-2xl font-bold font-mono-num text-[#16D94B]">
                  {stats ? stats.independentApplications : 4}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0D1728] border border-[#17243A]">
                <div className="text-xs text-[#8996AA]">Deriv WebSocket Feed</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      derivFeedStatus === 'CONNECTED'
                        ? 'bg-[#16D94B]'
                        : derivFeedStatus === 'CONNECTING'
                        ? 'bg-[#11C9F4]'
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="rounded-2xl border border-[#17243A] bg-[#0D1728] p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                  Live Deriv Market Feed
                </h2>
                <p className="text-xs sm:text-sm text-[#8996AA]">
                  Real-time public candlestick stream directly from Deriv WebSocket
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
                        ? 'bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-white'
                        : 'bg-[#0A1220] border border-[#17243A] text-[#8996AA] hover:text-white'
                    }`}
                  >
                    {sym}
                  </button>
                ))}

                <div className="h-5 w-px bg-[#17243A] mx-1 hidden sm:block" />

                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.label}
                    type="button"
                    onClick={() => setGranularity(tf.granularity)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-num cursor-pointer ${
                      granularity === tf.granularity
                        ? 'bg-[#101C30] border border-[#11C9F4] text-[#11C9F4]'
                        : 'bg-[#0A1220] border border-[#17243A] text-[#8996AA] hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Real-time Price Movement Telemetry Bar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#0A1220] border border-[#17243A] text-xs font-mono-num">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[#8996AA]">
                  Symbol: <strong className="text-white">{chartSymbol}</strong>
                </span>
                <span className="text-[#8996AA]">
                  Spot Price:{' '}
                  <strong className="text-[#16D94B]">
                    {activeTick ? activeTick.quote.toFixed(activeTick.pip_size ?? 2) : 'Streaming...'}
                  </strong>
                </span>
                {activeTick && (
                  <span className={priceDelta >= 0 ? 'text-[#16D94B]' : 'text-[#FF1744]'}>
                    {priceDelta >= 0 ? '+' : ''}
                    {priceDelta.toFixed(activeTick.pip_size ?? 2)} ({priceDeltaPct >= 0 ? '+' : ''}
                    {priceDeltaPct.toFixed(3)}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[#8996AA]">
                <Clock className="w-3.5 h-3.5 text-[#11C9F4]" />
                <span>
                  {activeTick
                    ? `Updated ${new Date(activeTick.epoch * 1000).toISOString().slice(11, 19)} UTC`
                    : `Feed: ${derivFeedStatus}`}
                </span>
              </div>
            </div>

            <LiveCandleChart
              symbol={chartSymbol}
              granularity={granularity}
              height={320}
              liveTick={activeTick}
            />
          </div>
        </section>

        {/* Four Independent Trading Applications */}
        <section id="applications" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-semibold text-[#11C9F4] mb-1">INDEPENDENT VERCEL WORKSPACES</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Four Specialized Deriv Applications
              </h2>
            </div>
            <p className="text-sm text-[#8996AA] max-w-md">
              Hosted independently on Vercel subdomains and unified via central PIPFLOWTRADE.SITE SSO.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayApps.map((app) => {
              const meta = appMeta[app.id] || { icon: Layers, accent: 'text-[#11C9F4]' };
              const Icon = meta.icon;
              const cleanHost = app.productionUrl.replace(/^https?:\/\//, '');
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-[#17243A] bg-[#0D1728] p-6 flex flex-col justify-between hover:border-[#11C9F4]/50 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#050914] border border-[#17243A] flex items-center justify-center">
                          <Icon className={`w-5 h-5 ${meta.accent}`} />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-base text-white uppercase">
                            {app.name}
                          </h3>
                          <p className="text-xs text-[#8996AA] font-mono-num">{cleanHost}</p>
                        </div>
                      </div>
                      {app.maintenanceMode ? (
                        <span className="text-[11px] font-mono-num text-amber-400">MAINTENANCE</span>
                      ) : (
                        <span className="text-[11px] font-mono-num text-[#16D94B]">
                          {app.vercelProjectRef || 'VERCEL'}
                        </span>
                      )}
                    </div>
                    {app.subtitle && (
                      <p className="text-sm font-medium text-[#11C9F4] mb-1">{app.subtitle}</p>
                    )}
                    <p className="text-sm text-[#8996AA] leading-relaxed">{app.description}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#17243A] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/app/${app.id}` as any)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#11C9F4] hover:text-white transition-colors cursor-pointer"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <a
                      href={app.productionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#8996AA] hover:text-white"
                    >
                      <span>Direct App</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Platform Capabilities Grid (CMS-backed) */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-semibold text-[#EC2698] mb-1">PLATFORM CAPABILITIES</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Powerful Features for Modern Traders
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(content?.capabilities || []).map((feat) => {
              const Icon = CAP_ICONS[feat.iconKey] || CheckCircle2;
              return (
                <button
                  key={feat.id}
                  type="button"
                  onClick={() => navigate((feat.route || '/auth') as any)}
                  className="text-left rounded-xl border border-[#17243A] bg-[#0D1728] p-5 hover:border-[#11C9F4]/50 transition-colors cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <Icon className="w-5 h-5 text-[#11C9F4] mb-3" />
                    <h3 className="font-display font-semibold text-base text-white mb-1.5">
                      {feat.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8996AA] leading-relaxed">{feat.description}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#16D94B]">
                    Explore <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* FAQ & Support Overview */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-[#11C9F4] mb-1">FREQUENTLY ASKED QUESTIONS</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Security, Deriv Integration & Workspace Architecture
            </h2>
          </div>

          <div className="space-y-3">
            {(content?.faqs || []).map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div key={faq.id} className="rounded-xl border border-[#17243A] bg-[#0D1728] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-semibold text-white cursor-pointer"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#8996AA] shrink-0 transition-transform ${
                        isOpen ? 'rotate-180 text-[#11C9F4]' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs sm:text-sm text-[#8996AA] leading-relaxed border-t border-[#17243A]/60 pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact & Get Started Band */}
        <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
          <div className="rounded-2xl border border-[#17243A] bg-[#0D1728] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-semibold text-[#11C9F4] mb-1">GET STARTED OR CONTACT SUPPORT</p>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-white">
                Ready to Explore Your Unified Workspace?
              </h3>
              <p className="text-xs sm:text-sm text-[#8996AA] mt-1">
                {content?.footer.contactEmail || 'support@pipflowtrade.site'} ·{' '}
                {content?.footer.supportHours || 'Mon–Fri · 06:00–22:00 UTC'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/support')}
                className="px-4 py-2.5 rounded-xl border border-[#17243A] bg-[#0A1220] hover:border-[#11C9F4] text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Mail className="w-4 h-4 text-[#11C9F4]" />
                <span>Help Centre & Support</span>
              </button>
              <button
                type="button"
                onClick={handleDerivStart}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#11C9F4] to-[#EC2698] text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Continue with Deriv</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#17243A] bg-[#070D19] py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <PipflowLogo size="sm" onClick={() => scrollToSection('home-top')} />
            <p className="text-xs text-[#8996AA] max-w-md leading-relaxed">
              {content?.footer.description ||
                'PIPFLOWTRADE.SITE is an independent trading workspace integrated with official Deriv OAuth2 and WebSocket APIs. Trading involves financial risk.'}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold text-white mb-2">Platform & Support</div>
            <button type="button" onClick={() => setLegalModal('about')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              About
            </button>
            <button type="button" onClick={() => navigate('/support')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Contact & Help Centre
            </button>
            <button type="button" onClick={() => navigate('/charts')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Public Live Charts
            </button>
            <button type="button" onClick={() => navigate('/auth')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Login / Register
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold text-white mb-2">Governance & Disclosures</div>
            <button type="button" onClick={() => setLegalModal('privacy')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setLegalModal('terms')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Terms of Service
            </button>
            <button type="button" onClick={() => setLegalModal('risk')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Risk Disclosure
            </button>
            <button type="button" onClick={() => setLegalModal('responsible')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Responsible Trading
            </button>
            <button type="button" onClick={() => setLegalModal('deriv')} className="block text-[#8996AA] hover:text-white cursor-pointer">
              Deriv Integration Disclosure
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-[#17243A] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8996AA]">
          <span>{content?.footer.copyrightText || `© ${new Date().getFullYear()} PIPFLOWTRADE.SITE. All rights reserved.`}</span>
          <span>Main Portal: pipflowtrade.site · Apps: bot / trader / charts / options</span>
        </div>
      </footer>

      {/* Legal / Info Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#17243A] bg-[#0D1728] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-white">
                {LEGAL_TOPICS[legalModal].title}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg border border-[#17243A] text-[#8996AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#8996AA] leading-relaxed">{LEGAL_TOPICS[legalModal].body}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#11C9F4] text-[#050914] cursor-pointer"
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
