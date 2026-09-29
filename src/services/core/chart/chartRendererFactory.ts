import type { ChartRenderer } from './chartRenderer';
import { VelaNativeChartRenderer } from './velaNativeChartRenderer';

/** Select the only production renderer. Renderer choice stays behind the TCO chart contract. */
export function createDefaultChartRenderer(_preferred: 'webgl2' | 'canvas2d' | 'vela-native' = 'vela-native'): ChartRenderer {
  return new VelaNativeChartRenderer();
}
