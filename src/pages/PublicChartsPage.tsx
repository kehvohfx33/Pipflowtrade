import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { PipflowLogo } from '../components/PipflowLogo.tsx';
import { LiveCandleChart } from '../components/LiveCandleChart.tsx';
import { useApp } from '../contexts/AppContext.tsx';

export const PublicChartsPage: React.FC = () => {
  const { navigate, ticks, derivFeedStatus, subscribeSymbol, session } = useApp();
  const [symbol, setSymbol] = useState('R_100');
  const [granularity, setGranularity] = useState(60);

  useEffect(() => {
    subscribeSymbol(symbol);
  }, [symbol, subscribeSymbol]);

  const activeTick = ticks[symbol];

  return (
    <div className="min-h-screen bg-[#050914] text-white flex flex-col">
      <header className="border-b border-[#1D2B40] bg-[#0B1220] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(session.authenticated ? '/dashboard' : '/')}
            className="p-2 rounded-lg border border-[#1D2B40] bg-[#050914] text-[#8492A6] hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <PipflowLogo size="sm" onClick={() => navigate('/')} />
        </div>

        <button
          type="button"
          onClick={() => navigate(session.authenticated ? '/app/charts' : '/auth')}
          className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-[#00C8FF] to-[#ED168F] text-white inline-flex items-center gap-1.5"
        >
          <span>{session.authenticated ? 'Open Full Charts App' : 'Sign In to Trade'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Public Live Deriv Charts</h1>
            <p className="text-sm text-[#8492A6]">
              Real-time Deriv WebSocket v3 candlestick market data · Feed Status:{' '}
              <span className={derivFeedStatus === 'CONNECTED' ? 'text-[#20F000]' : 'text-[#00C8FF]'}>
                {derivFeedStatus}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['R_100', 'R_50', 'R_25', '1HZ100V', 'frxEURUSD', 'frxXAUUSD'] as const).map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-num font-medium cursor-pointer ${
                  symbol === sym
                    ? 'bg-[#00C8FF] text-[#050914]'
                    : 'bg-[#0D1728] border border-[#1D2B40] text-[#8492A6] hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}

            <div className="h-5 w-px bg-[#1D2B40] mx-1" />

            {[
              { label: '1m', val: 60 },
              { label: '5m', val: 300 },
              { label: '15m', val: 900 },
              { label: '1h', val: 3600 },
            ].map((tf) => (
              <button
                key={tf.val}
                type="button"
                onClick={() => setGranularity(tf.val)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-num cursor-pointer ${
                  granularity === tf.val
                    ? 'bg-[#ED168F] text-white'
                    : 'bg-[#0D1728] border border-[#1D2B40] text-[#8492A6] hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#1D2B40] bg-[#0B1220] p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-[#8492A6]">
            <span className="font-mono-num text-white font-semibold">{symbol}</span>
            <span className="font-mono-num text-[#20F000] text-sm">
              {activeTick ? `Live Tick: ${activeTick.quote.toFixed(activeTick.pip_size ?? 2)}` : 'Awaiting tick...'}
            </span>
          </div>
          <LiveCandleChart symbol={symbol} granularity={granularity} height={480} liveTick={activeTick} />
        </div>
      </main>
    </div>
  );
};
