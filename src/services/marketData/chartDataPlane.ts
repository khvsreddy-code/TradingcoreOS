import type { HistoricalCandle } from '../brokers/BrokerAdapter';
export type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../types/market';
import { tradingCoreRuntime } from '../runtime/TradingCoreRuntime';
import { getCanonicalDataPlane, type CanonicalDataPlane } from '../core/data/canonicalDataPlane';
import { chartMarketKey, chartMarketStore } from './chartMarketStore';
import { historyStore, reconcileRealtimeCandle } from './HistoryStore';
import { acquireSharedChartMarketFeed } from './sharedChartMarketFeed';
import { chartHistoryCoordinator, historyPageCandles, historyDemandPageCandles, historyWarmTarget, initialHistoryCandles, shouldLoadOlderHistory } from './chartHistoryCoordinator';
import { marketDataGraph } from '../core/data/marketDataGraph';
import { chartPerformanceTelemetry } from './chartPerformanceTelemetry';

export const CHART_TIMEFRAME_INTERVALS: Record<string, string> = {
  '1m': '1minute',
  '3m': '3minute',
  '5m': '5minute',
  '15m': '15minute',
  '30m': '30minute',
  '60m': '60minute',
  '120m': '120minute',
  '240m': '240minute',
  '1H': '60minute',
  '2H': '120minute',
  '4H': '240minute',
  '1D': 'day',
  '1W': 'week',
  '1M': 'month',
};

export const CHART_TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '60m': 3600,
  '120m': 7200,
  '240m': 14400,
  '1H': 3600,
  '2H': 7200,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

const MAX_HISTORY_CANDLES = 50_000;
const IDLE_HOLD_MS = 30_000;
const CANONICAL_MAX = 50_000;

export type ChartDataPlaneKey = string;

type ChartColumnarSnapshot = Readonly<{
  time: ArrayLike<number>; open: ArrayLike<number>; high: ArrayLike<number>; low: ArrayLike<number>; close: ArrayLike<number>; volume: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds';
}>;
export type ChartDataPlaneSnapshot = Readonly<{
  key: ChartDataPlaneKey;
  brokerId: string;
  instrumentKey: string;
  timeframe: string;
  candles: HistoricalCandle[];
  /** Native Vela render data; compatibility candle objects are lazy. */
  columns?: ChartColumnarSnapshot;
  latestTick?: NormalizedMarketTick;
  revision: number;
  historyReady: boolean;
  historyLoading: boolean;
  olderHistoryLoading: boolean;
}>;

export type DataPlaneEvent =
  | { type: 'snapshot'; reason: 'cache' | 'history' | 'older-history'; snapshot: ChartDataPlaneSnapshot; olderAdded?: number; requestedLimit?: number }
  | { type: 'tick'; bucketChanged: boolean; snapshot: ChartDataPlaneSnapshot }
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string; snapshot: ChartDataPlaneSnapshot };

type Subscriber = (event: DataPlaneEvent) => void;

type PlaneState = {
  candles: HistoricalCandle[];
  columns?: ChartColumnarSnapshot;
  compatibilityCandles: HistoricalCandle[];
  compatibilityRevision: number;
  latestTick?: NormalizedMarketTick;
  revision: number;
  historyReady: boolean;
  historyLoading: boolean;
  olderHistoryLoading: boolean;
  historyPromise?: Promise<HistoricalCandle[]>;
  olderHistoryPromise?: Promise<HistoricalCandle[]>;
  feedStop?: () => void;
  marketStop?: () => void;
  idleTimer?: ReturnType<typeof setTimeout>;
  subscribers: Set<Subscriber>;
  consumers: number;
  lastHistoryLoadAt: number;
  olderHistoryExhausted: boolean;
  warmHistoryRequested: boolean;
  lastOlderRequestKey?: string;
  olderRequestCooldownUntil: number;
};

const registry = new Map<ChartDataPlaneKey, ChartDataPlane>();

function normalizeHistory(rows: HistoricalCandle[]): HistoricalCandle[] {
  const bySecond = new Map<number, HistoricalCandle>();
  for (const row of rows || []) {
    const raw = Date.parse(String(row.timestamp));
    const time = Math.floor(raw / 1000);
    const values = [Number(row.open), Number(row.high), Number(row.low), Number(row.close)];
    if (!Number.isFinite(raw) || !Number.isFinite(time) || time <= 0 || values.some(v => !Number.isFinite(v))) continue;
    const volume = Number(row.volume);
    bySecond.set(time, {
      timestamp: new Date(time * 1000).toISOString(),
      open: values[0], high: values[1], low: values[2], close: values[3],
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return [...bySecond.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-MAX_HISTORY_CANDLES);
}

function columnarHistoryToCandles(columns: {
  time: ArrayLike<number>; open: ArrayLike<number>; high: ArrayLike<number>; low: ArrayLike<number>; close: ArrayLike<number>; volume: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds';
}, limit = 5000): HistoricalCandle[] {
  const count = Math.min(columns.time.length, columns.open.length, columns.high.length, columns.low.length, columns.close.length, columns.volume.length);
  const start = Math.max(0, count - Math.max(1, limit));
  const out: HistoricalCandle[] = new Array(Math.max(0, count - start));
  const multiplier = columns.timeUnit === 'seconds' ? 1000 : 1;
  let previous = Number.NaN;
  let written = 0;
  for (let i = start; i < count; i += 1) {
    const time = Number(columns.time[i]) * multiplier;
    const open = Number(columns.open[i]), high = Number(columns.high[i]), low = Number(columns.low[i]), close = Number(columns.close[i]), volume = Number(columns.volume[i]);
    if (!Number.isFinite(time) || time <= 0 || ![open, high, low, close].every(Number.isFinite)) continue;
    if (time === previous) continue;
    previous = time;
    out[written++] = { timestamp: new Date(time).toISOString(), open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
  }
  out.length = written;
  return out;
}
export class ChartDataPlane {
  readonly key: ChartDataPlaneKey;
  private readonly canonicalPlane: CanonicalDataPlane;
  private readonly state: PlaneState = {
    candles: [], columns: undefined, compatibilityCandles: [], compatibilityRevision: -1, revision: 0, historyReady: false, historyLoading: false,
    olderHistoryLoading: false, subscribers: new Set(), consumers: 0, lastHistoryLoadAt: 0, olderHistoryExhausted: false, warmHistoryRequested: false, olderRequestCooldownUntil: 0,
  };

  constructor(
    readonly brokerId: string,
    readonly instrumentKey: string,
    readonly timeframe: string,
  ) {
    this.key = chartDataPlaneKey(brokerId, instrumentKey, timeframe);
    this.canonicalPlane = getCanonicalDataPlane(this.key);
  }

  private snapshot(): ChartDataPlaneSnapshot {
    return Object.freeze({
      key: this.key,
      brokerId: this.brokerId,
      instrumentKey: this.instrumentKey,
      timeframe: this.timeframe,
      candles: this.state.candles,
      ...(this.state.columns ? { columns: this.state.columns } : {}),
      latestTick: this.state.latestTick,
      revision: this.state.revision,
      historyReady: this.state.historyReady,
      historyLoading: this.state.historyLoading,
      olderHistoryLoading: this.state.olderHistoryLoading,
    });
  }

  /** Return the latest immutable snapshot so late subscribers can replay cached history. */
  getSnapshot(): ChartDataPlaneSnapshot {
    return this.snapshot();
  }

  private emit(event: DataPlaneEvent): void {
    const snapshot = event.snapshot || this.snapshot();
    const normalized = { ...event, snapshot } as DataPlaneEvent;
    this.state.subscribers.forEach(listener => {
      try { listener(normalized); } catch { /* a single chart must not break the shared plane */ }
    });
  }

  private syncCanonical(): void {
    const from = Math.max(0, this.state.candles.length - CANONICAL_MAX);
    this.canonicalPlane.replaceHistoricalCandleRows(this.state.candles, from);
  }

  private setCandles(rows: HistoricalCandle[], reason: 'cache' | 'history' | 'older-history'): void {
    this.state.candles = normalizeHistory(rows);
    if (this.state.candles.length) {
      marketDataGraph.syncBase(this.instrumentKey, this.timeframe, this.state.candles);

      this.state.revision += 1;
      this.syncCanonical();
      this.emit({ type: 'snapshot', reason, snapshot: this.snapshot() });
    }
  }

  private columnarSnapshot(): ChartColumnarSnapshot {
    const view = this.canonicalPlane.read();
    return Object.freeze({
      time: view.time,
      open: view.open,
      high: view.high,
      low: view.low,
      close: view.close,
      volume: view.volume,
      timeUnit: 'seconds',
    });
  }

  private onColumnarTick(tick: NormalizedMarketTick, price: number): { changed: boolean; bucketChanged: boolean; latest: HistoricalCandle | null } {
    const view = this.canonicalPlane.read();
    const rawTimestamp = tick.lastTradeTimestamp ?? tick.receivedAt ?? Date.now();
    const numericTimestamp = typeof rawTimestamp === 'number' ? rawTimestamp : Number(rawTimestamp);
    const timestampMs = Number.isFinite(numericTimestamp)
      ? (numericTimestamp > 1e12 ? numericTimestamp : numericTimestamp * 1000)
      : (() => {
          const parsed = Date.parse(String(rawTimestamp));
          return Number.isFinite(parsed) ? parsed : Date.now();
        })();
    const intervalSeconds = CHART_TIMEFRAME_SECONDS[this.timeframe] || 300;
    const bucketTime = Math.floor(timestampMs / (intervalSeconds * 1000)) * intervalSeconds;
    const lastIndex = view.length - 1;
    const lastTime = lastIndex >= 0 ? Number(view.time[lastIndex]) : Number.NaN;
    const previousOpen = lastIndex >= 0 ? Number(view.open[lastIndex]) : Number.NaN;
    const previousHigh = lastIndex >= 0 ? Number(view.high[lastIndex]) : Number.NaN;
    const previousLow = lastIndex >= 0 ? Number(view.low[lastIndex]) : Number.NaN;
    const previousClose = lastIndex >= 0 ? Number(view.close[lastIndex]) : Number.NaN;

    if (Number.isFinite(lastTime) && bucketTime < lastTime) {
      return { changed: false, bucketChanged: false, latest: null };
    }

    if (lastIndex < 0 || !Number.isFinite(lastTime)) {
      this.canonicalPlane.append({
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      });
    } else if (bucketTime === lastTime) {
      this.canonicalPlane.updateLast({
        time: lastTime,
        open: Number(view.open[lastIndex]),
        high: Math.max(Number(view.high[lastIndex]), price),
        low: Math.min(Number(view.low[lastIndex]), price),
        close: price,
        volume: Number(view.volume[lastIndex]) || 0,
      });
    } else {
      this.canonicalPlane.append({
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      });
    }

    const next = this.canonicalPlane.read();
    const i = next.length - 1;
    if (i < 0) return { changed: false, bucketChanged: false, latest: null };
    const latest: HistoricalCandle = {
      timestamp: new Date(Number(next.time[i]) * 1000).toISOString(),
      open: Number(next.open[i]),
      high: Number(next.high[i]),
      low: Number(next.low[i]),
      close: Number(next.close[i]),
      volume: Number(next.volume[i]) || 0,
    };
    const changed = lastIndex < 0
      || bucketTime !== lastTime
      || Number(next.open[i]) !== previousOpen
      || Number(next.high[i]) !== previousHigh
      || Number(next.low[i]) !== previousLow
      || Number(next.close[i]) !== previousClose;
    const bucketChanged = lastIndex < 0 || bucketTime > lastTime;

    // Keep Vela on the typed canonical path. Only the compatibility tail is touched;
    // never rebuild a 5k candle object array on every tick.
    const compat = this.state.compatibilityCandles;
    if (!compat.length) compat.push(latest);
    else {
      const lastCompat = compat[compat.length - 1]!;
      const lastCompatTime = Date.parse(lastCompat.timestamp);
      if (Date.parse(latest.timestamp) === lastCompatTime) compat[compat.length - 1] = latest;
      else if (Date.parse(latest.timestamp) > lastCompatTime) {
        compat.push(latest);
        if (compat.length > MAX_HISTORY_CANDLES) compat.shift();
      }
    }
    this.state.compatibilityCandles = compat;
    this.state.columns = this.columnarSnapshot();
    this.state.candles = [];
    return { changed, bucketChanged, latest };
  }

  private onTick = (tick: NormalizedMarketTick): void => {
    if (String(tick.instrumentKey || '') !== String(this.instrumentKey)) return;
    this.state.latestTick = tick;
    const price = Number(tick.ltp);
    if (!Number.isFinite(price)) return;
    const computeStartedAt = globalThis.performance?.now?.() ?? Date.now();
    // The global transport is instrument-only; this per-plane counter joins the
    // packet to the timeframe-specific history, compute, and Vela update metrics.
    chartPerformanceTelemetry.recordPacket(this.key);

    // Preserve the columnar render path after live updates. The previous implementation
    // reconciled against the entire compatibility candle array and then replaced the
    // typed state with OHLCV[]; that was the remaining zero-object hot-path leak and could
    // also delay first paint when history was temporarily empty.
    if (this.state.columns && this.state.candles.length === 0) {
      const result = this.onColumnarTick(tick, price);
      chartPerformanceTelemetry.recordCompute(this.key, Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - computeStartedAt), this.state.revision + 1);
      if (!result.latest || !result.changed) return;
      if (!result.bucketChanged) chartPerformanceTelemetry.recordFormingBarReplaceLast(this.key);

      this.state.revision += 1;
      this.state.compatibilityRevision = this.state.revision;
      marketDataGraph.updateBaseLast(this.instrumentKey, this.timeframe, result.latest);
      historyStore.upsertLatest(
        this.brokerId,
        this.instrumentKey,
        CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe,
        result.latest,
      );
      this.emit({ type: 'tick', bucketChanged: result.bucketChanged, snapshot: this.snapshot() });
      return;
    }

    // Cold/compatibility path used only when the plane was bootstrapped from OHLCV rows
    // or after an older-history merge. This path preserves the mature candle reconciler.
    const compatibility = this.state.candles.length ? this.state.candles : this.getCompatibilityCandles();
    const result = reconcileRealtimeCandle(
      compatibility,
      {
        price,
        timestamp: tick.lastTradeTimestamp ?? tick.receivedAt ?? Date.now(),
      },
      CHART_TIMEFRAME_SECONDS[this.timeframe] || 300,
      MAX_HISTORY_CANDLES,
      true,
    );
    chartPerformanceTelemetry.recordCompute(this.key, Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - computeStartedAt), this.state.revision + 1);
    if (!result.candles.length) return;
    const previousLength = this.state.candles.length;
    const previousClose = this.state.candles[previousLength - 1]?.close;
    this.state.candles = result.candles;
    this.state.columns = undefined;
    this.state.compatibilityCandles = result.candles;
    this.state.compatibilityRevision = -1;
    const latest = result.candles[result.candles.length - 1];
    if (latest) {
      const latestPoint = { time: Math.floor(Date.parse(latest.timestamp) / 1000), open: Number(latest.open), high: Number(latest.high), low: Number(latest.low), close: Number(latest.close), volume: Number(latest.volume) || 0 };
      const canonicalLength = this.canonicalPlane.market.length;
      const canonicalLastTime = canonicalLength ? this.canonicalPlane.market.time[canonicalLength - 1] : NaN;
      const canonicalNeedsReplace = canonicalLength !== previousLength && canonicalLength !== previousLength - 1;
      if (canonicalNeedsReplace || (!Number.isFinite(canonicalLastTime) && previousLength > 0)) this.syncCanonical();
      else if (!Number.isFinite(canonicalLastTime) || latestPoint.time > canonicalLastTime) this.canonicalPlane.append(latestPoint);
      else if (latestPoint.time === canonicalLastTime) this.canonicalPlane.updateLast(latestPoint);
      else this.syncCanonical();
    }
    if (latest) marketDataGraph.updateBaseLast(this.instrumentKey, this.timeframe, latest);
    if (result.bucketChanged || result.candles.length !== previousLength || Number(previousClose) !== Number(result.candles[result.candles.length - 1]?.close)) {
      this.state.revision += 1;
      historyStore.upsertLatest(this.brokerId, this.instrumentKey, CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe, result.candles[result.candles.length - 1]);
    }
    if (result.bucketChanged || Number(previousClose) !== Number(result.candles[result.candles.length - 1]?.close)) {
      if (!result.bucketChanged) chartPerformanceTelemetry.recordFormingBarReplaceLast(this.key);
      this.emit({ type: 'tick', bucketChanged: result.bucketChanged, snapshot: this.snapshot() });
    }
  };

  private start(): void {
    if (this.state.idleTimer) { clearTimeout(this.state.idleTimer); this.state.idleTimer = undefined; }
    if (!this.state.marketStop) {
      const marketKey = chartMarketKey(this.brokerId, this.instrumentKey);
      this.state.marketStop = chartMarketStore.subscribe(marketKey, () => {
        const tick = chartMarketStore.getTick(marketKey);
        if (tick) this.onTick(tick);
      });
      this.state.feedStop = acquireSharedChartMarketFeed(this.brokerId, this.instrumentKey);
      const cachedTick = chartMarketStore.getTick(marketKey) ?? tradingCoreRuntime.getMarketSnapshot(this.instrumentKey);
      if (cachedTick) this.onTick(cachedTick);
    }
    void this.ensureHistory();
  }

  private stopAfterIdle(): void {
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer);
    this.state.idleTimer = setTimeout(() => {
      if (this.state.consumers > 0) return;
      this.state.marketStop?.();
      this.state.marketStop = undefined;
      this.state.feedStop?.();
      this.state.feedStop = undefined;
    }, IDLE_HOLD_MS);
  }

  acquire(): () => void {
    this.state.consumers += 1;
    this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.state.consumers = Math.max(0, this.state.consumers - 1);
      if (this.state.consumers === 0) this.stopAfterIdle();
    };
  }

  subscribe(listener: Subscriber): () => void {
    this.state.subscribers.add(listener);
    const release = this.acquire();
    listener({ type: 'snapshot', reason: 'cache', snapshot: this.snapshot() });
    return () => {
      this.state.subscribers.delete(listener);
      release();
    };
  }

  private activeWindow(rows: HistoricalCandle[], limitOverride?: number): HistoricalCandle[] {
    const limit = Math.max(initialHistoryCandles(this.timeframe), Math.min(5000, Math.floor(Number(limitOverride) || initialHistoryCandles(this.timeframe))));
    return rows.length > limit ? rows.slice(-limit) : rows;
  }

  private mergeOlder(rows: HistoricalCandle[], reason: 'older-history', requestedLimit?: number): HistoricalCandle[] {
    const previousLength = this.state.candles.length;
    const merged = normalizeHistory([...rows, ...this.state.candles]);
    if (!merged.length) return this.state.candles;
    this.state.candles = merged;
    this.state.columns = undefined;
    this.state.compatibilityCandles = merged;
    this.state.compatibilityRevision = -1;
    marketDataGraph.syncBase(this.instrumentKey, this.timeframe, this.state.candles);
    this.state.revision += 1;
    this.syncCanonical();
    const olderAdded = Math.max(0, merged.length - previousLength);
    this.emit({ type: 'snapshot', reason, snapshot: this.snapshot(), olderAdded, requestedLimit });
    return merged;
  }

  private setColumnarHistory(columns: { time: ArrayLike<number>; open: ArrayLike<number>; high: ArrayLike<number>; low: ArrayLike<number>; close: ArrayLike<number>; volume: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds' }, requestedLimit: number, reason: 'cache' | 'history'): HistoricalCandle[] {
    const candlesForCache = columnarHistoryToCandles(columns, Math.min(5000, requestedLimit));
    if (!candlesForCache.length) return [];
    const retainedForCache = candlesForCache.slice(-MAX_HISTORY_CANDLES);

    // Critical render path: keep Vela on the typed columnar representation. The
    // OHLCV object array is retained only as a cold compatibility cache.
    this.state.columns = columns;
    this.state.candles = [];
    this.state.compatibilityCandles = retainedForCache;
    this.state.compatibilityRevision = this.state.revision + 1;
    this.state.revision += 1;
    this.canonicalPlane.replaceColumns(columns, Math.max(0, columns.time.length - retainedForCache.length));

    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    historyStore.set(this.brokerId, this.instrumentKey, interval, retainedForCache, Math.min(MAX_HISTORY_CANDLES, Math.max(requestedLimit, retainedForCache.length)));
    this.state.lastHistoryLoadAt = Date.now();
    this.state.olderHistoryExhausted = false;
    this.state.historyReady = true;
    this.emit({ type: 'snapshot', reason, snapshot: this.snapshot() });
    return retainedForCache;
  }

  /** Materialize the compatibility object view once per columnar revision. Vela rendering never needs this. */
  getCompatibilityCandles(limitOverride?: number): HistoricalCandle[] {
    if (this.state.candles.length) return this.activeWindow(this.state.candles, limitOverride);
    if (this.state.compatibilityCandles.length && this.state.compatibilityRevision === this.state.revision) {
      return this.activeWindow(this.state.compatibilityCandles, limitOverride);
    }
    if (!this.state.columns) return [];
    const materialized=columnarHistoryToCandles(this.state.columns, Math.min(MAX_HISTORY_CANDLES, Number(limitOverride)||MAX_HISTORY_CANDLES));
    this.state.compatibilityCandles=materialized;
    this.state.compatibilityRevision=this.state.revision;
    return this.activeWindow(materialized, limitOverride);
  }

  /** Explicit mature object-history path used by TCO's fast progressive adapter. */
  ensureReadyHistory(limitOverride?: number): Promise<HistoricalCandle[]> {
    return this.ensureHistory(limitOverride);
  }

  /** Cold-start columnar loader used by Vela's native renderer. Falls back to the ordinary broker path when unsupported. */
  async ensureReadyColumns(limitOverride?: number): Promise<HistoricalCandle[]> {
    if (this.state.historyPromise) return this.state.historyPromise;
    if (this.state.historyReady && (this.state.candles.length || this.state.columns?.time.length)) {
      if (this.state.candles.length) return this.activeWindow(this.state.candles, limitOverride);
      if (this.state.columns?.time.length) {
        // Keep Vela on the typed representation; only materialize the compatibility
        // view when a legacy consumer explicitly asks for candles.
        return this.getCompatibilityCandles(limitOverride);
      }
      // historyReady without candles/columns is an invalid terminal state.
      // Fall through and rehydrate instead of short-circuiting with [].
      this.state.historyReady = false;
    }
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    const baseLimit = initialHistoryCandles(this.timeframe);
    const requestedLimit = Number.isFinite(Number(limitOverride)) ? Math.max(baseLimit, Math.min(5000, Math.floor(Number(limitOverride)))) : baseLimit;
    const fresh = historyStore.get(this.brokerId, this.instrumentKey, interval);
    if (fresh?.length) {
      const active = this.activeWindow(fresh, requestedLimit);
      this.state.historyReady = true; this.state.olderHistoryExhausted = false; this.setCandles(active, 'cache');
      return active;
    }
    const stale = historyStore.getStale(this.brokerId, this.instrumentKey, interval);
    if (stale?.length) {
      const active = this.activeWindow(stale, requestedLimit);
      this.state.historyReady = true; this.state.olderHistoryExhausted = false; this.setCandles(active, 'cache');
      // SWR: stale candles paint immediately; network refresh proceeds in the same single-flight.
    }
    this.state.historyLoading = true;
    this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });
    const requestKey = `${this.key}:initial-columns:${requestedLimit}`;
    const historyStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalDataColumns(this.instrumentKey, interval, undefined, requestedLimit), 'initial')
      .then(columns => {
        if (!columns || columns.time.length === 0) {
          this.state.historyPromise = undefined;
          return this.ensureHistory(requestedLimit);
        }
        const active = this.setColumnarHistory(columns, requestedLimit, 'history');
        if (!active.length) throw new Error('No historical candles available');
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'initial', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), active.length);
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        return active;
      })
      .catch(error => {
        const message = String((error as any)?.message || error || 'Historical candles unavailable');
        this.emit({ type: 'status', status: 'error', error: message, snapshot: this.snapshot() });
        throw error;
      })
      .finally(() => { this.state.historyLoading = false; this.state.historyPromise = undefined; });
    this.state.historyPromise = promise;
    return promise;
  }
  private async ensureHistory(limitOverride?: number): Promise<HistoricalCandle[]> {
    if (this.state.historyPromise) return this.state.historyPromise;
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    const baseLimit = initialHistoryCandles(this.timeframe);
    const requestedLimit = Number.isFinite(Number(limitOverride)) ? Math.max(baseLimit, Math.min(5000, Math.floor(Number(limitOverride)))) : baseLimit;
    const initialLimit = requestedLimit;
    const fresh = historyStore.get(this.brokerId, this.instrumentKey, interval);
    const stale = historyStore.getStale(this.brokerId, this.instrumentKey, interval);
    if (fresh?.length) {
      const active = this.activeWindow(fresh, requestedLimit);
      if (!this.state.historyReady || this.state.candles.length < active.length) {
        this.state.historyReady = true;
        this.state.olderHistoryExhausted = false;
        this.setCandles(active, 'cache');
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      }
      return active;
    }
    if (stale?.length && !this.state.candles.length) {
      this.state.historyReady = true;
      this.state.olderHistoryExhausted = false;
      this.setCandles(this.activeWindow(stale, requestedLimit), 'cache');
    }

    this.state.historyLoading = true;
    this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });
    const requestKey = `${this.key}:initial:${initialLimit}`;
    const historyStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalData(this.instrumentKey, interval, undefined, initialLimit), 'initial')
      .then(rows => {
        const normalized = normalizeHistory(rows);
        if (!normalized.length) throw new Error('No historical candles available');
        historyStore.set(this.brokerId, this.instrumentKey, interval, normalized, Math.min(MAX_HISTORY_CANDLES, Math.max(initialLimit, normalized.length)));
        this.state.lastHistoryLoadAt = Date.now();
        this.state.olderHistoryExhausted = false;
        this.state.historyReady = true;
        const active = this.activeWindow(normalized);
        this.setCandles(active, 'history');
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'initial', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), active.length);
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        return active;
      })
      .catch(error => {
        const message = String((error as any)?.message || error || 'Historical candles unavailable');
        if (this.state.candles.length) {
          this.state.historyReady = true;
          this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
          return this.state.candles;
        }
        this.emit({ type: 'status', status: 'error', error: message, snapshot: this.snapshot() });
        throw error;
      })
      .finally(() => {
        this.state.historyLoading = false;
        this.state.historyPromise = undefined;
        if (this.state.candles.length) this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      });
    this.state.historyPromise = promise;
    return promise;
  }

  /** Cold-start contract: use the compact columnar path first, then fall back to object history. */
  ensureReady(limit?: number): Promise<HistoricalCandle[]> {
    return this.ensureReadyColumns(limit).catch(() => this.ensureHistory(limit));
  }

  /** Borrow the shared typed-array market view. No candle objects are created. */
  readCanonical() {
    return this.canonicalPlane.read();
  }

  /** The shared canonical data plane for advanced TCO consumers. */
  canonicalDataPlane(): CanonicalDataPlane {
    return this.canonicalPlane;
  }

  async loadOlderHistory(priority: 'visible' | 'warm' = 'visible', demand?: { visibleBars?: number }): Promise<HistoricalCandle[]> {
    if (this.state.historyReady && !this.state.candles.length && this.state.columns) this.getCompatibilityCandles(MAX_HISTORY_CANDLES);
    if (this.state.olderHistoryPromise || !this.state.historyReady || this.state.olderHistoryExhausted || this.state.candles.length >= MAX_HISTORY_CANDLES) {
      return this.state.olderHistoryPromise || this.state.candles;
    }
    const oldest = this.state.candles[0];
    if (!oldest?.timestamp) return this.state.candles;
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    const visibleBars = Math.max(1, Math.ceil(Number(demand?.visibleBars) || historyPageCandles(this.timeframe)));
    const limit = demand?.visibleBars ? historyDemandPageCandles(this.timeframe, visibleBars) : historyPageCandles(this.timeframe);
    const requestKey = `${this.key}:older:${oldest.timestamp}:${limit}`;
    const now = Date.now();
    if (this.state.lastOlderRequestKey === requestKey && now < this.state.olderRequestCooldownUntil) return this.state.candles;
    this.state.lastOlderRequestKey = requestKey;
    this.state.olderRequestCooldownUntil = now + 300;
    const cachedOlder = historyStore.getBefore(this.brokerId, this.instrumentKey, interval, oldest.timestamp, limit);
    if (cachedOlder.length) return this.mergeOlder(cachedOlder, 'older-history', limit);

    if (priority === 'visible') {
      this.state.olderHistoryLoading = true;
      this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });
    }
    const historyStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalDataBefore(this.instrumentKey, interval, oldest.timestamp, limit), priority)
      .then(rows => {
        const older = normalizeHistory(rows).filter(row => Date.parse(row.timestamp) < Date.parse(oldest.timestamp));
        if (!older.length) { this.state.olderHistoryExhausted = true; return this.state.candles; }
        historyStore.mergeInto(this.brokerId, this.instrumentKey, interval, older, MAX_HISTORY_CANDLES);
        this.state.olderHistoryExhausted = false;
        const merged = this.mergeOlder(older, 'older-history', limit);
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'older', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), older.length);
        return merged;
      })
      .finally(() => {
        this.state.olderHistoryLoading = false;
        this.state.olderHistoryPromise = undefined;
        if (priority === 'visible') this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      });
    this.state.olderHistoryPromise = promise;
    return promise;
  }

  requestWarmHistory(visibleBars?: number): void {
    if (this.state.warmHistoryRequested || !this.state.historyReady || this.state.olderHistoryExhausted || this.state.candles.length >= historyWarmTarget(this.timeframe)) return;
    this.state.warmHistoryRequested = true;
    void this.loadOlderHistory('warm', visibleBars ? { visibleBars } : undefined).catch(() => {
      // Warm history is opportunistic. A failed request must not permanently
      // disable warming for the active dataset.
      this.state.warmHistoryRequested = false;
    });
  }

  extendHistoryInBackground(): void {
    // Retained as a compatibility marker. Background work is explicitly demand-
    // driven: requestWarmHistory() may add one low-priority warm page, while deep
    // history remains tied to the user's visible left-edge movement. There is no
    // target-sized multi-page crawl.
  }

  dispose(): void {
    this.state.consumers = 0;
    this.state.subscribers.clear();
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer);
    this.state.marketStop?.();
    this.state.feedStop?.();
    this.state.marketStop = undefined;
    this.state.feedStop = undefined;
    this.state.historyPromise = undefined;
    this.state.olderHistoryPromise = undefined;
  }
}

export function chartDataPlaneKey(brokerId: string, instrumentKey: string, timeframe: string): ChartDataPlaneKey {
  return `${String(brokerId || 'unknown').toLowerCase()}:${String(instrumentKey || '').trim()}:${String(timeframe || '5m')}`;
}

export function getChartDataPlane(brokerId: string, instrumentKey: string, timeframe: string): ChartDataPlane {
  const key = chartDataPlaneKey(brokerId, instrumentKey, timeframe);
  let plane = registry.get(key);
  if (!plane) {
    plane = new ChartDataPlane(
      String(brokerId || 'unknown').toLowerCase(),
      String(instrumentKey || '').trim(),
      String(timeframe || '5m'),
    );
    registry.set(key, plane);
  }
  return plane;
}

export function clearChartDataPlaneRegistry(): void {
  registry.forEach(plane => plane.dispose());
  registry.clear();
}

export function chartDataPlaneRegistrySize(): number { return registry.size; }
