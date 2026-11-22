import React, { useEffect, useState } from 'react';
import { WorkspaceLayout } from '../components/WorkspaceLayout.tsx';
import { apiFetch } from '../lib/api.ts';

export const HistoryPage: React.FC = () => {
  const [tab, setTab] = useState<'transactions' | 'trades' | 'ledger'>('transactions');
  const [data, setData] = useState<{
    transactions: any[];
    trades: any[];
    ledgerEntries: any[];
  }>({ transactions: [], trades: [], ledgerEntries: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ transactions: any[]; trades: any[]; ledgerEntries: any[] }>('/api/user/transactions')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <WorkspaceLayout title="Trading History & Ledger">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 p-1 rounded-xl bg-[#0B1220] border border-[#1D2B40] w-fit">
          {[
            { id: 'transactions', label: `All Transactions (${data.transactions.length})` },
            { id: 'trades', label: `Deriv Contracts (${data.trades.length})` },
            { id: 'ledger', label: `Platform Ledger (${data.ledgerEntries.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as any)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === item.id
                  ? 'bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white'
                  : 'text-[#8492A6] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-5 overflow-x-auto">
          {loading ? (
            <div className="py-10 text-center text-xs text-[#8492A6]">Loading records...</div>
          ) : tab === 'transactions' ? (
            data.transactions.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#8492A6]">No transactions recorded.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4 text-right">Balance After</th>
                    <th className="py-2 text-right">Date (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2B40]/60">
                  {data.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5 pr-4 font-mono-num text-[#00C8FF]">{t.source}</td>
                      <td className="py-2.5 pr-4 font-mono-num text-white">{t.actionType}</td>
                      <td className="py-2.5 pr-4 text-[#8492A6]">{t.description}</td>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono-num font-semibold ${
                          Number(t.amount) >= 0 ? 'text-[#20F000]' : 'text-[#FF1744]'
                        }`}
                      >
                        {Number(t.amount) >= 0 ? '+' : ''}
                        {Number(t.amount).toFixed(2)} {t.currency}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num text-white">
                        {t.balanceAfter ? Number(t.balanceAfter).toFixed(2) : '—'}
                      </td>
                      <td className="py-2.5 text-right font-mono-num text-[#8492A6]">
                        {new Date(t.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === 'trades' ? (
            data.trades.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#8492A6]">No Deriv contracts executed yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                    <th className="py-2 pr-4">App</th>
                    <th className="py-2 pr-4">Contract ID</th>
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4 text-right">Stake</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Opened (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2B40]/60">
                  {data.trades.map((tr) => (
                    <tr key={tr.id}>
                      <td className="py-2.5 pr-4 font-mono-num uppercase text-[#00C8FF]">{tr.appId}</td>
                      <td className="py-2.5 pr-4 font-mono-num text-white">{tr.derivContractId || '—'}</td>
                      <td className="py-2.5 pr-4 font-mono-num text-white">{tr.symbol}</td>
                      <td className="py-2.5 pr-4 font-mono-num text-white">{tr.contractType}</td>
                      <td
                        className={`py-2.5 pr-4 font-mono-num ${
                          tr.mode === 'REAL' ? 'text-[#FF1744]' : 'text-[#20F000]'
                        }`}
                      >
                        {tr.mode}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num text-white">
                        {Number(tr.stake).toFixed(2)} {tr.currency}
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num text-[#8492A6]">{tr.status}</td>
                      <td className="py-2.5 text-right font-mono-num text-[#8492A6]">
                        {new Date(tr.openedAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : data.ledgerEntries.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8492A6]">
              No PIPFLOWTRADE Platform Ledger entries recorded.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1D2B40] text-[#8492A6]">
                  <th className="py-2 pr-4">Entry Type</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4 text-right">Previous</th>
                  <th className="py-2 pr-4 text-right">New Balance</th>
                  <th className="py-2 text-right">Date (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2B40]/60">
                {data.ledgerEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 pr-4 font-mono-num text-[#00C8FF]">{e.entryType}</td>
                    <td className="py-2.5 pr-4 text-white">{e.reason}</td>
                    <td className="py-2.5 pr-4 text-right font-mono-num text-[#20F000]">
                      {Number(e.amount).toFixed(2)} {e.currency}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono-num text-[#8492A6]">
                      {Number(e.previousBalance).toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono-num text-white font-semibold">
                      {Number(e.newBalance).toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right font-mono-num text-[#8492A6]">
                      {new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
};
