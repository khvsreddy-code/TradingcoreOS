import { useEffect, useRef, useState } from 'react';
import type { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import type { NormalizedMarketTick } from '../../types/market';

type Props = {
  instrumentKey: string;
  brokerId?: string;
  tick?: NormalizedMarketTick;
  chartIndex?: number;
  onUnavailable?: () => void;
};

type TVWidget = any;

type TVDatafeed = {
  onReady: (cb: (config: any) => void) => void;
  searchSymbols: (userInput: string, exchange: string, symbolType: string, onResult: (symbols: any[]) => void) => void;
  resolveSymbol: (symbolName: string, onResolve: (symbolInfo: any) => void, onError: (reason: string) => void) => void;
  getBars: (symbolInfo: any, resolution: string, periodParams: any, onHistory: (bars: any[], meta: any) => void, onError: (reason: string) => void) => void;
  subscribeBars: (symbolInfo: any, resolution: string, onRealtime: (bar: any) => void, subscriberUID: string, onResetCacheNeeded: () => void) => void;
  unsubscribeBars: (subscriberUID: string) => void;
};

const resolutionMap: Record<string, string> = {
  '1': '1minute', '3': '3minute', '5': '5minute', '15': '15minute', '30': '30minute',
  '60': '60minute', '120': '120minute', '240': '240minute', '1D': 'day', '1W': 'week', '1M': 'month',
};

const canonical = (key: string) => String(key || '').trim();
const epoch = (value: string | number) => {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Math.floor(ms / 1000);
};

const normalize = (rows: HistoricalCandle[]) => {
  const byTime = new Map<number, any>();
  for (const row of rows || []) {
    const t = epoch(row.timestamp);
    const open = Number(row.open), high = Number(row.high), low = Number(row.low), close = Number(row.close), volume = Number(row.volume) || 0;
    if (!Number.isFinite(t) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    byTime.set(t, { time: t * 1000, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
};

function makeDatafeed(brokerId: string, instrumentKey: string, tickRef: { current?: NormalizedMarketTick }): TVDatafeed {
  const subscribers = new Map<string, { resolution: string; callback: (bar: any) => void; last?: any }>();
  return {
    onReady: (cb) => setTimeout(() => cb({
      supported_resolutions: Object.keys(resolutionMap),
      supports_search: true,
      supports_group_request: false,
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    }), 0),
    searchSymbols: (userInput, _exchange, _symbolType, cb) => cb([{ symbol: userInput || instrumentKey, full_name: userInput || instrumentKey, description: userInput || instrumentKey, exchange: brokerId.toUpperCase(), ticker: userInput || instrumentKey, type: 'stock' }]),
    resolveSymbol: (symbolName, onResolve) => setTimeout(() => onResolve({
      ticker: symbolName,
      name: symbolName,
      description: symbolName,
      type: 'stock',
      session: '24x7',
      timezone: 'Asia/Kolkata',
      exchange: brokerId.toUpperCase(),
      minmov: 1,
      pricescale: 100,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: Object.keys(resolutionMap),
      volume_precision: 2,
      data_status: 'streaming',
    }), 0),
    getBars: async (_symbolInfo, resolution, periodParams, onHistory, onError) => {
      try {
        const interval = resolutionMap[resolution] || '5minute';
        const data = await tradingCoreRuntime.getHistoricalData(canonical(instrumentKey), interval);
        const bars = normalize(data);
        const from = Number(periodParams?.from || 0) * 1000;
        const to = Number(periodParams?.to || Number.MAX_SAFE_INTEGER) * 1000;
        const filtered = bars.filter((b) => b.time >= from && b.time <= to);
        onHistory(filtered, { noData: filtered.length === 0 });
      } catch (e: any) {
        onError(e?.message || 'TradingCore history unavailable');
      }
    },
    subscribeBars: (_symbolInfo, resolution, callback, subscriberUID) => {
      subscribers.set(subscriberUID, { resolution, callback });
      const id = window.setInterval(() => {
        const sub = subscribers.get(subscriberUID);
        const ltp = Number(tickRef.current?.ltp);
        if (!sub || !Number.isFinite(ltp)) return;
        const intervalSeconds = Math.max(60, Number.parseInt(resolution, 10) * 60 || (resolution === '1D' ? 86400 : 300));
        const now = Math.floor(Date.now() / 1000);
        const bucket = Math.floor(now / intervalSeconds) * intervalSeconds;
        const last = sub.last;
        const next = last && last.time === bucket * 1000
          ? { ...last, high: Math.max(last.high, ltp), low: Math.min(last.low, ltp), close: ltp }
          : { time: bucket * 1000, open: last?.close ?? ltp, high: ltp, low: ltp, close: ltp, volume: 0 };
        sub.last = next;
        callback(next);
      }, 1000);
      (subscribers.get(subscriberUID) as any).timer = id;
    },
    unsubscribeBars: (subscriberUID) => {
      const sub: any = subscribers.get(subscriberUID);
      if (sub?.timer) window.clearInterval(sub.timer);
      subscribers.delete(subscriberUID);
    },
  };
}

let tradingViewPromise: Promise<any> | null = null;
function loadTradingView(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('TradingView requires a browser'));
  if ((window as any).TradingView) return Promise.resolve((window as any).TradingView);
  if (!tradingViewPromise) {
    tradingViewPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-tradingcore-tradingview]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).TradingView));
        existing.addEventListener('error', () => reject(new Error('TradingView Advanced Charts library failed to load')));
        return;
      }
      const script = document.createElement('script');
      script.src = '/tradingview/charting_library.js';
      script.async = true;
      script.dataset.tradingcoreTradingview = 'true';
      script.onload = () => (window as any).TradingView ? resolve((window as any).TradingView) : reject(new Error('TradingView global was not created'));
      script.onerror = () => reject(new Error('TradingView Advanced Charts library is not installed at /tradingview/charting_library.js'));
      document.head.appendChild(script);
    });
  }
  return tradingViewPromise;
}

export function TradingViewAdvancedChart({ instrumentKey, brokerId = 'unknown', tick, chartIndex, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidget>();
  const tickRef = useRef<NormalizedMarketTick | undefined>(tick);
  const [error, setError] = useState('');
  tickRef.current = tick;

  useEffect(() => {
    let disposed = false;
    const resolved = canonical(instrumentKey);
    const datafeed = makeDatafeed(brokerId, resolved, tickRef);
    loadTradingView().then((TradingView) => {
      if (disposed || !hostRef.current) return;
      const widget = new TradingView.widget({
        autosize: true,
        symbol: resolved,
        interval: '5',
        container: hostRef.current,
        library_path: '/tradingview/',
        datafeed,
        locale: 'en',
        timezone: 'Asia/Kolkata',
        theme: 'dark',
        client_id: 'tradingcoreos',
        user_id: 'tradingcoreos-user',
        fullscreen: false,
        disabled_features: ['header_compare', 'header_symbol_search', 'header_saveload', 'header_undo_redo'],
        enabled_features: ['side_toolbar_in_fullscreen_mode'],
        hide_side_toolbar: false,
        allow_symbol_change: false,
        save_image: false,
        details: false,
        hotlist: false,
        calendar: false,
        studies_overrides: {},
        overrides: {
          'paneProperties.background': '#090c12',
          'paneProperties.backgroundType': 'solid',
          'scalesProperties.textColor': '#94a3b8',
          'scalesProperties.lineColor': '#252b38',
          'mainSeriesProperties.candleStyle.upColor': '#10b981',
          'mainSeriesProperties.candleStyle.downColor': '#ef4444',
          'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
          'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        },
      });
      widgetRef.current = widget;
      widget.onChartReady?.(() => {
        if (disposed) return;
        try {
          widget.activeChart().setSymbol?.(resolved);
        } catch {}
      });
    }).catch((e) => {
      if (!disposed) { setError(e?.message || 'TradingView Advanced Charts unavailable'); onUnavailable?.(); }
    });
    return () => {
      disposed = true;
      try { widgetRef.current?.remove(); } catch {}
      widgetRef.current = undefined;
    };
  }, [instrumentKey, brokerId]);

  useEffect(() => {
    const onTimeframe = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.chartIndex != null && detail.chartIndex !== chartIndex) return;
      const tf = String(detail.timeframe || '5m');
      const resolution = ({ '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1H': '60', '1D': '1D' } as Record<string, string>)[tf];
      if (!resolution) return;
      try { widgetRef.current?.activeChart?.().setResolution(resolution, () => {}); } catch {}
    };
    window.addEventListener('TRADINGCORE_SET_TIMEFRAME', onTimeframe);
    return () => window.removeEventListener('TRADINGCORE_SET_TIMEFRAME', onTimeframe);
  }, [chartIndex]);

  return <div className="relative h-full min-h-[430px] w-full overflow-hidden rounded-xl bg-[#090c12]">
    <div ref={hostRef} className="h-full min-h-[430px] w-full" />
    {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090c12] p-6 text-center text-xs text-[#f59e0b]">
      <div><div className="font-semibold text-white">TradingView Advanced Charts is not installed</div><div className="mt-1 max-w-md text-[#94a3b8]">Run the TradingCoreOS TradingView setup step to populate <code>/public/tradingview</code>. The legacy chart remains available as the fallback.</div></div>
    </div>}
  </div>;
}
