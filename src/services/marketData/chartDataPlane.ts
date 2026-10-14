import type { HistoricalCandle } from '../brokers/BrokerAdapter';
export type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { MarketFeedStatus, NormalizedMarketTick } from '../../types/market';
import { LiveCandleStateMachine, liveTradeTimestampMs, type LiveCandleTransitionKind } from './liveCandleStateMachine';
import { tradingCoreRuntime } from '../runtime/TradingCoreRuntime';
import { getCanonicalDataPlane, type CanonicalDataPlane } from '../core/data/canonicalDataPlane';
import { chartMarketKey, chartMarketStore } from './chartMarketStore';
import { historyStore } from './HistoryStore';
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
  marketDataRevision: number;
  datasetGeneration: number;
  dirtyRange: Readonly<{ from: number; to: number }>;
  feedStatus?: MarketFeedStatus;
  recovering: boolean;
}>;

export type DataPlaneEvent =
  | { type: 'snapshot'; reason: 'cache' | 'history' | 'older-history' | 'recovery'; snapshot: ChartDataPlaneSnapshot; olderAdded?: number; requestedLimit?: number; correctedBars?: number }
  | { type: 'tick'; bucketChanged: boolean; snapshot: ChartDataPlaneSnapshot; transition?: LiveCandleTransitionKind }
  /** A quote whose exchange trade time is unknown. Consumers may update quote UI, but must not mutate candles. */
  | { type: 'quote'; snapshot: ChartDataPlaneSnapshot }
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string; snapshot: ChartDataPlaneSnapshot };

type Subscriber = (event: DataPlaneEvent) => void;

type PlaneState = {
  candles: HistoricalCandle[];
  columns?: ChartColumnarSnapshot;
  compatibilityCandles: HistoricalCandle[];
  compatibilityRevision: number;
  latestTick?: NormalizedMarketTick;
  /** Latest accepted exchange trade time; blocks out-of-order forming-bar regressions. */
  lastAcceptedTradeTimestampMs?: number;
  revision: number;
  historyReady: boolean;
  historyLoading: boolean;
  olderHistoryLoading: boolean;
  historyPromise?: Promise<HistoricalCandle[]>;
  olderHistoryPromise?: Promise<HistoricalCandle[]>;
  olderHistoryRequestKey?: string;
  olderHistoryPriority?: 'visible' | 'warm';
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
  feedStatus?: MarketFeedStatus;
  marketStatusRevision: number;
  recoveryPending: boolean;
  recoveryInFlight: boolean;
  lastRecoveryAt: number;
  recoveryRetryTimer?: ReturnType<typeof setTimeout>;
};

const registry = new Map<ChartDataPlaneKey, ChartDataPlane>();

/** Only a valid exchange trade timestamp may create or advance a candle. Packet arrival time is not trade time. */
function tradeTimestamp(tick: NormalizedMarketTick): string | undefined {
  const raw = tick.lastTradeTimestamp ?? tick.brokerTimestamp ?? (
    tick.source === 'paper' || tick.source === 'replay' || tick.source === 'backtest' || tick.source === 'simulator'
      ? tick.timestamp ?? tick.receivedAtEpoch ?? tick.receivedAt
      : undefined
  );
  if (raw == null || raw === '') return undefined;
  const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim());
  const milliseconds = Number.isFinite(numeric)
    ? (numeric > 1e12 ? numeric : numeric * 1000)
    : Date.parse(String(raw));
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return undefined;
  return new Date(milliseconds).toISOString();
}

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
  private readonly liveCandle: LiveCandleStateMachine;
  private disposed = false;
  private readonly state: PlaneState = {
    candles: [], columns: undefined, compatibilityCandles: [], compatibilityRevision: -1, revision: 0, historyReady: false, historyLoading: false,
    olderHistoryLoading: false, subscribers: new Set(), consumers: 0, lastHistoryLoadAt: 0, olderHistoryExhausted: false, warmHistoryRequested: false, olderRequestCooldownUntil: 0,
    marketStatusRevision: 0, recoveryPending: false, recoveryInFlight: false, lastRecoveryAt: 0,
  };
  

  constructor(
    readonly brokerId: string,
    readonly instrumentKey: string,
    readonly timeframe: string,
  ) {
    this.key = chartDataPlaneKey(brokerId, instrumentKey, timeframe);
    this.canonicalPlane = getCanonicalDataPlane(this.key);
    this.liveCandle = new LiveCandleStateMachine(this.instrumentKey, this.timeframe);
  }

  private snapshot(): ChartDataPlaneSnapshot {
    const canonical = this.canonicalPlane.read();
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
      marketDataRevision: canonical.revision,
      datasetGeneration: this.liveCandle.generation,
      dirtyRange: Object.freeze({ from: canonical.dirtyFrom, to: canonical.dirtyTo }),
      feedStatus: this.state.feedStatus,
      recovering: this.state.recoveryPending || this.state.recoveryInFlight,
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
    this.state.columns = undefined;
    this.state.compatibilityCandles = this.state.candles;
    if (this.state.candles.length) {
      marketDataGraph.syncBase(this.instrumentKey, this.timeframe, this.state.candles);

      this.state.revision += 1;
      this.state.compatibilityRevision = this.state.revision;
      this.syncCanonical();
      this.emit({ type: 'snapshot', reason, snapshot: this.snapshot() });
    }
  }

  /** Activate a validated cached history snapshot and replay any pre-history trades in time order. */
  private activateCachedHistory(): void {
    const activation = this.liveCandle.activateCachedHistory();
    this.state.lastAcceptedTradeTimestampMs = undefined;
    this.replayBufferedTicks(activation.ticks);
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

  private latestCanonicalCandle(): HistoricalCandle | undefined {
    const view = this.canonicalPlane.read();
    const index = view.length - 1;
    if (index < 0) return undefined;
    return {
      timestamp: new Date(Number(view.time[index]) * 1000).toISOString(),
      open: Number(view.open[index]),
      high: Number(view.high[index]),
      low: Number(view.low[index]),
      close: Number(view.close[index]),
      volume: Number(view.volume[index]) || 0,
    };
  }

  private updateCompatibilityTail(bar: HistoricalCandle, bucketChanged: boolean, previousRevision: number): boolean {
    const hasColumnarHistory = Boolean(this.state.columns);
    const compatibleCacheIsCurrent = this.state.compatibilityCandles.length > 0
      && this.state.compatibilityRevision === previousRevision;

    if (this.state.candles.length > 0) {
      const rows = this.state.candles;
      const last = rows[rows.length - 1];
      if (bucketChanged || !last || Date.parse(last.timestamp) !== Date.parse(bar.timestamp)) rows.push(bar);
      else rows[rows.length - 1] = bar;
      if (rows.length > MAX_HISTORY_CANDLES) rows.splice(0, rows.length - MAX_HISTORY_CANDLES);
      this.state.compatibilityCandles = rows;
      return true;
    }

    if (hasColumnarHistory && !compatibleCacheIsCurrent) {
      // A one-candle tail is not a valid full-history compatibility mirror.
      // Invalidate it instead of letting object consumers mistake it for history.
      this.state.compatibilityCandles = [];
      this.state.compatibilityRevision = -1;
      return false;
    }

    const rows = this.state.compatibilityCandles;
    if (rows.length > 0 && compatibleCacheIsCurrent) {
      const last = rows[rows.length - 1];
      if (bucketChanged || !last || Date.parse(last.timestamp) !== Date.parse(bar.timestamp)) rows.push(bar);
      else rows[rows.length - 1] = bar;
      if (rows.length > MAX_HISTORY_CANDLES) rows.splice(0, rows.length - MAX_HISTORY_CANDLES);
      return true;
    }

    if (!hasColumnarHistory) {
      // Defensive recovery for a typed canonical timeline whose compatibility
      // owner has not yet been materialized.
      this.state.compatibilityCandles = [bar];
      this.state.compatibilityRevision = -1;
    }
    return false;
  }

  private replayBufferedTicks(ticks: readonly NormalizedMarketTick[]): void {
    if (!ticks.length) return;
    // The state machine drains in exchange-time order and resets its ordering
    // watermark, so the accepted post-history deltas can rebuild the forming bar.
    this.state.lastAcceptedTradeTimestampMs = undefined;
    for (const tick of ticks) this.handleTick(tick, true);
    this.state.lastAcceptedTradeTimestampMs = this.liveCandle.lastAcceptedTimestampMs;
  }

  private onTick = (tick: NormalizedMarketTick): void => this.handleTick(tick, false);

  private rememberLatestTick(tick: NormalizedMarketTick, tradeTimeMs?: number): boolean {
    const previousTimeMs = this.state.latestTick
      ? liveTradeTimestampMs(this.state.latestTick)
      : undefined;
    if (tradeTimeMs != null && previousTimeMs != null && tradeTimeMs < previousTimeMs) return false;
    this.state.latestTick = tick;
    return true;
  }

  private handleTick(tick: NormalizedMarketTick, replaying: boolean): void {
    if (String(tick.instrumentKey || '') !== String(this.instrumentKey)) return;

    const price = Number(tick.ltp);
    const tradeTimeMs = liveTradeTimestampMs(tick);
    const hasHistory = this.state.historyReady && this.canonicalPlane.length > 0;
    const lifecyclePending = !this.state.historyReady
      || this.state.historyLoading
      || this.state.recoveryPending
      || this.state.recoveryInFlight;

    if (!replaying && lifecyclePending) this.liveCandle.bufferTick(tick);

    // A quote may update the header while history is cold/recovering, but it must
    // never become a candle until a canonical historical baseline is available.
    if (!hasHistory || (!replaying && (this.state.historyLoading || this.state.recoveryPending || this.state.recoveryInFlight))) {
      if (Number.isFinite(price) && this.rememberLatestTick(tick, tradeTimeMs)) {
        this.emit({ type: 'quote', snapshot: this.snapshot() });
      }
      return;
    }
    if (!Number.isFinite(price) || tradeTimeMs == null) {
      if (this.rememberLatestTick(tick, tradeTimeMs)) this.emit({ type: 'quote', snapshot: this.snapshot() });
      return;
    }

    const computeStartedAt = globalThis.performance?.now?.() ?? Date.now();
    chartPerformanceTelemetry.recordPacket(this.key);
    const view = this.canonicalPlane.read();
    const index = view.length - 1;
    const latest: HistoricalCandle | undefined = index < 0 ? undefined : {
      timestamp: new Date(Number(view.time[index]) * 1000).toISOString(),
      open: Number(view.open[index]),
      high: Number(view.high[index]),
      low: Number(view.low[index]),
      close: Number(view.close[index]),
      volume: Number(view.volume[index]) || 0,
    };
    const transition = this.liveCandle.transition(
      tick,
      latest,
      CHART_TIMEFRAME_SECONDS[this.timeframe] || 300,
    );
    chartPerformanceTelemetry.recordCompute(
      this.key,
      Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - computeStartedAt),
      this.state.revision + 1,
    );
    this.state.lastAcceptedTradeTimestampMs = this.liveCandle.lastAcceptedTimestampMs;

    if (transition.kind === 'out-of-order') return;
    if (transition.kind === 'invalid') {
      if (this.rememberLatestTick(tick, tradeTimeMs)) this.emit({ type: 'quote', snapshot: this.snapshot() });
      return;
    }
    if (!transition.accepted || !transition.changed || !transition.bar) {
      if (this.rememberLatestTick(tick, tradeTimeMs)) this.emit({ type: 'quote', snapshot: this.snapshot() });
      return;
    }

    const bar = transition.bar;
    const canonicalPoint = {
      time: Math.floor(Date.parse(bar.timestamp) / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: Number(bar.volume) || 0,
    };
    if (transition.bucketChanged || this.canonicalPlane.length === 0) this.canonicalPlane.market.append(canonicalPoint);
    else this.canonicalPlane.market.updateLast(canonicalPoint);

    const previousRevision = this.state.revision;
    const wasColumnar = Boolean(this.state.columns);
    this.rememberLatestTick(tick, tradeTimeMs);
    const fullCompatibility = this.updateCompatibilityTail(bar, transition.bucketChanged, previousRevision);

    if (wasColumnar) {
      this.state.columns = this.columnarSnapshot();
      this.state.candles = [];
    } else {
      this.state.columns = undefined;
      if (this.state.candles.length > 0) this.state.compatibilityCandles = this.state.candles;
    }

    this.state.revision += 1;
    this.state.compatibilityRevision = fullCompatibility ? this.state.revision : -1;
    if (!transition.bucketChanged) chartPerformanceTelemetry.recordFormingBarReplaceLast(this.key);
    marketDataGraph.updateBaseLast(this.instrumentKey, this.timeframe, bar);
    historyStore.upsertLatest(
      this.brokerId,
      this.instrumentKey,
      CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe,
      bar,
    );
    this.emit({
      type: 'tick',
      bucketChanged: transition.bucketChanged,
      transition: transition.kind,
      snapshot: this.snapshot(),
    });
  }

  private onFeedStatus(status: MarketFeedStatus): void {
    const previous = this.state.feedStatus;
    if (previous === status) return;
    this.state.feedStatus = status;
    if (previous === 'connected' && status !== 'connected') this.state.recoveryPending = true;
    if (status === 'connected' && this.state.recoveryPending) this.maybeRecoverAfterReconnect();
    this.emit({
      type: 'status',
      status: status === 'connected' && !this.state.recoveryPending && !this.state.recoveryInFlight ? 'ready' : 'loading',
      snapshot: this.snapshot(),
    });
  }

  private maybeRecoverAfterReconnect(): void {
    if (!this.state.recoveryPending || this.state.recoveryInFlight || this.disposed) return;
    if (this.state.consumers <= 0 || this.state.feedStatus !== 'connected') return;
    if (this.state.recoveryRetryTimer) return;
    if (!this.state.historyReady || this.state.historyLoading || this.canonicalPlane.length === 0) return;

    // A flapping socket must not turn every reconnect into another history request.
    // Keep the recovery pending and retry once the bounded cooldown expires.
    const retryDelay = Math.max(0, 5_000 - (Date.now() - this.state.lastRecoveryAt));
    if (this.state.lastRecoveryAt > 0 && retryDelay > 0) {
      this.state.recoveryRetryTimer = setTimeout(() => {
        this.state.recoveryRetryTimer = undefined;
        this.maybeRecoverAfterReconnect();
      }, retryDelay);
      return;
    }

    this.state.recoveryPending = false;
    this.state.recoveryInFlight = true;
    this.state.lastRecoveryAt = Date.now();
    const generation = this.liveCandle.beginHistoryLoad('recovery');
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    const requested = Math.max(100, Math.min(500, initialHistoryCandles(this.timeframe)));
    this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });

    void tradingCoreRuntime.getHistoricalDataColumns(this.instrumentKey, interval, undefined, requested)
      .then(columns => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) return;
        const correctedBars = columns?.time.length ? this.reconcileRecentColumnarHistory(columns) : 0;
        const pending = this.liveCandle.drainPendingTicks(generation);
        this.state.recoveryInFlight = false;
        this.state.historyReady = this.canonicalPlane.length > 0;
        this.state.lastAcceptedTradeTimestampMs = undefined;
        this.replayBufferedTicks(pending);
        this.emit({ type: 'snapshot', reason: 'recovery', correctedBars, snapshot: this.snapshot() });
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      })
      .catch(() => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) return;
        const pending = this.liveCandle.drainPendingTicks(generation);
        this.state.recoveryInFlight = false;
        this.state.lastAcceptedTradeTimestampMs = undefined;
        this.replayBufferedTicks(pending);
        // Keep the last valid canonical snapshot. Reconnect recovery failure must
        // not blank the chart or replace it with an LTP-only candle.
        this.emit({ type: 'snapshot', reason: 'recovery', correctedBars: 0, snapshot: this.snapshot() });
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      })
      .finally(() => {
        if (this.liveCandle.isCurrentGeneration(generation)) this.state.recoveryInFlight = false;
      });
  }

  /** Reconcile recent broker corrections directly into canonical columns, preserving the live tail. */
  private reconcileRecentColumnarHistory(columns: {
    time: ArrayLike<number>;
    open: ArrayLike<number>;
    high: ArrayLike<number>;
    low: ArrayLike<number>;
    close: ArrayLike<number>;
    volume: ArrayLike<number>;
    timeUnit?: 'milliseconds' | 'seconds';
  }): number {
    const incoming = normalizeHistory(columnarHistoryToCandles(columns, 500));
    if (!incoming.length) return 0;

    const before = this.canonicalPlane.revision;
    const view = this.canonicalPlane.read();
    const tailIndex = view.length - 1;
    const tailTimeSeconds = tailIndex >= 0 ? Number(view.time[tailIndex]) : Number.NaN;
    let correctedBars = 0;
    const reconciled = incoming.map(row => {
      const timestampSeconds = Math.floor(Date.parse(row.timestamp) / 1000);
      let lo = 0, hi = view.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (Number(view.time[mid]) < timestampSeconds) lo = mid + 1;
        else hi = mid;
      }
      if (lo >= view.length || Number(view.time[lo]) !== timestampSeconds) {
        // Backfill may recover bars entirely missed during a websocket outage,
        // not just corrections to timestamps already present in the chart.
        correctedBars += 1;
        return row;
      }

      const isTail = lo === tailIndex && timestampSeconds === tailTimeSeconds;
      const old = {
        open: Number(view.open[lo]), high: Number(view.high[lo]), low: Number(view.low[lo]),
        close: Number(view.close[lo]), volume: Number(view.volume[lo]) || 0,
      };
      if (isTail) {
        return {
          ...row,
          open: old.open,
          high: Math.max(old.high, row.high),
          low: Math.min(old.low, row.low),
          close: old.close,
          volume: Math.max(old.volume, row.volume),
        };
      }
      if (old.open !== row.open || old.high !== row.high || old.low !== row.low
        || old.close !== row.close || old.volume !== row.volume) correctedBars += 1;
      return row;
    });

    this.canonicalPlane.reconcileHistoricalCandleRows(reconciled);
    if (this.canonicalPlane.revision === before) return 0;

    this.state.columns = this.columnarSnapshot();
    this.state.candles = [];
    this.state.compatibilityCandles = [];
    this.state.compatibilityRevision = -1;
    this.state.revision += 1;
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    historyStore.mergeInto(this.brokerId, this.instrumentKey, interval, reconciled, MAX_HISTORY_CANDLES);
    const latest = this.latestCanonicalCandle();
    if (latest) historyStore.upsertLatest(this.brokerId, this.instrumentKey, interval, latest);

    // Secondary-timeframe/CoreSpirit graph consumers have an object-row bridge.
    // Rebuild it once for a recovery revision, not on each live tick; immediately
    // discard the compatibility mirror so the canonical typed tape stays primary.
    const mirror = this.getCompatibilityCandles(MAX_HISTORY_CANDLES);
    marketDataGraph.syncBase(this.instrumentKey, this.timeframe, mirror);
    this.state.compatibilityCandles = [];
    this.state.compatibilityRevision = -1;
    return correctedBars;
  }

  private start(): void {
    if (this.state.idleTimer) { clearTimeout(this.state.idleTimer); this.state.idleTimer = undefined; }
    if (!this.state.marketStop) {
      const marketKey = chartMarketKey(this.brokerId, this.instrumentKey);
      const syncMarketSnapshot = () => {
        const marketSnapshot = chartMarketStore.getSnapshot(marketKey);
        const statusRevision = Number(marketSnapshot.statusRevision) || 0;
        // The shared store can be cleared/recreated when a broker session changes.
        // Accept a lower positive revision as a new status epoch instead of silently
        // ignoring every status from the replacement entry.
        if (
          marketSnapshot.status &&
          statusRevision > 0 &&
          (statusRevision !== this.state.marketStatusRevision || marketSnapshot.status !== this.state.feedStatus)
        ) {
          this.state.marketStatusRevision = statusRevision;
          this.onFeedStatus(marketSnapshot.status);
        }
        const tick = chartMarketStore.getTick(marketKey);
        if (tick) this.onTick(tick);
      };
      this.state.marketStop = chartMarketStore.subscribe(marketKey, syncMarketSnapshot);
      // Attach the listener before acquiring the socket so synchronous connection
      // status and the most recent tick cannot be lost during subscription setup.
      syncMarketSnapshot();
      this.state.feedStop = acquireSharedChartMarketFeed(this.brokerId, this.instrumentKey);
      if (this.state.recoveryPending) this.maybeRecoverAfterReconnect();
      const cachedTick = chartMarketStore.getTick(marketKey) ?? tradingCoreRuntime.getMarketSnapshot(this.instrumentKey);
      if (cachedTick) this.onTick(cachedTick);
    }
    // Do not start object history here. The chart runtime and Vela provider explicitly
    // call ensureReady(), which tries typed columnar data first and falls back only
    // when the compact endpoint is unsupported. This avoids a first-load race.
  }

  private stopAfterIdle(): void {
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer);
    this.state.idleTimer = setTimeout(() => {
      if (this.state.consumers > 0) return;
      if (this.state.recoveryRetryTimer) clearTimeout(this.state.recoveryRetryTimer);
      this.state.recoveryRetryTimer = undefined;
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
    const currentRows = this.state.candles.length
      ? this.state.candles
      : this.getCompatibilityCandles(MAX_HISTORY_CANDLES);
    const previousLength = currentRows.length;
    const merged = normalizeHistory([...rows, ...currentRows]);
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

  /**
   * Compatibility entry point retained for Vela call sites. Always try the typed
   * columnar path first; the shared loader falls back to object candles only when
   * the provider cannot serve columns.
   */
  ensureReadyHistory(limitOverride?: number): Promise<HistoricalCandle[]> {
    return this.ensureReady(limitOverride);
  }

  /**
   * Warm a rarely-used dataset without competing with a selected chart. If the user
   * selects it while queued, the foreground request promotes this same single-flight.
   */
  prewarmHistory(limitOverride?: number): Promise<void> {
    if (this.state.historyPromise || this.state.historyReady) return Promise.resolve();
    const interval = CHART_TIMEFRAME_INTERVALS[this.timeframe] || this.timeframe;
    const baseLimit = initialHistoryCandles(this.timeframe);
    const requestedLimit = Number.isFinite(Number(limitOverride))
      ? Math.max(baseLimit, Math.min(5000, Math.floor(Number(limitOverride))))
      : baseLimit;
    if (historyStore.get(this.brokerId, this.instrumentKey, interval)?.length) return Promise.resolve();

    const requestKey = `${this.key}:initial:${requestedLimit}`;
    return chartHistoryCoordinator.request(requestKey, async () => {
      const rows = await tradingCoreRuntime.getHistoricalData(this.instrumentKey, interval, undefined, requestedLimit);
      const normalized = normalizeHistory(rows);
      if (normalized.length) historyStore.set(this.brokerId, this.instrumentKey, interval, normalized, requestedLimit);
      return normalized;
    }, 'warm').then(() => undefined);
  }

  /** Cold-start columnar loader used by Vela's native renderer. Falls back to the ordinary broker path when unsupported. */
  async ensureReadyColumns(limitOverride?: number): Promise<HistoricalCandle[]> {
    if (this.state.historyPromise) return this.state.historyPromise;
    if (this.state.historyReady && (this.state.candles.length || this.state.columns?.time.length)) {
      if (!this.state.historyLoading && !this.state.recoveryPending && !this.state.recoveryInFlight && this.liveCandle.buffering) {
        this.activateCachedHistory();
      }
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
      this.state.historyReady = true;
      this.state.olderHistoryExhausted = false;
      this.setCandles(active, 'cache');
      this.activateCachedHistory();
      return this.state.candles;
    }
    const stale = historyStore.getStale(this.brokerId, this.instrumentKey, interval);
    if (stale?.length) {
      const active = this.activeWindow(stale, requestedLimit);
      this.state.historyReady = true;
      this.state.olderHistoryExhausted = false;
      this.setCandles(active, 'cache');
      this.activateCachedHistory();
      // SWR: stale candles paint immediately; network refresh proceeds in the same single-flight.
    }
    this.state.historyLoading = true;
    const generation = this.liveCandle.beginHistoryLoad('history');
    this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });
    const requestKey = `${this.key}:initial-columns:${requestedLimit}`;
    const historyStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalDataColumns(this.instrumentKey, interval, undefined, requestedLimit), 'initial')
      .then(columns => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) {
          return this.getCompatibilityCandles(requestedLimit);
        }
        if (!columns || columns.time.length === 0) {
          // Let the object-history fallback own its own generation. The outer
          // finally block is generation-guarded and cannot clear the new request.
          this.state.historyPromise = undefined;
          return this.ensureHistory(requestedLimit);
        }
        const active = this.setColumnarHistory(columns, requestedLimit, 'history');
        if (!active.length) throw new Error('No historical candles available');
        const buffered = this.liveCandle.drainPendingTicks(generation);
        this.state.lastAcceptedTradeTimestampMs = undefined;
        this.replayBufferedTicks(buffered);
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'initial', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), active.length);
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        return active;
      })
      .catch(error => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) {
          return this.getCompatibilityCandles(requestedLimit);
        }
        const message = String((error as any)?.message || error || 'Historical candles unavailable');
        this.liveCandle.failHistoryLoad(generation, true);
        this.emit({ type: 'status', status: 'error', error: message, snapshot: this.snapshot() });
        throw error;
      })
      .finally(() => {
        if (!this.liveCandle.isCurrentGeneration(generation)) return;
        this.state.historyLoading = false;
        this.state.historyPromise = undefined;
        if (this.state.historyReady) this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        if (this.state.recoveryPending && this.state.feedStatus === 'connected') this.maybeRecoverAfterReconnect();
      });
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
      if (!this.state.historyReady || this.state.candles.length < active.length || !this.canonicalPlane.length) {
        this.state.olderHistoryExhausted = false;
        this.setCandles(active, 'cache');
      }
      this.state.historyReady = this.canonicalPlane.length > 0;
      if (this.state.historyReady) {
        this.activateCachedHistory();
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      }
      return this.state.candles.length ? this.state.candles : active;
    }
    if (stale?.length && !this.state.candles.length) {
      this.state.olderHistoryExhausted = false;
      this.setCandles(this.activeWindow(stale, requestedLimit), 'cache');
      this.state.historyReady = this.canonicalPlane.length > 0;
      if (this.state.historyReady) this.activateCachedHistory();
    }

    this.state.historyLoading = true;
    const generation = this.liveCandle.beginHistoryLoad('history');
    this.emit({ type: 'status', status: 'loading', snapshot: this.snapshot() });
    const requestKey = `${this.key}:initial:${initialLimit}`;
    const historyStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalData(this.instrumentKey, interval, undefined, initialLimit), 'initial')
      .then(rows => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) {
          return this.getCompatibilityCandles(initialLimit);
        }
        const normalized = normalizeHistory(rows);
        if (!normalized.length) throw new Error('No historical candles available');
        historyStore.set(this.brokerId, this.instrumentKey, interval, normalized, Math.min(MAX_HISTORY_CANDLES, Math.max(initialLimit, normalized.length)));
        this.state.lastHistoryLoadAt = Date.now();
        this.state.olderHistoryExhausted = false;
        const active = this.activeWindow(normalized);
        this.setCandles(active, 'history');
        this.state.historyReady = this.canonicalPlane.length > 0;
        const buffered = this.liveCandle.drainPendingTicks(generation);
        this.state.lastAcceptedTradeTimestampMs = undefined;
        this.replayBufferedTicks(buffered);
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'initial', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), active.length);
        this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        return active;
      })
      .catch(error => {
        if (this.disposed || !this.liveCandle.isCurrentGeneration(generation)) {
          return this.getCompatibilityCandles(initialLimit);
        }
        const message = String((error as any)?.message || error || 'Historical candles unavailable');
        if (this.state.historyReady && this.canonicalPlane.length > 0) {
          const buffered = this.liveCandle.drainPendingTicks(generation);
          this.state.lastAcceptedTradeTimestampMs = undefined;
          this.replayBufferedTicks(buffered);
          this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
          return this.state.candles.length ? this.state.candles : this.getCompatibilityCandles(initialLimit);
        }
        this.state.historyReady = false;
        this.liveCandle.failHistoryLoad(generation, true);
        this.emit({ type: 'status', status: 'error', error: message, snapshot: this.snapshot() });
        throw error;
      })
      .finally(() => {
        if (!this.liveCandle.isCurrentGeneration(generation)) return;
        this.state.historyLoading = false;
        this.state.historyPromise = undefined;
        if (this.state.historyReady) this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
        if (this.state.recoveryPending && this.state.feedStatus === 'connected') this.maybeRecoverAfterReconnect();
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
    const currentRows = this.state.candles.length
      ? this.state.candles
      : this.getCompatibilityCandles(MAX_HISTORY_CANDLES);
    if (this.state.olderHistoryPromise) {
      if (priority === 'visible' && this.state.olderHistoryPriority === 'warm' && this.state.olderHistoryRequestKey) {
        chartHistoryCoordinator.promote(this.state.olderHistoryRequestKey, 'visible');
        this.state.olderHistoryPriority = 'visible';
      }
      return this.state.olderHistoryPromise;
    }
    if (!this.state.historyReady || this.state.olderHistoryExhausted || currentRows.length >= MAX_HISTORY_CANDLES) {
      return currentRows;
    }
    const oldest = currentRows[0];
    if (!oldest?.timestamp) return currentRows;
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
    this.state.olderHistoryRequestKey = requestKey;
    this.state.olderHistoryPriority = priority;
    const promise = chartHistoryCoordinator.request(requestKey, () => tradingCoreRuntime.getHistoricalDataBefore(this.instrumentKey, interval, oldest.timestamp, limit), priority)
      .then(rows => {
        const older = normalizeHistory(rows).filter(row => Date.parse(row.timestamp) < Date.parse(oldest.timestamp));
        if (!older.length) { this.state.olderHistoryExhausted = true; return currentRows; }
        historyStore.mergeInto(this.brokerId, this.instrumentKey, interval, older, MAX_HISTORY_CANDLES);
        this.state.olderHistoryExhausted = false;
        const merged = this.mergeOlder(older, 'older-history', limit);
        chartPerformanceTelemetry.recordHistoryLoad(this.key, 'older', Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - historyStartedAt), older.length);
        return merged;
      })
      .finally(() => {
        this.state.olderHistoryLoading = false;
        this.state.olderHistoryPromise = undefined;
        if (this.state.olderHistoryRequestKey === requestKey) {
          this.state.olderHistoryRequestKey = undefined;
          this.state.olderHistoryPriority = undefined;
        }
        if (priority === 'visible' || this.state.historyReady) this.emit({ type: 'status', status: 'ready', snapshot: this.snapshot() });
      });
    this.state.olderHistoryPromise = promise;
    return promise;
  }

  requestWarmHistory(visibleBars?: number): void {
    const retainedLength = this.state.candles.length || this.state.columns?.time.length || this.state.compatibilityCandles.length;
    if (this.state.warmHistoryRequested || !this.state.historyReady || this.state.olderHistoryExhausted || retainedLength >= historyWarmTarget(this.timeframe)) return;
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
    if (this.state.recoveryRetryTimer) clearTimeout(this.state.recoveryRetryTimer);
    this.state.recoveryRetryTimer = undefined;
    this.disposed = true;
    // Invalidate every in-flight load/recovery before tearing down subscriptions.
    this.liveCandle.beginHistoryLoad('recovery');
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
