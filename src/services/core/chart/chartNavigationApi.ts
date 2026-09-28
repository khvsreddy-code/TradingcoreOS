import type { ChartTimeScale } from './chartTimeScale';
import type { ChartPriceScaleEngine, ChartPriceScaleMode, ChartPriceScalePolicy } from './chartPriceScale';
import type { ChartViewportController } from './chartViewportController';

export type VisibleBarRange = Readonly<{ from: number; to: number }>;
export type VisiblePriceRange = Readonly<{ from: number; to: number }>;

/** Renderer-neutral navigation contract inspired by mature chart interaction patterns. */
export class ChartNavigationApi {
  private readonly listeners = new Set<(snapshot: ReturnType<ChartNavigationApi['snapshot']>) => void>();
  private _panEnabled = true;
  private _zoomEnabled = true;
  private _pixelHeight = 1;

  constructor(
    private readonly viewport: ChartViewportController,
    private readonly time: ChartTimeScale,
    private readonly price: ChartPriceScaleEngine,
    private readonly lengthProvider: () => number,
  ) {}

  setViewportSize(width: number, height: number, devicePixelRatio = this.viewport.get().devicePixelRatio): void {
    this._pixelHeight = Math.max(1, Number(height) || 1);
    this.viewport.resizePixelWidth(width, this.lengthProvider());
    this.viewport.setDevicePixelRatio(devicePixelRatio);
  }

  pixelWidth(): number { return this.viewport.get().pixelWidth; }
  timeSpacing(): number { return this.barSpacing(); }
  barSpacing(): number { return this.viewport.get().pixelsPerBar; }
  setBarSpacing(pixels: number, anchorRatio = 0.5): void {
    if (!this._zoomEnabled) return;
    const next = Math.max(0.01, Number(pixels) || this.barSpacing());
    this.viewport.setBarSpacing(this.lengthProvider(), next, anchorRatio);
    this.emitChange();
  }

  scrollOffset(): number { return this.viewport.get().firstVisibleBar + this.viewport.get().scroll; }
  setScrollOffset(offsetBars: number): void {
    if (!this._panEnabled) return;
    this.viewport.setLogicalStart(this.lengthProvider(), offsetBars);
    this.emitChange();
  }

  horizontalOffset(): number { return this.scrollOffset(); }
  setHorizontalOffset(offsetBars: number): void { this.setScrollOffset(offsetBars); }

  visibleRange(): VisibleBarRange {
    const view = this.viewport.get();
    return Object.freeze({ from: view.firstVisibleBar, to: view.lastVisibleBar + 1 });
  }

  setVisibleRange(range: VisibleBarRange): void {
    this.viewport.setVisibleBars(this.lengthProvider(), range.from, Math.max(1, range.to - range.from));
    this.emitChange();
  }

  resetTimeView(): void { this.viewport.setVisibleBars(this.lengthProvider(), Math.max(0, this.lengthProvider() - this.visibleCount()), this.visibleCount()); }

  visibleCount(): number { return Math.max(1, this.viewport.get().to - this.viewport.get().from); }

  timeToCoordinate(timestamp: number): number { return this.time.xFromTime(timestamp, this.viewport); }
  coordinateToTime(x: number): number { return this.time.timeFromX(x, this.viewport); }

  priceToCoordinate(price: number): number { return this.price.yFromPrice(price, this._pixelHeight); }
  coordinateToPrice(y: number): number { return this.price.priceFromY(y, this._pixelHeight); }

  setAutoScale(enabled: boolean): void { this.price.setPolicy(enabled ? 'auto' : 'manual'); }
  setPriceMode(mode: ChartPriceScaleMode): void { this.price.setMode(mode); }
  priceMode(): ChartPriceScaleMode { return this.price.mode; }
  setVisiblePriceRange(range: VisiblePriceRange): void { this.price.setManualDomain(range.from, range.to); }
  visiblePriceRange(): VisiblePriceRange { return Object.freeze({ from: this.price.domain.min, to: this.price.domain.max }); }
  setPriceScalePolicy(policy: ChartPriceScalePolicy): void { this.price.setPolicy(policy); }

  setZoomEnabled(enabled: boolean): void { this._zoomEnabled = Boolean(enabled); }
  setPanEnabled(enabled: boolean): void { this._panEnabled = Boolean(enabled); }
  isZoomEnabled(): boolean { return this._zoomEnabled; }
  isPanEnabled(): boolean { return this._panEnabled; }

  panByPixels(deltaX: number): void { if (this._panEnabled) this.viewport.panByPixels(this.lengthProvider(), Number(deltaX) || 0); }
  panByBars(deltaBars: number): void { if (this._panEnabled) this.viewport.panByBars(this.lengthProvider(), Number(deltaBars) || 0); }
  zoomBy(factor: number, anchorRatio = 0.5): void { if (this._zoomEnabled) this.viewport.zoom(Number(factor) || 1, this.lengthProvider(), anchorRatio); }

  onViewportChange(listener: (snapshot: ReturnType<ChartNavigationApi['snapshot']>) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private emitChange(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) { try { listener(snapshot); } catch {} }
  }

  snapshot() {
    return Object.freeze({
      barSpacing: this.barSpacing(),
      scrollOffset: this.scrollOffset(),
      visibleRange: this.visibleRange(),
      visiblePriceRange: this.visiblePriceRange(),
      zoomEnabled: this._zoomEnabled,
      panEnabled: this._panEnabled,
    });
  }
}
