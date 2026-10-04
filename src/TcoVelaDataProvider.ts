import type { DataProvider, ProviderInfo, SymbolDescriptor, BarRange, OHLCV } from './services/core/chart/velaChartFacade';
import { getChartDataPlane, CHART_TIMEFRAME_INTERVALS } from './services/marketData/chartDataPlane';
import type { CanonicalMarketView } from './services/core/data/canonicalDataPlane';
import type { ColumnarBars, ColumnarBarUpdate } from './services/core/chart/velaChartFacade';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

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

function epoch(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

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

function timeframeMs(timeframe: string): number {
  const match = String(timeframe).trim().match(/^(\d+)([smhdw]?)$/i);
  if (!match) return 5 * 60_000;
  const n = Math.max(1, Number(match[1]));
  switch (String(match[2]).toLowerCase()) {
    case 's': return n * 1000;
    case 'h': return n * 60 * 60_000;
    case 'd': return n * 24 * 60 * 60_000;
    case 'w': return n * 7 * 24 * 60 * 60_000;
    default: return n * 60_000;
  }
}

export class TcoVelaDataProvider implements DataProvider {
  info(): ProviderInfo {
    return {
      name: 'tco',
      displayName: 'TradingCoreOS',
      supportedTimeframes: ['1', '3', '5', '10', '15'],
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
    const plane = getChartDataPlane('fyers', symbol, tcoTimeframe);
    await plane.ensureReadyColumns(requested);
    const requestedTo = range.to == null ? null : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
    const current = plane.readCanonical();
    const newestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
    if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(newestMs) && requestedTo < newestMs - 1) {
      await plane.loadOlderHistory('visible', { visibleBars: requested });
    }
    return marketViewToColumns(plane.readCanonical(), range, requested);
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
    const plane = getChartDataPlane('fyers', symbol, tcoTimeframe);
    await plane.ensureReady(5000);
    const requestedTo = range.to == null ? null : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
    const current = plane.readCanonical();
    const newestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
    if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(newestMs) && requestedTo < newestMs - 1) {
      await plane.loadOlderHistory('visible', { visibleBars: requested });
    }
    return marketViewToBars(plane.readCanonical(), range, requested);
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(100, Math.min(5000, Math.floor(Number(range.limit) || 750)));
    const plane = getChartDataPlane('fyers', symbol, tcoTimeframe);
    let lastError: unknown = null;
    try {
      await plane.ensureReady(requested);
      const requestedTo = range.to == null ? null : (Number(range.to) > 2e12 ? Number(range.to) : Number(range.to) * 1000);
      const current = plane.readCanonical();
      const currentNewestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
      if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(currentNewestMs) && requestedTo < currentNewestMs - 1) {
        await plane.loadOlderHistory('visible');
      }
      return marketViewToBars(plane.readCanonical(), range, requested);
    } catch (error) {
      lastError = error;
    }

    // Compatibility fallback is deliberately outside the canonical path. It is only
    // used when the shared plane could not initialize, and the next websocket update
    // still enters through the canonical TCO data plane.
    try {
      const quote = await tradingCoreRuntime.getMarketQuotes([symbol]);
      const row = quote[symbol];
      if (row && Number.isFinite(Number(row.ltp)) && Number(row.ltp) > 0) {
        const now = Date.now();
        const interval = timeframeMs(tcoTimeframe);
        return [{ time: Math.floor(now / interval) * interval, open: Number(row.ltp), high: Number(row.ltp), low: Number(row.ltp), close: Number(row.ltp), volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined }];
      }
    } catch {
      // Preserve the original canonical-history error at the Vela fault boundary.
    }
    if (lastError) throw lastError;
    return [];
  }

  async getBarsProgressive(ticker: string, timeframe: string, range: BarRange, onBatch: (bars: OHLCV[]) => void, opts?: { signal?: AbortSignal }): Promise<OHLCV[]> {
    if (opts?.signal?.aborted) return [];
    const bars = await this.getBars(ticker, timeframe, range);
    if (!opts?.signal?.aborted && bars.length) onBatch(bars);
    return bars;
  }

  getSymbolInfo(ticker: string) {
    const symbol = runtimeSymbol(ticker);
    return Promise.resolve({ ticker: symbol, exchange: symbol.startsWith('BSE:') ? 'BSE' : 'NSE', type: 'index' });
  }

  subscribeColumns(ticker: string, timeframe: string, onBar: (bar: ColumnarBarUpdate) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const plane = getChartDataPlane('fyers', symbol, tcoTimeframe);
    let fingerprint = '';
    const stop = plane.subscribe((event) => {
      if (event.type !== 'snapshot' && event.type !== 'tick') return;
      const view = plane.readCanonical();
      if (!view.length) return;
      const i = view.length - 1;
      const time = view.time[i]!;
      const open = view.open[i]!, high = view.high[i]!, low = view.low[i]!, close = view.close[i]!;
      const volume = Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined;
      const nextKey = `${time}|${open}|${high}|${low}|${close}|${volume ?? ''}`;
      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      onBar({ time, open, high, low, close, volume, timeUnit: 'seconds' });
    });
    return stop;
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: OHLCV) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const plane = getChartDataPlane('fyers', symbol, tcoTimeframe);
    let fingerprint = '';
    const stop = plane.subscribe((event) => {
      if (event.type !== 'snapshot' && event.type !== 'tick') return;
      const view = plane.readCanonical();
      if (!view.length) return;
      const i = view.length - 1;
      const next: OHLCV = { time: view.time[i]! * 1000, open: view.open[i]!, high: view.high[i]!, low: view.low[i]!, close: view.close[i]!, volume: Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined };
      const nextKey = `${next.time}|${next.open}|${next.high}|${next.low}|${next.close}|${next.volume ?? ''}`;
      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      onBar(next);
    });

    return stop;
  }
}

export function createTcoVelaDataProvider(): TcoVelaDataProvider {
  return new TcoVelaDataProvider();
}
