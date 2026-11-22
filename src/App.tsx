import React, { useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { PublicChartsPage } from './pages/PublicChartsPage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { OnboardingPage } from './pages/OnboardingPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { AppWorkspacePage } from './pages/AppWorkspacePage.tsx';
import { ToolsPage } from './pages/ToolsPage.tsx';
import { HistoryPage } from './pages/HistoryPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { NotificationsPage, SupportPage } from './pages/NotificationsSupportPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { AdminAuthModal } from './components/AdminAuthModal.tsx';

const PROTECTED_ROUTES = new Set([
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
]);

function RouterView() {
  const { route, navigate, session, loadingSession, toast } = useApp();

  useEffect(() => {
    if (loadingSession) return;
    if (PROTECTED_ROUTES.has(route) && !session.authenticated) {
      navigate('/auth');
      return;
    }
    if (route === '/' && session.authenticated) {
      navigate(session.user?.onboardingCompleted ? '/dashboard' : '/onboarding');
    }
  }, [route, session.authenticated, session.user?.onboardingCompleted, loadingSession, navigate]);

  const renderPage = () => {
    if (loadingSession && PROTECTED_ROUTES.has(route)) {
      return (
        <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center text-sm text-[#8492A6]">
          Initializing PIPFLOWTRADE.SITE workspace...
        </div>
      );
    }

    switch (route) {
      case '/':
        return <LandingPage />;
      case '/charts':
        return <PublicChartsPage />;
      case '/auth':
        return <AuthPage />;
      case '/onboarding':
        return <OnboardingPage />;
      case '/dashboard':
        return <DashboardPage />;
      case '/app/bot':
        return <AppWorkspacePage appId="bot" />;
      case '/app/trader':
        return <AppWorkspacePage appId="trader" />;
      case '/app/charts':
        return <AppWorkspacePage appId="charts" />;
      case '/app/options':
        return <AppWorkspacePage appId="options" />;
      case '/tools':
        return <ToolsPage />;
      case '/history':
        return <HistoryPage />;
      case '/account':
        return <AccountPage />;
      case '/notifications':
        return <NotificationsPage />;
      case '/support':
        return <SupportPage />;
      case '/admin':
        return <AdminPage />;
      default:
        return <LandingPage />;
    }
  };

  return (
    <>
      {renderPage()}
      <AdminAuthModal />
      {toast && (
        <div className="fixed bottom-16 lg:bottom-6 right-4 sm:right-6 z-50 max-w-sm rounded-xl border border-[#1D2B40] bg-[#0D1728] px-4 py-3 shadow-2xl text-xs font-medium flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              toast.type === 'success'
                ? 'bg-[#20F000]'
                : toast.type === 'error'
                ? 'bg-[#FF1744]'
                : 'bg-[#00C8FF]'
            }`}
          />
          <span className="text-white">{toast.message}</span>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterView />
    </AppProvider>
  );
}
