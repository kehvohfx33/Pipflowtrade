import React, { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { apiFetch } from '../lib/api.ts';

interface LiveCandleChartProps {
  symbol: string;
  granularity?: number;
  height?: number;
  liveTick?: { quote: number; epoch: number } | null;
}

export const LiveCandleChart: React.FC<LiveCandleChartProps> = ({
  symbol,
  granularity = 60,
  height = 340,
  liveTick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#050914' },
        textColor: '#8492A6',
      },
      grid: {
        vertLines: { color: '#111C30' },
        horzLines: { color: '#111C30' },
      },
      width: el.clientWidth,
      height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1D2B40',
      },
      rightPriceScale: {
        borderColor: '#1D2B40',
      },
      crosshair: {
        vertLine: { color: '#00C8FF', width: 1, labelBackgroundColor: '#0D1728' },
        horzLine: { color: '#00C8FF', width: 1, labelBackgroundColor: '#0D1728' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#20F000',
      downColor: '#FF1744',
      borderVisible: false,
      wickUpColor: '#20F000',
      wickDownColor: '#FF1744',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<{ candles: Array<{ epoch: number; open: number; high: number; low: number; close: number }> }>(
      `/api/deriv/candles?symbol=${encodeURIComponent(symbol)}&granularity=${granularity}&count=120`
    )
      .then((res) => {
        if (cancelled || !seriesRef.current) return;
        const formatted = (res.candles || []).map((c) => ({
          time: Number(c.epoch) as Time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        if (formatted.length > 0) {
          seriesRef.current.setData(formatted);
          const last = formatted[formatted.length - 1];
          lastCandleRef.current = {
            time: Number(last.time),
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
          };
          chartRef.current?.timeScale().fitContent();
        }
        setLoading(false);
      })
      .catch(() => {
        // Fallback to direct public Deriv WebSocket v3 (read-only market data, no credentials)
        try {
          const directWs = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
          directWs.onopen = () => {
            directWs.send(
              JSON.stringify({
                ticks_history: symbol,
                adjust_start_time: 1,
                count: 120,
                end: 'latest',
                granularity,
                style: 'candles',
              })
            );
          };
          directWs.onmessage = (evt) => {
            if (cancelled) return;
            try {
              const msg = JSON.parse(evt.data);
              if (msg.error) {
                setError(msg.error.message || 'Deriv candle stream unavailable.');
                setLoading(false);
                directWs.close();
                return;
              }
              if (Array.isArray(msg.candles) && seriesRef.current) {
                const formatted = msg.candles.map((c: any) => ({
                  time: Number(c.epoch) as Time,
                  open: Number(c.open),
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                }));
                if (formatted.length > 0) {
                  seriesRef.current.setData(formatted);
                  const last = formatted[formatted.length - 1];
                  lastCandleRef.current = {
                    time: Number(last.time),
                    open: last.open,
                    high: last.high,
                    low: last.low,
                    close: last.close,
                  };
                  chartRef.current?.timeScale().fitContent();
                }
                setLoading(false);
                directWs.close();
              }
            } catch {
              // ignore
            }
          };
          directWs.onerror = () => {
            if (!cancelled) {
              setError('Unable to reach Deriv public market WebSocket.');
              setLoading(false);
            }
          };
        } catch (err: any) {
          if (!cancelled) {
            setError(err?.message || 'Unable to load Deriv candle stream.');
            setLoading(false);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, granularity]);

  useEffect(() => {
    if (!liveTick || !seriesRef.current) return;
    const bucketTime = Math.floor(liveTick.epoch / granularity) * granularity;
    const prev = lastCandleRef.current;

    if (!prev || bucketTime > prev.time) {
      const nextCandle = {
        time: bucketTime,
        open: prev ? prev.close : liveTick.quote,
        high: liveTick.quote,
        low: liveTick.quote,
        close: liveTick.quote,
      };
      lastCandleRef.current = nextCandle;
      seriesRef.current.update({ ...nextCandle, time: nextCandle.time as Time });
    } else if (bucketTime === prev.time) {
      const updated = {
        ...prev,
        high: Math.max(prev.high, liveTick.quote),
        low: Math.min(prev.low, liveTick.quote),
        close: liveTick.quote,
      };
      lastCandleRef.current = updated;
      seriesRef.current.update({ ...updated, time: updated.time as Time });
    }
  }, [liveTick, granularity]);

  return (
    <div className="relative w-full rounded-xl border border-[#1D2B40] bg-[#050914] overflow-hidden">
      <div ref={containerRef} className="w-full" style={{ height }} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050914]/80 text-xs text-[#8492A6]">
          Loading live Deriv market candles for {symbol}...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050914]/90 px-4 text-center text-xs text-[#FF1744]">
          {error}
        </div>
      )}
    </div>
  );
};
