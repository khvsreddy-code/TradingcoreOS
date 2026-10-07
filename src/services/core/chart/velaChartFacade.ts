/** Compatibility boundary for the legacy chart-api surface. New TradingCoreOS code should import from velaNativeChartKernel. */
/**
 * Legacy compatibility shim.
 * New TradingCoreOS code must import from velaNativeChartKernel.
 */
export * from './velaNativeChartKernel';
export {
  registerLegendAction,
  unregisterLegendAction,
  registerLegendCallout,
  unregisterLegendCallout,
  registerStatePersistence,
  unregisterStatePersistence,
  registerSymbolRanking,
  symbolRanking,
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
