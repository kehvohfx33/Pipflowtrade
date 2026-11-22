import React, { useState } from 'react';
import {
  BarChart2,
  Bell,
  Bot,
  ChevronDown,
  HelpCircle,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Settings,
  Shield,
  Sliders,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { PipflowLogo } from './PipflowLogo.tsx';
import { AppRoute, useApp } from '../contexts/AppContext.tsx';

interface WorkspaceLayoutProps {
  title: string;
  children: React.ReactNode;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ title, children }) => {
  const {
    route,
    navigate,
    session,
    derivFeedStatus,
    registerLogoTap,
    logout,
  } = useApp();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const navItems: Array<{ label: string; route: AppRoute; icon: React.ComponentType<any> }> = [
    { label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    { label: 'Bot', route: '/app/bot', icon: Bot },
    { label: 'Trader', route: '/app/trader', icon: TrendingUp },
    { label: 'Charts', route: '/app/charts', icon: BarChart2 },
    { label: 'Options', route: '/app/options', icon: Layers },
    { label: 'Trading Tools', route: '/tools', icon: Sliders },
    { label: 'Trading History', route: '/history', icon: History },
    { label: 'Account', route: '/account', icon: User },
    { label: 'Notifications', route: '/notifications', icon: Bell },
    { label: 'Support', route: '/support', icon: HelpCircle },
    { label: 'Settings', route: '/account', icon: Settings },
  ];

  const activeDeriv = session.activeDerivAccount;
  const isEmergencyStopped = session.riskSettings?.emergencyStopActive;

  const handleNav = (r: AppRoute) => {
    setMobileDrawerOpen(false);
    navigate(r);
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col lg:flex-row">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#1D2B40] bg-[#0B1220] z-30">
        <div className="h-16 px-5 border-b border-[#1D2B40] flex items-center">
          <PipflowLogo size="sm" onClick={registerLogoTap} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route === item.route && !(item.label === 'Settings' && route === '/account');
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#00C8FF]/20 to-[#ED168F]/20 text-white border border-[#00C8FF]/40'
                    : 'text-[#8492A6] hover:text-white hover:bg-[#0D1728]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#00C8FF]' : ''}`} />
                  <span>{item.label}</span>
                </span>
                {item.route === '/notifications' && session.unreadNotifications > 0 && (
                  <span className="px-1.5 py-0.5 text-[11px] font-mono-num rounded bg-[#ED168F] text-white">
                    {session.unreadNotifications}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1D2B40] space-y-2">
          {isEmergencyStopped && (
            <div className="px-3 py-2 rounded-lg bg-[#FF1744]/15 border border-[#FF1744]/40 text-xs text-[#FF1744] font-medium flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>Emergency Stop Active</span>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#8492A6] hover:text-[#FF1744] hover:bg-[#0D1728] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Top Persistent Navigation */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 border-b border-[#1D2B40] bg-[#0B1220]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#1D2B40] bg-[#050914] text-white"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="lg:hidden">
              <PipflowLogo size="sm" showText={false} onClick={registerLogoTap} />
            </div>
            <h1 className="font-display font-bold text-sm sm:text-base text-white truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Deriv WebSocket Indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1D2B40] bg-[#050914] text-xs font-mono-num">
              <span
                className={`w-2 h-2 rounded-full ${
                  derivFeedStatus === 'CONNECTED'
                    ? 'bg-[#20F000]'
                    : derivFeedStatus === 'CONNECTING'
                    ? 'bg-[#00C8FF]'
                    : 'bg-[#FF1744]'
                }`}
              />
              <span className="text-[#8492A6]">Deriv Feed:</span>
              <span className="text-white">{derivFeedStatus}</span>
            </div>

            {/* Active Deriv Account & Demo/Real Mode */}
            {activeDeriv ? (
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#1D2B40] bg-[#050914] hover:border-[#00C8FF]/50 text-xs font-mono-num cursor-pointer"
              >
                <span
                  className={`font-semibold ${
                    activeDeriv.accountType === 'REAL' ? 'text-[#FF1744]' : 'text-[#20F000]'
                  }`}
                >
                  {activeDeriv.accountType}
                </span>
                <span className="hidden sm:inline text-[#8492A6]">{activeDeriv.derivLoginId}</span>
                <span className="text-white font-semibold">
                  {Number(activeDeriv.reportedBalance).toFixed(2)} {activeDeriv.currency}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="px-3 py-1.5 rounded-lg border border-[#00C8FF]/40 bg-[#00C8FF]/10 text-xs font-medium text-[#00C8FF] cursor-pointer"
              >
                Connect Deriv
              </button>
            )}

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative p-2 rounded-lg border border-[#1D2B40] bg-[#050914] text-[#8492A6] hover:text-white cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {session.unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ED168F] text-[10px] font-bold text-white flex items-center justify-center">
                  {session.unreadNotifications}
                </span>
              )}
            </button>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#1D2B40] bg-[#050914] hover:border-[#00C8FF]/40 text-xs cursor-pointer"
              >
                <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00C8FF] to-[#ED168F] flex items-center justify-center font-bold text-white">
                  {(session.profile?.fullName || session.user?.email || 'U')[0].toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate text-white font-medium">
                  {session.profile?.fullName || session.user?.email}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#8492A6]" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#1D2B40] bg-[#0D1728] shadow-2xl py-1.5 z-50">
                  <div className="px-3.5 py-2 border-b border-[#1D2B40]">
                    <div className="text-xs font-semibold text-white truncate">
                      {session.profile?.fullName}
                    </div>
                    <div className="text-[11px] text-[#8492A6] truncate">{session.user?.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setProfileMenuOpen(false); navigate('/account'); }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#8492A6] hover:text-white hover:bg-[#13223A]"
                  >
                    Account & Deriv Connections
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileMenuOpen(false); navigate('/tools'); }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#8492A6] hover:text-white hover:bg-[#13223A]"
                  >
                    Risk Management Guard
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileMenuOpen(false); navigate('/onboarding'); }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#8492A6] hover:text-white hover:bg-[#13223A]"
                  >
                    Re-run Guided Onboarding
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileMenuOpen(false); logout(); }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#FF1744] hover:bg-[#13223A] border-t border-[#1D2B40]"
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      {/* Mobile Bottom Thumb Navigation (<= 15% sticky height cap) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-[#1D2B40] bg-[#0B1220]/95 backdrop-blur-md grid grid-cols-5">
        {[
          { label: 'Home', route: '/dashboard' as AppRoute, icon: LayoutDashboard },
          { label: 'Bot', route: '/app/bot' as AppRoute, icon: Bot },
          { label: 'Trader', route: '/app/trader' as AppRoute, icon: TrendingUp },
          { label: 'Charts', route: '/app/charts' as AppRoute, icon: BarChart2 },
          { label: 'Options', route: '/app/options' as AppRoute, icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = route === tab.route;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => navigate(tab.route)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-[#00C8FF]' : 'text-[#8492A6]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Slide-Out Drawer */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/75" onClick={() => setMobileDrawerOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[#0B1220] border-r border-[#1D2B40] flex flex-col h-full">
            <div className="h-14 px-4 border-b border-[#1D2B40] flex items-center justify-between">
              <PipflowLogo size="sm" onClick={registerLogoTap} />
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg border border-[#1D2B40] text-[#8492A6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = route === item.route;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleNav(item.route)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      active ? 'bg-[#00C8FF]/15 text-white border border-[#00C8FF]/40' : 'text-[#8492A6]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-[#1D2B40]">
              <button
                type="button"
                onClick={() => { setMobileDrawerOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#FF1744]"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
