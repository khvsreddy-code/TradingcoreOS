import type { DataProvider, ProviderInfo, SymbolDescriptor, BarRange, OHLCV, ColumnarBars, ColumnarBarUpdate } from './services/core/chart/velaNativeChartKernel';
import { chartDataPlaneKey, getChartDataPlane, CHART_TIMEFRAME_INTERVALS } from './services/marketData/chartDataPlane';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';
import type { CanonicalMarketView } from './services/core/data/canonicalDataPlane';
import type { HistoricalCandle } from './services/marketData/chartDataPlane';
import { marketLatencyTrace } from './services/core/performance/marketLatencyTrace';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import { tradingApi, readTradingApiJson } from './services/http/tradingApi';

const FALLBACK_SYMBOLS: readonly SymbolDescriptor[] = [
  { ticker: 'NIFTY50-INDEX', prefix: 'NSE', description: 'NIFTY 50', type: 'index' },
  { ticker: 'NIFTYBANK-INDEX', prefix: 'NSE', description: 'NIFTY BANK', type: 'index' },
  { ticker: 'FINNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Financial Services', type: 'index' },
  { ticker: 'MIDCPNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Midcap Select', type: 'index' },
  { ticker: 'SENSEX-INDEX', prefix: 'BSE', description: 'S&P BSE SENSEX', type: 'index' },
];

type FyersMasterName = 'NSE_CM'|'NSE_FO'|'NSE_CD'|'NSE_COM'|'BSE_CM'|'BSE_FO'|'MCX_COM';
type FyersSymbolRecord = Record<string, unknown>;
const FYERS_MASTERS: readonly FyersMasterName[] = ['NSE_CM','NSE_FO','NSE_CD','NSE_COM','BSE_CM','BSE_FO','MCX_COM'];
let symbolCatalog: SymbolDescriptor[] = FALLBACK_SYMBOLS.map((symbol) => ({ ...symbol }));

function textField(row: FyersSymbolRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

function descriptorFromMaster(master: FyersMasterName, row: FyersSymbolRecord, symbolKey = ''): SymbolDescriptor | undefined {
  // The server preserves FYERS's ticker key because master rows often omit a generic symbol field.
  let ticker = textField(row, 'symbol', 'symbol_ticker', 'symTicker', 'fySymbol', 'fysymbol') || symbolKey;
  if (!ticker.includes(':') && symbolKey.includes(':')) ticker = symbolKey;
  if (!ticker || !ticker.includes(':')) return undefined;
  const prefix = ticker.slice(0, ticker.indexOf(':')).toUpperCase();
  if (!/^[A-Z0-9_-]{2,16}$/.test(prefix)) return undefined;
  const providerTicker = ticker.slice(ticker.indexOf(':') + 1);
  if (!providerTicker) return undefined;

  const description = textField(row, 'description', 'symbol_desc', 'symbolDesc', 'display_name', 'name', 'exSymName', 'symDetails');
  const series = textField(row, 'exSeries', 'series').toUpperCase();
  const display = `${providerTicker} ${description}`.toUpperCase();
  const kind = master === 'NSE_COM' || master === 'MCX_COM' ? 'commodity' :
    master === 'NSE_CD' ? 'forex' :
    master.endsWith('_FO') ? 'derivative' :
    /INDEX/.test(display) ? 'index' :
    series === 'ETF' || /\\bETF\\b|BEES/.test(display) ? 'etf' : 'stock';
  return { ticker: providerTicker, prefix, description: description || ticker, type: kind, market: master };
}

function rememberDiscoveredSymbols(discovered: readonly SymbolDescriptor[]): void {
  const byVenueAndTicker = new Map<string, SymbolDescriptor>();
  for (const symbol of symbolCatalog) {
    byVenueAndTicker.set(`${symbol.prefix ?? 'fyers'}:${symbol.ticker.toUpperCase()}`, symbol);
  }
  for (const symbol of discovered) {
    byVenueAndTicker.set(`${symbol.prefix ?? 'fyers'}:${symbol.ticker.toUpperCase()}`, { ...symbol });
  }
  symbolCatalog = [...byVenueAndTicker.values()];
}

function runtimeSymbol(ticker: string): string {
  const value = String(ticker || '').trim();
  if (!value) return 'NSE:NIFTY50-INDEX';
  if (value.includes(':')) return value;
  const discovered = symbolCatalog.find((item) => item.ticker.toUpperCase() === value.toUpperCase());
  return `${discovered?.prefix || 'NSE'}:${value}`;
}

function runtimeTimeframe(timeframe: string): string {
  const value = String(timeframe || '5').trim();
  if (/^\d+$/.test(value)) return `${value}m`;
  if (/^[DWM]$/i.test(value)) return `1${value.toUpperCase()}`;
  if (CHART_TIMEFRAME_INTERVALS[value]) return value;
  if (/^\d+[mhd]$/i.test(value)) return value.toLowerCase();
  return '5m';
}
export function tcoVelaPerformanceKey(brokerId: string, symbol: string, timeframe: string): string {
  return chartDataPlaneKey(brokerId, runtimeSymbol(symbol), runtimeTimeframe(timeframe));
}

function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function recordVelaRenderUpdate(key: string, patchStartedAt: number, lastPacketAt: number, callbackDurationMs: number): void {
  if (!key) return;
  const record = () => {
    const renderedAt = performanceNow();
    const tickToPatchMs = lastPacketAt > 0 ? Math.max(0, patchStartedAt - lastPacketAt) : 0;
    const tickToRenderMs = lastPacketAt > 0 ? Math.max(0, renderedAt - lastPacketAt) : 0;
    chartPerformanceTelemetry.recordRenderUpdate(key, tickToPatchMs, tickToRenderMs, callbackDurationMs);
  };
  // Sample the next frame after Vela accepts the bar update, including a renderer paint opportunity.
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(record);
  else globalThis.setTimeout(record, 16);
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
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
  const start = Math.max(0, Number.isFinite(from) ? lowerBound(view.time, from > 1e11 ? from / 1000 : from) : 0);
  const end = Number.isFinite(to) ? Math.min(view.length, upperBound(view.time, to > 1e11 ? to / 1000 : to)) : view.length;
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
  const start = Math.max(0, Number.isFinite(from) ? lowerBound(view.time, from > 1e11 ? from / 1000 : from) : 0);
  const end = Number.isFinite(to) ? Math.min(view.length, upperBound(view.time, to > 1e11 ? to / 1000 : to)) : view.length;
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

  // Vela's registry builds synchronously useful seed indexes first. Full exchange masters
  // are queried only after a user searches, never during chart initialization.
  async listSymbols(): Promise<SymbolDescriptor[]> {
    return FALLBACK_SYMBOLS.map((symbol) => ({ ...symbol }));
  }

  async searchSymbols(query: string, limit = 100, market = 'All'): Promise<SymbolDescriptor[]> {
    const rawQuery = String(query || '').trim();
    const term = rawQuery.replace(/^[A-Z0-9_-]{2,16}:/i, '').trim();
    if (term.length < 2) return [];

    const mastersByMarket: Record<string, FyersMasterName[]> = {
      All: [...FYERS_MASTERS],
      Stocks: ['NSE_CM', 'BSE_CM'],
      ETFs: ['NSE_CM', 'BSE_CM'],
      Options: ['NSE_FO', 'BSE_FO'],
      Futures: ['NSE_FO', 'BSE_FO'],
      Forex: ['NSE_CD'],
      Commodities: ['NSE_COM', 'MCX_COM'],
      Crypto: [],
    };
    const masters = mastersByMarket[market] ?? [...FYERS_MASTERS];
    if (masters.length === 0) return [];

    const maxResults = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 100;
    const response = await tradingApi(
      `/api/trading/fyers/symbol-master?master=${encodeURIComponent(masters.join(','))}&q=${encodeURIComponent(term)}&limit=${maxResults}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const payload = await readTradingApiJson<{ success?: boolean; data?: FyersSymbolRecord[]; error?: string }>(response);
    if (!response.ok || payload?.success !== true || !Array.isArray(payload.data)) {
      throw new Error(payload?.error || `FYERS symbol search failed (HTTP ${response.status})`);
    }

    const byKey = new Map<string, SymbolDescriptor>();
    for (const row of payload.data) {
      const masterText = textField(row, 'catalogMaster', 'market');
      if (!FYERS_MASTERS.includes(masterText as FyersMasterName)) continue;
      const descriptor = descriptorFromMaster(masterText as FyersMasterName, row, textField(row, 'symbol'));
      if (!descriptor) continue;
      const key = `${descriptor.prefix}:${descriptor.ticker.toUpperCase()}`;
      if (!byKey.has(key)) byKey.set(key, descriptor);
    }
    const discovered = [...byKey.values()];
    rememberDiscoveredSymbols(discovered);
    return discovered;
  }

  async getBarsColumns(ticker: string, timeframe: string, range: BarRange): Promise<ColumnarBars> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(100, Math.min(500, Math.floor(Number(range.limit) || 500)));
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);

    // HOT path: a recently viewed symbol already lives in the shared canonical plane.
    // Return its typed arrays immediately — no REST, no object materialization.
    const cached = plane.readCanonical();
    if (cached.length > 0 && plane.getSnapshot().historyReady) {
      const requestedTo = range.to == null
        ? null
        : (Number(range.to) > 1e11 ? Number(range.to) : Number(range.to) * 1000);
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
    if (opts?.signal?.aborted) return [];
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    const requested = Math.max(100, Math.min(5000, Math.floor(Number(range.limit) || 5000)));
    const firstPaintBars = Math.min(requested, 300);
    const abort = () => Boolean(opts?.signal?.aborted);
    if (abort()) return [];

    // Start/attach to the single-flight, then inspect the cache immediately.
    // ensureReadyHistory installs fresh/stale HistoryStore rows synchronously before
    // its first network await, so real candles can paint without waiting for refresh.
    const historyPromise = plane.ensureReadyHistory(firstPaintBars)
      .then(historicalToVelaBars)
      .catch(() => [] as OHLCV[]);

    let first: OHLCV[] = [];
    const snapshot = plane.getSnapshot();
    if (snapshot.historyReady && !abort()) {
      const canonical = plane.readCanonical();
      const cached = canonical.length
        ? marketViewToBars(canonical, range, firstPaintBars)
        : historicalToVelaBars(plane.getCompatibilityCandles(firstPaintBars));
      if (cached.length) {
        first = cached.slice(-requested);
        onBatch(first);
      }
    }

    const history = await historyPromise;
    // Never let a late request from an abandoned symbol/timeframe repaint the chart.
    if (abort()) return [];
    if (history.length) {
      const next = history.slice(-requested);
      const same = first.length === next.length && next.every((bar, index) => {
        const old = first[index];
        return !!old
          && Number(old.time) === Number(bar.time)
          && Number(old.open) === Number(bar.open)
          && Number(old.high) === Number(bar.high)
          && Number(old.low) === Number(bar.low)
          && Number(old.close) === Number(bar.close)
          && Number(old.volume ?? 0) === Number(bar.volume ?? 0);
      });
      if (!same) onBatch(next);
      first = next;
    }
    if (!first.length) return [];

    // Older pages never block first paint, and each consumer checks its abort signal.
    if (first.length < requested) {
      void plane.loadOlderHistory('warm', { visibleBars: Math.min(300, requested - first.length) })
        .then(() => {
          if (abort()) return;
          const canonical = plane.readCanonical();
          const expanded = canonical.length
            ? marketViewToBars(canonical, range, requested)
            : historicalToVelaBars(plane.getCompatibilityCandles(requested));
          if (expanded.length > first.length) onBatch(expanded.slice(-requested));
        })
        .catch(() => { /* older history is opportunistic; preserve the visible window */ });
    }
    return first;
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
    const requestedTo = range.to == null ? null : (Number(range.to) > 1e11 ? Number(range.to) : Number(range.to) * 1000);
    const current = plane.readCanonical();
    const newestMs = current.length ? current.time[current.length - 1]! * 1000 : Number.NaN;
    if (requestedTo != null && Number.isFinite(requestedTo) && Number.isFinite(newestMs) && requestedTo < newestMs - 1) {
      await plane.loadOlderHistory('visible', { visibleBars: requested });
    }
    const loaded = plane.readCanonical();
    if (loaded.length) return marketViewToBars(loaded, range, requested);
    // A zero-row canonical plane is not a successful history response.
    // Retry only through the real-history path; do not convert LTP into historical OHLC.
    return this.getBars(ticker, timeframe, range);
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    const requested = Math.max(100, Math.min(500, Math.floor(Number(range.limit) || 500)));
    const brokerId = await activeBrokerId();
    const plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
    const requestedTo = range.to == null ? null : (Number(range.to) > 1e11 ? Number(range.to) : Number(range.to) * 1000);
    const historyPromise = plane.ensureReadyHistory(requested);
    const initialSnapshot = plane.getSnapshot();
    if (initialSnapshot.historyReady) {
      const cachedView = plane.readCanonical();
      const cachedRows = cachedView.length
        ? marketViewToBars(cachedView, range, requested)
        : historicalToVelaBars(plane.getCompatibilityCandles(requested));
      const cachedOldest = cachedRows[0]?.time;
      if (cachedRows.length && (requestedTo == null || !Number.isFinite(cachedOldest) || requestedTo >= cachedOldest)) {
        void historyPromise.catch(() => undefined);
        return cachedRows;
      }
    }
    let lastError: unknown = null;
    try {
      await historyPromise;
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

    // Never fabricate a historical candle from a quote; preserve the history error.
    if (lastError) throw lastError;
    return [];
  }

  getSymbolInfo(ticker: string) {
    const symbol = runtimeSymbol(ticker);
    const bareTicker = symbol.split(':').pop() ?? symbol;
    const descriptor = symbolCatalog.find((item) =>
      `${item.prefix ?? 'NSE'}:${item.ticker}`.toUpperCase() === symbol.toUpperCase(),
    );
    // Do not report every instrument as an index: Vela and CoreSpirit use this metadata
    // for syminfo, instrument-specific behavior, and indicator context on option charts.
    const type = /(?:CE|PE)$/i.test(bareTicker) ? 'option'
      : /FUT(?:URES?)?$/i.test(bareTicker) ? 'future'
      : /-INDEX$/i.test(bareTicker) || descriptor?.type === 'index' ? 'index'
      : descriptor?.type ?? 'stock';
    return Promise.resolve({
      ticker: symbol,
      exchange: symbol.startsWith('BSE:') ? 'BSE' : symbol.startsWith('MCX:') ? 'MCX' : 'NSE',
      type,
    });
  }

  subscribeColumns(ticker: string, timeframe: string, onBar: (bar: ColumnarBarUpdate) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    let plane: ReturnType<typeof getChartDataPlane> | undefined;
    let stopPlane: (() => void) | undefined;
    let attachedBrokerId: string | undefined;
    let performanceKey = '';
    let cancelled = false;
    let fingerprint = '';
    let pendingSequence = 0;
    let pendingHistoryReplacement = false;
    const timelineKey = `${symbol}|${tcoTimeframe}`;
    let scheduled = false;
    let dirty = false;
    let raf = 0;

    const flush = () => {
      scheduled = false;
      if (cancelled || !dirty || !plane) return;
      dirty = false;
      const normalizationStartedAt = performanceNow();
      const view = marketLatencyTrace.measure(timelineKey, pendingSequence, 'canonical', () => plane!.readCanonical());
      if (!view.length) {
        chartPerformanceTelemetry.recordStage(performanceKey, 'normalization', Math.max(0, performanceNow() - normalizationStartedAt));
        return;
      }
      const i = view.length - 1;
      const time = view.time[i]!;
      const open = view.open[i]!, high = view.high[i]!, low = view.low[i]!, close = view.close[i]!;
      const volume = Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined;
      const sequence = plane.canonicalDataPlane().revision;
      const nextKey = `${time}|${open}|${high}|${low}|${close}|${volume ?? ''}`;
      const patchStartedAt = performanceNow();
      chartPerformanceTelemetry.recordStage(
        performanceKey,
        'normalization',
        Math.max(0, patchStartedAt - normalizationStartedAt),
      );
      const lastPacketAt = chartPerformanceTelemetry.getLastPacketAt(performanceKey);

      if (pendingHistoryReplacement) {
        pendingHistoryReplacement = false;
        fingerprint = nextKey;
        // Corrections, backfills and reconnect recovery can change bars BEFORE
        // the tail. A scalar replace-last update would leave Vela's historical
        // columns stale, so publish one explicit columnar dataset replacement.
        // This is off the ordinary tick path and keeps Vela the single chart owner.
        const columns: ColumnarBars = Object.freeze({
          time: view.time,
          open: view.open,
          high: view.high,
          low: view.low,
          close: view.close,
          volume: view.volume,
          length: view.length,
          timeUnit: 'seconds',
        });
        const replacement: ColumnarBarUpdate = {
          time, open, high, low, close, volume,
          timeUnit: 'seconds',
          sequence,
          timelineKey,
          operation: 'replace-history',
          columns,
          dirtyRange: { from: view.dirtyFrom, to: view.dirtyTo },
          preserveView: true,
        };
        const dispatchStartedAt = performanceNow();
        chartPerformanceTelemetry.recordStage(performanceKey, 'patch', Math.max(0, dispatchStartedAt - patchStartedAt));
        onBar(replacement);
        recordVelaRenderUpdate(performanceKey, dispatchStartedAt, lastPacketAt, Math.max(0, performanceNow() - dispatchStartedAt));
        return;
      }

      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      const update: ColumnarBarUpdate = { time, open, high, low, close, volume, timeUnit: 'seconds', sequence, timelineKey };
      const dispatchStartedAt = performanceNow();
      chartPerformanceTelemetry.recordStage(performanceKey, 'patch', Math.max(0, dispatchStartedAt - patchStartedAt));
      onBar(update);
      recordVelaRenderUpdate(performanceKey, dispatchStartedAt, lastPacketAt, Math.max(0, performanceNow() - dispatchStartedAt));
    };

    const schedule = () => {
      if (cancelled) return;
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      raf = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(flush)
        : Number(setTimeout(flush, 16));
    };


    const detach = () => {
      stopPlane?.();
      stopPlane = undefined;
      attachedBrokerId = undefined;
      performanceKey = '';
      plane = undefined;
      fingerprint = '';
      pendingHistoryReplacement = false;
      dirty = false;
      if (raf) {
        if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      scheduled = false;
    };

    const attach = (brokerId: string) => {
      if (cancelled || attachedBrokerId === brokerId) return;
      detach();
      attachedBrokerId = brokerId;
      performanceKey = tcoVelaPerformanceKey(brokerId, symbol, tcoTimeframe);
      plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
      stopPlane = plane.subscribe((event) => {
        if (event.type !== 'snapshot' && event.type !== 'tick') return;
        pendingSequence = event.snapshot.marketDataRevision;
        if (
          event.type === 'snapshot' &&
          (event.reason === 'cache' || event.reason === 'history' || event.reason === 'older-history' || event.reason === 'recovery')
        ) {
          pendingHistoryReplacement = true;
        }
        schedule();
      });
      schedule();
    };

    const syncBroker = () => {
      if (cancelled) return;
      const brokerId = activeBrokerIdSync();
      if (brokerId) attach(brokerId);
      else detach();
    };
    const offBrokerConnected = tradingCoreRuntime.on('BROKER_CONNECTED', syncBroker);
    const offBrokerDisconnected = tradingCoreRuntime.on('BROKER_DISCONNECTED', syncBroker);
    const brokerId = activeBrokerIdSync();
    if (brokerId) attach(brokerId);
    else void activeBrokerId().then(attach).catch(() => undefined);

    return () => {
      cancelled = true;
      offBrokerConnected();
      offBrokerDisconnected();
      detach();
    };
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: OHLCV) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    const tcoTimeframe = runtimeTimeframe(timeframe);
    let plane: ReturnType<typeof getChartDataPlane> | undefined;
    let stopPlane: (() => void) | undefined;
    let attachedBrokerId: string | undefined;
    let performanceKey = '';
    let cancelled = false;
    let fingerprint = '';
    let scheduled = false;
    let dirty = false;
    let raf = 0;

    const flush = () => {
      scheduled = false;
      if (cancelled || !dirty || !plane) return;
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
      const patchStartedAt = performanceNow();
      const lastPacketAt = chartPerformanceTelemetry.getLastPacketAt(performanceKey);
      onBar(next);
      recordVelaRenderUpdate(performanceKey, patchStartedAt, lastPacketAt, Math.max(0, performanceNow() - patchStartedAt));
    };

    const schedule = () => {
      if (cancelled) return;
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      raf = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(flush)
        : Number(setTimeout(flush, 16));
    };


    const detach = () => {
      stopPlane?.();
      stopPlane = undefined;
      attachedBrokerId = undefined;
      performanceKey = '';
      plane = undefined;
      fingerprint = '';
      dirty = false;
      if (raf) {
        if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      scheduled = false;
    };

    const attach = (brokerId: string) => {
      if (cancelled || attachedBrokerId === brokerId) return;
      detach();
      attachedBrokerId = brokerId;
      performanceKey = tcoVelaPerformanceKey(brokerId, symbol, tcoTimeframe);
      plane = getChartDataPlane(brokerId, symbol, tcoTimeframe);
      stopPlane = plane.subscribe((event) => {
        if (event.type !== 'snapshot' && event.type !== 'tick') return;
        schedule();
      });
      schedule();
    };

    const syncBroker = () => {
      if (cancelled) return;
      const brokerId = activeBrokerIdSync();
      if (brokerId) attach(brokerId);
      else detach();
    };
    const offBrokerConnected = tradingCoreRuntime.on('BROKER_CONNECTED', syncBroker);
    const offBrokerDisconnected = tradingCoreRuntime.on('BROKER_DISCONNECTED', syncBroker);
    const brokerId = activeBrokerIdSync();
    if (brokerId) attach(brokerId);
    else void activeBrokerId().then(attach).catch(() => undefined);

    return () => {
      cancelled = true;
      offBrokerConnected();
      offBrokerDisconnected();
      detach();
    };
  }
}

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
      void plane.prewarmHistory(requested).catch(() => {});
    }
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: 1500 });
  } else {
    globalThis.setTimeout(run, 150);
  }
}
