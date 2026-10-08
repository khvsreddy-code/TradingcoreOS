/**
 * Production chart backend policy.
 *
 * TradingCoreOS owns the market-data and semantic boundaries; Vela NativeRenderer
 * is the sole production chart renderer. The retired TCO WebGL2/Canvas2D engines
 * are intentionally absent rather than hidden behind a runtime backend switch.
 */
export type ChartBackendKind = 'vela-native';

export const PRODUCTION_CHART_BACKEND: ChartBackendKind = 'vela-native';

export function isNativeChartBackendEnabled(kind: ChartBackendKind): boolean {
  return kind === 'vela-native';
}
