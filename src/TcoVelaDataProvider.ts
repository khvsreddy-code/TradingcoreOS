import type { DataProvider, ProviderInfo, SymbolDescriptor, BarRange, OHLCV, ColumnarBars, ColumnarBarUpdate } from './services/core/chart/velaNativeChartKernel';
import { chartDataPlaneKey, getChartDataPlane, CHART_TIMEFRAME_INTERVALS } from './services/marketData/chartDataPlane';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';
import type { CanonicalMarketView } from './services/core/data/canonicalDataPlane';
import type { HistoricalCandle } from './services/marketData/chartDataPlane';
import { marketLatencyTrace } from './services/core/performance/marketLatencyTrace';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

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
const SYMBOL_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
let symbolCatalog: { expiresAt: number; symbols: SymbolDescriptor[] } | undefined;
let symbolCatalogLoad: Promise<SymbolDescriptor[]> | undefined;

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

function descriptorFromMaster(master: FyersMasterName, row: FyersSymbolRecord): SymbolDescriptor | undefined {
  const ticker = textField(row, 'symbol', 'symbol_ticker', 'fySymbol', 'fysymbol');
  if (!ticker || !ticker.includes(':')) return undefined;
  const prefix = ticker.slice(0, ticker.indexOf(':')).toUpperCase();
  if (!/^[A-Z0-9_-]{2,16}$/.test(prefix)) return undefined;
  const description = textField(row, 'description', 'symbol_desc', 'symbolDesc', 'display_name', 'name');
  const kind = master.endsWith('_FO') || master.endsWith('_COM') ? 'derivative' :
    master.endsWith('_CD') ? 'currency' : master === 'MCX_COM' || master === 'NSE_COM' ? 'commodity' :
    /INDEX/i.test(ticker) ? 'index' : 'equity';
  return { ticker, prefix, description: description || ticker, type: kind, market: master };
}

async function loadFyersSymbolCatalog(): Promise<SymbolDescriptor[]> {
  if (symbolCatalog && symbolCatalog.expiresAt > Date.now()) return symbolCatalog.symbols;
  if (symbolCatalogLoad) return symbolCatalogLoad;
  symbolCatalogLoad = (async () => {
    const settled = await Promise.allSettled(FYERS_MASTERS.map(async (master) => {
      const response = await fetch(`https://public.fyers.in/sym_details/${master}_sym_master.json`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`FYERS ${master} symbol master returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      const rows: unknown[] = Array.isArray(payload) ? payload :
        Array.isArray(root?.data) ? root.data as unknown[] :
        root ? Object.values(root) : [];
      return { master, rows };
    }));
    const byTicker = new Map<string, SymbolDescriptor>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue; // partial master outage must not hide healthy venues
      for (const value of result.value.rows) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const descriptor = descriptorFromMaster(result.value.master, value as FyersSymbolRecord);
        if (descriptor && !byTicker.has(descriptor.ticker)) byTicker.set(descriptor.ticker, descriptor);
      }
    }
    // Keep the terminal usable during an upstream outage, but never cache a fallback-only
    // result for the full TTL: the next list request should retry discovery.
    const symbols = [...byTicker.values()];
    for (const fallback of FALLBACK_SYMBOLS) {
      if (!byTicker.has(`${fallback.prefix}:${fallback.ticker}`) && !byTicker.has(fallback.ticker)) {
        if (!symbols.some((item) => item.ticker === fallback.ticker || item.ticker === `${fallback.prefix}:${fallback.ticker}`)) symbols.push({ ...fallback });
      }
    }
    symbols.sort((a, b) => a.ticker.localeCompare(b.ticker));
    if (byTicker.size > 0) symbolCatalog = { symbols, expiresAt: Date.now() + SYMBOL_CATALOG_TTL_MS };
    return symbols;
  })().finally(() => { symbolCatalogLoad = undefined; });
  return symbolCatalogLoad;
}

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

  async listSymbols(): Promise<SymbolDescriptor[]> {
    try { return (await loadFyersSymbolCatalog()).map((symbol) => ({ ...symbol })); }
    catch { return FALLBACK_SYMBOLS.map((symbol) => ({ ...symbol })); }
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

    // History and quote are independent. Race them for time-to-first-visible-price,
    // but always keep the history promise alive so real candles replace the seed.
    const historyPromise: Promise<OHLCV[]> = plane.ensureReadyHistory(firstPaintBars).then(historicalToVelaBars).catch(() => []);
    const quotePromise = tradingCoreRuntime.getMarketQuotes([symbol]).catch(() => ({}));

    type FirstPaintResult =
      | { kind: 'history'; bars: OHLCV[] }
      | { kind: 'quote'; bars: OHLCV[] };

    const quoteBars = async (): Promise<OHLCV[]> => {
      if (abort()) return [];
      const quote = await quotePromise;
      if (abort()) return [];
      const row = quote[symbol];
      const ltp = Number(row?.ltp);
      if (!Number.isFinite(ltp) || ltp <= 0) return [];
      const now = Date.now();
      const interval = timeframeMs(tcoTimeframe);
      return [{
        time: Math.floor(now / interval) * interval,
        open: ltp,
        high: ltp,
        low: ltp,
        close: ltp,
        volume: Number.isFinite(Number(row?.volume)) ? Number(row?.volume) : undefined,
      }];
    };

    let first: OHLCV[] = [];
    const firstResult: FirstPaintResult = await Promise.race([
      historyPromise.then((bars): FirstPaintResult => ({ kind: 'history', bars })),
      quoteBars().then((bars): FirstPaintResult => ({ kind: 'quote', bars })),
    ]);

    if (abort()) return firstResult.bars;
    if (firstResult.bars.length > 0) {
      first = firstResult.bars;
      onBatch(first.slice(-requested));
    }

    // Always let real history supersede the quote seed when it arrives. The quote seed
    // exists only to make the first frame non-empty; it is never written into historyStore.
    const history = await historyPromise;
    if (abort()) return history.length ? history : first;
    if (history.length > 0 && (firstResult.kind !== 'history' || history.length !== first.length)) {
      first = history;
      onBatch(history.slice(-requested));
    } else if (history.length === 0 && first.length === 0) {
      // History can legally return an empty page during a broker/session race. Re-use
      // the already-started quote request so Vela never leaves a blank canvas while
      // the live price path is healthy.
      const fallback = await quoteBars();
      if (!abort() && fallback.length) {
        first = fallback;
        onBatch(fallback);
      }
    }

    let currentLength = history.length || first.length;
    while (!abort() && currentLength > 0 && currentLength < requested) {
      const beforeLength = currentLength;
      const older = historicalToVelaBars(await plane.loadOlderHistory('warm', { visibleBars: Math.min(1200, requested - currentLength) }));
      if (abort()) return older;
      currentLength = older.length;
      if (currentLength <= beforeLength) break;
      onBatch(older.slice(-requested));
    }

    return !abort() ? (plane.readCanonical().length ? marketViewToBars(plane.readCanonical(), range, requested) : first) : first;
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
    // A zero-row canonical plane is not a successful history response.
    // Reuse the same broker/quote fallback as normal chart bootstrap.
    return this.getBars(ticker, timeframe, range);
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

  getSymbolInfo(ticker: string) {
    const symbol = runtimeSymbol(ticker);
    return Promise.resolve({ ticker: symbol, exchange: symbol.startsWith('BSE:') ? 'BSE' : 'NSE', type: 'index' });
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
    const timelineKey = `${symbol}|${tcoTimeframe}`;
    let scheduled = false;
    let dirty = false;
    let raf = 0;

    const flush = () => {
      scheduled = false;
      if (cancelled || !dirty || !plane) return;
      dirty = false;
      const view = marketLatencyTrace.measure(timelineKey, pendingSequence, 'canonical', () => plane!.readCanonical());
      if (!view.length) return;
      const i = view.length - 1;
      const time = view.time[i]!;
      const open = view.open[i]!, high = view.high[i]!, low = view.low[i]!, close = view.close[i]!;
      const volume = Number.isFinite(view.volume[i]!) ? view.volume[i]! : undefined;
      const sequence = plane.canonicalDataPlane().revision;
      const nextKey = `${time}|${open}|${high}|${low}|${close}|${volume ?? ''}`;
      if (nextKey === fingerprint) return;
      fingerprint = nextKey;
      const patchStartedAt = performanceNow();
      const lastPacketAt = chartPerformanceTelemetry.getLastPacketAt(performanceKey);
      onBar({ time, open, high, low, close, volume, timeUnit: 'seconds', sequence, timelineKey });
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
        pendingSequence = event.snapshot.revision;
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
      void plane.ensureReadyHistory(requested).catch(() => {});
    }
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: 1500 });
  } else {
    globalThis.setTimeout(run, 150);
  }
}
