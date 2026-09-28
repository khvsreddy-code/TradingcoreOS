import { useEffect, useRef } from 'react';
import { getCurrentTheme, getThemePalette } from '../../theme/theme';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  Time,
  createChart,
} from 'lightweight-charts';

type Props = {
  basePrice: number;
  timeframe: string;
  showLevels: boolean;
  showForecast: boolean;
};

const STEP_MINUTES: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '1H': 60,
  '1D': 1440,
};

function buildCandles(basePrice: number, timeframe: string) {
  const step = STEP_MINUTES[timeframe] ?? 5;
  const start = Date.UTC(2026, 7, 31, 9, 15) / 1000;
  let price = basePrice - 105;
  let seed = 17;
  const rows: Array<{ time: Time; open: number; high: number; low: number; close: number; volume: number }> = [];

  for (let i = 0; i < 96; i += 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const noise = (seed / 233280 - 0.5) * Math.max(basePrice * 0.0007, 8);
    const drift = Math.max(basePrice * 0.00004, 1.5) + Math.sin(i / 8) * Math.max(basePrice * 0.00008, 2.5);
    const open = price;
    const close = open + drift + noise;
    const high = Math.max(open, close) + Math.max(basePrice * 0.00016, 6) + ((i * 7) % 9);
    const low = Math.min(open, close) - Math.max(basePrice * 0.00014, 5) - ((i * 5) % 8);
    const volume = 900 + ((i * 173) % 4100) + Math.round(Math.abs(noise) * 40);
    rows.push({ time: (start + i * step * 60) as Time, open, high, low, close, volume });
    price = close;
  }
  return rows;
}

export function ShowcaseChart({ basePrice, timeframe, showLevels, showForecast }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | undefined>(undefined);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | undefined>(undefined);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | undefined>(undefined);
  const vwapRef = useRef<ISeriesApi<'Line'> | undefined>(undefined);
  const forecastRef = useRef<ISeriesApi<'Line'> | undefined>(undefined);

  useEffect(() => {
    if (!host.current) return;
    const palette = getThemePalette(getCurrentTheme());
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: palette.surface2 }, textColor: palette.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      crosshair: {
        vertLine: { color: palette.axis, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.surface3 },
        horzLine: { color: palette.axis, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.surface3 },
      },
      rightPriceScale: { borderColor: palette.axis, scaleMargins: { top: 0.08, bottom: 0.23 }, minimumWidth: 74 },
      timeScale: { borderColor: palette.axis, timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7, minBarSpacing: 3 },
      localization: { priceFormatter: (value) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#3b82f6', downColor: '#ef4444', borderUpColor: '#60a5fa', borderDownColor: '#fb7185', wickUpColor: '#60a5fa', wickDownColor: '#fb7185',
      priceLineVisible: true, lastValueVisible: true,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.81, bottom: 0 } });
    const vwap = chart.addSeries(LineSeries, { color: '#c084fc', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'VWAP' });
    const forecast = chart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'Projection' });

    chartRef.current = chart; candleRef.current = candles; volumeRef.current = volume; vwapRef.current = vwap; forecastRef.current = forecast;

    const applyTheme = () => {
      const next = getThemePalette(getCurrentTheme());
      try {
        chart.applyOptions({
          layout: { background: { type: ColorType.Solid, color: next.surface2 }, textColor: next.muted },
          grid: { vertLines: { color: next.grid }, horzLines: { color: next.grid } },
          crosshair: {
            vertLine: { color: next.axis, labelBackgroundColor: next.surface3 },
            horzLine: { color: next.axis, labelBackgroundColor: next.surface3 },
          },
          rightPriceScale: { borderColor: next.axis },
          timeScale: { borderColor: next.axis },
        } as any);
      } catch {}
    };
    window.addEventListener('tradingcore:theme-change', applyTheme);

    const data = buildCandles(basePrice, timeframe);
    candles.setData(data);
    volume.setData(data.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.25)' })));

    let pv = 0; let vol = 0;
    vwap.setData(data.map((c) => {
      const typical = (c.high + c.low + c.close) / 3;
      pv += typical * c.volume; vol += c.volume;
      return { time: c.time, value: pv / vol };
    }));

    const last = data[data.length - 1];
    const futureStep = (STEP_MINUTES[timeframe] ?? 5) * 60;
    forecast.setData([
      { time: last.time, value: last.close },
      { time: (Number(last.time) + futureStep) as Time, value: last.close + 18 },
      { time: (Number(last.time) + futureStep * 2) as Time, value: last.close + 31 },
      { time: (Number(last.time) + futureStep * 3) as Time, value: last.close + 46 },
      { time: (Number(last.time) + futureStep * 4) as Time, value: last.close + 58 },
    ]);

    const lines = [
      candles.createPriceLine({ price: basePrice, color: '#60a5fa', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'ENTRY' }),
      candles.createPriceLine({ price: basePrice + 310, color: '#60a5fa', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TARGET' }),
      candles.createPriceLine({ price: basePrice - 225, color: '#fb7185', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'INVALIDATION' }),
      candles.createPriceLine({ price: pv / vol, color: '#c084fc', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'VWAP' }),
    ];
    if (!showLevels) lines.forEach((line) => candles.removePriceLine(line));
    forecast.applyOptions({ visible: showForecast });
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => chart.timeScale().fitContent());
    observer.observe(host.current);
    return () => { observer.disconnect(); window.removeEventListener('tradingcore:theme-change', applyTheme); chart.remove(); chartRef.current = undefined; candleRef.current = undefined; volumeRef.current = undefined; vwapRef.current = undefined; forecastRef.current = undefined; };
  }, [basePrice, timeframe, showLevels, showForecast]);

  return <div ref={host} className="absolute inset-0" aria-label="Interactive TradingCore chart preview" />;
}
