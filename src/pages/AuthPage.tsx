import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

type AuthTab = 'login' | 'register' | 'deriv' | 'forgot' | 'reset';

export const AuthPage: React.FC = () => {
  const { navigate, refreshSession, showToast, session } = useApp();
  const [tab, setTab] = useState<AuthTab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [derivToken, setDerivToken] = useState('');

  useEffect(() => {
    const hashQuery = window.location.hash.split('?')[1] || '';
    const params = new URLSearchParams(hashQuery);
    const t = params.get('tab');
    const oauthErr = params.get('oauth_error');
    const reset = params.get('reset');
    if (t === 'register' || t === 'deriv' || t === 'forgot' || t === 'reset') {
      setTab(t);
    }
    if (reset) {
      setTab('reset');
      setResetToken(reset);
    }
    if (oauthErr) {
      setTab('deriv');
      setError(oauthErr);
    }
  }, []);

  useEffect(() => {
    if (session.authenticated) {
      navigate(session.user?.onboardingCompleted ? '/dashboard' : '/onboarding');
    }
  }, [session.authenticated, session.user?.onboardingCompleted, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refreshSession();
      showToast('success', 'Authenticated into PIPFLOWTRADE.SITE');
      navigate(data?.user?.onboardingCompleted ? '/dashboard' : '/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          confirmPassword,
          acceptTerms,
          acceptRiskDisclosure: acceptRisk,
        }),
      });
      await refreshSession();
      showToast('success', res?.emailVerification?.message || 'Account registered.');
      navigate('/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDerivOAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = await apiFetch<{ redirectUrl: string }>('/api/deriv/authorize');
      window.location.href = resp.redirectUrl;
    } catch (err: any) {
      setError(err?.message || 'Deriv OAuth2 is not configured on this server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDerivTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/deriv/connect-token', {
        method: 'POST',
        body: JSON.stringify({ apiToken: derivToken }),
      });
      await refreshSession();
      showToast('success', 'Deriv account verified and encrypted.');
      navigate(data?.user?.onboardingCompleted ? '/dashboard' : '/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Unable to verify Deriv API token.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMsg(res.message);
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate password recovery.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: password, confirmPassword }),
      });
      setInfoMsg(res.message);
      setTab('login');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-md w-full mx-auto flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs text-[#8492A6] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Website
        </button>
        <PipflowLogo size="sm" onClick={() => navigate('/')} />
      </div>

      <div className="max-w-md w-full mx-auto my-8 rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-6 sm:p-8 shadow-2xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-white">
            {tab === 'login' && 'Sign In to PIPFLOWTRADE'}
            {tab === 'register' && 'Create PIPFLOWTRADE Account'}
            {tab === 'deriv' && 'Connect Your Deriv Account'}
            {tab === 'forgot' && 'Password Recovery'}
            {tab === 'reset' && 'Set New Password'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8492A6]">
            One central identity for Bot, Trader, Charts, and Options.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#050914] border border-[#1D2B40] mb-6">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === 'login' ? 'bg-[#13223A] text-white' : 'text-[#8492A6] hover:text-white'
            }`}
          >
            Email Login
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === 'register' ? 'bg-[#13223A] text-white' : 'text-[#8492A6] hover:text-white'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => { setTab('deriv'); setError(null); }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === 'deriv' ? 'bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white' : 'text-[#8492A6] hover:text-white'
            }`}
          >
            Deriv OAuth
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-[#FF1744]/50 bg-[#FF1744]/10 p-3 text-xs text-[#FF1744]">
            {error}
          </div>
        )}
        {infoMsg && (
          <div className="mb-4 rounded-xl border border-[#20F000]/50 bg-[#20F000]/10 p-3 text-xs text-[#20F000]">
            {infoMsg}
          </div>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8492A6] mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8492A6] absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8492A6] mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8492A6] absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setTab('forgot')}
                className="text-[#00C8FF] hover:underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => setTab('reset')}
                className="text-[#8492A6] hover:text-white"
              >
                Have a reset token?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white hover:opacity-95 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#8492A6] mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8492A6] mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#8492A6] mb-1">Password (8+ chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8492A6] mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-[#8492A6] pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 accent-[#00C8FF]"
              />
              <span>I agree to the PIPFLOWTRADE.SITE Terms of Service and Privacy Policy.</span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-[#8492A6] cursor-pointer">
              <input
                type="checkbox"
                checked={acceptRisk}
                onChange={(e) => setAcceptRisk(e.target.checked)}
                className="mt-0.5 accent-[#00C8FF]"
              />
              <span>I acknowledge the Financial Risk Disclosure for trading synthetic and forex markets.</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white hover:opacity-95 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {tab === 'deriv' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-[#20F000]" />
                <span>Official Deriv OAuth2 Login</span>
              </div>
              <p className="text-xs text-[#8492A6] leading-relaxed">
                You will be redirected to Deriv’s official authorization portal. PIPFLOWTRADE never
                asks for your Deriv password.
              </p>
              <button
                type="button"
                onClick={handleDerivOAuth}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue with Deriv OAuth2</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="relative text-center text-xs text-[#8492A6]">
              <span className="bg-[#0D1728] px-2 relative z-10">or verify with Official Deriv API Token</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-[#1D2B40]" />
            </div>

            <form onSubmit={handleDerivTokenConnect} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#8492A6]">Deriv API Token</label>
                  <a
                    href="https://app.deriv.com/account/api-token"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#00C8FF] inline-flex items-center gap-1 hover:underline"
                  >
                    Create on Deriv <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#8492A6] absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={derivToken}
                    onChange={(e) => setDerivToken(e.target.value)}
                    placeholder="Paste read+trade Deriv API token"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-semibold text-sm border border-[#20F000]/60 bg-[#050914] text-white hover:bg-[#13223A] transition-colors cursor-pointer"
              >
                {loading ? 'Verifying with Deriv...' : 'Verify & Connect Deriv Token'}
              </button>
            </form>
          </div>
        )}

        {tab === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-xs text-[#8492A6]">
              Enter your registered email address to request a password reset token.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[#00C8FF] text-[#050914] cursor-pointer"
            >
              {loading ? 'Processing...' : 'Send Recovery Instructions'}
            </button>
          </form>
        )}

        {tab === 'reset' && (
          <form onSubmit={handleReset} className="space-y-3.5">
            <input
              type="text"
              required
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Reset token"
              className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white font-mono-num"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (8+ chars)"
              className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
            />
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[#20F000] text-[#050914] cursor-pointer"
            >
              {loading ? 'Updating...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-[#1D2B40] flex items-center gap-2 text-[11px] text-[#8492A6]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#20F000] shrink-0" />
          <span>Protected by scrypt hashing, AES-256-GCM token encryption & HTTP-only cookies.</span>
        </div>
      </div>

      <div className="text-center text-xs text-[#8492A6] pb-2">
        PIPFLOWTRADE.SITE · Central Identity & Deriv SSO Authority
      </div>
    </div>
  );
};
