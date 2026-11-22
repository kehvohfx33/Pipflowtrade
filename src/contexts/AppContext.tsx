import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.ts';

export type AppRoute =
  | '/'
  | '/charts'
  | '/auth'
  | '/onboarding'
  | '/dashboard'
  | '/app/bot'
  | '/app/trader'
  | '/app/charts'
  | '/app/options'
  | '/tools'
  | '/history'
  | '/account'
  | '/notifications'
  | '/support'
  | '/admin';

export interface DerivAccountSummary {
  id: string;
  derivLoginId: string;
  accountType: 'DEMO' | 'REAL';
  currency: string;
  reportedBalance: string;
  landingCompany: string | null;
  isActive: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED';
  lastSyncedAt: string | null;
}

export interface RiskSettings {
  maxStake: string;
  maxDailyLoss: string;
  maxTradesPerDay: number;
  stopLossLimit: string;
  takeProfitTarget: string;
  maxConsecutiveLosses: number;
  maxExposure: string;
  sessionTimeLimitMinutes: number;
  emergencyStopActive: boolean;
}

export interface SessionState {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    status: string;
    emailVerified: boolean;
    onboardingCompleted: boolean;
    onboardingStep: number;
    lastLoginAt: string | null;
    createdAt: string;
  } | null;
  profile: {
    fullName: string;
    country: string | null;
    timezone: string;
    phone: string | null;
  } | null;
  roles: string[];
  accountPreferences: {
    emailNotifications: boolean;
    tradeAlerts: boolean;
    riskAlerts: boolean;
    compactTerminal: boolean;
  } | null;
  tradingPreferences: {
    defaultApplication: 'bot' | 'trader' | 'charts' | 'options';
    preferredMode: 'DEMO' | 'REAL';
    defaultMarket: string;
    realMoneyRiskAcknowledged: boolean;
    riskAcknowledgedAt: string | null;
  } | null;
  riskSettings: RiskSettings | null;
  derivAccounts: DerivAccountSummary[];
  activeDerivAccount: DerivAccountSummary | null;
  platformLedger: {
    currency: string;
    availableBalance: string;
    updatedAt: string;
  } | null;
  unreadNotifications: number;
}

export interface TickData {
  symbol: string;
  quote: number;
  epoch: number;
  pip_size?: number;
}

interface AppContextValue {
  route: AppRoute;
  navigate: (to: AppRoute, query?: string) => void;
  session: SessionState;
  loadingSession: boolean;
  refreshSession: () => Promise<void>;
  ticks: Record<string, TickData>;
  derivFeedStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  subscribeSymbol: (symbol: string) => void;
  adminModalOpen: boolean;
  setAdminModalOpen: (open: boolean) => void;
  registerLogoTap: () => void;
  tapCount: number;
  toast: { type: 'success' | 'error' | 'info'; message: string } | null;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  logout: () => Promise<void>;
}

const VALID_ROUTES = new Set<AppRoute>([
  '/',
  '/charts',
  '/auth',
  '/onboarding',
  '/dashboard',
  '/app/bot',
  '/app/trader',
  '/app/charts',
  '/app/options',
  '/tools',
  '/history',
  '/account',
  '/notifications',
  '/support',
  '/admin',
]);

function parseRouteFromLocation(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '');
  const hashPath = hash.split('?')[0] || '';
  if (VALID_ROUTES.has(hashPath as AppRoute)) {
    return hashPath as AppRoute;
  }
  const path = window.location.pathname;
  if (VALID_ROUTES.has(path as AppRoute)) {
    return path as AppRoute;
  }
  return '/';
}

const EMPTY_SESSION: SessionState = {
  authenticated: false,
  user: null,
  profile: null,
  roles: [],
  accountPreferences: null,
  tradingPreferences: null,
  riskSettings: null,
  derivAccounts: [],
  activeDerivAccount: null,
  platformLedger: null,
  unreadNotifications: 0,
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation());
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('acct1') && params.has('token1')) {
      const qs = window.location.search;
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      window.location.replace(`/api/deriv/callback${qs}`);
    }
  }, []);
  const [loadingSession, setLoadingSession] = useState(true);
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const [derivFeedStatus, setDerivFeedStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'>('CONNECTING');
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapResetTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  const navigate = useCallback((to: AppRoute, query?: string) => {
    const suffix = query ? `?${query}` : '';
    window.location.hash = `${to}${suffix}`;
    setRoute(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHashOrPop = () => {
      setRoute(parseRouteFromLocation());
    };
    window.addEventListener('hashchange', onHashOrPop);
    window.addEventListener('popstate', onHashOrPop);
    return () => {
      window.removeEventListener('hashchange', onHashOrPop);
      window.removeEventListener('popstate', onHashOrPop);
    };
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiFetch<SessionState>('/api/auth/session');
      setSession({
        authenticated: Boolean(data.authenticated),
        user: data.user || null,
        profile: data.profile || null,
        roles: data.roles || [],
        accountPreferences: data.accountPreferences || null,
        tradingPreferences: data.tradingPreferences || null,
        riskSettings: data.riskSettings || null,
        derivAccounts: data.derivAccounts || [],
        activeDerivAccount: data.activeDerivAccount || null,
        platformLedger: data.platformLedger || null,
        unreadNotifications: data.unreadNotifications || 0,
      });
    } catch {
      setSession(EMPTY_SESSION);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    apiFetch<{ feedStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'; ticks: Record<string, TickData> }>(
      '/api/deriv/ticks/latest'
    )
      .then((res) => {
        if (res.ticks) setTicks(res.ticks);
        if (res.feedStatus) setDerivFeedStatus(res.feedStatus);
      })
      .catch(() => {});
  }, [refreshSession]);

  // Real-time WebSocket connection for market ticks & authenticated user events
  useEffect(() => {
    let active = true;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'market:tick' && msg.payload) {
            setTicks((prev) => ({ ...prev, [msg.symbol]: msg.payload }));
          } else if (msg.type === 'deriv:feed_status' && msg.payload?.status) {
            setDerivFeedStatus(msg.payload.status);
          } else if (msg.type === 'balance:ledger_updated' && msg.payload) {
            refreshSession();
            showToast(
              'info',
              `Platform Ledger updated: ${Number(msg.payload.availableBalance).toFixed(2)} ${msg.payload.currency}`
            );
          } else if (msg.type === 'balance:deriv_synced' || msg.type === 'trade:executed' || msg.type === 'risk:updated') {
            refreshSession();
          } else if (msg.type === 'session:revoked') {
            setSession(EMPTY_SESSION);
            navigate('/auth');
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (active) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [refreshSession, showToast, navigate]);

  const subscribeSymbol = useCallback((symbol: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'market:subscribe', symbol }));
    }
  }, []);

  // Hidden 20-tap logo trigger (ONLY reveals admin login modal, never grants privilege)
  const registerLogoTap = useCallback(() => {
    if (tapResetTimer.current) window.clearTimeout(tapResetTimer.current);
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= 20) {
        setAdminModalOpen(true);
        return 0;
      }
      return next;
    });
    tapResetTimer.current = window.setTimeout(() => {
      setTapCount(0);
    }, 5000);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setSession(EMPTY_SESSION);
    navigate('/');
    showToast('info', 'You have been securely logged out.');
  }, [navigate, showToast]);

  return (
    <AppContext.Provider
      value={{
        route,
        navigate,
        session,
        loadingSession,
        refreshSession,
        ticks,
        derivFeedStatus,
        subscribeSymbol,
        adminModalOpen,
        setAdminModalOpen,
        registerLogoTap,
        tapCount,
        toast,
        showToast,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
