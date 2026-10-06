import type { ChartDataPlane, ChartDataPlaneSnapshot } from './chartDataPlane';
import type { NormalizedMarketTick } from '../../types/market';

export type MarketDataStoreSnapshot = Readonly<{
  key: string;
  snapshot: ChartDataPlaneSnapshot;
}>;

type Listener = (event: { type: string; snapshot: ChartDataPlaneSnapshot; error?: string; olderAdded?: number }) => void;

type Entry = {
  plane: ChartDataPlane;
  snapshot: ChartDataPlaneSnapshot;
  listeners: Set<Listener>;
  uiListeners: Set<() => void>;
  uiScheduled: boolean;
  consumers: number;
};

/**
 * Broker/data-plane adapter for UI-free chart consumers.
 *
 * The canonical ChartDataPlane remains the source of truth. This registry only
 * adds a stable imperative subscription boundary so chart controllers never
 * subscribe directly from React components.
 */
class MarketDataStore {
  private entries = new Map<string, Entry>();

  attach(key: string, plane: ChartDataPlane): () => void {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        plane,
        snapshot: {
          key,
          brokerId: plane.brokerId,
          instrumentKey: plane.instrumentKey,
          timeframe: plane.timeframe,
          candles: [],
          latestTick: undefined,
          revision: 0,
          historyReady: false,
          historyLoading: false,
          olderHistoryLoading: false,
        },
        listeners: new Set(),
        uiListeners: new Set(),
        uiScheduled: false,
        consumers: 0,
      };
      this.entries.set(key, entry);
      const stop = plane.subscribe((event) => {
        entry!.snapshot = event.snapshot;
        entry!.listeners.forEach(listener => listener({
          type: event.type,
          snapshot: event.snapshot,
          ...(event.type === 'status' && event.error ? { error: event.error } : {}),
          ...(event.type === 'snapshot' && event.olderAdded != null ? { olderAdded: event.olderAdded } : {}),
        }));
        this.scheduleUi(entry!);
      });
      // Keep the stop function on the entry without expanding the public store API.
      (entry as Entry & { stop?: () => void }).stop = stop;
    }
    entry.consumers += 1;
    return () => this.detach(key);
  }

  getSnapshot(key: string): MarketDataStoreSnapshot | null {
    const entry = this.entries.get(key);
    return entry ? { key, snapshot: entry.snapshot } : null;
  }

  getLatestTick(key: string): NormalizedMarketTick | undefined {
    return this.entries.get(key)?.snapshot.latestTick;
  }

  subscribe(key: string, listener: Listener): () => void {
    const entry = this.entries.get(key);
    if (!entry) return () => undefined;
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  subscribeUi(key: string, listener: () => void): () => void {
    const entry = this.entries.get(key);
    if (!entry) return () => undefined;
    entry.uiListeners.add(listener);
    return () => entry.uiListeners.delete(listener);
  }

  requestOlder(key: string, visibleBars?: number): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve();
    return entry.plane.loadOlderHistory('visible', visibleBars ? { visibleBars } : undefined);
  }

  requestWarm(key: string, visibleBars?: number): void {
    this.entries.get(key)?.plane.requestWarmHistory(visibleBars);
  }

  readCanonical(key: string) {
    return this.entries.get(key)?.plane.readCanonical();
  }

  getPlane(key: string): ChartDataPlane | undefined {
    return this.entries.get(key)?.plane;
  }

  detach(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers > 0) return;
    entry.listeners.clear();
    entry.uiListeners.clear();
    (entry as Entry & { stop?: () => void }).stop?.();
    this.entries.delete(key);
  }

  private scheduleUi(entry: Entry): void {
    if (!entry.uiListeners.size || entry.uiScheduled) return;
    entry.uiScheduled = true;
    const flush = () => {
      entry.uiScheduled = false;
      entry.uiListeners.forEach(listener => listener());
    };
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(flush);
    else Promise.resolve().then(flush);
  }
}

export const marketDataStore = new MarketDataStore();
