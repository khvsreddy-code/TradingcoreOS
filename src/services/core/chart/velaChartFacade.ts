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
