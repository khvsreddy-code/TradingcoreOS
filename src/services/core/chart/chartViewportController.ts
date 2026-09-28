import { normalizeChartViewport, type ChartViewport, type ChartViewportInput, ChartViewportTransform } from './chartViewport';

export class ChartViewportController {
  private _length = 0;
  private _viewport: ChartViewport = normalizeChartViewport(0, { from: 0, to: 0, pixelWidth: 1 });
  private readonly _transform = new ChartViewportTransform();

  constructor() { this._transform.update(this._viewport); }

  set(length: number, viewport: ChartViewportInput): void {
    this._length = Math.max(0, Math.floor(length));
    this._viewport = normalizeChartViewport(length, viewport);
    this._transform.update(this._viewport);
  }

  get(): ChartViewport { return this._viewport; }
  get transform(): ChartViewportTransform { return this._transform; }

  setPriceDomain(min: number, max: number): void {
    this._viewport = normalizeChartViewport(this._length, { ...this._viewport, priceMin: min, priceMax: max });
    this._transform.update(this._viewport);
  }

  setBarSpacing(length: number, pixelsPerBar: number, anchorRatio = 0.5): void {
    const safeLength = Math.max(0, Math.floor(length));
    const next = Math.max(0.01, Number.isFinite(pixelsPerBar) ? Number(pixelsPerBar) : this._viewport.pixelsPerBar);
    const ratio = Math.max(0, Math.min(1, anchorRatio));
    const before = this._viewport;
    const anchorBar = before.firstVisibleBar + before.scroll + Math.max(1, before.to - before.from) * ratio;
    const visibleBars = Math.max(1, Math.round(before.pixelWidth / next));
    const rawFirst = anchorBar - visibleBars * ratio;
    this._length = safeLength;
    const first = Math.floor(rawFirst);
    this._viewport = normalizeChartViewport(safeLength, { ...before, firstVisibleBar: first, lastVisibleBar: first + visibleBars - 1, pixelsPerBar: next, scroll: rawFirst - first });
    this._transform.update(this._viewport);
  }

  setLogicalStart(length: number, logicalStart: number): void {
    const safeLength = Math.max(0, Math.floor(length));
    this._length = safeLength;
    const span = Math.max(1, Math.round(this._viewport.pixelWidth / this._viewport.pixelsPerBar));
    const maxStart = Math.max(0, safeLength - Math.min(span, safeLength));
    const raw = Math.max(0, Math.min(maxStart + (maxStart === 0 ? 0 : 1 - Number.EPSILON), Number(logicalStart) || 0));
    const first = Math.floor(raw);
    this._viewport = normalizeChartViewport(safeLength, { ...this._viewport, firstVisibleBar: first, lastVisibleBar: first + span - 1, scroll: raw - first });
    this._transform.update(this._viewport);
  }

  setDevicePixelRatio(devicePixelRatio: number): void {
    this._viewport = normalizeChartViewport(this._length, { ...this._viewport, devicePixelRatio });
    this._transform.update(this._viewport);
  }

  panByBars(length: number, deltaBars: number): void {
    this.panByPixels(length, deltaBars * this._viewport.pixelsPerBar);
  }

  panByPixels(length: number, deltaPixels: number): void {
    const safeLength = Math.max(0, Math.floor(length));
    if (safeLength === 0) return;
    this._length = safeLength;
    const visibleCount = Math.max(1, this._viewport.to - this._viewport.from);
    const maxFirst = Math.max(0, safeLength - Math.min(visibleCount, safeLength));
    let logicalFirst = this._viewport.firstVisibleBar + this._viewport.scroll + deltaPixels / this._viewport.pixelsPerBar;
    logicalFirst = Math.max(0, Math.min(maxFirst + (maxFirst === 0 ? 0 : 1 - Number.EPSILON), logicalFirst));
    const first = Math.floor(logicalFirst);
    const scroll = logicalFirst - first;
    this._viewport = normalizeChartViewport(safeLength, { ...this._viewport, firstVisibleBar: first, scroll });
    this._transform.update(this._viewport);
  }

  zoom(factor: number, length: number, anchorRatio = 0.5): void {
    const safeFactor = Math.max(0.1, Math.min(10, Number.isFinite(factor) ? factor : 1));
    this._length = Math.max(0, Math.floor(length));
    const ratio = Math.max(0, Math.min(1, anchorRatio));
    const before = this._viewport;
    const anchorBar = before.firstVisibleBar + before.scroll + (before.to - before.from) * ratio;
    const pixelsPerBar = Math.max(0.01, before.pixelsPerBar * safeFactor);
    const visibleBars = Math.max(1, Math.round(before.pixelWidth / pixelsPerBar));
    const rawFirst = anchorBar - visibleBars * ratio;
    const nextZoom = Math.max(0.01, before.zoom * safeFactor);
    this._viewport = normalizeChartViewport(length, {
      ...before,
      firstVisibleBar: Math.floor(rawFirst),
      lastVisibleBar: Math.floor(rawFirst) + visibleBars - 1,
      pixelsPerBar,
      zoom: nextZoom,
      scroll: rawFirst - Math.floor(rawFirst),
    });
    this._transform.update(this._viewport);
  }

  resizePixelWidth(pixelWidth: number, length: number): void {
    this._length = Math.max(0, Math.floor(length));
    const old = this._viewport;
    const visibleBars = Math.max(1, old.to - old.from);
    const pixelsPerBar = Math.max(0.01, Number(pixelWidth) / visibleBars);
    this._viewport = normalizeChartViewport(length, { ...old, pixelWidth, pixelsPerBar });
    this._transform.update(this._viewport);
  }

  setVisibleBars(length: number, firstVisibleBar: number, visibleBars: number): void {
    this._length = Math.max(0, Math.floor(length));
    const count = Math.max(1, Math.floor(visibleBars));
    const from = Math.floor(firstVisibleBar);
    this._viewport = normalizeChartViewport(length, { ...this._viewport, firstVisibleBar: from, lastVisibleBar: from + count - 1, pixelsPerBar: this._viewport.pixelWidth / count, scroll: 0 });
    this._transform.update(this._viewport);
  }

  barIndexToX(barIndex: number): number { return this._transform.barIndexToX(barIndex); }
  xToBarIndex(x: number): number { return this._transform.xToBarIndex(x); }
}
