import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import type { ChartAnalytics } from '../../marketData/levelEngine';
import type { OIChartAnalytics } from '../../marketData/oiEngine';
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
type HotState = {
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
  lifecycle: ChartStoreSnapshot['lifecycle'];
};

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

/**
 * Per-chart imperative state.
 *
 * Tick-hot state is mutable and never freeze-wraps or spreads a snapshot.
 * React/UI consumers only receive an immutable snapshot once per rAF. The
 * canonical typed-array data plane remains the numerical source of truth;
 * candles here are retained solely as an explicit compatibility view.
 */
export class ChartStore {
  private snapshot: ChartStoreSnapshot = EMPTY;
  private readonly hot: HotState = {
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
  };
  private listeners = new Set<Listener>();
  private uiListeners = new Set<Listener>();
  private uiFrame: number | null = null;

  getSnapshot(): ChartStoreSnapshot { return this.snapshot; }

  getCandles(): HistoricalCandle[] { return this.hot.candles; }
  getLatestTick(): NormalizedMarketTick | undefined { return this.hot.latestTick; }
  getRevision(): number { return this.hot.revision; }

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
      ? (this.hot.lifecycle === 'ready' ? 'updating' : this.hot.lifecycle)
      : event.type === 'status' && event.error
        ? 'error'
        : event.type === 'status'
          ? 'ready'
          : this.hot.lifecycle;

    this.hot.revision = event.snapshot.revision;
    this.hot.candles = event.snapshot.candles;
    this.hot.latestTick = event.snapshot.latestTick;
    this.hot.historyReady = event.snapshot.historyReady;
    this.hot.historyLoading = event.snapshot.historyLoading || event.snapshot.olderHistoryLoading;
    this.hot.error = event.error || (nextLifecycle === 'error' ? this.hot.error : '');
    this.hot.lifecycle = nextLifecycle as ChartStoreSnapshot['lifecycle'];

    this.listeners.forEach(listener => listener());
    this.scheduleUiNotify();
  }

  setVisibleRange(range: { from: number; to: number } | null): void {
    this.hot.visibleLogicalRange = range;
    this.scheduleUiNotify();
  }

  setAnalytics(analytics: ChartAnalytics | null): void {
    this.hot.analytics = analytics;
    this.scheduleUiNotify();
  }

  setOiAnalytics(oiAnalytics: OIChartAnalytics | null): void {
    this.hot.oiAnalytics = oiAnalytics;
    this.scheduleUiNotify();
  }

  setError(error: string): void {
    this.hot.error = error;
    if (error) this.hot.lifecycle = 'error';
    this.scheduleUiNotify();
  }

  setLifecycle(lifecycle: ChartStoreSnapshot['lifecycle']): void {
    this.hot.lifecycle = lifecycle;
    this.scheduleUiNotify();
  }

  beginGeneration(): number {
    this.hot.generation += 1;
    this.hot.lifecycle = 'loading';
    this.hot.error = '';
    this.scheduleUiNotify();
    return this.hot.generation;
  }

  invalidateGeneration(): void {
    this.hot.generation += 1;
    this.scheduleUiNotify();
  }

  publishUiSnapshot(snapshot: Partial<ChartStoreSnapshot>): void {
    Object.assign(this.hot, snapshot);
    this.scheduleUiNotify();
  }

  private scheduleUiNotify(): void {
    if (!this.uiListeners.size || this.uiFrame != null) return;
    const flush = () => {
      this.uiFrame = null;
      this.snapshot = Object.freeze({
        generation: this.hot.generation,
        revision: this.hot.revision,
        candles: this.hot.candles,
        latestTick: this.hot.latestTick,
        visibleLogicalRange: this.hot.visibleLogicalRange,
        historyReady: this.hot.historyReady,
        historyLoading: this.hot.historyLoading,
        error: this.hot.error,
        analytics: this.hot.analytics,
        oiAnalytics: this.hot.oiAnalytics,
        lifecycle: this.hot.lifecycle,
      });
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
    this.hot.lifecycle = 'disposed';
    this.snapshot = Object.freeze({
      generation: this.hot.generation,
      revision: this.hot.revision,
      candles: this.hot.candles,
      latestTick: this.hot.latestTick,
      visibleLogicalRange: this.hot.visibleLogicalRange,
      historyReady: this.hot.historyReady,
      historyLoading: this.hot.historyLoading,
      error: this.hot.error,
      analytics: this.hot.analytics,
      oiAnalytics: this.hot.oiAnalytics,
      lifecycle: 'disposed',
    });
  }
}
