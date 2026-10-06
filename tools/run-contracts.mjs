import { spawnSync } from 'node:child_process';

const contracts = [
  ['execution-plan', ['src/services/coreSpirit/executionPlanVisualizerContract.test.mjs', true]],
  ['repaint-profiler', ['src/services/coreSpirit/repaintProfilerContract.test.mjs', true]],
  ['temporal-types', ['src/services/coreSpirit/temporalTypesContract.test.mjs', true]],
  ['trading-native-plan', ['src/services/coreSpirit/tradingNativePlanContract.test.mjs', true]],
  ['specialized-plan', ['src/services/coreSpirit/specializedPlanContract.test.mjs', true]],
  ['series-registry', ['src/services/coreSpirit/seriesRegistryContract.test.mjs', true]],
  ['series-backend-dispatcher', ['src/services/coreSpirit/seriesBackendDispatcherContract.test.mjs', true]],
  ['dirty-graph', ['src/services/coreSpirit/dirtyGraphContract.test.mjs', true]],
  ['columnar-market-data', ['src/services/coreSpirit/columnarMarketDataContract.test.mjs', true]],
  ['optimized-execution', ['src/services/coreSpirit/coreSpiritOptimizedExecutionContract.test.mjs', true]],
  ['architecture-consolidation', ['src/architectureConsolidationGuard.test.mjs', false]],
  ['architecture', ['src/architecture/architectureContract.test.mjs', false]],
  ['canonical-market-data', ['src/canonicalMarketDataTransportContract.test.mjs', false]],
  ['semantic-series-type', ['src/coreSpiritSemanticSeriesTypeContract.test.mjs', false]],
  ['semantic-series-type-runtime', ['src/services/coreSpirit/semanticSeriesTypeRuntime.test.ts', true]],
  ['artifact-hygiene', ['src/generatedArtifactHygieneContract.test.mjs', false]],
  ['routes', ['src/routeContract.test.mjs', false]],
  ['indicator-dependency-graph', ['src/indicatorDependencyGraphContract.test.mjs', false]],
  ['indicator-incremental', ['src/indicatorIncrementalContract.test.mjs', false]],
  ['indicator-appearance', ['src/indicatorAppearanceContract.test.mjs', false]],
  ['indicator-parameter-system', ['src/indicatorParameterSystemContract.test.mjs', false]],
  ['indicator-conditional-settings', ['src/indicatorConditionalSettingsContract.test.mjs', false]],
  ['indicator-parameter-state', ['src/services/coreSpirit/indicatorParameterState.test.ts', true]],
  ['indicator-component', ['src/coreSpiritIndicatorComponentContract.test.mjs', false]],
  ['indicator-declarative-execution', ['src/coreSpiritIndicatorDeclarativeExecutionContract.test.mjs', false]],
  ['runtime-hot-vm', ['src/coreSpiritRuntimeHotVmContract.test.mjs', false]],
  ['vela-runtime-export', ['src/velaFacadeRuntimeExportContract.test.mjs', false]],
  ['vela-drawing', ['src/velaDrawingCapabilityContract.test.mjs', false]],
  ['vela-incremental-patch', ['src/velaIncrementalPatchContract.test.mjs', false]],
  ['vela-v108-boundary', ['src/velaV108BoundaryContract.test.mjs', false]],
  ['vela-fyers-motion', ['src/velaFyers5kMotionContract.test.mjs', false]],
  ['vela-workspace-ux', ['src/velaTcoWorkspaceUxContract.test.mjs', false]],
  ['terminal-shell', ['src/terminalShellContract.test.mjs', false]],
  ['terminal-dock-system', ['src/terminalDockSystemContract.test.mjs', false]],
  ['terminal-dock-architecture', ['src/terminalDockArchitectureContract.test.mjs', false]],
  ['terminal-react-root', ['src/terminalReactRootContract.test.mjs', false]],
  ['terminal-visual-density', ['src/terminalVisualDensityContract.test.mjs', false]],
  ['multi-chart-data-plane', ['src/chartMultiChartDataPlaneContract.test.mjs', false]],
  ['chart-history-demand', ['src/chartHistoryDemandContract.test.mjs', false]],
  ['chart-history-indicator', ['src/chartHistoryIndicatorGraphV106Contract.test.mjs', false]],
  ['indicator-dependency-field-index', ['src/indicatorDependencyFieldIndexContract.test.mjs', false]],
  ['realtime-architecture', ['src/realtimeArchitectureContract.test.mjs', false]],
  ['frontend-performance', ['src/frontendPerformanceContract.test.mjs', false]],
  ['fyers-order-latency', ['src/fyersOrderLatencyContract.test.mjs', false]],
  ['vela-tco-semantic-boundary', ['src/velaTcoSemanticBoundaryContract.test.mjs', false]],
];

for (const [name, [file, needsTsLoader]] of contracts) {
  console.log(`[contract] START ${name}`);
  const args = needsTsLoader
    ? ['--loader', './tools/nodeTsTranspileLoader.mjs', file]
    : [file];
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`[contract] ${name} failed to spawn:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[contract] FAIL ${name} exit=${result.status ?? 'signal'}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[contract] PASS ${name}`);
}
console.log('[contract] ALL PASS');
