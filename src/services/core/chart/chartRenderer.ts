import type { ColumnarCandleStore } from './chartDataModel';
import type { ChartDataPoint } from './chartDataModel';
import type { ChartLodBar, ChartLodIndex } from './chartLevelOfDetail';
import type { ChartScene } from './chartScene';

export type ChartRendererEnvironment = {
  mount: HTMLElement;
  width: number;
  height: number;
  pixelRatio: number;
};

export interface ChartRenderer {
  readonly kind: string;
  mount(environment: ChartRendererEnvironment): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  /** Legacy object path retained only for compatibility renderers. */
  setCandles(rows: readonly ChartDataPoint[]): void;
  /** Zero-copy chart-engine data boundary. */
  setCandlesStore(store: ColumnarCandleStore): void;
  updateLastCandle(row: ChartDataPoint): void;
  /** Legacy object LOD path retained only for compatibility renderers. */
  setReducedCandles(rows: readonly ChartLodBar[]): void;
  /** Zero-object LOD path for native renderers. */
  setReducedCandlesIndex(index: ChartLodIndex): void;
  setScene(scene: ChartScene): void;
  render(): void;
  dispose(): void;
}
