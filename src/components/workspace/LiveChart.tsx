import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { NormalizedMarketTick } from '../../types/market';
import { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { buildChartAnalytics, ChartAnalytics } from '../../services/marketData/levelEngine';

const intervals: Record<string, string> = {
  '1m': '1minute', '3m': '3minute', '5m': '5minute', '15m': '15minute', '30m': '30minute', '1H': '60minute', '1D': 'day'
};

type Props = {
  instrumentKey: string;
  tick?: NormalizedMarketTick;
  onAnalytics?: (analytics: ChartAnalytics) => void;
};

function buildVWAPSeries(candles: HistoricalCandle[]) {
  const sessions = new Map<string, { pv: number; volume: number }>();
  return candles.map(c => {
    const key = new Date(c.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const bucket = sessions.get(key) || { pv: 0, volume: 0 };
    const vol = Math.max(0, Number(c.volume || 0));
    bucket.pv += ((c.high + c.low + c.close) / 3) * vol;
    bucket.volume += vol;
    sessions.set(key, bucket);
    return { time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time, value: bucket.volume > 0 ? bucket.pv / bucket.volume : c.close };
  });
}

export function LiveChart({ instrumentKey, tick, onAnalytics }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const candleRef = useRef<ISeriesApi<'Candlestick'>>();
  const lineRef = useRef<ISeriesApi<'Line'>>();
  const volumeRef = useRef<ISeriesApi<'Histogram'>>();
  const liveBar = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number }>();
  const candlesData = useRef<HistoricalCandle[]>([]);
  const [timeframe, setTimeframe] = useState('5m');
  const [showLevels, setShowLevels] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [error, setError] = useState<string>();

  const levelLines = useRef<Array<{ remove: () => void }>>([]);
  const analyticsRef = useRef<ChartAnalytics | null>(null);

  const clearLevelLines = () => {
    levelLines.current.forEach(x => x.remove());
    levelLines.current = [];
  };

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    setError(undefined);
    clearLevelLines();
    const instance = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0c0e15' }, textColor: '#8c93a6', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: '#171b27' }, horzLines: { color: '#171b27' } },
      crosshair: { mode: 0, vertLine: { color: '#3b4357', width: 1, style: 2, labelBackgroundColor: '#1a2030' }, horzLine: { color: '#3b4357', width: 1, style: 2, labelBackgroundColor: '#1a2030' } },
      rightPriceScale: { borderColor: '#252b3a', scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { borderColor: '#252b3a', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8, minBarSpacing: 3 },
      watermark: { visible: true, fontSize: 28, horzAlign: 'center', vertAlign: 'center', color: '#ffffff0a', text: 'TRADINGCORE' },
    });
    chartRef.current = instance;

    const candles = instance.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceLineVisible: true, lastValueVisible: true,
    });
    const line = instance.addSeries(LineSeries, { color: '#c084fc', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const volume = instance.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    candleRef.current = candles;
    lineRef.current = line;
    volumeRef.current = volume;

    tradingCoreRuntime.getHistoricalData(instrumentKey, intervals[timeframe]).then((data: HistoricalCandle[]) => {
      if (disposed || !data?.length) throw new Error('No historical candles available');
      const normalized = data
        .map(c => ({ ...c, time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time }))
        .sort((a, b) => Number(a.time) - Number(b.time));
      candles.setData(normalized.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
      candlesData.current = data.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      line.setData(buildVWAPSeries(candlesData.current));
      line.applyOptions({ visible: showVWAP });
      volume.setData(normalized.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? '#10b98155' : '#ef444455' })));
      const latest = normalized[normalized.length - 1];
      liveBar.current = { time: Number(latest.time), open: latest.open, high: latest.high, low: latest.low, close: latest.close, volume: latest.volume || 0 };
      const analytics = buildChartAnalytics(data, tick?.ltp || latest.close);
      analyticsRef.current = analytics;
      emitAnalytics(analytics);
      instance.timeScale().fitContent();
    }).catch((reason: any) => {
      if (!disposed) setError(reason?.message || 'Historical candles unavailable');
    });

    const resize = () => instance.applyOptions({ width: host.current?.clientWidth || 0 });
    window.addEventListener('resize', resize);
    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      clearLevelLines();
      instance.remove();
      chartRef.current = undefined;
      candleRef.current = undefined;
      lineRef.current = undefined;
      volumeRef.current = undefined;
      liveBar.current = undefined;
    };
  }, [instrumentKey, timeframe]);

  useEffect(() => {
    if (!tick?.ltp || !candleRef.current || !lineRef.current) return;
    const price = Number(tick.ltp);
    const intervalSeconds: Record<string, number> = {
      '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '1D': 86400,
    };
    const seconds = intervalSeconds[timeframe] || 300;
    const ts = Math.floor((new Date(tick.lastTradeTimestamp || tick.receivedAt).getTime() || Date.now()) / 1000);
    const bucket = Math.floor(ts / seconds) * seconds;
    const prior = liveBar.current;
    if (!prior || prior.time !== bucket) {
      liveBar.current = { time: bucket, open: prior?.close ?? price, high: Math.max(prior?.close ?? price, price), low: Math.min(prior?.close ?? price, price), close: price, volume: tick.volume || 0 };
    } else {
      prior.close = price;
      prior.high = Math.max(prior.high, price);
      prior.low = Math.min(prior.low, price);
      if (tick.volume) prior.volume = tick.volume;
    }
    const b = liveBar.current;
    candleRef.current.update({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close });
    const existing = candlesData.current.find(c => Math.floor(new Date(c.timestamp).getTime() / 1000) === b.time);
    if (existing) { existing.high = b.high; existing.low = b.low; existing.close = b.close; existing.volume = b.volume; }
    else candlesData.current.push({ timestamp: new Date(b.time * 1000).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    lineRef.current.setData(buildVWAPSeries(candlesData.current));
    if (volumeRef.current) volumeRef.current.update({ time: b.time as Time, value: b.volume, color: b.close >= b.open ? '#10b98155' : '#ef444455' });
    const updatedAnalytics = buildChartAnalytics(candlesData.current, price);
    analyticsRef.current = updatedAnalytics;
    emitAnalytics(updatedAnalytics);
  }, [tick, timeframe]);

  const toolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[#222636] pb-2 mb-2">
      <span className="text-[9px] uppercase tracking-widest text-[#64748b] mr-1">Chart</span>
      {Object.keys(intervals).map(value => (
        <button key={value} onClick={() => setTimeframe(value)} className={`px-2 py-1 rounded border text-[10px] font-mono ${timeframe === value ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]' : 'border-[#222636] text-[#8c93a6] hover:text-white'}`}>{value}</button>
      ))}
      <span className="mx-1 h-4 w-px bg-[#222636]" />
      <button onClick={() => setShowLevels(v => !v)} className={`px-2 py-1 rounded border text-[10px] ${showLevels ? 'border-[#10b981]/50 text-[#10b981]' : 'border-[#222636] text-[#64748b]'}`}>Levels</button>
      <button onClick={() => setShowVWAP(v => !v)} className={`px-2 py-1 rounded border text-[10px] ${showVWAP ? 'border-[#a855f7]/50 text-[#c084fc]' : 'border-[#222636] text-[#64748b]'}`}>VWAP</button>
      <button onClick={() => setShowVolume(v => !v)} className={`px-2 py-1 rounded border text-[10px] ${showVolume ? 'border-[#3b82f6]/50 text-[#93c5fd]' : 'border-[#222636] text-[#64748b]'}`}>Volume</button>
    </div>
  ), [timeframe, showLevels, showVWAP, showVolume]);

  // Level price lines are rebuilt when the analytics or visibility toggles change.
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series || !onAnalytics) return;
    // analytics are stored by the parent; line rendering is intentionally done there via
    // a compact callback-independent pass below in the chart's local custom event.
  }, [showLevels, showVWAP]);

  useEffect(() => {
    if (volumeRef.current) volumeRef.current.applyOptions({ visible: showVolume });
    if (lineRef.current) lineRef.current.applyOptions({ visible: showVWAP });
    const current = analyticsRef.current;
    if (current) window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics', { detail: current }));
  }, [showVolume, showLevels, showVWAP]);

  // We use a small event bridge so analytics stay in the parent without keeping a second
  // copy of the candle dataset in React state.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ChartAnalytics>).detail;
      const series = candleRef.current;
      if (!series) return;
      clearLevelLines();
      if (showLevels) {
        [...detail.support.slice(0, 3), ...detail.resistance.slice(0, 3)].forEach(level => {
          const color = level.state === 'BROKEN' ? '#64748b' : level.side === 'support' ? '#22c55e' : '#ef4444';
          const line = series.createPriceLine({ price: level.price, color, lineWidth: level.state === 'BROKEN' ? 1 : 2, lineStyle: level.state === 'BROKEN' ? 1 : 0, axisLabelVisible: true, title: `${level.side === 'support' ? 'S' : 'R'} ${level.price.toFixed(2)}` });
          levelLines.current.push({ remove: () => series.removePriceLine(line) });
        });
      }
      if (showVWAP && detail.vwap > 0) {
        const line = series.createPriceLine({ price: detail.vwap, color: '#c084fc', lineWidth: 1, axisLabelVisible: true, title: 'VWAP' });
        levelLines.current.push({ remove: () => series.removePriceLine(line) });
      }
    };
    window.addEventListener('tradingcore:chart-analytics', handler);
    return () => window.removeEventListener('tradingcore:chart-analytics', handler);
  }, [showLevels, showVWAP]);

  // Recalculate a compact browser-level analytics snapshot when the parent supplies one.
  const emitAnalytics = (analytics: ChartAnalytics) => {
    window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics', { detail: analytics }));
    onAnalytics?.(analytics);
  };

  // Patch the initial loader callback's event publication by observing the callback wrapper.
  // The callback below is intentionally stable and also feeds the side panels.
  useEffect(() => {
    // no-op; the historical loader calls onAnalytics directly.
  }, []);

  return <div className="flex-1 min-h-0 flex flex-col">
    {toolbar}
    <div className="flex items-center justify-between px-1 pb-2 text-[10px] font-mono">
      <span className="text-[#64748b]">Lightweight Charts · broker candles</span>
      <span className="text-[#10b981]">● LIVE TICK</span>
    </div>
    {error ? <div className="flex-1 min-h-[360px] flex items-center justify-center rounded-xl border border-[#ef4444]/20 bg-[#0c0e15] text-xs text-[#ef4444]">{error}</div> : <div ref={host} className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-[#222636]" />}
  </div>;
}
