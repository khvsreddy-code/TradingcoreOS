import type { ChartRenderer } from './chartRenderer';
import { Canvas2DChartRenderer } from './canvas2dChartRenderer';
import { WebGL2ChartRenderer } from './webgl2ChartRenderer';

/** Select the highest capability renderer available without exposing renderer details to React. */
export function createDefaultChartRenderer(preferred: 'webgl2' | 'canvas2d' = 'webgl2'): ChartRenderer {
  if (preferred === 'canvas2d') return new Canvas2DChartRenderer();
  return new WebGL2ChartRenderer();
}
