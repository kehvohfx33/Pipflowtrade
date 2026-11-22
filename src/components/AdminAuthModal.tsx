import React, { useState } from 'react';
import { Lock, ShieldAlert, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const AdminAuthModal: React.FC = () => {
  const { adminModalOpen, setAdminModalOpen, navigate, showToast } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!adminModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/private-admin/authenticate', {
        method: 'POST',
        body: JSON.stringify({ email, password, mfaCode: mfaCode || undefined }),
      });
      setAdminModalOpen(false);
      setEmail('');
      setPassword('');
      setMfaCode('');
      showToast('success', 'Administrator session authenticated.');
      navigate('/admin');
    } catch (err: any) {
      if (err?.data?.mfaRequired) setMfaRequired(true);
      setError(err?.message || 'Administrator authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1D2B40] bg-[#0D1728] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#ED168F]" />
            <h2 className="font-display text-lg font-bold text-white">
              Private Administration Login
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setAdminModalOpen(false)}
            className="p-1.5 rounded-lg border border-[#1D2B40] text-[#8492A6] hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#8492A6] mb-4">
          Authorized administrators only. All authentication attempts and administrative actions are
          recorded in the server audit log.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-[#FF1744]/50 bg-[#FF1744]/10 p-3 text-xs text-[#FF1744]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[#8492A6] mb-1">
              Administrator Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@pipflowtrade.site"
              className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8492A6] mb-1">
              Administrator Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8492A6] absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white focus:outline-none focus:border-[#00C8FF]"
              />
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label className="block text-xs font-medium text-[#8492A6] mb-1">
                MFA Verification Code
              </label>
              <input
                type="text"
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="Enter MFA secret/code"
                className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white font-mono-num"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Authenticate Administrator'}
          </button>
        </form>
      </div>
    </div>
  );
};
