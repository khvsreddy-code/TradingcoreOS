import type { MarketFeedStatus, NormalizedMarketTick } from '../../types/market';
import { chartPerformanceTelemetry } from './chartPerformanceTelemetry';
import { TickRingBuffer } from './TickRingBuffer';

export type ChartMarketKey = string;
export type ChartMarketSnapshot = {
  tick?: NormalizedMarketTick;
  revision: number;
  marketSequence: number;
  status?: MarketFeedStatus;
  statusRevision?: number;
};

type Listener = () => void;

const DEFAULT_TICK_RING_SIZE = 8192;
export const MAX_CHART_MARKET_STORE_ENTRIES = 64;
const MAX_IDLE_MARKET_ENTRY_MS = 10 * 60_000;

type Entry = ChartMarketSnapshot & {
  snapshot: ChartMarketSnapshot;
  tickRing: TickRingBuffer;
  reactNotifyScheduled: boolean;
  lastUsedAt: number;
};

const EMPTY_SNAPSHOT: ChartMarketSnapshot = { revision: 0, marketSequence: 0, statusRevision: 0 };

class ChartMarketStore {
  private entries = new Map<ChartMarketKey, Entry>();
  private listeners = new Map<ChartMarketKey, Set<Listener>>();
  private reactListeners = new Map<ChartMarketKey, Set<Listener>>();

  publish(key: ChartMarketKey, tick: NormalizedMarketTick): void {
    chartPerformanceTelemetry.recordPacket(key);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        tick,
        revision: 0,
        marketSequence: 0,
        statusRevision: 0,
        snapshot: { tick, revision: 0, marketSequence: 0, statusRevision: 0 },
        tickRing: new TickRingBuffer(DEFAULT_TICK_RING_SIZE, key),
        reactNotifyScheduled: false,
        lastUsedAt: Date.now(),
      };
      this.entries.set(key, entry);
    }
    this.touchEntry(key, entry);
    entry.tick = tick;
    entry.revision += 1;
    entry.marketSequence = entry.tickRing.push(tick);
    entry.snapshot = { tick, revision: entry.revision, marketSequence: entry.marketSequence, status: entry.status, statusRevision: entry.statusRevision ?? 0 };

    this.listeners.get(key)?.forEach(listener => listener());
    if (this.reactListeners.get(key)?.size) chartPerformanceTelemetry.recordReactNotificationRequest(key);
    this.scheduleReactNotification(key, entry);
    this.trim();
  }

  /** Publish transport lifecycle separately from tick revisions. Status edges are never inferred from quote silence. */
  publishStatus(key: ChartMarketKey, status: MarketFeedStatus): void {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        revision: 0,
        marketSequence: 0,
        statusRevision: 0,
        tickRing: new TickRingBuffer(DEFAULT_TICK_RING_SIZE, key),
        reactNotifyScheduled: false,
        lastUsedAt: Date.now(),
        snapshot: { revision: 0, marketSequence: 0, statusRevision: 0 },
      };
      this.entries.set(key, entry);
    }
    this.touchEntry(key, entry);
    if (entry.status === status) return;
    entry.status = status;
    entry.statusRevision = (entry.statusRevision ?? 0) + 1;
    entry.snapshot = {
      tick: entry.tick,
      revision: entry.revision,
      marketSequence: entry.marketSequence,
      status,
      statusRevision: entry.statusRevision,
    };
    this.listeners.get(key)?.forEach(listener => listener());
    if (this.reactListeners.get(key)?.size) chartPerformanceTelemetry.recordReactNotificationRequest(key);
    this.scheduleReactNotification(key, entry);
    this.trim();
  }

  clear(key?: ChartMarketKey): void {
    if (key == null) { this.entries.clear(); chartPerformanceTelemetry.reset(); }
    else { this.entries.delete(key); chartPerformanceTelemetry.reset(key); }
  }

  getSnapshot(key: ChartMarketKey): ChartMarketSnapshot {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry ? entry.snapshot : EMPTY_SNAPSHOT;
  }

  getTick(key: ChartMarketKey): NormalizedMarketTick | undefined {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry?.tick;
  }

  getSequence(key: ChartMarketKey): number {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry?.marketSequence || 0;
  }

  forEachTickSince(key: ChartMarketKey, sequenceExclusive: number, visitor: Parameters<TickRingBuffer['forEachSince']>[1]): number {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry?.tickRing.forEachSince(sequenceExclusive, visitor) || 0;
  }

  getRecentTicks(key: ChartMarketKey): NormalizedMarketTick[] {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry?.tickRing.toArray() || [];
  }

  getRevision(key: ChartMarketKey): number {
    const entry = this.entries.get(key);
    if (entry) this.touchEntry(key, entry);
    return entry?.revision || 0;
  }

  getPerformanceSnapshot(key: ChartMarketKey) {
    return chartPerformanceTelemetry.snapshot(key);
  }

  subscribe(key: ChartMarketKey, listener: Listener): () => void {
    return this.addListener(this.listeners, key, listener);
  }

  subscribeSnapshot(key: ChartMarketKey, listener: Listener): () => void {
    return this.addListener(this.reactListeners, key, listener);
  }

  /** Remove an unused ring; active chart/React consumers pin their instrument key. */
  evictIfUnused(key: ChartMarketKey): boolean {
    if ((this.listeners.get(key)?.size ?? 0) > 0 || (this.reactListeners.get(key)?.size ?? 0) > 0) return false;
    const removed = this.entries.delete(key);
    if (removed) chartPerformanceTelemetry.reset(key);
    return removed;
  }

  trim(now = Date.now()): number {
    const candidates = [...this.entries.entries()]
      .filter(([key]) => (this.listeners.get(key)?.size ?? 0) === 0 && (this.reactListeners.get(key)?.size ?? 0) === 0)
      .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    let removed = 0;
    for (const [key, entry] of candidates) {
      const expired = now - entry.lastUsedAt >= MAX_IDLE_MARKET_ENTRY_MS;
      if (!expired && this.entries.size <= MAX_CHART_MARKET_STORE_ENTRIES) break;
      if (this.entries.get(key) === entry && this.evictIfUnused(key)) removed += 1;
    }
    return removed;
  }

  stats(): Readonly<{ entries: number; activeEntries: number; estimatedBytes: number; maxEntries: number }> {
    let activeEntries = 0;
    let estimatedBytes = 0;
    for (const [key, entry] of this.entries) {
      if ((this.listeners.get(key)?.size ?? 0) > 0 || (this.reactListeners.get(key)?.size ?? 0) > 0) activeEntries += 1;
      estimatedBytes += entry.tickRing.estimatedBytes;
    }
    return Object.freeze({ entries: this.entries.size, activeEntries, estimatedBytes, maxEntries: MAX_CHART_MARKET_STORE_ENTRIES });
  }

  private touchEntry(key: ChartMarketKey, entry: Entry): void {
    entry.lastUsedAt = Date.now();
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private addListener(registry: Map<ChartMarketKey, Set<Listener>>, key: ChartMarketKey, listener: Listener): () => void {
    let bucket = registry.get(key);
    if (!bucket) {
      bucket = new Set();
      registry.set(key, bucket);
    }
    bucket.add(listener);
    return () => {
      const current = registry.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) registry.delete(key);
      this.trim();
    };
  }

  private scheduleReactNotification(key: ChartMarketKey, entry: Entry): void {
    if (entry.reactNotifyScheduled) return;
    entry.reactNotifyScheduled = true;
    const flush = () => {
      entry.reactNotifyScheduled = false;
      chartPerformanceTelemetry.recordReactFrame(key);
      this.reactListeners.get(key)?.forEach(listener => listener());
    };
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(() => flush());
    else Promise.resolve().then(flush);
  }
}

export const chartMarketStore = new ChartMarketStore();

export const chartMarketKey = (brokerId: string, instrumentKey: string): ChartMarketKey =>
  `${String(brokerId || 'unknown').toLowerCase()}:${String(instrumentKey || '')}`;
