/** Compatibility boundary for the legacy chart-api surface. New TradingCoreOS code should import from velaNativeChartKernel. */
/**
 * Legacy compatibility shim.
 * New TradingCoreOS code must import from velaNativeChartKernel.
 */
export * from './velaNativeChartKernel';
/** Public TCO chart boundary for the vendored Vela composition root and neutral OHLCV model. */
export { Vela } from '../../../../vendor/vela/src/Vela';
export type { OHLCV } from '../../../../vendor/vela/src/core/model/ohlcv';
export { registerChartType, unregisterChartType, chartType, chartTypes } from '../../../../vendor/vela/src/chart-types/registry';
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
export type { InputSchema, InputValue } from '../../../../vendor/vela/src/core/model/inputs';
export type {
  ChartTypeDefinition,
  SeriesDataEngine,
  SeriesDataEngineHost,
  ChartTypeSettingsSection,
  SettingsRowDescriptor,
} from '../../../../vendor/vela/src/chart-types/registry';
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
  registerWidgetAction,
  unregisterWidgetAction,
  registerSidePanel,
  unregisterSidePanel,
  sidePanels,
} from '../../../../vendor/vela/src/widget/contributions';
export type {
  WidgetActionDescriptor,
  WidgetActionTarget,
  SidePanelDescriptor,
  SidePanelHandle,
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
