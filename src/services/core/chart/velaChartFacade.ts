/** Compatibility boundary for the legacy chart-api surface. New TradingCoreOS code should import from velaNativeChartKernel. */
/**
 * Legacy compatibility shim.
 * New TradingCoreOS code must import from velaNativeChartKernel.
 */
export * from './velaNativeChartKernel';
export {
  VelaNativeChartKernel as VelaChartFacade,
  VelaNativeSeriesKernel as VelaSeriesFacade,
  createVelaNativeChart as createChart,
} from './velaNativeChartKernel';

export {
  registerNativeIndicator,
  unregisterNativeIndicator,
  getNativeIndicator,
  nativeIndicatorTypes,
  registerRendererLayer,
  unregisterRendererLayer,
  rendererLayers,
  registerChartType,
  unregisterChartType,
  chartType,
  chartTypes,
  registerDefaultEngine,
  unregisterDefaultEngine,
  resolveEngines,
  type NativeIndicator,
  type NativeIndicatorDescriptor,
  type NativeIndicatorContext,
  type NativeIndicatorOutput,
  type NativeIndicatorInfo,
  type RendererLayerDefinition,
  type RendererLayerInstance,
  type RendererLayerArgs,
  type BasePaintingModulation,
  type ChartTypeDefinition,
  type SeriesDataEngine,
  type SeriesDataEngineHost,
  type EngineFactory,
} from '../../../../vendor/vela/src/plugin';

export {
  registerSidePanel,
  unregisterSidePanel,
  registerWidgetAction,
  unregisterWidgetAction,
  registerWidgetAttachment,
  unregisterWidgetAttachment,
  registerLegendAction,
  unregisterLegendAction,
  registerLegendCallout,
  unregisterLegendCallout,
  registerStatePersistence,
  unregisterStatePersistence,
  registerSymbolRanking,
  symbolRanking,
  type SidePanelDescriptor,
  type SidePanelHandle,
  type SidePanelHeader,
  type WidgetActionDescriptor,
  type WidgetContext,
  type WidgetAttachment,
  type LegendActionDescriptor,
  type LegendCalloutDescriptor,
  type LegendCalloutSpec,
  type LegendIndicatorInfo,
  type StatePersistenceHandler,
  type SymbolRankingHook,
  type ExternalIndicatorEntry,
} from '../../../../vendor/vela/src/widget/contributions';
