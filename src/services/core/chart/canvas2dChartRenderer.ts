import type { ChartDataPoint, ColumnarCandleStore } from './chartDataModel';
import type { ChartLodBar, ChartLodIndex } from './chartLevelOfDetail';
import type { ChartRenderer, ChartRendererEnvironment } from './chartRenderer';
import type { ChartScene } from './chartScene';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';

/** Lightweight renderer-neutral fallback used when WebGL2 is unavailable. */
export class Canvas2DChartRenderer implements ChartRenderer {
  readonly kind = 'canvas2d';
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private reduced: readonly ChartLodBar[] = [];
  private reducedIndex: ChartLodIndex | null = null;
  private store: ColumnarCandleStore | null = null;
  private width = 1;
  private height = 1;

  mount(environment: ChartRendererEnvironment): void {
    this.dispose();
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
    environment.mount.appendChild(canvas);
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.resize(environment.width, environment.height, environment.pixelRatio);
  }
  resize(width: number, height: number, pixelRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): void {
    this.width = Math.max(1, Math.floor(width)); this.height = Math.max(1, Math.floor(height));
    if (!this.canvas || !this.ctx) return;
    this.canvas.width = Math.floor(this.width * pixelRatio); this.canvas.height = Math.floor(this.height * pixelRatio);
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  setCandles(_rows: readonly ChartDataPoint[]): void {}
  setCandlesStore(store: ColumnarCandleStore): void { this.store = store; }
  updateLastCandle(_row: ChartDataPoint): void {}
  setReducedCandles(rows: readonly ChartLodBar[]): void { this.reduced = rows; this.reducedIndex = null; }
  setReducedCandlesIndex(index: ChartLodIndex): void { this.reducedIndex = index; }
  setScene(_scene: ChartScene): void {}
  render(): void {
    if (!this.ctx) return;
    const palette = getThemePalette(getCurrentTheme());
    this.ctx.fillStyle = palette.surface2; this.ctx.fillRect(0, 0, this.width, this.height);
    const index = this.reducedIndex;
    if (index && index.count) {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < index.count; i++) { min = Math.min(min, index.low[i]); max = Math.max(max, index.high[i]); }
      const range = Math.max(max - min, 1e-9); const step = this.width / index.count;
      this.ctx.lineWidth = 1;
      for (let i = 0; i < index.count; i++) {
        const open = index.open[i]; const close = index.close[i]; const high = index.high[i]; const low = index.low[i];
        const x = i * step + step / 2;
        const y = (price:number) => this.height - ((price - min) / range) * this.height;
        const color = close >= open ? palette.accentSoft : '#ef4444';
        this.ctx.strokeStyle = color; this.ctx.fillStyle = color;
        this.ctx.beginPath(); this.ctx.moveTo(x, y(high)); this.ctx.lineTo(x, y(low)); this.ctx.stroke();
        const bodyTop = Math.min(y(open), y(close)); const bodyHeight = Math.max(1, Math.abs(y(open) - y(close)));
        this.ctx.fillRect(Math.max(0, x - step * .28), bodyTop, Math.max(1, step * .56), bodyHeight);
      }
    } else {
      if (!this.reduced.length) return;
      let min = Infinity, max = -Infinity;
      for (const candle of this.reduced) { min = Math.min(min, candle.low); max = Math.max(max, candle.high); }
      const range = Math.max(max - min, 1e-9); const step = this.width / this.reduced.length;
      this.ctx.lineWidth = 1;
      for (let i = 0; i < this.reduced.length; i++) {
        const c = this.reduced[i]; const x = i * step + step / 2;
        const y = (price:number) => this.height - ((price - min) / range) * this.height;
        const color = c.close >= c.open ? palette.accentSoft : '#ef4444';
        this.ctx.strokeStyle = color; this.ctx.fillStyle = color;
        this.ctx.beginPath(); this.ctx.moveTo(x, y(c.high)); this.ctx.lineTo(x, y(c.low)); this.ctx.stroke();
        const bodyTop = Math.min(y(c.open), y(c.close)); const bodyHeight = Math.max(1, Math.abs(y(c.open) - y(c.close)));
        this.ctx.fillRect(Math.max(0, x - step * .28), bodyTop, Math.max(1, step * .56), bodyHeight);
      }
    }
  }
  dispose(): void { this.canvas?.remove(); this.canvas = null; this.ctx = null; this.reduced = []; this.reducedIndex = null; this.store = null; }
}
