import type { ChartRenderer, ChartRendererEnvironment } from './chartRenderer';
import type { ChartDataPoint, ColumnarCandleStore } from './chartDataModel';
import type { ChartLodBar, ChartLodIndex } from './chartLevelOfDetail';
import type { ChartScene } from './chartScene';
import { NativeRenderer } from '../../../../vendor/vela/src/renderers/native/NativeRenderer';
import type { VelaTheme } from '../../../../vendor/vela/src/core/options';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';

function theme(): VelaTheme {
  const p = getThemePalette(getCurrentTheme());
  return { background: p.surface2, textColor: p.muted, gridColor: p.grid, borderColor: p.axis, upColor: '#22c55e', downColor: '#ef4444', fontFamily: 'JetBrains Mono, monospace' };
}

type VelaLegacyBar = Parameters<NativeRenderer['setBars']>[0][number];

function toBars(rows: readonly ChartDataPoint[]): VelaLegacyBar[] {
  return rows.map((x) => ({ time: Number(x.time) * 1000, open: Number(x.open), high: Number(x.high), low: Number(x.low), close: Number(x.close), volume: Number(x.volume) || undefined }));
}

/** TCO's renderer-port implementation. Vela is contained here; no Vela type crosses this seam. */
export class VelaNativeChartRenderer implements ChartRenderer {
  readonly kind = 'vela-native';
  private renderer = new NativeRenderer();

  mount(environment: ChartRendererEnvironment): void { this.renderer.mount(environment.mount, theme()); }
  resize(_width: number, _height: number, _pixelRatio?: number): void { this.renderer.resize(); }
  setCandles(rows: readonly ChartDataPoint[]): void { this.renderer.setBars(toBars(rows)); }
  setCandlesStore(store: ColumnarCandleStore): void {
    const v = store.views();
    this.renderer.setBarsColumns({
      time: v.time, open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volume,
      length: store.length, timeUnit: 'seconds',
    });
  }
  updateLastCandle(row: ChartDataPoint): void { this.renderer.updateBarColumns({ time: Number(row.time), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) || undefined, timeUnit: 'seconds' }); }
  setReducedCandles(rows: readonly ChartLodBar[]): void {
    // Compatibility input only: materialize the LOD rows into one typed bucket index and
    // hand that index to Vela. Never replace the full candle series with reduced OHLC objects.
    const n = rows.length;
    const from = new Uint32Array(n);
    const to = new Uint32Array(n);
    const time = new Float64Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const close = new Float64Array(n);
    const volume = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const row = rows[i]!;
      from[i] = Math.max(0, Math.floor(row.sourceFrom));
      to[i] = Math.max(from[i]! + 1, Math.floor(row.sourceTo));
      time[i] = Number(row.time);
      open[i] = Number(row.open);
      high[i] = Number(row.high);
      low[i] = Number(row.low);
      close[i] = Number(row.close);
      volume[i] = Number.isFinite(Number(row.volume)) ? Number(row.volume) : Number.NaN;
    }
    this.renderer.setLodIndex({ from, to, time, open, high, low, close, volume, count: n, timeUnit: 'seconds' });
  }
  setReducedCandlesIndex(index: ChartLodIndex): void {
    this.renderer.setLodIndex({
      from: index.from, to: index.to, time: index.time, open: index.open, high: index.high, low: index.low, close: index.close, volume: index.volume,
      count: index.count, sourceRevision: index.sourceRevision, sourceLength: index.sourceLength, timeUnit: 'seconds',
    });
  }
  setScene(_scene: ChartScene): void { /* scene ownership remains in TCO; Vela receives rendered models via CoreSpirit adapter */ }
  render(): void { /* NativeRenderer schedules its own frames. */ }
  dispose(): void { this.renderer.destroy(); }
}
