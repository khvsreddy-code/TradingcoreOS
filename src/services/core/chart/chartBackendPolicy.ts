/**
 * Production chart backend policy.
 *
 * Lightweight Charts remains the production renderer while the retained
 * TradingCore chart engine is validated. Native WebGL/Canvas backends are
 * experimental and must not be selected by the workspace until feature parity
 * and production validation are complete.
 */
export type ChartBackendKind = 'lightweight-charts' | 'webgl2' | 'canvas2d';

export const PRODUCTION_CHART_BACKEND: ChartBackendKind = 'lightweight-charts';

export const EXPERIMENTAL_NATIVE_BACKENDS_ENABLED = false;

export function isNativeChartBackendEnabled(kind: ChartBackendKind): boolean {
  return EXPERIMENTAL_NATIVE_BACKENDS_ENABLED && kind !== 'lightweight-charts';
}
