/**
 * Native Vela rendering kernel for TradingCoreOS.
 * This is the active rendering implementation: all chart pixels, panes, price/time scales,
 * markers, fills and incremental series patches terminate in Vela's NativeRenderer.
 */
import { NativeRenderer } from '../../../../vendor/vela/src/renderers/native/NativeRenderer';
// Register the CoreSpirit scene consumer before any Vela renderer is constructed.
import './coreSpiritVelaOutputLayer';
import type { IndicatorRenderHandle, ClickEvent, CrosshairEvent, VisibleRange } from '../../../../vendor/vela/src/core/ports/IChartRenderer';
import type { Unsubscribe } from '../../../../vendor/vela/src/core/util/types';
import type { VelaTheme } from '../../../../vendor/vela/src/core/options';
import type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
import type { ColumnarBars, ColumnarBarUpdate } from '../../../../vendor/vela/src/core/model/columnar-bars';
import type { IndicatorModel } from '../../../../vendor/vela/src/core/model/indicator';
import type { SeriesPoint, SeriesSpec, LineLikeSeries, LineStyle as VelaLineStyle, MarkerPoint } from '../../../../vendor/vela/src/core/model/series';
import type { PriceLine, Pane, Fill } from '../../../../vendor/vela/src/core/model/scene';
import type { ScenePatch, SeriesPatchOperation } from '../../../../vendor/vela/src/core/model/patch';
import { DrawingsControl } from '../../../../vendor/vela/src/core/DrawingsControl';
import { DrawingController } from '../../../../vendor/vela/src/core/drawings/DrawingController';
import { loadDrawingFamiliesForTypes } from '../../../../vendor/vela/src/core/drawings/registry';
import { TypedEventBus } from '../../../../vendor/vela/src/core/events/EventBus';
import type { VelaEventMap } from '../../../../vendor/vela/src/core/events/types';
import type { DrawingsOption } from '../../../../vendor/vela/src/core/drawings/toolbar';
import type { SerializedDrawing } from '../../../../vendor/vela/src/core/drawings/Drawing';
import { migrateVelaDrawingDocument } from './velaDrawingPersistence';

export type Time = number;
export type LineStyleValue = 0 | 1 | 2;
export const LineStyle = Object.freeze({ Solid: 0 as LineStyleValue, Dashed: 1 as LineStyleValue, Dotted: 2 as LineStyleValue });
export type { VelaWorkspaceOptions, WorkspaceEventMap } from '../../../../vendor/vela/src/workspace';

export type { DataProvider, ProviderInfo, SymbolDescriptor } from '../../../../vendor/vela/src/core/ports/DataProvider';
export type { BarRange, MarketDataFeed, SymbolInfo } from '../../../../vendor/vela/src/core/ports/MarketDataFeed';
export type {
  ScriptingEngine,
  EngineCapabilities,
  PreparedScript,
  ExecutionRequest,
  ExecutionHandlers,
  ExecutionSession,
} from '../../../../vendor/vela/src/core/ports/ScriptingEngine';
export type { InputValue, InputSchema } from '../../../../vendor/vela/src/core/model/inputs';
export type { IndicatorMeta, IndicatorModel } from '../../../../vendor/vela/src/core/model/indicator';
export type { SeriesPoint, SeriesSpec, MarkerPoint } from '../../../../vendor/vela/src/core/model/series';
export type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
export type { SerializedDrawing } from '../../../../vendor/vela/src/core/drawings/Drawing';
export type { ColumnarBars, ColumnarBarUpdate, ColumnarLodIndex } from '../../../../vendor/vela/src/core/model/columnar-bars';
export type { Background, PriceLine } from '../../../../vendor/vela/src/core/model/scene';
export type { DrawingLabel, DrawingLine, DrawingPolyline } from '../../../../vendor/vela/src/core/model/drawings';
export type { HighCardinalityRectBatch, HighCardinalityRectInstance } from '../../../../vendor/vela/src/core/model/instances';
export type { ScenePatch, ValuePatch } from '../../../../vendor/vela/src/core/model/patch';
export { registerSidePanel, unregisterSidePanel, registerWidgetAction, unregisterWidgetAction } from '../../../../vendor/vela/src/widget/contributions';
export type { SidePanelDescriptor, SidePanelHandle, SidePanelHeader, WidgetActionDescriptor, WidgetContext } from '../../../../vendor/vela/src/widget/contributions';
export type { VelaStorage } from '../../../../vendor/vela/src/widget/persist';

export function migrateVelaDrawings(value: unknown): SerializedDrawing[] {
  return migrateVelaDrawingDocument(value);
}

export type IChartApi = VelaNativeChartKernel;
export type ISeriesApi<T = string> = VelaNativeSeriesKernel<T>;

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
  opacity?: number;
  gradient?: boolean;
  gradientColor?: string;
  glow?: boolean;
  glowStrength?: number;
};

type ChartPointInput = { time: Time; value?: number | null; open?: number; high?: number; low?: number; close?: number; color?: string };

export type VelaNativeSeriesPatch =
  | { type:'append'; values: readonly ChartPointInput[] }
  | { type:'replaceLast'; values: readonly ChartPointInput[] }
  | { type:'replaceRange'; from:number; to:number; values: readonly ChartPointInput[] }
  | { type:'removeRange'; from:number; to:number };
type ChartMarkerInput = { time: Time; position: 'aboveBar' | 'belowBar' | 'inBar'; color: string; shape: string; text?: string; size?: 'tiny' | 'small' | 'normal' | 'large' | 'huge'; textSize?: number; offset?: number };

type PriceLineHandle = { id: string; remove: () => void };
export type FillHandle = { id: string; setOptions: (options: { enabled?: boolean; upperColor?: string; lowerColor?: string; opacity?: number; gradient?: boolean; conditional?: boolean; bullishColor?: string; bearishColor?: string }) => void; remove: () => void };

let chartSerial = 0;
let seriesSerial = 0;
let markerSerial = 0;

function lineStyle(value: unknown): VelaLineStyle {
  const n = Number(value) || 0;
  return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
}

export function msFromTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  // Epoch seconds are ~1.7e9; epoch milliseconds are ~1.7e12 in 2026.
  // The previous 2e12 cutoff misclassified modern millisecond timestamps
  // and multiplied them by 1,000 a second time.
  return n >= 1_000_000_000_000 ? n : n * 1000;
}

function mergeChartOptions(base: any, patch: any): any {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result: Record<string, any> = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    // An explicit undefined clears an optional setting such as backgroundGradient.
    if (value === undefined) result[key] = undefined;
    else if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = mergeChartOptions(result[key], value);
    else result[key] = value;
  }
  return result;
}

function velaThemeFromOptions(options: any): VelaTheme {
  const layout = options?.layout || {};
  const bg = layout.background?.color || layout.background || '#070a10';
  const text = layout.textColor || '#f3f4f6';
  const grid = options?.grid?.horzLines?.color || options?.grid?.vertLines?.color || '#171b27';
  const border = options?.rightPriceScale?.borderColor || options?.timeScale?.borderColor || '#252b3a';
  const gradient = layout.backgroundGradient && typeof layout.backgroundGradient === 'object' ? layout.backgroundGradient : undefined;
  const backgroundGradient = gradient && /^#[0-9a-f]{6}$/i.test(String(gradient.from || '')) && /^#[0-9a-f]{6}$/i.test(String(gradient.to || ''))
    ? { from: String(gradient.from), to: String(gradient.to), angle: Math.max(0, Math.min(360, Number(gradient.angle) || 0)) }
    : undefined;
  return { background: String(bg), ...(backgroundGradient ? { backgroundGradient } : {}), textColor: String(text), gridColor: String(grid), borderColor: String(border), upColor: '#22c55e', downColor: '#ef4444', fontFamily: String(layout.fontFamily || 'JetBrains Mono, monospace') };
}

function hexRgb(value: string): [number, number, number] | null {
  const raw = String(value || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return null;
  return [parseInt(raw.slice(1, 3), 16), parseInt(raw.slice(3, 5), 16), parseInt(raw.slice(5, 7), 16)];
}
function withAlpha(color: string, opacity: number): string {
  const rgb = hexRgb(color); const alpha = Math.max(0, Math.min(1, Number(opacity)));
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color;
}
function mixColor(a: string, b: string, t: number): string {
  const ar = hexRgb(a), br = hexRgb(b); if (!ar || !br) return withAlpha(a, 1 - t * 0.35);
  const n = Math.max(0, Math.min(1, t)); const f = (x: number, y: number) => Math.round(x + (y - x) * n);
  return `rgb(${f(ar[0],br[0])},${f(ar[1],br[1])},${f(ar[2],br[2])})`;
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
  constructor(private readonly chart: VelaNativeChartKernel) {}

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

export class VelaNativeSeriesKernel<T = string> {
  readonly id: string;
  private readonly kind: SeriesKind;
  private readonly model?: IndicatorModel;
  private handle?: IndicatorRenderHandle;
  private removed = false;
  private appearanceKey = '';
  private paneId = 'price';

  constructor(readonly chart: VelaNativeChartKernel, kind: SeriesKind, private options: SeriesOptions = {}, id = `tco-series:${++seriesSerial}`) {
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
        style: { color: withAlpha(String(options.color || '#38bdf8'), Number(options.opacity ?? 1)), width: Math.max(1, Number(options.lineWidth) || 1), lineStyle: lineStyle(options.lineStyle), glow: Boolean(options.glow) ? Math.max(0.05, Number(options.glowStrength) || 0.35) : 0 },
      } as any;
      this.model = indicatorBase(`tco-indicator:${id}`, title, chart.pricePaneId, [series]);
      this.handle = chart.renderer.mountIndicator(this.model);
    }
  }

  setData(rows: readonly ChartPointInput[]): void {
    if (this.removed) return;
    if (this.kind === 'candle') { this.chart.setBarsColumns(toColumnarBars(rows)); return; }
    const points = rows.map((p) => ({ time: msFromTime(p.time), value: p.value == null ? null : Number(p.value), ...(p.color ? { color: String(p.color) } : {}) })).filter((p) => Number.isFinite(p.time)) as SeriesPoint[];
    const current = this.valueSeries()?.points ?? [];
    let op: SeriesPatchOperation = 'replace';
    let payload = points;
    if (current.length > 0 && points.length === current.length + 1 && current[current.length - 1]!.time === points[points.length - 2]!.time) {
      op = 'append';
      payload = [points[points.length - 1]!];
    } else if (current.length > 0 && points.length === current.length && current[current.length - 1]!.time === points[points.length - 1]!.time) {
      op = 'replace-last';
      payload = [points[points.length - 1]!];
    }
    this.patchSeries(op, payload);
    this.chart.syncBandFillsForSeries(this.id, op, payload);
  }

  patch(patch: VelaNativeSeriesPatch): void {
    if (this.removed || this.kind === 'candle') return;
    const rawValues = patch.type === 'removeRange' ? [] : patch.values;
    const values = (rawValues ?? []).map((p) => ({ time: msFromTime(p.time), value: p.value == null ? null : Number(p.value), ...(p.color ? { color:String(p.color) } : {}) }))
      .filter((p) => Number.isFinite(p.time)) as SeriesPoint[];
    if (patch.type === 'append') {
      this.patchSeries('append', values);
      this.chart.syncBandFillsForSeries(this.id, 'append', values);
      return;
    }
    if (patch.type === 'replaceLast') {
      this.patchSeries('replace-last', values.slice(-1));
      this.chart.syncBandFillsForSeries(this.id, 'replace-last', values.slice(-1));
      return;
    }
    const series = this.valueSeries();
    if (!series) return;
    const start = Math.max(0, Math.min(series.points.length, Math.floor(patch.from)));
    const to = Math.max(start - 1, Math.min(series.points.length - 1, Math.floor(patch.to)));
    const remove = to >= start ? to - start + 1 : 0;
    if (patch.type === 'removeRange') {
      this.patchSeries('replace-range', [], start, remove);
      return;
    }
    this.patchSeries('replace-range', values, start, remove);
    this.chart.syncBandFillsForSeries(this.id, 'replace-range', values);
  }

  update(row: ChartPointInput): void {
    if (this.removed) return;
    if (this.kind === 'candle') { this.chart.updateBar(toBar(row)); return; }
    const point: SeriesPoint = { time: msFromTime(row.time), value: row.value == null ? null : Number(row.value), ...(row.color ? { color: String(row.color) } : {}) };
    if (!Number.isFinite(point.time)) return;
    const series = this.valueSeries(); if (!series) return;
    const last = series.points[series.points.length - 1];
    if (!last || point.time > last.time) {
      this.patchSeries('append', [point]);
      this.chart.syncBandFillsForSeries(this.id, 'append', [point]);
    } else if (point.time === last.time) {
      this.patchSeries('replace-last', [point]);
      this.chart.syncBandFillsForSeries(this.id, 'replace-last', [point]);
    }
  }

  applyOptions(next: SeriesOptions): void {
    this.options = { ...this.options, ...next };
    if (this.kind === 'candle') { this.chart.setCandleOptions(next); return; }
    const series = this.valueSeries();
    if (!series || !this.handle || !this.model) return;
    const appearanceKey = JSON.stringify({ color:this.options.color, opacity:this.options.opacity, width:this.options.lineWidth, style:this.options.lineStyle, visible:this.options.visible, legend:this.options.lastValueVisible, glow:this.options.glow, glowStrength:this.options.glowStrength });
    if (appearanceKey === this.appearanceKey) return;
    this.appearanceKey = appearanceKey;
    const baseColor = String(this.options.color || series.style.color || '#38bdf8');
    const opacity = Math.max(0.05, Math.min(1, Number(this.options.opacity ?? 1)));
    const style = {
      color: withAlpha(baseColor, opacity),
      width: Math.max(1, Number(this.options.lineWidth) || series.style.width || 1),
      lineStyle: lineStyle(this.options.lineStyle),
      glow: Boolean(this.options.glow) ? Math.max(0.05, Math.min(1, Number(this.options.glowStrength) || 0.35)) : 0,
    };
    this.chart.setSeriesGlow(series.id, Number(style.glow) || 0);
    this.chart.renderer.updateIndicator(this.handle, {
      kind: 'value', indicatorId: this.model.id, dirty: { from: 0, to: 0 }, series: [],
      seriesStyles: [{ seriesId: series.id, style, display: { pane: this.options.visible !== false, legend: !!this.options.lastValueVisible, priceScale: false, dataWindow: false }, title: String(this.options.title || series.title), visible: this.options.visible !== false }],
    } as ScenePatch);
  }

  setPaneAppearance(options: { mode:'auto'|'overlay'|'separate'; scale:'price'|'percent'|'indexed'|'log'; scaleMode:'auto'|'manual'; min:number|null; max:number|null; auto:boolean; inverted:boolean }, paneId?: string): void {
    if (this.kind === 'candle' || !this.handle) return;
    const targetPane = options.mode === 'separate'
      ? (paneId || `tco-indicator-pane:${this.id}`)
      : options.mode === 'overlay'
        ? this.chart.pricePaneId
        : (this.paneId || this.chart.pricePaneId);
    if (targetPane !== this.paneId) {
      const pane: Pane = { id: targetPane, kind: targetPane === this.chart.pricePaneId ? 'price' : 'study', order: targetPane === this.chart.pricePaneId ? 0 : 10, heightWeight: 1, title: targetPane === this.chart.pricePaneId ? undefined : String(this.options.title || this.id) };
      if (targetPane !== this.chart.pricePaneId) this.chart.renderer.ensurePane(pane);
      this.chart.renderer.setIndicatorPane(this.handle, targetPane, { ownScale: targetPane !== this.chart.pricePaneId });
      this.paneId = targetPane;
    }
    this.chart.renderer.configurePaneAppearance?.(targetPane, { scale: options.scale === 'log' ? 'price' : options.scale, log: options.scale === 'log', scaleMode: options.scaleMode, auto: options.auto && options.scaleMode === 'auto', min: options.min, max: options.max, inverted: options.inverted });
  }

  priceScale(): { applyOptions: (options: { scaleMargins?: { top?: number; bottom?: number } }) => void } {
    return { applyOptions: () => { /* Vela owns pane geometry; no data recomputation is performed. */ } };
  }

  createPriceLine(options: { price: number; color?: string; lineWidth?: number; lineStyle?: number; axisLabelVisible?: boolean; title?: string; lastValueVisible?: boolean }): PriceLineHandle {
    return this.chart.createPriceLine(options);
  }

  removePriceLine(handle: PriceLineHandle): void {
    handle.remove();
  }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    if (this.handle) this.chart.renderer.removeIndicator(this.handle);
    this.chart.removeBandFillsForSeries(this.id);
    this.chart.unregisterSeries(this);
  }

  getPaneId(): string { return this.paneId; }
  snapshotPoints(): SeriesPoint[] { return this.valueSeries()?.points || []; }

  private valueSeries(): LineLikeSeries | undefined {
    const s = this.model?.series[0];
    return s && (s.kind === 'line' || s.kind === 'histogram') ? s : undefined;
  }

  private patchSeries(op: SeriesPatchOperation, points: SeriesPoint[], start?:number, remove?:number): void {
    const series = this.valueSeries();
    if (!series || !this.handle || !this.model) return;
    const retained = series.points;
    const dirtyFrom = points[0]?.time ?? retained[Math.max(0,start ?? retained.length - 1)]?.time ?? 0;
    const dirtyTo = points.at(-1)?.time ?? retained[Math.min(retained.length - 1,(start ?? retained.length - 1))]?.time ?? dirtyFrom;
    this.chart.renderer.updateIndicator(this.handle, {
      kind: 'value', indicatorId: this.model.id,
      dirty: { from: dirtyFrom, to: dirtyTo },
      series: [{ seriesId: series.id, kind: 'points', points, op, ...(start != null ? { start } : {}), ...(remove != null ? { remove } : {}) }],
    } as ScenePatch);
  }
}

function markerEqual(a: MarkerPoint, b: MarkerPoint): boolean {
  return a.time === b.time && a.position === b.position && a.color === b.color && a.shape === b.shape && a.text === b.text && a.size === b.size && a.textSize === b.textSize && a.offset === b.offset;
}
function markerPatch(previous: readonly MarkerPoint[], next: readonly MarkerPoint[]): { op: SeriesPatchOperation; markers: MarkerPoint[]; start?: number; remove?: number } | null {
  let start = 0;
  while (start < previous.length && start < next.length && markerEqual(previous[start]!, next[start]!)) start += 1;
  if (start === previous.length && start === next.length) return null;
  let oldEnd = previous.length - 1, newEnd = next.length - 1;
  while (oldEnd >= start && newEnd >= start && markerEqual(previous[oldEnd]!, next[newEnd]!)) { oldEnd -= 1; newEnd -= 1; }
  const payload = next.slice(start, newEnd + 1);
  const remove = Math.max(0, oldEnd - start + 1);
  if (start >= previous.length) return { op: 'append', markers: payload };
  if (start === 0 && oldEnd === previous.length - 1 && newEnd === next.length - 1) return { op: 'replace', markers: payload };
  return { op: 'replace-range', markers: payload, start, remove };
}

function toColumnarBars(rows: readonly ChartPointInput[]): ColumnarBars {
  const n = rows.length;
  const time = new Float64Array(n), open = new Float64Array(n), high = new Float64Array(n), low = new Float64Array(n), close = new Float64Array(n), volume = new Float64Array(n);
  volume.fill(Number.NaN);
  for (let i = 0; i < n; i += 1) {
    const row = rows[i]!, t = msFromTime(row.time), c = Number(row.close ?? row.value ?? 0);
    time[i] = t; open[i] = Number(row.open ?? c); high[i] = Number(row.high ?? c); low[i] = Number(row.low ?? c); close[i] = c;
    const v = Number((row as any).volume); if (Number.isFinite(v)) volume[i] = v;
  }
  return { time, open, high, low, close, volume, length:n, timeUnit:'milliseconds' };
}

function toBar(row: ChartPointInput): OHLCV {
  const time = msFromTime(row.time);
  const close = Number(row.close ?? row.value ?? 0);
  return { time, open: Number(row.open ?? close), high: Number(row.high ?? close), low: Number(row.low ?? close), close, volume: Number((row as any).volume) || undefined };
}

export function createSeriesMarkers(candle: ISeriesApi<'Candlestick'> | ISeriesApi, markers: readonly ChartMarkerInput[] = []) {
  const host = candle as unknown as VelaNativeSeriesKernel;
  const state = { id: `tco-marker:${++markerSerial}` };
  const setMarkers = (next: readonly ChartMarkerInput[]) => host.chart.setMarkers(next);
  setMarkers(markers);
  return { setMarkers, detach: () => host.chart.setMarkers([]), id: state.id };
}

export class VelaNativeChartKernel {
  readonly renderer = new NativeRenderer();
  readonly pricePaneId = 'price';
  private readonly timeScaleFacade = new VelaTimeScaleFacade(this);
  private readonly series = new Set<VelaNativeSeriesKernel>();
  private readonly candleSeries = new Set<VelaNativeSeriesKernel>();
  private readonly markerModels = new Map<string, { handle: IndicatorRenderHandle; seriesId: string; markers: MarkerPoint[] }>();
  private readonly bandFills = new Map<string, { handle: IndicatorRenderHandle; modelId: string; from: VelaNativeSeriesKernel; to: VelaNativeSeriesKernel; fill: Fill; options: any }>();
  private readonly priceLineModelId = `tco-price-lines:${++chartSerial}`;
  private priceLineHandle?: IndicatorRenderHandle;
  private priceLines: PriceLine[] = [];
  private lastCandleOptions: SeriesOptions = {};
  private themeOptions: any = {};
  private mounted = false;
  private onClickHandlers = new Set<(param: any) => void>();
  private logicalRangeSubscriptions = new Map<(range: { from: number; to: number } | null) => void, Unsubscribe>();
  private timeRangeSubscriptions = new Map<(range: { from: number; to: number } | null) => void, Unsubscribe>();
  private readonly drawingEvents = new TypedEventBus<VelaEventMap>();
  private readonly drawingController: DrawingController;
  readonly drawings: DrawingsControl;
  private readonly drawingChangeHandlers = new Set<() => void>();

  constructor(private readonly host: HTMLElement, options: any = {}) {
    this.themeOptions = mergeChartOptions({}, options);
    this.renderer.mount(host, velaThemeFromOptions(this.themeOptions));
    this.drawingController = new DrawingController(
      this.renderer,
      this.drawingEvents,
      (options?.drawings === undefined ? true : options.drawings) as DrawingsOption,
    );
    this.drawings = new DrawingsControl(this.drawingController);
    this.mounted = true;
    for (const eventName of ['drawing:created','drawing:edited','drawing:removed','drawing:favorites','drawing:selected'] as const) {
      this.drawingEvents.on(eventName, () => {
        for (const handler of this.drawingChangeHandlers) handler();
      });
    }
    if (Array.isArray(options?.velaDrawings)) {
      const initial = options.velaDrawings as SerializedDrawing[];
      void loadDrawingFamiliesForTypes(initial.map((drawing) => drawing.type)).then(() => this.drawings.fromJSON({version:1,drawings:initial}));
    }
    this.renderer.onClick((event: ClickEvent) => {
      for (const cb of this.onClickHandlers) cb({ point: event.time == null ? undefined : { x: this.timeToCoordinate(event.time) ?? 0, y: event.price == null ? 0 : this.priceToCoordinate(event.price) ?? 0 }, time: event.time ?? undefined, seriesData: new Map() });
    });
  }

  addSeries(kindToken: any, options: SeriesOptions = {}): VelaNativeSeriesKernel {
    const kind: SeriesKind = kindToken?.kind === 'candlestick' ? 'candle' : kindToken?.kind === 'histogram' ? 'histogram' : 'line';
    const s = new VelaNativeSeriesKernel(this, kind, options);
    this.series.add(s);
    if (kind === 'candle') this.candleSeries.add(s);
    return s;
  }

  removeSeries(series: VelaNativeSeriesKernel): void { series.remove(); }
  timeScale(): VelaTimeScaleFacade { return this.timeScaleFacade; }
  resize(width: number, height: number): void { if (this.mounted) this.renderer.resize(); if (this.host.style.width === '' && width) this.host.style.width = `${Math.max(1, width)}px`; if (this.host.style.height === '' && height) this.host.style.height = `${Math.max(1, height)}px`; }
  onDrawingChange(cb: () => void): () => void {
    this.drawingChangeHandlers.add(cb);
    return () => this.drawingChangeHandlers.delete(cb);
  }
  remove(): void {
    if (!this.mounted) return;
    this.drawingController.destroy();
    this.drawingChangeHandlers.clear();
    this.series.forEach(s => s.remove());
    this.series.clear();
    this.renderer.destroy();
    this.mounted = false;
  }
  applyOptions(options: any): void {
    this.themeOptions = mergeChartOptions(this.themeOptions, options);
    this.renderer.setTheme(velaThemeFromOptions(this.themeOptions));
    if (options?.crosshair) this.renderer.applyFeature('crosshair.visible', Number(options.crosshair.mode) !== 2);
  }
  subscribeClick(cb: (param: any) => void): void { this.onClickHandlers.add(cb); }
  unsubscribeClick(cb: (param: any) => void): void { this.onClickHandlers.delete(cb); }
  subscribeSizeChange(_cb: () => void): () => void { return () => {}; }

  setBars(bars: readonly ChartPointInput[]): void { this.setBarsColumns(toColumnarBars(bars)); }
  setBarsColumns(columns: ColumnarBars): void { this.renderer.setBarsColumns(columns, { preserveView: this.renderer.getVisibleRange() !== null }); }
  updateBar(bar: OHLCV): void { this.updateBarColumns({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, timeUnit: 'milliseconds' }); }
  updateBarColumns(update: ColumnarBarUpdate): void { this.renderer.updateBarColumns(update); }
  setCandleOptions(options: SeriesOptions): void { this.lastCandleOptions = { ...this.lastCandleOptions, ...options }; const apply = (this.renderer as any).setCandleAppearance; if (typeof apply === 'function') apply.call(this.renderer, { upColor: options.upColor || options.color || '#22c55e', downColor: options.downColor || options.color || '#ef4444', borderUpColor: options.borderUpColor, borderDownColor: options.borderDownColor, wickUpColor: options.wickUpColor, wickDownColor: options.wickDownColor, borderVisible: options.borderVisible, wickVisible: options.wickVisible }); }
  setMarkers(markers: readonly ChartMarkerInput[]): void {
    const modelId = `${this.priceLineModelId}:markers`;
    const existing = this.markerModels.get(modelId);
    const next: MarkerPoint[] = markers.map((m): MarkerPoint => ({ time: msFromTime(m.time), position: m.position, color: String(m.color || '#f59e0b'), shape: String(m.shape || 'circle'), ...(m.text ? { text: String(m.text) } : {}), ...(m.size ? { size: m.size } : {}), ...(m.textSize != null ? { textSize: Number(m.textSize) } : {}), ...(m.offset != null ? { offset: Number(m.offset) } : {}) }));
    if (!existing) {
      const seriesId = `${modelId}:series`;
      const markerSeries: SeriesSpec = { id: seriesId, title: 'Signals', paneId: this.pricePaneId, kind: 'markers', visible: true, overlay: true, markers: next };
      const model = indicatorBase(modelId, 'Signals', this.pricePaneId, [markerSeries]);
      const handle = this.renderer.mountIndicator(model);
      this.markerModels.set(modelId, { handle, seriesId, markers: next });
      return;
    }
    const delta = markerPatch(existing.markers, next);
    if (!delta) return;
    existing.markers = next;
    this.renderer.updateIndicator(existing.handle, { kind: 'value', indicatorId: modelId, dirty: { from: delta.markers[0]?.time ?? 0, to: delta.markers.at(-1)?.time ?? 0 }, series: [{ seriesId: existing.seriesId, kind: 'markers', markers: delta.markers, op: delta.op, start: delta.start, remove: delta.remove }] } as ScenePatch);
  }

  createPriceLine(optionsOrPrice: number | { price: number; color?: string; lineWidth?: number; lineStyle?: number; axisLabelVisible?: boolean; title?: string; lastValueVisible?: boolean }, legacyOptions?: { color?: string; lineWidth?: number; lineStyle?: number; axisLabelVisible?: boolean; title?: string; lastValueVisible?: boolean }): PriceLineHandle {
    const options = typeof optionsOrPrice === 'number' ? { ...(legacyOptions ?? {}), price: optionsOrPrice } : optionsOrPrice;
    const id = `tco-price-line:${++seriesSerial}`;
    this.priceLines.push({ id, paneId: this.pricePaneId, price:Number(options.price), color:String(options.color || '#60a5fa'), width:Math.max(1,Number(options.lineWidth)||1), lineStyle:lineStyle(options.lineStyle), title:options.title });
    this.ensurePriceLineModel();
    this.updatePriceLineModel();
    return { id, remove:()=>{ this.priceLines=this.priceLines.filter(x=>x.id!==id); this.updatePriceLineModel(); } };
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
  addFillBetweenSeries(from: VelaNativeSeriesKernel, to: VelaNativeSeriesKernel, options: { id?: string; enabled?: boolean; upperColor?: string; lowerColor?: string; opacity?: number; gradient?: boolean; conditional?: boolean; bullishColor?: string; bearishColor?: string } = {}): FillHandle {
    const id = options.id || `tco-fill:${++seriesSerial}`;
    const existing = this.bandFills.get(id);
    if (existing) { this.applyFillOptions(existing, options); return { id, setOptions: next => this.applyFillOptions(existing, next), remove: () => this.removeBandFill(id) }; }
    const modelId = `${id}:model`, fromId = `${id}:from`, toId = `${id}:to`;
    const fromSpec: SeriesSpec = { id: fromId, title: `${id}:from`, paneId: this.pricePaneId, kind: 'line', visible: false, overlay: true, display: { pane: false, legend: false, priceScale: false, dataWindow: false }, points: from.snapshotPoints(), style: { color: '#60a5fa', width: 1, lineStyle: 'solid' } };
    const toSpec: SeriesSpec = { id: toId, title: `${id}:to`, paneId: this.pricePaneId, kind: 'line', visible: false, overlay: true, display: { pane: false, legend: false, priceScale: false, dataWindow: false }, points: to.snapshotPoints(), style: { color: '#60a5fa', width: 1, lineStyle: 'solid' } };
    const fill: Fill = { id: `${id}:fill`, paneId: this.pricePaneId, fromSeriesId: fromId, toSeriesId: toId };
    const model = indicatorBase(modelId, 'Indicator fill', this.pricePaneId, [fromSpec, toSpec]); model.fills = [fill];
    const handle = this.renderer.mountIndicator(model);
    const state = { handle, modelId, from, to, fill, options: {} as any };
    this.bandFills.set(id, state); this.applyFillOptions(state, options); this.syncBandFill(id);
    return { id, setOptions: next => this.applyFillOptions(state, next), remove: () => this.removeBandFill(id) };
  }

  private applyFillOptions(state: { handle: IndicatorRenderHandle; modelId: string; from: VelaNativeSeriesKernel; to: VelaNativeSeriesKernel; fill: Fill; options: any }, options: any): void {
    state.options = { ...state.options, ...options };
    const fromPoints = state.from.snapshotPoints(), toPoints = state.to.snapshotPoints();
    const opacity = Math.max(0.02, Math.min(1, Number(state.options.opacity ?? 0.18)));
    const upper = withAlpha(String(state.options.upperColor || '#60a5fa'), opacity);
    const lower = withAlpha(String(state.options.lowerColor || '#60a5fa'), opacity);
    const fill = state.fill;
    if (state.options.enabled === false) { fill.colors = undefined; fill.gradient = undefined; fill.color = 'rgba(0,0,0,0)'; }
    else if (state.options.gradient) {
      fill.color = undefined; fill.colors = undefined;
      fill.gradient = fromPoints.map((p, i) => { const q = toPoints[i]; if (!q || p.value == null || q.value == null) return null; return { topValue: Math.max(p.value, q.value), bottomValue: Math.min(p.value, q.value), topColor: upper, bottomColor: lower }; });
    } else if (state.options.conditional) {
      fill.gradient = undefined; fill.color = undefined;
      fill.colors = fromPoints.map((p, i) => { const q = toPoints[i]; if (!q || p.value == null || q.value == null) return null; return p.value >= q.value ? withAlpha(String(state.options.bullishColor || '#22c55e'), opacity) : withAlpha(String(state.options.bearishColor || '#ef4444'), opacity); });
    } else { fill.gradient = undefined; fill.colors = undefined; fill.color = upper; }
    fill.paneId = state.from.getPaneId();
    this.renderer.updateIndicator(state.handle, { kind: 'value', indicatorId: state.modelId, dirty: { from: fromPoints[0]?.time ?? 0, to: fromPoints.at(-1)?.time ?? 0 }, series: [], fillStyles: [{ fillId: fill.id, paneId: fill.paneId, color: fill.color }], fillDeltas: [{ fillId: fill.id, op: 'replace', ...(fill.colors !== undefined ? { colors: fill.colors } : {}), ...(fill.gradient !== undefined ? { gradient: fill.gradient } : {}) }] } as ScenePatch);
  }

  private syncBandFill(id: string): void {
    const state = this.bandFills.get(id); if (!state) return;
    const fromPoints = state.from.snapshotPoints(), toPoints = state.to.snapshotPoints();
    this.renderer.updateIndicator(state.handle, { kind: 'value', indicatorId: state.modelId, dirty: { from: fromPoints[0]?.time ?? 0, to: fromPoints.at(-1)?.time ?? 0 }, series: [{ seriesId: `${id}:from`, kind: 'points', points: fromPoints, op: 'replace' }, { seriesId: `${id}:to`, kind: 'points', points: toPoints, op: 'replace' }] } as ScenePatch);
  }

  syncBandFillsForSeries(seriesId: string, op: SeriesPatchOperation = 'replace', points?: SeriesPoint[]): void {
    for (const [id, state] of this.bandFills) {
      const target = state.from.id === seriesId ? `${id}:from` : state.to.id === seriesId ? `${id}:to` : null;
      if (!target) continue;
      const payload = points ?? (target.endsWith(':from') ? state.from.snapshotPoints() : state.to.snapshotPoints());
      if (payload.length === 0 && op !== 'replace') continue;
      this.renderer.updateIndicator(state.handle, { kind: 'value', indicatorId: state.modelId, dirty: { from: payload[0]?.time ?? 0, to: payload.at(-1)?.time ?? 0 }, series: [{ seriesId: target, kind: 'points', points: payload, op }] } as ScenePatch);
    }
  }


  private removeBandFill(id: string): void {
    const state = this.bandFills.get(id);
    if (!state) return;
    this.renderer.removeIndicator(state.handle);
    this.bandFills.delete(id);
  }

  removeBandFillsForSeries(seriesId: string): void {
    for (const [id, state] of this.bandFills) {
      if (state.from.id === seriesId || state.to.id === seriesId) this.removeBandFill(id);
    }
  }


  unregisterSeries(series: VelaNativeSeriesKernel): void { this.series.delete(series); this.candleSeries.delete(series); this.setSeriesGlow(series.id, 0); }
  private readonly seriesGlow = new Map<string, number>();
  setSeriesGlow(seriesId: string, amount: number): void {
    if (amount > 0) this.seriesGlow.set(seriesId, Math.min(1, amount)); else this.seriesGlow.delete(seriesId);
    const max = Math.max(0, ...this.seriesGlow.values());
    this.renderer.applyFeature('glow', max);
  }


  /** Renderer-only compatibility bridge for appearance modules; live data uses incremental updateIndicator patches. */
  setIndicatorFills(indicatorId: string, fills: Fill[]): void {
    const fn = (this.renderer as any).setIndicatorFills;
    if (typeof fn === 'function') fn.call(this.renderer, indicatorId, fills);
  }

  /** Renderer-only compatibility bridge; callers with live data should prefer incremental patch ops. */
  setIndicatorSeriesPoints(indicatorId: string, updates: Array<{ seriesId: string; points: SeriesPoint[] }>): void {
    const fn = (this.renderer as any).setIndicatorSeriesPoints;
    if (typeof fn === 'function') fn.call(this.renderer, indicatorId, updates);
  }

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

export function createVelaNativeChart(host: HTMLElement, options?: any): IChartApi { return new VelaNativeChartKernel(host, options); }
