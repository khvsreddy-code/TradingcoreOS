import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { ChartDataEngine } from './chartDataEngine';
import { ChartRenderingEngine } from './chartRenderingEngine';
import { createLodIndex, updateLodIndex, type ChartLodIndex } from './chartLevelOfDetail';
import type { ChartRenderer } from './chartRenderer';

/** Backward-compatible facade over the deeper TradingCore chart architecture. */
export class ChartCore {
  readonly data;
  readonly scene;
  private readonly dataEngine: ChartDataEngine;
  private readonly renderingEngine: ChartRenderingEngine;
  private lastRenderedRevision = -1;
  private lastWidth = 0;
  private readonly lod: ChartLodIndex = createLodIndex();

  constructor(renderer: ChartRenderer) {
    this.dataEngine = new ChartDataEngine('chart');
    this.data = this.dataEngine.plane.market;
    this.renderingEngine = new ChartRenderingEngine(renderer);
    this.scene = this.renderingEngine.scene;
  }

  replaceHistory(rows: readonly HistoricalCandle[]): void {
    this.dataEngine.replace(rows.map(row => ({
      time: Math.floor(Date.parse(String(row.timestamp)) / 1000),
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) || 0,
    })).filter(row => Number.isFinite(row.time) && row.time > 0 && [row.open,row.high,row.low,row.close].every(Number.isFinite)));
    this.lastRenderedRevision = -1;
  }

  updateRealtime(row: HistoricalCandle): void {
    const time = Math.floor(Date.parse(String(row.timestamp)) / 1000);
    const normalized = { time, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) || 0 };
    if (!Number.isFinite(time) || time <= 0 || ![normalized.open, normalized.high, normalized.low, normalized.close].every(Number.isFinite)) return;
    const lastTime = this.data.length ? this.data.time[this.data.length - 1] : undefined;
    if (lastTime === time) this.dataEngine.updateLast(normalized);
    else if (lastTime == null || time > lastTime) this.dataEngine.append(normalized);
  }

  render(width: number): void {
    this.lastWidth = Math.max(1, Math.floor(width));
    if (this.lastRenderedRevision === this.data.revision && this.lod.viewport.pixelWidth === this.lastWidth) {
      this.renderingEngine.render();
      return;
    }
    updateLodIndex(this.data, this.lod, { from: 0, to: this.data.length, pixelWidth: this.lastWidth });
    this.renderingEngine.renderer.setCandlesStore(this.data);
    this.renderingEngine.renderer.setReducedCandlesIndex(this.lod);
    this.renderingEngine.render();
    this.lastRenderedRevision = this.data.revision;
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    this.renderingEngine.renderer.resize(width, height, pixelRatio);
    this.lastWidth = Math.max(1, Math.floor(width));
  }

  getRenderStats() {
    return { ...this.renderingEngine.getStats(), revision: this.data.revision, candles: this.data.length, lodBuckets: this.lod.count, sceneRevision: this.scene.revision, dirtyFrom: this.data.dirtyRange.from, dirtyTo: this.data.dirtyRange.to, lodDirtyFrom: this.lod.dirtyFromBucket, lodDirtyTo: this.lod.dirtyToBucket } as const;
  }

  dispose(): void { this.renderingEngine.dispose(); this.dataEngine.plane.detachConsumer('chart:chart'); }
}
