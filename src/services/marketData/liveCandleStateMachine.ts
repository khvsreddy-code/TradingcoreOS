import type { HistoricalCandle } from './chartDataPlane';
import type { NormalizedMarketTick } from '../../types/market';

export type LiveCandlePhase = 'idle' | 'loading-history' | 'ready' | 'recovering';
export type LiveCandleTransitionKind =
  | 'invalid'
  | 'duplicate'
  | 'out-of-order'
  | 'forming-bar-update'
  | 'new-bar'
  | 'session-boundary';

export type LiveCandleTransition = Readonly<{
  kind: LiveCandleTransitionKind;
  accepted: boolean;
  changed: boolean;
  bucketChanged: boolean;
  timestampMs?: number;
  bar?: HistoricalCandle;
}>;

const MAX_PENDING_TICKS = 4096;
const MAX_SEEN_TICKS = 8192;

export function liveTradeTimestampMs(tick: NormalizedMarketTick): number | undefined {
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
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}

function tickIdentity(tick: NormalizedMarketTick, timestampMs: number): string {
  const sequence = Number(tick.sequence);
  if (Number.isSafeInteger(sequence) && sequence >= 0) {
    return `${tick.instrumentKey}|seq:${sequence}|${timestampMs}|${String(tick.ltp)}`;
  }
  return [
    tick.instrumentKey,
    timestampMs,
    Number(tick.ltp),
    Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : '',
    Number.isFinite(Number(tick.oi)) ? Number(tick.oi) : '',
  ].join('|');
}

function compareTicks(a: NormalizedMarketTick, b: NormalizedMarketTick): number {
  const aTime = liveTradeTimestampMs(a) ?? 0;
  const bTime = liveTradeTimestampMs(b) ?? 0;
  if (aTime !== bTime) return aTime - bTime;
  const aSequence = Number(a.sequence);
  const bSequence = Number(b.sequence);
  return (Number.isSafeInteger(aSequence) ? aSequence : 0)
    - (Number.isSafeInteger(bSequence) ? bSequence : 0);
}

/**
 * Dataset-scoped live-candle lifecycle.
 *
 * It is the gate for history generations, pre-history/recovery tick buffering,
 * event idempotency, exchange-time ordering, and the forming-bar/new-bar decision.
 * Actual numeric storage remains owned by CanonicalDataPlane; this class emits the
 * exact replacement/append decision for that single canonical dataset.
 */
export class LiveCandleStateMachine {
  private phaseValue: LiveCandlePhase = 'idle';
  private historyGenerationValue = 0;
  private readonly pendingTicks: NormalizedMarketTick[] = [];
  private readonly pendingIdentities = new Set<string>();
  private readonly seenIdentities = new Map<string, true>();
  private lastAcceptedTradeTimestampMs?: number;

  constructor(
    readonly instrumentKey: string,
    readonly timeframe: string,
  ) {}

  get phase(): LiveCandlePhase { return this.phaseValue; }
  get generation(): number { return this.historyGenerationValue; }
  get lastAcceptedTimestampMs(): number | undefined { return this.lastAcceptedTradeTimestampMs; }
  get pendingCount(): number { return this.pendingTicks.length; }
  get buffering(): boolean { return this.phaseValue !== 'ready'; }

  beginHistoryLoad(kind: 'history' | 'recovery' = 'history'): number {
    this.historyGenerationValue += 1;
    this.phaseValue = kind === 'recovery' ? 'recovering' : 'loading-history';
    return this.historyGenerationValue;
  }

  isCurrentGeneration(generation: number): boolean {
    return generation === this.historyGenerationValue;
  }

  /** Mark a cached, already-normalized dataset usable without starting a request. */
  activateCachedHistory(): { generation: number; ticks: NormalizedMarketTick[] } {
    this.historyGenerationValue += 1;
    return { generation: this.historyGenerationValue, ticks: this.takePendingTicks() };
  }

  /** Buffer only genuine exchange-time trades, never receive-time-only quote packets. */
  bufferTick(tick: NormalizedMarketTick): boolean {
    if (String(tick.instrumentKey || '') !== this.instrumentKey) return false;
    const timestampMs = liveTradeTimestampMs(tick);
    const price = Number(tick.ltp);
    if (timestampMs == null || !Number.isFinite(price)) return false;
    const identity = tickIdentity(tick, timestampMs);
    if (this.pendingIdentities.has(identity)) return false;
    if (this.pendingTicks.length >= MAX_PENDING_TICKS) {
      const removed = this.pendingTicks.shift();
      if (removed) {
        const removedTime = liveTradeTimestampMs(removed);
        if (removedTime != null) this.pendingIdentities.delete(tickIdentity(removed, removedTime));
      }
    }
    this.pendingTicks.push({ ...tick });
    this.pendingIdentities.add(identity);
    return true;
  }

  /** Reject stale async responses and return buffered deltas in exchange-time order. */
  drainPendingTicks(generation: number): NormalizedMarketTick[] {
    if (!this.isCurrentGeneration(generation)) return [];
    this.phaseValue = 'ready';
    this.lastAcceptedTradeTimestampMs = undefined;
    this.seenIdentities.clear();
    return this.takePendingTicks();
  }

  /** Leave queued ticks intact when no usable historical baseline could be recovered. */
  failHistoryLoad(generation: number, keepPending = true): void {
    if (!this.isCurrentGeneration(generation)) return;
    this.phaseValue = keepPending ? 'idle' : 'ready';
    this.seenIdentities.clear();
    this.lastAcceptedTradeTimestampMs = undefined;
    if (!keepPending) this.takePendingTicks();
  }

  private takePendingTicks(): NormalizedMarketTick[] {
    const pending = this.pendingTicks.splice(0).sort(compareTicks);
    this.pendingIdentities.clear();
    return pending;
  }

  private remember(identity: string): void {
    this.seenIdentities.delete(identity);
    this.seenIdentities.set(identity, true);
    while (this.seenIdentities.size > MAX_SEEN_TICKS) {
      const oldest = this.seenIdentities.keys().next().value;
      if (oldest == null) break;
      this.seenIdentities.delete(oldest);
    }
  }

  transition(
    tick: NormalizedMarketTick,
    latest: HistoricalCandle | undefined,
    intervalSeconds: number,
  ): LiveCandleTransition {
    const timestampMs = liveTradeTimestampMs(tick);
    const price = Number(tick.ltp);
    if (
      timestampMs == null ||
      !Number.isFinite(price) ||
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds <= 0 ||
      String(tick.instrumentKey || '') !== this.instrumentKey
    ) {
      return { kind: 'invalid', accepted: false, changed: false, bucketChanged: false };
    }

    const identity = tickIdentity(tick, timestampMs);
    if (this.seenIdentities.has(identity)) {
      return { kind: 'duplicate', accepted: false, changed: false, bucketChanged: false, timestampMs };
    }
    this.remember(identity);

    const lastTimeSeconds = latest ? Date.parse(String(latest.timestamp)) / 1000 : Number.NaN;
    if (Number.isFinite(lastTimeSeconds) && timestampMs < lastTimeSeconds * 1000) {
      return { kind: 'out-of-order', accepted: false, changed: false, bucketChanged: false, timestampMs };
    }
    if (this.lastAcceptedTradeTimestampMs != null && timestampMs < this.lastAcceptedTradeTimestampMs) {
      return { kind: 'out-of-order', accepted: false, changed: false, bucketChanged: false, timestampMs };
    }

    const lastPrice = Number(latest?.close);
    const lastHigh = Number(latest?.high);
    const lastLow = Number(latest?.low);
    const lastVolume = Number(latest?.volume) || 0;
    const lastOpen = Number(latest?.open);
    const anchorSeconds = Number.isFinite(lastTimeSeconds)
      ? ((lastTimeSeconds % intervalSeconds) + intervalSeconds) % intervalSeconds
      : 0;
    const tradeSeconds = timestampMs / 1000;
    const bucketTime = Math.floor((tradeSeconds - anchorSeconds) / intervalSeconds) * intervalSeconds + anchorSeconds;

    if (Number.isFinite(lastTimeSeconds) && bucketTime < lastTimeSeconds) {
      return { kind: 'out-of-order', accepted: false, changed: false, bucketChanged: false, timestampMs };
    }

    const bucketChanged = !Number.isFinite(lastTimeSeconds) || bucketTime > lastTimeSeconds;
    let kind: LiveCandleTransitionKind;
    let bar: HistoricalCandle;
    if (!Number.isFinite(lastTimeSeconds) || !latest) {
      kind = 'new-bar';
      bar = {
        timestamp: new Date(bucketTime * 1000).toISOString(),
        open: price, high: price, low: price, close: price, volume: 0,
      };
    } else if (bucketTime === lastTimeSeconds) {
      const high = Math.max(lastHigh, price);
      const low = Math.min(lastLow, price);
      bar = {
        timestamp: new Date(lastTimeSeconds * 1000).toISOString(),
        open: lastOpen,
        high,
        low,
        close: price,
        volume: lastVolume,
      };
      kind = price === lastPrice && high === lastHigh && low === lastLow
        ? 'duplicate'
        : 'forming-bar-update';
    } else {
      const gap = bucketTime - lastTimeSeconds;
      kind = gap > intervalSeconds ? 'session-boundary' : 'new-bar';
      bar = {
        timestamp: new Date(bucketTime * 1000).toISOString(),
        open: price, high: price, low: price, close: price, volume: 0,
      };
    }

    this.lastAcceptedTradeTimestampMs = timestampMs;
    const changed = bucketChanged || !latest
      || bar.open !== lastOpen || bar.high !== lastHigh || bar.low !== lastLow
      || bar.close !== lastPrice || bar.volume !== lastVolume;
    return { kind, accepted: true, changed, bucketChanged, timestampMs, bar };
  }
}
