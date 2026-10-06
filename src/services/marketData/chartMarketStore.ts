import type { NormalizedMarketTick } from '../../types/market';
import { chartPerformanceTelemetry } from './chartPerformanceTelemetry';
import { TickRingBuffer } from './TickRingBuffer';

export type ChartMarketKey = string;
export type ChartMarketSnapshot = {
  tick?: NormalizedMarketTick;
  revision: number;
  marketSequence: number;
};

type Listener = () => void;

const DEFAULT_TICK_RING_SIZE = 8192;

type Entry = ChartMarketSnapshot & {
  snapshot: ChartMarketSnapshot;
  tickRing: TickRingBuffer;
  reactNotifyScheduled: boolean;
};

const EMPTY_SNAPSHOT: ChartMarketSnapshot = { revision: 0, marketSequence: 0 };

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
        snapshot: { tick, revision: 0, marketSequence: 0 },
        tickRing: new TickRingBuffer(DEFAULT_TICK_RING_SIZE),
        reactNotifyScheduled: false,
      };
      this.entries.set(key, entry);
    }
    entry.tick = tick;
    entry.revision += 1;
    entry.marketSequence = entry.tickRing.push(tick);
    entry.snapshot = { tick, revision: entry.revision, marketSequence: entry.marketSequence };

    this.listeners.get(key)?.forEach(listener => listener());
    if (this.reactListeners.get(key)?.size) chartPerformanceTelemetry.recordReactNotificationRequest(key);
    this.scheduleReactNotification(key, entry);
  }

  clear(key?: ChartMarketKey): void {
    if (key == null) { this.entries.clear(); chartPerformanceTelemetry.reset(); }
    else { this.entries.delete(key); chartPerformanceTelemetry.reset(key); }
  }

  getSnapshot(key: ChartMarketKey): ChartMarketSnapshot {
    const entry = this.entries.get(key);
    return entry ? entry.snapshot : EMPTY_SNAPSHOT;
  }

  getTick(key: ChartMarketKey): NormalizedMarketTick | undefined {
    return this.entries.get(key)?.tick;
  }

  getSequence(key: ChartMarketKey): number {
    return this.entries.get(key)?.marketSequence || 0;
  }

  forEachTickSince(key: ChartMarketKey, sequenceExclusive: number, visitor: Parameters<TickRingBuffer['forEachSince']>[1]): number {
    return this.entries.get(key)?.tickRing.forEachSince(sequenceExclusive, visitor) || 0;
  }

  getRecentTicks(key: ChartMarketKey): NormalizedMarketTick[] {
    return this.entries.get(key)?.tickRing.toArray() || [];
  }

  getRevision(key: ChartMarketKey): number {
    return this.entries.get(key)?.revision || 0;
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
