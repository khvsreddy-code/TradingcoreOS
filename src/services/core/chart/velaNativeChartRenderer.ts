import type { ChartRenderer, ChartRendererEnvironment } from './chartRenderer';
import type { ChartDataPoint, ColumnarCandleStore } from './chartDataModel';
import type { ChartLodBar, ChartLodIndex } from './chartLevelOfDetail';
import type { ChartScene } from './chartScene';
import { NativeRenderer } from '../../../../vendor/vela/src/renderers/native/NativeRenderer';
import type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
import type { VelaTheme } from '../../../../vendor/vela/src/core/options';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';

function theme(): VelaTheme {
  const p = getThemePalette(getCurrentTheme());
  return { background: p.surface2, textColor: p.muted, gridColor: p.grid, borderColor: p.axis, upColor: '#22c55e', downColor: '#ef4444', fontFamily: 'JetBrains Mono, monospace' };
}

function toBars(rows: readonly ChartDataPoint[]): OHLCV[] {
  return rows.map((x) => ({ time: Number(x.time) * 1000, open: Number(x.open), high: Number(x.high), low: Number(x.low), close: Number(x.close), volume: Number(x.volume) || undefined }));
}

/** TCO's renderer-port implementation. Vela is contained here; no Vela type crosses this seam. */
export class VelaNativeChartRenderer implements ChartRenderer {
  readonly kind = 'vela-native';
  private renderer = new NativeRenderer();

  mount(environment: ChartRendererEnvironment): void { this.renderer.mount(environment.mount, theme()); }
  resize(_width: number, _height: number, _pixelRatio?: number): void { this.renderer.resize(); }
  setCandles(rows: readonly ChartDataPoint[]): void { this.renderer.setBars(toBars(rows)); }
  setCandlesStore(store: ColumnarCandleStore): void { const v = store.views(); const bars: OHLCV[] = new Array(store.length); for (let i = 0; i < store.length; i += 1) bars[i] = { time: v.time[i]! * 1000, open: v.open[i]!, high: v.high[i]!, low: v.low[i]!, close: v.close[i]!, volume: v.volume[i] || undefined }; this.renderer.setBars(bars); }
  updateLastCandle(row: ChartDataPoint): void { this.renderer.updateBar(toBars([row])[0]!); }
  setReducedCandles(_rows: readonly ChartLodBar[]): void { /* Vela's viewport handles visual LOD; source data remains canonical. */ }
  setReducedCandlesIndex(_index: ChartLodIndex): void { /* reserved for future multi-resolution data projection */ }
  setScene(_scene: ChartScene): void { /* scene ownership remains in TCO; Vela receives rendered models via CoreSpirit adapter */ }
  render(): void { /* NativeRenderer schedules its own frames. */ }
  dispose(): void { this.renderer.destroy(); }
}
