import type { DataProvider, ProviderInfo, SymbolDescriptor } from '../vendor/vela/src/core/ports/DataProvider';
import type { BarRange } from '../vendor/vela/src/core/ports/MarketDataFeed';
import type { OHLCV, ColumnarBars, ColumnarBarUpdate } from '../vendor/vela/src/core/model/ohlcv';
import { getChartDataPlane, CHART_TIMEFRAME_INTERVALS } from './services/marketData/chartDataPlane';
import type { CanonicalMarketView } from './services/core/data/canonicalDataPlane';
import type { HistoricalCandle } from './services/marketData/chartDataPlane';
import { marketLatencyTrace } from './services/core/performance/marketLatencyTrace';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import { createProgressiveHistoryEmitter } from './services/core/chart/velaProgressiveHistory';

const SYMBOLS: readonly SymbolDescriptor[] = [
  { ticker: 'NIFTY50-INDEX', prefix: 'NSE', description: 'NIFTY 50', type: 'index' },
  { ticker: 'NIFTYBANK-INDEX', prefix: 'NSE', description: 'NIFTY BANK', type: 'index' },
  { ticker: 'FINNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Financial Services', type: 'index' },
  { ticker: 'MIDCPNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Midcap Select', type: 'index' },
  { ticker: 'SENSEX-INDEX', prefix: 'BSE', description: 'S&P BSE SENSEX', type: 'index' },
];

function runtimeSymbol(ticker: string): string {
  const value = String(ticker || '').trim();
  if (!value) return 'NSE:NIFTY50-INDEX';
  return value.includes(':') ? value : `NSE:${value}`;
}

function runtimeTimeframe(timeframe: string): string {
  const value = String(timeframe || '5').trim();
  if (/^\d+$/.test(value)) return `${value}m`;
  if (CHART_TIMEFRAME_INTERVALS[value]) return value;
  if (/^\d+[mhd]$/i.test(value)) return value.toLowerCase();
  return '5m';
}

async function activeBrokerId(): Promise<string> {
  const existing = tradingCoreRuntime.getPrimaryBrokerId();
  if (existing) return existing;
  try { await tradingCoreRuntime.restoreBrokerConnections(); } catch {}
  const restored = tradingCoreRuntime.getPrimaryBrokerId();
  if (!restored) throw new Error('No connected broker is available for Vela market data.');
  return restored;
}

function historicalToVelaBars(bars: readonly HistoricalCandle[]): OHLCV[] {
  return bars.map((bar) => ({
    time: epoch(bar.timestamp),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number.isFinite(Number(bar.volume)) ? Number(bar.volume) : undefined,
  }));
}

function seedColumnsFromBars(bars: readonly OHLCV[]): ColumnarBars {
  const normalized = bars.map((bar) => ({
    time: epoch((bar as any).time),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume) || 0,
  })).filter((bar) => Number.isFinite(bar.time) && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite));
  return {
    time: Float64Array.from(normalized, (bar) => bar.time),
    open: Float64Array.from(normalized, (bar) => bar.open),
    high: Float64Array.from(normalized, (bar) => bar.high),
    low: Float64Array.from(normalized, (bar) => bar.low),
    close: Float64Array.from(normalized, (bar) => bar.close),
    volume: Float64Array.from(normalized, (bar) => bar.volume),
    length: normalized.length,
    timeUnit: 'milliseconds',
  };
}

function epoch(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}


const EMPTY_COLUMNAR_BARS: ColumnarBars = {
  time: new Float64Array(0),
  open: new Float64Array(0),
  high: new Float64Array(0),
  low: new Float64Array(0),
  close: new Float64Array(0),
  volume: new Float64Array(0),
  length: 0,
  timeUnit: 'milliseconds',
};

function marketViewToBars(view: CanonicalMarketView, range: BarRange, limit: number): OHLCV[] {
  const from = range.from == null ? Number.NEGATIVE_INFINITY : Number(range.from);
  const to = range.to == null ? Number.POSITIVE_INFINITY : Number(range.to);
  const start = Math.max(0, Number.isFinite(from) ? lowerBound(view.time, from > 2e12 ? from / 1000 : from) : 0);
  const end = Number.isFinite(to) ? Math.min(view.length, upperBound(view.time, to > 2e12 ? to / 1000 : to)) : view.length;
  const first = Math.max(start, end - limit);
  const bars = new Array<OHLCV>(Math.max(0, end - first));
  let out = 0;
  for (let i = first; i < end; i += 1) {
    bars[out++] = {
      time: view.time[i]! * 1000,
      open: view.open[i]!,
      high: view.high[i]!,
      low: view.low[i]!,
      close: view.close[i]!,
      volume: Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined,
    };
  }
  return bars;
}


function marketViewToColumns(view: CanonicalMarketView, range: BarRange, limit: number): ColumnarBars {
  const from = range.from == null ? Number.NEGATIVE_INFINITY : Number(range.from);
  const to = range.to == null ? Number.POSITIVE_INFINITY : Number(range.to);
  const start = Math.max(0, Number.isFinite(from) ? lowerBound(view.time, from > 2e12 ? from / 1000 : from) : 0);
  const end = Number.isFinite(to) ? Math.min(view.length, upperBound(view.time, to > 2e12 ? to / 1000 : to)) : view.length;
  const first = Math.max(start, end - limit);
  return {
    time: view.time.subarray(first, end),
    open: view.open.subarray(first, end),
    high: view.high.subarray(first, end),
    low: view.low.subarray(first, end),
    close: view.close.subarray(first, end),
    volume: view.volume.subarray(first, end),
    length: Math.max(0, end - first),
    timeUnit: 'seconds',
  };
}

function lowerBound(values: Float64Array, target: number): number {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid]! < target) lo = mid + 1; else hi = mid; }
  return lo;
}

function upperBound(values: Float64Array, target: number): number {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid]! <= target) lo = mid + 1; else hi = mid; }
  return lo;
}

function activeBrokerIdSync(): string | null {
  return tradingCoreRuntime.getPrimaryBrokerId();
}

export class TcoVelaDataProvider implements DataProvider {
  info(): ProviderInfo {
    return {
      name: 'tco',
      displayName: 'TradingCoreOS',
      supportedTimeframes: ['1', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
      capabilities: { enumerate: true, stream: true, symbolInfo: true },
    };
  }

  listSymbols(): Promise<SymbolDescriptor[]> {
    return Promise.resolve(SYMBOLS.map(symbol => ({ ...symbol })));
  }

  async getBarsColumns(ticker: string, timeframe: string, range: BarRange): Promise<ColumnarBars> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(100, Math.min(5000, Math.floor(Number(range.limit) || 5000)));
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);

    // HOT path: a recently viewed symbol already lives in the shared canonical plane.
    // Return its typed arrays immediately — no REST, no object materialization.
    const cached = plane.readCanonical();
    if (cached.length > 0 && plane.getSnapshot().historyReady) {
      const requestedTo = range.to == null
        ? null
        : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
      const newestMs = cached.time[cached.length - 1]! * 1000;
      if (requestedTo == null || requestedTo >= newestMs - 1) {
        return marketViewToColumns(cached, range, requested);
      }
    }

    // COLD path: deliberately return an empty column set so Vela moves immediately to
    // getBarsProgressive(). That path paints the first real history page before older
    // history is fetched. A 5k REST request must never become the first-frame bottleneck.
    return EMPTY_COLUMNAR_BARS;
  }

  /**
   * Progressive TCO history: first paint is a small real window from the shared history
   * plane; older pages stream in behind it. Abort promptly when Vela switches symbols.
   */
  async getBarsProgressive(
    ticker: string,
    timeframe: string,
    range: BarRange,
    onBatch: (bars: OHLCV[]) => void,
    opts?: { signal?: AbortSignal },
  ): Promise<OHLCV[]> {
    if (opts?.signal?.aborted) return [];
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    const requested = Math.max(100, Math.min(5000, Math.floor(Number(range.limit) || 5000)));
    const firstPaintBars = Math.min(requested, 300);

    const abort = () => Boolean(opts?.signal?.aborted);
    if (abort()) return [];

    // P0: Vela's progressive provider contract requires cumulative canonical history snapshots.
    // An LTP quote is live data, not history, and must never be emitted here.
    const history = await plane.ensureReadyHistory(firstPaintBars).then(historicalToVelaBars).catch(() => []);
    if (abort()) return history;
    const emitProgressive = createProgressiveHistoryEmitter(onBatch);
    if (history.length) emitProgressive(history.slice(-requested));
    let currentLength = history.length;
    while (!abort() && currentLength > 0 && currentLength < requested) {
      const beforeLength = currentLength;
      const older = historicalToVelaBars(await plane.loadOlderHistory('warm', { visibleBars: Math.min(1200, requested - currentLength) }));
      if (abort()) return older;
      currentLength = older.length;
      if (currentLength <= beforeLength) break;
      emitProgressive(older.slice(-requested));
    }

    return !abort() ? (plane.readCanonical().length ? marketViewToBars(plane.readCanonical(), range, requested) : history) : history;
  }

  /**
   * Explicit ranged-history seam used by Vela's 5k backward paging. Keeping this
   * method on the TCO provider guarantees that deep scrolls go through the shared
   * ChartDataPlane/Fyers cache instead of opening a second broker-history path.
   */
  async loadRange(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(2, Math.min(5000, Math.floor(Number(range.limit) || 5000)));
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    await plane.ensureReadyHistory(5000);
    const requestedTo = range.to == null ? null : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
    const current = plane.readCanonical();
    const newestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
    if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(newestMs) && requestedTo < newestMs - 1) {
      await plane.loadOlderHistory('visible', { visibleBars: requested });
    }
    const loaded = plane.readCanonical();
    if (loaded.length) return marketViewToBars(loaded, range, requested);
    // A zero-row canonical plane is not a successful Vela history response.
    throw new Error(`No canonical FYERS history available for ${symbol} ${tcoTimeframe}.`);
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(100, Math.min(5000, Math.floor(Number(range.limit) || 750)));
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    let lastError: unknown = null;
    try {
      await plane.ensureReadyHistory(requested);
      const requestedTo = range.to == null ? null : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
      const current = plane.readCanonical();
      const currentNewestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
      if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(currentNewestMs) && requestedTo < currentNewestMs - 1) {
        await plane.loadOlderHistory('visible');
      }
      const canonical = plane.readCanonical();
      if (canonical.length) return marketViewToBars(canonical, range, requested);
      lastError = new Error('Vela canonical market-data plane returned no history bars.');
    } catch (error) {
      lastError = error;
    }

    // FYERS Quotes is realtime data. Do not convert an LTP into a Vela history bar.
    if (lastError) throw lastError;
    throw new Error(`No canonical FYERS history available for ${symbol} ${tcoTimeframe}.`);
  }

  getSymbolInfo(ticker: string) {
    const symbol = runtimeSymbol(ticker);
    return Promise.resolve({ ticker: symbol, exchange: symbol.startsWith('BSE:') ? 'BSE' : 'NSE', type: 'index' });
  }

  subscribeColumns(ticker: string, timeframe: string, onBar: (bar: ColumnarBarUpdate) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const brokerId = activeBrokerIdSync();
    if (!brokerId) return () => {};
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    let fingerprint = '';
    let pendingSequence = 0;
    const timelineKey = `${symbol}|${tcoTimeframe}`;
    let scheduled = false;
    let dirty = false;
    let raf = 0;

    const flush = () => {
      scheduled = false;
      if (!dirty) return;
      dirty = false;
      const view = marketLatencyTrace.measure(timelineKey, pendingSequence, 'canonical', () => plane.readCanonical());
      if (!view.length) return;
      const i = view.length - 1;
      const time = view.time[i]!;
      const open = view.open[i]!, high = view.high[i]!, low = view.low[i]!, close = view.close[i]!;
      const volume = Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined;
      const sequence = plane.canonicalDataPlane().revision;
      const nextKey = `${time}|${open}|${high}|${low}|${close}|${volume ?? ''}`;
      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      const bar: ColumnarBarUpdate = { time, open, high, low, close, volume, timeUnit: 'seconds', sequence, timelineKey };
      onBar(bar);
    };

    const schedule = () => {
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      raf = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(flush)
        : Number(setTimeout(flush, 16));
    };

    const stop = plane.subscribe((event) => {
      if (event.type !== 'snapshot' && event.type !== 'tick') return;
      pendingSequence = event.snapshot.revision;
      schedule();
    });

    return () => {
      stop();
      dirty = false;
      if (raf) {
        if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      scheduled = false;
    };
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: OHLCV) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const brokerId = activeBrokerIdSync();
    if (!brokerId) return () => {};
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    let fingerprint = '';
    let scheduled = false;
    let dirty = false;
    let raf = 0;

    const flush = () => {
      scheduled = false;
      if (!dirty) return;
      dirty = false;
      const view = plane.readCanonical();
      if (!view.length) return;
      const i = view.length - 1;
      const next: OHLCV = {
        time: view.time[i]! * 1000,
        open: view.open[i]!,
        high: view.high[i]!,
        low: view.low[i]!,
        close: view.close[i]!,
        volume: Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined,
      };
      const nextKey = `${next.time}|${next.open}|${next.high}|${next.low}|${next.close}|${next.volume ?? ''}`;
      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      onBar(next);
    };

    const schedule = () => {
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      raf = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(flush)
        : Number(setTimeout(flush, 16));
    };

    const stop = plane.subscribe((event) => {
      if (event.type !== 'snapshot' && event.type !== 'tick') return;
      schedule();
    });

    return () => {
      stop();
      dirty = false;
      if (raf) {
        if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      scheduled = false;
    };
  }}

export function createTcoVelaDataProvider(): TcoVelaDataProvider {
  return new TcoVelaDataProvider();
}


/** Prewarm the common index set without blocking chart construction or first paint. */
export function prewarmTcoVelaHistory(
  symbols: readonly string[],
  timeframe = '5m',
  limit = 1200,
): void {
  const unique = [...new Set(symbols.map(value => String(value).trim()).filter(Boolean))].slice(0, 8);
  if (!unique.length) return;

  const run = () => {
    const brokerId = tradingCoreRuntime.getPrimaryBrokerId();
    if (!brokerId) return;
    const requested = Math.max(200, Math.min(2000, Math.floor(Number(limit) || 1200)));
    for (const raw of unique) {
      const plane = getChartDataPlane(brokerId, runtimeSymbol(raw), runtimeTimeframe(timeframe));
      void plane.ensureReadyHistory(requested).catch(() => {});
    }
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: 1500 });
  } else {
    globalThis.setTimeout(run, 150);
  }
}
