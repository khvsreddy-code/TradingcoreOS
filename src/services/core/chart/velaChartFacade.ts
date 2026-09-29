import { NativeRenderer } from '../../../../vendor/vela/src/renderers/native/NativeRenderer';
import type { IndicatorRenderHandle, ClickEvent, CrosshairEvent, VisibleRange } from '../../../../vendor/vela/src/core/ports/IChartRenderer';
import type { Unsubscribe } from '../../../../vendor/vela/src/core/util/types';
import type { VelaTheme } from '../../../../vendor/vela/src/core/options';
import type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
import type { IndicatorModel } from '../../../../vendor/vela/src/core/model/indicator';
import type { SeriesPoint, SeriesSpec, LineLikeSeries, LineStyle as VelaLineStyle, MarkerPoint } from '../../../../vendor/vela/src/core/model/series';
import type { PriceLine } from '../../../../vendor/vela/src/core/model/scene';
import type { ScenePatch } from '../../../../vendor/vela/src/core/model/patch';

export type Time = number;
export type LineStyle = 0 | 1 | 2;
export type IChartApi = VelaChartFacade;
export type ISeriesApi<T = string> = VelaSeriesFacade<T>;

export const ColorType = Object.freeze({ Solid: 'solid' as const });
export const CandlestickSeries = Object.freeze({ kind: 'candlestick' as const });
export const HistogramSeries = Object.freeze({ kind: 'histogram' as const });
export const LineSeries = Object.freeze({ kind: 'line' as const });

type SeriesKind = 'candle' | 'line' | 'histogram';

type SeriesOptions = {
  color?: string;
  lineWidth?: number;
  lineStyle?: number;
  title?: string;
  visible?: boolean;
  priceLineVisible?: boolean;
  lastValueVisible?: boolean;
  priceScaleId?: string;
  priceFormat?: unknown;
  wickUpColor?: string;
  wickDownColor?: string;
  borderUpColor?: string;
  borderDownColor?: string;
  borderVisible?: boolean;
  wickVisible?: boolean;
  upColor?: string;
  downColor?: string;
  autoscaleInfoProvider?: unknown;
};

type ChartPointInput = { time: Time; value?: number | null; open?: number; high?: number; low?: number; close?: number; color?: string };
type ChartMarkerInput = { time: Time; position: 'aboveBar' | 'belowBar' | 'inBar'; color: string; shape: string; text?: string; size?: 'tiny' | 'small' | 'normal' | 'large' | 'huge' };

type PriceLineHandle = { id: string; remove: () => void };

let chartSerial = 0;
let seriesSerial = 0;
let markerSerial = 0;

function lineStyle(value: unknown): VelaLineStyle {
  const n = Number(value) || 0;
  return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
}

function msFromTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n < 2_000_000_000_000 ? n * 1000 : n;
}

function velaThemeFromOptions(options: any): VelaTheme {
  const layout = options?.layout || {};
  const bg = layout.background?.color || layout.background || '#070a10';
  const text = layout.textColor || '#f3f4f6';
  const grid = options?.grid?.horzLines?.color || options?.grid?.vertLines?.color || '#171b27';
  const border = options?.rightPriceScale?.borderColor || options?.timeScale?.borderColor || '#252b3a';
  return { background: String(bg), textColor: String(text), gridColor: String(grid), borderColor: String(border), upColor: '#22c55e', downColor: '#ef4444', fontFamily: String(layout.fontFamily || 'JetBrains Mono, monospace') };
}

function indicatorBase(id: string, title: string, paneId: string, series: SeriesSpec[]): IndicatorModel {
  return {
    id,
    title,
    overlay: true,
    paneHint: 'price',
    paneId,
    series,
    fills: [],
    backgrounds: [],
    priceLines: [],
    inputs: [],
    inputValues: {},
    legend: false,
  };
}

class VelaTimeScaleFacade {
  constructor(private readonly chart: VelaChartFacade) {}

  barSpacing(): number { return this.chart.barSpacing(); }
  rightOffset(): number { return this.chart.rightOffset(); }
  applyOptions(options: { barSpacing?: number; rightOffset?: number; visible?: boolean; borderColor?: string } = {}): void {
    if (options.barSpacing != null) this.chart.setBarSpacing(options.barSpacing);
    if (options.rightOffset != null) this.chart.setRightOffset(options.rightOffset);
  }
  fitContent(): void { this.chart.fitContent(); }
  setVisibleRange(range: { from: number; to: number }): void { this.chart.setVisibleTimeRange(range); }
  getVisibleRange(): { from: number; to: number } | null { return this.chart.getVisibleTimeRange(); }
  setVisibleLogicalRange(range: { from: number; to: number }): void { this.chart.setVisibleLogicalRange(range); }
  getVisibleLogicalRange(): { from: number; to: number } | null { return this.chart.getVisibleLogicalRange(); }
  timeToCoordinate(time: Time): number | null { return this.chart.timeToCoordinate(time); }
  coordinateToTime(x: number): Time | null { return this.chart.coordinateToTime(x); }
  subscribeVisibleLogicalRangeChange(cb: (range: { from: number; to: number } | null) => void): () => void { return this.chart.subscribeVisibleLogicalRangeChange(cb); }
  unsubscribeVisibleLogicalRangeChange(cb: (range: { from: number; to: number } | null) => void): void { this.chart.unsubscribeVisibleLogicalRangeChange(cb); }
  subscribeVisibleTimeRangeChange(cb: (range: { from: number; to: number } | null) => void): () => void { return this.chart.subscribeVisibleTimeRangeChange(cb); }
  unsubscribeVisibleTimeRangeChange(cb: (range: { from: number; to: number } | null) => void): void { this.chart.unsubscribeVisibleTimeRangeChange(cb); }
}

export class VelaSeriesFacade<T = string> {
  readonly id: string;
  private readonly kind: SeriesKind;
  private readonly model?: IndicatorModel;
  private handle?: IndicatorRenderHandle;
  private removed = false;

  constructor(readonly chart: VelaChartFacade, kind: SeriesKind, private options: SeriesOptions = {}, id = `tco-series:${++seriesSerial}`) {
    this.id = id;
    this.kind = kind;
    if (kind !== 'candle') {
      const title = String(options.title || id);
      const series: SeriesSpec = {
        id: `${id}:series`,
        title,
        paneId: chart.pricePaneId,
        kind,
        visible: options.visible !== false,
        display: { pane: options.visible !== false, legend: !!options.lastValueVisible, priceScale: false, dataWindow: false },
        overlay: true,
        points: [],
        style: { color: String(options.color || '#38bdf8'), width: Math.max(1, Number(options.lineWidth) || 1), lineStyle: lineStyle(options.lineStyle) },
      } as any;
      this.model = indicatorBase(`tco-indicator:${id}`, title, chart.pricePaneId, [series]);
      this.handle = chart.renderer.mountIndicator(this.model);
    }
  }

  setData(rows: readonly ChartPointInput[]): void {
    if (this.removed) return;
    if (this.kind === 'candle') { this.chart.setBars(rows.map(toBar)); return; }
    const points = rows.map((p) => ({ time: msFromTime(p.time), value: p.value == null ? null : Number(p.value), ...(p.color ? { color: String(p.color) } : {}) })).filter(p => Number.isFinite(p.time)) as SeriesPoint[];
    const series = this.valueSeries();
    if (!series) return;
    series.points = points;
    this.patchSeries(points);
  }

  update(row: ChartPointInput): void {
    if (this.removed) return;
    if (this.kind === 'candle') { this.chart.updateBar(toBar(row)); return; }
    const point: SeriesPoint = { time: msFromTime(row.time), value: row.value == null ? null : Number(row.value), ...(row.color ? { color: String(row.color) } : {}) };
    if (!Number.isFinite(point.time)) return;
    const series = this.valueSeries();
    if (!series) return;
    const last = series.points[series.points.length - 1];
    if (!last || point.time > last.time) series.points.push(point); else if (point.time === last.time) series.points[series.points.length - 1] = point; else return;
    this.patchSeries([point]);
  }

  applyOptions(next: SeriesOptions): void {
    this.options = { ...this.options, ...next };
    if (this.kind === 'candle') {
      this.chart.setCandleOptions(next);
      return;
    }
    const series = this.valueSeries();
    if (!series) return;
    series.title = String(this.options.title || series.title);
    series.visible = this.options.visible !== false;
    series.display = { pane: series.visible !== false, legend: !!this.options.lastValueVisible, priceScale: false, dataWindow: false };
    series.style = {
      ...series.style,
      color: String(this.options.color || series.style.color),
      width: Math.max(1, Number(this.options.lineWidth) || series.style.width || 1),
      lineStyle: lineStyle(this.options.lineStyle),
    };
    this.chart.renderer.updateIndicator(this.handle!, { kind: 'value', indicatorId: this.model!.id, dirty: { from: Number.MIN_SAFE_INTEGER, to: Number.MAX_SAFE_INTEGER }, series: [{ seriesId: series.id, kind: 'points', points: series.points }] } as ScenePatch);
  }

  createPriceLine(options: { price: number; color?: string; lineWidth?: number; lineStyle?: number; axisLabelVisible?: boolean; title?: string }): PriceLineHandle {
    return this.chart.createPriceLine(Number(options.price), options);
  }

  removePriceLine(handle: PriceLineHandle): void { handle?.remove?.(); }
  priceToCoordinate(price: number): number | null { return this.chart.priceToCoordinate(price); }
  coordinateToPrice(y: number): number | null { return this.chart.coordinateToPrice(y); }
  priceScale() { return { applyOptions: (_options: unknown) => {} }; }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    if (this.handle) this.chart.renderer.removeIndicator(this.handle);
    this.chart.unregisterSeries(this);
  }

  private valueSeries(): LineLikeSeries | undefined {
    const s = this.model?.series[0];
    return s && (s.kind === 'line' || s.kind === 'histogram') ? s : undefined;
  }

  private patchSeries(points: SeriesPoint[]): void {
    const series = this.valueSeries();
    if (!series || !this.handle || !this.model) return;
    this.chart.renderer.updateIndicator(this.handle, { kind: 'value', indicatorId: this.model.id, dirty: { from: points[0]?.time ?? 0, to: points.at(-1)?.time ?? 0 }, series: [{ seriesId: series.id, kind: 'points', points: series.points }] } as ScenePatch);
  }
}

function toBar(row: ChartPointInput): OHLCV {
  const time = msFromTime(row.time);
  const close = Number(row.close ?? row.value ?? 0);
  return { time, open: Number(row.open ?? close), high: Number(row.high ?? close), low: Number(row.low ?? close), close, volume: Number((row as any).volume) || undefined };
}

export function createSeriesMarkers(candle: ISeriesApi<'Candlestick'> | ISeriesApi, markers: readonly ChartMarkerInput[] = []) {
  const host = candle as unknown as VelaSeriesFacade;
  const state = { id: `tco-marker:${++markerSerial}` };
  const setMarkers = (next: readonly ChartMarkerInput[]) => host.chart.setMarkers(next);
  setMarkers(markers);
  return { setMarkers, detach: () => host.chart.setMarkers([]), id: state.id };
}

export class VelaChartFacade {
  readonly renderer = new NativeRenderer();
  readonly pricePaneId = 'price';
  private readonly timeScaleFacade = new VelaTimeScaleFacade(this);
  private readonly series = new Set<VelaSeriesFacade>();
  private readonly candleSeries = new Set<VelaSeriesFacade>();
  private readonly markerModels = new Map<string, { handle: IndicatorRenderHandle; seriesId: string }>();
  private readonly priceLineModelId = `tco-price-lines:${++chartSerial}`;
  private priceLineHandle?: IndicatorRenderHandle;
  private priceLines: PriceLine[] = [];
  private lastCandleOptions: SeriesOptions = {};
  private mounted = false;
  private onClickHandlers = new Set<(param: any) => void>();
  private logicalRangeSubscriptions = new Map<(range: { from: number; to: number } | null) => void, Unsubscribe>();
  private timeRangeSubscriptions = new Map<(range: { from: number; to: number } | null) => void, Unsubscribe>();

  constructor(private readonly host: HTMLElement, options: any = {}) {
    this.renderer.mount(host, velaThemeFromOptions(options));
    this.mounted = true;
    this.renderer.onClick((event: ClickEvent) => {
      for (const cb of this.onClickHandlers) cb({ point: event.time == null ? undefined : { x: this.timeToCoordinate(event.time) ?? 0, y: event.price == null ? 0 : this.priceToCoordinate(event.price) ?? 0 }, time: event.time ?? undefined, seriesData: new Map() });
    });
  }

  addSeries(kindToken: any, options: SeriesOptions = {}): VelaSeriesFacade {
    const kind: SeriesKind = kindToken?.kind === 'candlestick' ? 'candle' : kindToken?.kind === 'histogram' ? 'histogram' : 'line';
    const s = new VelaSeriesFacade(this, kind, options);
    this.series.add(s);
    if (kind === 'candle') this.candleSeries.add(s);
    return s;
  }

  removeSeries(series: VelaSeriesFacade): void { series.remove(); }
  timeScale(): VelaTimeScaleFacade { return this.timeScaleFacade; }
  resize(width: number, height: number): void { if (this.mounted) this.renderer.resize(); if (this.host.style.width === '' && width) this.host.style.width = `${Math.max(1, width)}px`; if (this.host.style.height === '' && height) this.host.style.height = `${Math.max(1, height)}px`; }
  remove(): void { if (!this.mounted) return; this.series.forEach(s => s.remove()); this.series.clear(); this.renderer.destroy(); this.mounted = false; }
  applyOptions(options: any): void { this.renderer.setTheme(velaThemeFromOptions(options)); if (options?.crosshair) this.renderer.applyFeature('crosshair.visible', Number(options.crosshair.mode) !== 2); }
  subscribeClick(cb: (param: any) => void): void { this.onClickHandlers.add(cb); }
  unsubscribeClick(cb: (param: any) => void): void { this.onClickHandlers.delete(cb); }
  subscribeSizeChange(_cb: () => void): () => void { return () => {}; }

  setBars(bars: readonly ChartPointInput[]): void { this.renderer.setBars(bars.map(toBar), { preserveView: this.renderer.getVisibleRange() !== null }); }
  updateBar(bar: OHLCV): void { this.renderer.updateBar(bar); }
  setCandleOptions(options: SeriesOptions): void { this.lastCandleOptions = { ...this.lastCandleOptions, ...options }; const apply = (this.renderer as any).setCandleAppearance; if (typeof apply === 'function') apply.call(this.renderer, { upColor: options.upColor || options.color || '#22c55e', downColor: options.downColor || options.color || '#ef4444', borderUpColor: options.borderUpColor, borderDownColor: options.borderDownColor, wickUpColor: options.wickUpColor, wickDownColor: options.wickDownColor, borderVisible: options.borderVisible, wickVisible: options.wickVisible }); }
  setMarkers(markers: readonly ChartMarkerInput[]): void {
    const modelId = `${this.priceLineModelId}:markers`;
    const existing = this.markerModels.get(modelId);
    const markerPoints: MarkerPoint[] = markers.map((m): MarkerPoint => ({ time: msFromTime(m.time), position: m.position, color: String(m.color || '#f59e0b'), shape: String(m.shape || 'circle'), ...(m.text ? { text: String(m.text) } : {}), ...(m.size ? { size: m.size } : {}) }));
    if (!existing) {
      const seriesId = `${modelId}:series`;
      const markerSeries: SeriesSpec = { id: seriesId, title: 'Signals', paneId: this.pricePaneId, kind: 'markers', visible: true, overlay: true, markers: markerPoints };
      const model = indicatorBase(modelId, 'Signals', this.pricePaneId, [markerSeries]);
      const handle = this.renderer.mountIndicator(model);
      this.markerModels.set(modelId, { handle, seriesId });
      return;
    }
    this.renderer.updateIndicator(existing.handle, { kind: 'value', indicatorId: modelId, dirty: { from: markerPoints[0]?.time ?? 0, to: markerPoints.at(-1)?.time ?? 0 }, series: [{ seriesId: existing.seriesId, kind: 'markers', markers: markerPoints }] } as ScenePatch);
  }

  createPriceLine(price: number, options: { color?: string; lineWidth?: number; lineStyle?: number; axisLabelVisible?: boolean; title?: string }): PriceLineHandle {
    const id = `tco-price-line:${++seriesSerial}`;
    this.priceLines.push({ id, paneId: this.pricePaneId, price, color: String(options.color || '#60a5fa'), width: Math.max(1, Number(options.lineWidth) || 1), lineStyle: lineStyle(options.lineStyle), title: options.title });
    this.ensurePriceLineModel();
    this.updatePriceLineModel();
    return { id, remove: () => { this.priceLines = this.priceLines.filter(x => x.id !== id); this.updatePriceLineModel(); } };
  }

  barSpacing(): number { return Number((this.renderer as any).barSpacing?.() ?? 6); }
  setBarSpacing(value: number): void { try { (this.renderer as any).setBarSpacing?.(Math.max(0.1, Number(value) || 0.1)); } catch {} }
  rightOffset(): number { return Number((this.renderer as any).rightOffset?.() ?? 0); }
  setRightOffset(value: number): void { try { (this.renderer as any).setRightOffset?.(Number(value) || 0); } catch {} }
  fitContent(): void { const bars = this.currentBars(); if (bars.length) this.renderer.setVisibleRange({ from: bars[0]!.time, to: bars.at(-1)!.time }); }
  setVisibleTimeRange(range: { from: number; to: number }): void { this.renderer.setVisibleRange({ from: msFromTime(range.from), to: msFromTime(range.to) }); }
  getVisibleTimeRange(): { from: number; to: number } | null { const r = this.renderer.getVisibleRange(); return r ? { from: r.from / 1000, to: r.to / 1000 } : null; }
  setVisibleLogicalRange(range: { from: number; to: number }): void { const bars = this.currentBars(); if (!bars.length) return; const from = bars[Math.max(0, Math.floor(range.from))]?.time ?? bars[0]!.time; const to = bars[Math.min(bars.length - 1, Math.ceil(range.to))]?.time ?? bars.at(-1)!.time; this.renderer.setVisibleRange({ from, to }); }
  getVisibleLogicalRange(): { from: number; to: number } | null { const r = this.renderer.getVisibleRange(); const bars = this.currentBars(); if (!r || !bars.length) return null; const from = bars.findIndex(b => b.time >= r.from); let to = bars.findIndex(b => b.time >= r.to); if (to < 0) to = bars.length - 1; return { from: Math.max(0, from), to: Math.max(0, to) }; }
  subscribeVisibleLogicalRangeChange(cb: (range: { from: number; to: number } | null) => void): () => void { const unsub = this.renderer.onViewportChange(() => cb(this.getVisibleLogicalRange())); this.logicalRangeSubscriptions.set(cb, unsub); return unsub; }
  unsubscribeVisibleLogicalRangeChange(cb: (range: { from: number; to: number } | null) => void): void { const unsub = this.logicalRangeSubscriptions.get(cb); if (unsub) { unsub(); this.logicalRangeSubscriptions.delete(cb); } }
  subscribeVisibleTimeRangeChange(cb: (range: { from: number; to: number } | null) => void): () => void { const unsub = this.renderer.onViewportChange(r => cb({ from: r.from / 1000, to: r.to / 1000 })); this.timeRangeSubscriptions.set(cb, unsub); return unsub; }
  unsubscribeVisibleTimeRangeChange(cb: (range: { from: number; to: number } | null) => void): void { const unsub = this.timeRangeSubscriptions.get(cb); if (unsub) { unsub(); this.timeRangeSubscriptions.delete(cb); } }
  timeToCoordinate(time: number): number | null { const fn = (this.renderer as any).timeToCoordinate; return typeof fn === 'function' ? Number(fn.call(this.renderer, msFromTime(time))) : null; }
  coordinateToTime(x: number): number | null { const fn = (this.renderer as any).coordinateToTime; const v = typeof fn === 'function' ? fn.call(this.renderer, x) : null; return v == null ? null : Number(v) / 1000; }
  priceToCoordinate(price: number): number | null { const fn = (this.renderer as any).priceToCoordinate; return typeof fn === 'function' ? Number(fn.call(this.renderer, price)) : null; }
  coordinateToPrice(y: number): number | null { const fn = (this.renderer as any).coordinateToPrice; const v = typeof fn === 'function' ? fn.call(this.renderer, y) : null; return v == null ? null : Number(v); }
  setVisibleRangeFromRenderer(range: VisibleRange): void { this.renderer.setVisibleRange(range); }

  subscribeCrosshair(cb: (e: CrosshairEvent) => void): Unsubscribe { return this.renderer.onCrosshairMove(cb); }
  currentBars(): OHLCV[] { return ((this.renderer as any).bars || []) as OHLCV[]; }
  unregisterSeries(series: VelaSeriesFacade): void { this.series.delete(series); this.candleSeries.delete(series); }

  private ensurePriceLineModel(): void {
    if (this.priceLineHandle) return;
    const model = indicatorBase(this.priceLineModelId, 'Price Levels', this.pricePaneId, []);
    model.priceLines = this.priceLines;
    this.priceLineHandle = this.renderer.mountIndicator(model);
  }
  private updatePriceLineModel(): void {
    this.ensurePriceLineModel();
    if (!this.priceLineHandle) return;
    const setLines = (this.renderer as any).setIndicatorPriceLines;
    if (typeof setLines === 'function') setLines.call(this.renderer, this.priceLineModelId, this.priceLines);
  }
}

export function createChart(host: HTMLElement, options?: any): IChartApi { return new VelaChartFacade(host, options); }
