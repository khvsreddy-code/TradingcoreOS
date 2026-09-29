/**
 * Production chart backend policy.
 *
 * TradingCoreOS owns the chart contracts and data plane; Vela NativeRenderer is the
 * sole production rendering backend. CoreSpirit and React code never import Vela
 * renderer internals directly — they use the TCO chart facade/engine boundary.
 */
export type ChartBackendKind = 'vela-native';

export const PRODUCTION_CHART_BACKEND: ChartBackendKind = 'vela-native';

export const EXPERIMENTAL_NATIVE_BACKENDS_ENABLED = true;

export function isNativeChartBackendEnabled(kind: ChartBackendKind): boolean {
  return kind === 'vela-native';
}
