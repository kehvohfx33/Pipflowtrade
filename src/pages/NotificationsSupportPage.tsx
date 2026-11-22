import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, HelpCircle, Send } from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { useApp } from '../contexts/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const NotificationsPage: React.FC = () => {
  const { refreshSession, showToast } = useApp();
  const [notifications, setNotifications] = useState<any[]>([]);

  const load = () => {
    apiFetch<{ notifications: any[] }>('/api/user/notifications')
      .then((res) => setNotifications(res.notifications || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    await apiFetch('/api/user/notifications/read', { method: 'POST', body: JSON.stringify({}) });
    load();
    await refreshSession();
    showToast('info', 'All notifications marked as read.');
  };

  return (
    <WorkspaceLayout title="Notifications Center">
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#8492A6]">
            <Bell className="w-4 h-4 text-[#00C8FF]" />
            <span>Account connections, trade settlements, risk alerts & ledger updates</span>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="px-3 py-1.5 rounded-lg border border-[#1D2B40] bg-[#0B1220] text-xs text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5 text-[#20F000]" />
            Mark All Read
          </button>
        </div>

        <div className="space-y-2.5">
          {notifications.length === 0 ? (
            <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-8 text-center text-xs text-[#8492A6]">
              You have no notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border p-4 ${
                  n.isRead ? 'border-[#1D2B40] bg-[#0B1220]' : 'border-[#00C8FF]/50 bg-[#0D1728]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono-num text-[#00C8FF]">{n.category}</span>
                  <span className="text-[11px] font-mono-num text-[#8492A6]">
                    {new Date(n.createdAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
                  </span>
                </div>
                <div className="font-semibold text-sm text-white mt-1">{n.title}</div>
                <p className="text-xs text-[#8492A6] mt-1">{n.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
};

export const SupportPage: React.FC = () => {
  const { session, navigate, showToast } = useApp();
  const [email, setEmail] = useState(session.user?.email || '');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('DERIV_CONNECTION');
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = () => {
    if (!session.authenticated) return;
    apiFetch<{ tickets: any[] }>('/api/support/tickets')
      .then((res) => setTickets(res.tickets || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.authenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ email, subject, category, message }),
      });
      setSubject('');
      setMessage('');
      loadTickets();
      showToast('success', 'Support ticket submitted.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How does Single Sign-On (SSO) work across Bot, Trader, Charts, and Options?',
      a: 'When you select an application from the main PIPFLOWTRADE.SITE dashboard, the Render backend issues a short-lived signed SSO code verified by the target Vercel deployment without exposing your Deriv tokens in URLs.',
    },
    {
      q: 'What is the difference between Deriv Balance and PIPFLOWTRADE Platform Ledger?',
      a: 'Your Deriv Balance comes directly from Deriv APIs and remains authoritative at Deriv. The PIPFLOWTRADE Platform Ledger is a separate internal platform balance record.',
    },
    {
      q: 'How do I switch between Demo and Real accounts safely?',
      a: 'Real-money accounts require explicit financial risk acknowledgement during Onboarding or in Account Settings. You can switch active accounts anytime in the Account section.',
    },
  ];

  const content = (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSubmit} className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#00C8FF]" />
            <h2 className="font-display font-bold text-base text-white">Submit a Support Request</h2>
          </div>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          >
            <option value="DERIV_CONNECTION">Deriv OAuth2 / API Connection</option>
            <option value="SSO_APPS">Bot / Trader / Charts / Options SSO</option>
            <option value="RISK_LIMITS">Risk Management Limits</option>
            <option value="ACCOUNT_SECURITY">Account & Security</option>
            <option value="GENERAL">General Issue Report</option>
          </select>

          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />

          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your question or issue..."
            className="w-full px-3 py-2.5 rounded-xl bg-[#050914] border border-[#1D2B40] text-sm text-white"
          />

          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white inline-flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Submitting...' : 'Submit Ticket'}</span>
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-3">
            <h2 className="font-display font-bold text-base text-white">Help Centre & FAQs</h2>
            <div className="space-y-3">
              {faqs.map((f) => (
                <div key={f.q} className="p-3 rounded-xl bg-[#050914] border border-[#1D2B40]">
                  <div className="text-xs font-semibold text-white">{f.q}</div>
                  <p className="text-xs text-[#8492A6] mt-1 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>

          {session.authenticated && (
            <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 space-y-2.5">
              <h3 className="font-display font-bold text-sm text-white">Your Support Tickets</h3>
              {tickets.length === 0 ? (
                <p className="text-xs text-[#8492A6]">No support tickets submitted yet.</p>
              ) : (
                tickets.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl bg-[#050914] border border-[#1D2B40] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{t.subject}</span>
                      <span className="font-mono-num text-[#00C8FF]">{t.status}</span>
                    </div>
                    <p className="text-[#8492A6] mt-1">{t.message}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (session.authenticated) {
    return <WorkspaceLayout title="Help Centre & Support">{content}</WorkspaceLayout>;
  }

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col">
      <header className="border-b border-[#1D2B40] bg-[#0B1220] px-4 sm:px-6 h-16 flex items-center justify-between">
        <PipflowLogo size="sm" onClick={() => navigate('/')} />
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-xs text-[#00C8FF] hover:underline"
        >
          Return to Home
        </button>
      </header>
      <main className="flex-1 p-4 sm:p-6">{content}</main>
    </div>
  );
};
