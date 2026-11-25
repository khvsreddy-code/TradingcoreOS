import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('src/main.tsx');
const app = read('src/App.tsx');
const liveShell = read('src/appShells/LiveTradingShell.tsx');
const terminal = read('src/LiveTradingTerminal.tsx');
const workspace = read('src/LiveTradingWorkspace.tsx');
const velaLoader = read('src/services/core/chart/velaWorkspaceLoader.ts');
const terminalOptions = read('src/services/core/chart/tcoVelaTerminal.ts');
const tcoProvider = read('src/TcoVelaDataProvider.ts');
const chartPlane = read('src/services/marketData/chartDataPlane.ts');
const coreVela = read('src/CoreSpiritVelaEngine.ts');
const compilerClient = read('src/services/coreSpirit/coreSpiritCompilerClient.ts');
const compilerWorker = read('src/services/coreSpirit/coreSpiritCompiler.worker.ts');
const chartRunner = read('src/services/coreSpirit/chartRunner.ts');
const workerPool = read('src/services/coreSpirit/coreSpiritWorkerPool.ts');
const runtimeWorker = read('src/services/coreSpirit/coreSpirit.worker.ts');
const coreRuntime = read('src/services/coreSpirit/runtime.ts');
const outputAdapter = read('src/services/coreSpirit/velaOutputAdapter.ts');
const sceneDiff = read('src/services/core/chart/coreSpiritSceneDiff.ts');
const panelChrome = read('src/services/core/chart/tcoVelaChrome.ts');
const panelRegistry = read('vendor/vela/src/widget/contributions.ts');
const panelDock = read('vendor/vela/src/widget/panel-dock.ts');
const tradingRuntime = read('src/services/runtime/TradingCoreRuntime.ts');
const tradingEngine = read('src/services/engine/TradingEngine.ts');

assert.match(main, /createRoot\(document\.getElementById\('root'\)!\)/,
  'main.tsx must remain the single application React entry root');
assert.match(app, /LiveTradingShell/);
assert.match(liveShell, /import\(['"]\.\.\/LiveTradingTerminal['"]\)/);
assert.match(terminal, /<LiveTradingWorkspace\s*\/>/,
  'the live terminal must remain a thin host for the canonical workspace');
for (const dependency of [
  'loadVelaWorkspace',
  'createTcoVelaDataProvider',
  'LazyCoreSpiritVelaEngine',
  'createTcoVelaTerminalOptions',
  'tcoVelaChrome',
]) assert.match(workspace, new RegExp(dependency),
  'LiveTradingWorkspace must assemble the existing Vela/CoreSpirit adapters: ' + dependency);

assert.match(velaLoader, /import\(['"]\.\.\/\.\.\/\.\.\/\.\.\/vendor\/vela\/src\/workspace['"]\)/,
  'VelaWorkspace must be dynamically loaded from the vendored workspace entry');
assert.match(velaLoader, /module\.registerLayout\(layout\)/,
  'layout registration must use the same dynamically imported Vela workspace module');
assert.match(terminalOptions, /shell:\s*'VelaWorkspace'/);
assert.match(terminalOptions, /providers:\s*\{[\s\S]*tco:\s*\(\)\s*=>\s*deps\.createDataProvider\(\)/);
assert.match(terminalOptions, /engines:\s*\{[\s\S]*corespirit:\s*\(\)\s*=>\s*deps\.createCoreSpiritEngine\(\)/);

assert.match(tcoProvider, /export class TcoVelaDataProvider implements DataProvider/);
assert.match(tcoProvider, /getChartDataPlane/);
assert.match(tcoProvider, /chartDataPlaneKey/);
assert.doesNotMatch(tcoProvider, /tradingCoreRuntime\.getHistoricalDataColumns/,
  'Vela must not bypass the shared canonical chart-history plane');
assert.match(chartPlane, /getCanonicalDataPlane/);
assert.match(chartPlane, /acquireSharedChartMarketFeed/);
assert.match(chartPlane, /LiveCandleStateMachine/);
assert.match(chartPlane, /MAX_CHART_DATA_PLANES/);
assert.match(chartPlane, /MAX_CHART_DATA_PLANE_BYTES/);

assert.match(compilerClient, /new Worker\(new URL\(['"]\.\/coreSpiritCompiler\.worker\.ts['"]/);
assert.match(compilerWorker, /compileCoreSpirit\(/);
assert.match(compilerWorker, /validateExecutableArtifact/);
assert.match(coreVela, /compileCoreSpiritArtifactOffThread/);
assert.match(coreVela, /runCoreSpiritArtifactInWorker/);
assert.match(coreVela, /adaptCoreSpiritOutputsForVela/);
assert.match(coreVela, /handlers\.onScenePatches\?\.\(patches\)/,
  'CoreSpirit must return retained scene patches to Vela instead of owning the renderer');
assert.match(chartRunner, /coreSpiritWorkerPool\.runArtifact\(/);
assert.match(workerPool, /new Worker\(new URL\(['"]\.\/coreSpirit\.worker\.ts['"]/);
assert.match(runtimeWorker, /new CoreSpiritRuntime\(/);
assert.match(coreRuntime, /CoreSpiritExecutionVM/);
assert.match(coreRuntime, /CoreSpiritOptimizedExecutionVM/);
assert.match(coreRuntime, /CoreSpiritResourceGovernor/);
assert.match(outputAdapter, /adaptCoreSpiritOutputsForVela/);
assert.match(outputAdapter, /coreSpiritTimeToVelaMillis/);
assert.match(sceneDiff, /class CoreSpiritSceneDiff/);

assert.match(panelChrome, /function registerTcoSidePanel/);
assert.match(panelChrome, /registerSidePanel\(/);
assert.match(panelRegistry, /export function registerSidePanel\(/);
assert.match(panelRegistry, /panels\.set\(desc\.id, desc\)/);
assert.match(panelDock, /desc\.mount\(/);
assert.match(panelDock, /entry\.handle\?\.onOpen\?\.\(\)/);
assert.match(panelDock, /entry\.handle\?\.destroy\?\.\(\)/);

assert.match(tradingRuntime, /private brokerMgr:\s*BrokerManager/);
assert.match(tradingRuntime, /private engine:\s*TradingEngine/);
assert.match(tradingRuntime, /public async placeOrder\(order: OrderRequest\)/);
assert.match(tradingRuntime, /this\.engine\.placeOrder\(routedOrder\)/);
assert.match(tradingEngine, /this\.activeBrokerAdapter\.placeOrder\(order\)/,
  'the host execution engine must delegate broker submission through the active BrokerAdapter');

console.log('TRADINGCORE_ENGINEERING_OWNERSHIP_MAP_CONTRACT_OK');
