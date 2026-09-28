import type { ChartDataRange } from '../data/marketDataStore';

/**
 * Renderer-neutral chart viewport. `from/to` remain as the legacy half-open
 * aliases while the canonical state is expressed with explicit visible-bar,
 * zoom/scroll, price-domain and device-pixel information.
 */
export type ChartViewport = ChartDataRange & {
  firstVisibleBar: number;
  lastVisibleBar: number;
  pixelsPerBar: number;
  priceMin: number;
  priceMax: number;
  zoom: number;
  scroll: number;
  pixelWidth: number;
  devicePixelRatio: number;
};

export type ChartViewportInput = Partial<ChartViewport>;

export function normalizeChartViewport(length: number, viewport: ChartViewportInput = {}): ChartViewport {
  const safeLength = Math.max(0, Math.floor(length));
  const pixelWidth = Math.max(1, Number.isFinite(viewport.pixelWidth) ? Number(viewport.pixelWidth) : 1);
  const dpr = Math.max(0.25, Number.isFinite(viewport.devicePixelRatio) ? Number(viewport.devicePixelRatio) : 1);

  const requestedFrom = Number.isFinite(viewport.firstVisibleBar)
    ? Number(viewport.firstVisibleBar)
    : Number.isFinite(viewport.from)
      ? Number(viewport.from)
      : 0;
  const requestedTo = Number.isFinite(viewport.lastVisibleBar)
    ? Number(viewport.lastVisibleBar) + 1
    : Number.isFinite(viewport.to)
      ? Number(viewport.to)
      : safeLength;

  const initialFrom = Math.max(0, Math.min(safeLength, Math.floor(requestedFrom)));
  const initialTo = Math.max(initialFrom, Math.min(safeLength, Math.ceil(requestedTo)));
  const visibleCount = Math.max(1, initialTo - initialFrom);

  let pixelsPerBar = Number.isFinite(viewport.pixelsPerBar) && Number(viewport.pixelsPerBar) > 0
    ? Number(viewport.pixelsPerBar)
    : pixelWidth / visibleCount;
  pixelsPerBar = Math.max(0.01, pixelsPerBar);

  const requestedScroll = Number.isFinite(viewport.scroll) ? Number(viewport.scroll) : 0;
  let first = Math.floor(Math.max(0, requestedScroll + initialFrom));
  let scroll = requestedScroll + initialFrom - first;

  const span = Math.max(1, Math.round(pixelWidth / pixelsPerBar));
  if (safeLength === 0) {
    first = 0;
    scroll = 0;
  } else {
    const maxFirst = Math.max(0, safeLength - Math.min(span, safeLength));
    first = Math.max(0, Math.min(maxFirst, first));
    if (first >= maxFirst) scroll = Math.min(scroll, 1 - Number.EPSILON);
  }

  const last = safeLength === 0 ? -1 : Math.min(safeLength - 1, first + Math.max(1, span) - 1);
  const to = Math.min(safeLength, Math.max(first, last + 1));

  return {
    from: first,
    to,
    firstVisibleBar: first,
    lastVisibleBar: last,
    pixelsPerBar,
    priceMin: Number.isFinite(viewport.priceMin) ? Number(viewport.priceMin) : 0,
    priceMax: Number.isFinite(viewport.priceMax) ? Number(viewport.priceMax) : 1,
    zoom: Number.isFinite(viewport.zoom) && Number(viewport.zoom) > 0 ? Number(viewport.zoom) : 1,
    scroll: Math.max(0, Math.min(0.999999999, scroll)),
    pixelWidth,
    devicePixelRatio: dpr,
  };
}

/** Fast affine transform between canonical bar coordinates and pixels. */
export class ChartViewportTransform {
  private _first = 0;
  private _scroll = 0;
  private _pixelsPerBar = 1;
  private _pixelWidth = 1;

  update(viewport: ChartViewport): void {
    this._first = viewport.firstVisibleBar;
    this._scroll = viewport.scroll;
    this._pixelsPerBar = viewport.pixelsPerBar;
    this._pixelWidth = viewport.pixelWidth;
  }

  barIndexToX(barIndex: number): number {
    return (barIndex - this._first - this._scroll) * this._pixelsPerBar;
  }

  xToBarIndex(x: number): number {
    return this._first + this._scroll + x / this._pixelsPerBar;
  }

  barSpanInPixels(barCount: number): number { return barCount * this._pixelsPerBar; }
  pixelsPerBar(): number { return this._pixelsPerBar; }

  visiblePixelRange(): Readonly<{ min: number; max: number }> {
    return Object.freeze({ min: 0, max: this._pixelWidth });
  }
}
