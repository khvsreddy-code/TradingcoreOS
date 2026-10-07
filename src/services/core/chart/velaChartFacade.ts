/** Compatibility boundary for the legacy chart-api surface. New TradingCoreOS code should import from velaNativeChartKernel. */
/**
 * Legacy compatibility shim.
 * New TradingCoreOS code must import from velaNativeChartKernel.
 */
export * from './velaNativeChartKernel';
/** Public TCO chart boundary for the vendored Vela composition root and neutral OHLCV model. */
export { Vela } from '../../../../vendor/vela/src/Vela';
export type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
export {
  registerNativeIndicator,
  unregisterNativeIndicator,
} from '../../../../vendor/vela/src/core/native-indicators';
export type {
  NativeIndicator,
  NativeIndicatorContext,
  NativeIndicatorDescriptor,
  NativeIndicatorInfo,
  NativeIndicatorOutput,
} from '../../../../vendor/vela/src/core/native-indicators';
export {
  registerRendererLayer,
  unregisterRendererLayer,
  rendererLayers,
} from '../../../../vendor/vela/src/renderers/native/layers';
export type {
  RendererLayerDefinition,
  RendererLayerArgs,
  RendererLayerInstance,
  BasePaintingModulation,
} from '../../../../vendor/vela/src/renderers/native/layers';
export {
  registerLegendAction,
  unregisterLegendAction,
  registerLegendCallout,
  unregisterLegendCallout,
  registerStatePersistence,
  unregisterStatePersistence,
  registerSymbolRanking,
  symbolRanking,
  registerDefaultEngine,
  unregisterDefaultEngine,
  registerWidgetAttachment,
  unregisterWidgetAttachment,
} from '../../../../vendor/vela/src/widget/contributions';
export type {
  LegendActionDescriptor,
  LegendCalloutDescriptor,
  LegendIndicatorInfo,
  LegendCalloutSpec,
  StatePersistenceHandler,
  WidgetContext,
  SymbolRankingHook,
  ExternalIndicatorEntry,
  WidgetAttachment,
} from '../../../../vendor/vela/src/widget/contributions';
export {
  VelaNativeChartKernel as VelaChartFacade,
  VelaNativeSeriesKernel as VelaSeriesFacade,
  createVelaNativeChart as createChart,
} from './velaNativeChartKernel';

// TCO uses Vela's contribution registries directly through this compatibility boundary.
