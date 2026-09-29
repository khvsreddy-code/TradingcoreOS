import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { ChartDataEngine } from './chartDataEngine';
import { ChartInteractionEngine } from './chartInteraction';
import { ChartRenderingEngine } from './chartRenderingEngine';
import { createDefaultChartRenderer } from './chartRendererFactory';
import { createLodIndex, updateLodIndex } from './chartLevelOfDetail';
import { ChartViewportController } from './chartViewportController';
import { ChartScaleModel } from './chartScales';
import type { ChartTimeScaleOptions } from './chartTimeScale';
import type { ChartRenderer } from './chartRenderer';
import { TradingCoreChartApi } from './chartApi';
import { CoreDrawingStore } from '../drawing/coreDrawingStore';
import { ChartGestureController } from './chartGestureController';

function normalize(rows: readonly HistoricalCandle[]) {
  return rows.map(row => ({
    time: Math.floor(Date.parse(String(row.timestamp)) / 1000),
    open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) || 0,
  })).filter(row => Number.isFinite(row.time) && row.time > 0 && [row.open, row.high, row.low, row.close].every(Number.isFinite));
}

/** Full renderer-neutral chart platform coordinator for future native migration. */
export class TradingCoreChartEngine {
  readonly data: ChartDataEngine;
  readonly interaction = new ChartInteractionEngine();
  readonly renderer: ChartRenderingEngine;
  readonly viewport = new ChartViewportController();
  readonly scales = new ChartScaleModel();
  private lastScaleRevision = -1;
  private lastScaleViewportFrom = -1;
  private lastScaleViewportTo = -1;
  private lastScalePixelsPerBar = -1;
  private lastScaleMode = '';
  readonly lod = createLodIndex();
  readonly drawingStore = new CoreDrawingStore();
  readonly api: TradingCoreChartApi;
  readonly gestures: ChartGestureController;

  constructor(timelineKey = 'chart', renderer: ChartRenderer = createDefaultChartRenderer(), timeScale?: ChartTimeScaleOptions) {
    this.data = new ChartDataEngine(timelineKey);
    if (timeScale) this.scales.setTimeOptions(timeScale);
    this.api = new TradingCoreChartApi({ viewport: this.viewport, time: this.scales.time, price: this.scales.price, lengthProvider: () => this.data.plane.length, drawingStore: this.drawingStore });
    this.gestures = new ChartGestureController(this.api.navigation);
    this.renderer = new ChartRenderingEngine(renderer);
    this.viewport.set(this.data.plane.length, { from: 0, to: this.data.plane.length, pixelWidth: 1 });
  }

  mount(environment: Parameters<ChartRenderer['mount']>[0]): void { this.renderer.renderer.mount(environment); }
  replaceHistory(rows: readonly HistoricalCandle[]): void { this.data.replace(normalize(rows)); this.lastScaleRevision = -1; this.lastScaleViewportFrom = -1; this.lastScaleViewportTo = -1; this.lastScalePixelsPerBar = -1; this.lastScaleMode = ''; this.viewport.set(this.data.plane.length, { ...this.viewport.get(), firstVisibleBar: 0, lastVisibleBar: Math.max(0, this.data.plane.length - 1) }); }
  updateRealtime(row: HistoricalCandle): void {
    const normalized = normalize([row])[0];
    if (!normalized) return;
    const lastTime = this.data.plane.length ? this.data.plane.market.time[this.data.plane.length - 1] : undefined;
    if (lastTime === normalized.time) this.data.updateLast(normalized);
    else if (lastTime == null || normalized.time > lastTime) this.data.append(normalized);
  }

  render(width: number, height = 1, pixelRatio?: number): void {
    this.api.navigation.setViewportSize(width, height, pixelRatio ?? this.viewport.get().devicePixelRatio);
    this.viewport.resizePixelWidth(width, this.data.plane.length);
    if (pixelRatio != null) this.viewport.setDevicePixelRatio(pixelRatio);
    const viewportState = this.viewport.get();
    const scaleChanged = this.lastScaleRevision !== this.data.plane.revision
      || this.lastScaleViewportFrom !== viewportState.firstVisibleBar
      || this.lastScaleViewportTo !== viewportState.lastVisibleBar
      || this.lastScalePixelsPerBar !== viewportState.pixelsPerBar
      || this.lastScaleMode !== this.scales.price.mode;
    if (scaleChanged) {
      const market = this.data.plane.market;
      this.scales.bindTimeline(market.time);
      const vp = this.viewport.get();
      const first = Math.max(0, Math.min(market.length, vp.firstVisibleBar));
      const to = Math.min(market.length, Math.max(first + 1, vp.lastVisibleBar + 1));
      const base = market.close[first];
      this.scales.setAutoPriceScale(market.high, market.low, first, to, base);
      const domain = this.scales.price.domain;
      this.viewport.setPriceDomain(domain.min, domain.max);
      this.lastScaleRevision = this.data.plane.revision;
      this.lastScaleViewportFrom = this.viewport.get().firstVisibleBar;
      this.lastScaleViewportTo = this.viewport.get().lastVisibleBar;
      this.lastScalePixelsPerBar = this.viewport.get().pixelsPerBar;
      this.lastScaleMode = this.scales.price.mode;
    }
    updateLodIndex(this.data.plane.market, this.lod, this.viewport.get());
    this.renderer.renderer.resize(width, height, pixelRatio);
    this.renderer.renderer.setCandlesStore(this.data.plane.market);
    this.renderer.renderer.setReducedCandlesIndex(this.lod);
    this.renderer.render();
  }

  dispatchInteraction(event: Parameters<ChartInteractionEngine['handle']>[0]): void {
    this.interaction.handle(event);
    if (event.type !== 'doubleclick') {
      this.gestures.handle({ type: event.type, x: event.x, y: event.y, deltaX: event.deltaX, deltaY: event.deltaY });
    }
  }
  dispatchGesture(event: Parameters<ChartGestureController['handle']>[0]): void { this.gestures.handle(event); }
  pan(deltaBars: number): void { this.viewport.panByBars(this.data.plane.length, deltaBars); }
  zoom(factor: number, anchorRatio = 0.5): void { this.viewport.zoom(factor, this.data.plane.length, anchorRatio); }
  dispose(): void { this.renderer.dispose(); this.data.plane.detachConsumer(`chart:${this.data.plane.timelineKey}`); }
}
