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
  registerNativeIndicator, unregisterNativeIndicator,
  registerRendererLayer, unregisterRendererLayer,
  registerChartType, unregisterChartType,
  registerDefaultEngine, unregisterDefaultEngine,
  registerSidePanel, unregisterSidePanel,
  registerWidgetAction, unregisterWidgetAction,
  registerWidgetAttachment, unregisterWidgetAttachment,
  registerLegendAction, unregisterLegendAction,
  registerLegendCallout, unregisterLegendCallout,
  registerStatePersistence, unregisterStatePersistence,
  registerSymbolRanking, symbolRanking,
  type SidePanelDescriptor, type SidePanelHandle, type SidePanelHeader,
  type WidgetActionDescriptor, type WidgetContext, type WidgetAttachment,
  type LegendActionDescriptor, type LegendCalloutDescriptor, type LegendCalloutSpec,
  type LegendIndicatorInfo, type StatePersistenceHandler, type SymbolRankingHook,
  type ExternalIndicatorEntry,
} from '../../../../vendor/vela/src/widget/contributions';
