import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import type { ChartAnalytics } from '../../../services/marketData/levelEngine';
import type { OIChartAnalytics } from '../../../services/marketData/oiEngine';
import type { ChartDataPlaneSnapshot } from '../../marketData/chartDataPlane';

export type ChartStoreSnapshot = Readonly<{
  generation: number;
  revision: number;
  candles: HistoricalCandle[];
  latestTick?: NormalizedMarketTick;
  visibleLogicalRange: { from: number; to: number } | null;
  historyReady: boolean;
  historyLoading: boolean;
  error: string;
  analytics: ChartAnalytics | null;
  oiAnalytics: OIChartAnalytics | null;
  lifecycle: 'idle' | 'loading' | 'ready' | 'updating' | 'error' | 'recovering' | 'disposed';
}>;

type Listener = () => void;

const EMPTY: ChartStoreSnapshot = Object.freeze({
  generation: 0,
  revision: 0,
  candles: [],
  latestTick: undefined,
  visibleLogicalRange: null,
  historyReady: false,
  historyLoading: false,
  error: '',
  analytics: null,
  oiAnalytics: null,
  lifecycle: 'idle',
});

function freezeSnapshot(value: ChartStoreSnapshot): ChartStoreSnapshot {
  return Object.freeze(value);
}

/**
 * Per-chart imperative state.
 *
 * High-frequency market state lives here instead of React. Consumers that need
 * every tick subscribe imperatively; UI consumers can use subscribeUi(), which
 * is frame-coalesced and therefore does not turn the market feed into a React
 * event bus.
 */
export class ChartStore {
  private snapshot: ChartStoreSnapshot = EMPTY;
  private listeners = new Set<Listener>();
  private uiListeners = new Set<Listener>();
  private uiFrame: number | null = null;

  getSnapshot(): ChartStoreSnapshot { return this.snapshot; }

  getCandles(): HistoricalCandle[] { return this.snapshot.candles; }
  getLatestTick(): NormalizedMarketTick | undefined { return this.snapshot.latestTick; }
  getRevision(): number { return this.snapshot.revision; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeUi(listener: Listener): () => void {
    this.uiListeners.add(listener);
    return () => this.uiListeners.delete(listener);
  }

  publishMarketSnapshot(event: { type: string; snapshot: ChartDataPlaneSnapshot; error?: string }): void {
    const nextLifecycle = event.type === 'tick'
      ? (this.snapshot.lifecycle === 'ready' ? 'updating' : this.snapshot.lifecycle)
      : event.type === 'status' && event.error
        ? 'error'
        : event.type === 'status'
          ? 'ready'
          : this.snapshot.lifecycle;

    this.snapshot = freezeSnapshot({
      generation: this.snapshot.generation,
      revision: event.snapshot.revision,
      candles: event.snapshot.candles,
      latestTick: event.snapshot.latestTick,
      visibleLogicalRange: this.snapshot.visibleLogicalRange,
      historyReady: event.snapshot.historyReady,
      historyLoading: event.snapshot.historyLoading || event.snapshot.olderHistoryLoading,
      error: event.error || (nextLifecycle === 'error' ? this.snapshot.error : ''),
      analytics: this.snapshot.analytics,
      oiAnalytics: this.snapshot.oiAnalytics,
      lifecycle: nextLifecycle as ChartStoreSnapshot['lifecycle'],
    });

    this.listeners.forEach(listener => listener());
    this.scheduleUiNotify();
  }

  setVisibleRange(range: { from: number; to: number } | null): void {
    this.snapshot = freezeSnapshot({ ...this.snapshot, visibleLogicalRange: range });
    this.scheduleUiNotify();
  }

  setAnalytics(analytics: ChartAnalytics | null): void {
    this.snapshot = freezeSnapshot({ ...this.snapshot, analytics });
    this.scheduleUiNotify();
  }

  setOiAnalytics(oiAnalytics: OIChartAnalytics | null): void {
    this.snapshot = freezeSnapshot({ ...this.snapshot, oiAnalytics });
    this.scheduleUiNotify();
  }

  setError(error: string): void {
    this.snapshot = freezeSnapshot({
      ...this.snapshot,
      error,
      lifecycle: error ? 'error' : this.snapshot.lifecycle,
    });
    this.scheduleUiNotify();
  }

  setLifecycle(lifecycle: ChartStoreSnapshot['lifecycle']): void {
    this.snapshot = freezeSnapshot({ ...this.snapshot, lifecycle });
    this.scheduleUiNotify();
  }

  beginGeneration(): number {
    const generation = this.snapshot.generation + 1;
    this.snapshot = freezeSnapshot({ ...this.snapshot, generation, lifecycle: 'loading', error: '' });
    this.scheduleUiNotify();
    return generation;
  }

  invalidateGeneration(): void {
    const generation = this.snapshot.generation + 1;
    this.snapshot = freezeSnapshot({ ...this.snapshot, generation });
  }

  publishUiSnapshot(snapshot: Partial<ChartStoreSnapshot>): void {
    this.snapshot = freezeSnapshot({ ...this.snapshot, ...snapshot });
    this.scheduleUiNotify();
  }

  private scheduleUiNotify(): void {
    if (!this.uiListeners.size || this.uiFrame != null) return;
    const flush = () => {
      this.uiFrame = null;
      this.uiListeners.forEach(listener => listener());
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
      this.uiFrame = globalThis.requestAnimationFrame(flush);
    } else {
      this.uiFrame = Number(setTimeout(flush, 16));
    }
  }

  dispose(): void {
    if (this.uiFrame != null) {
      if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(this.uiFrame);
      else clearTimeout(this.uiFrame);
    }
    this.uiFrame = null;
    this.listeners.clear();
    this.uiListeners.clear();
    this.snapshot = freezeSnapshot({ ...this.snapshot, lifecycle: 'disposed' });
  }
}
