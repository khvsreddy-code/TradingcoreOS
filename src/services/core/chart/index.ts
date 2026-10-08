/**
 * Canonical chart boundary.
 *
 * TradingCoreOS no longer exposes its retired standalone chart engine/renderer
 * stack from this barrel. All production chart pixels and interactions terminate
 * in the Vela-native kernel; TCO-specific features attach through Vela ports and
 * renderer-layer registries.
 */
export * from './velaNativeChartKernel';
export { chartTimeToEpochSeconds, epochSecondsToChartTime } from './velaTime';
