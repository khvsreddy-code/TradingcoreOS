import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');

const runtime = read('src/services/coreSpirit/runtime.ts');
const vector = read('src/services/coreSpirit/seriesVector.ts');
const patch = read('vendor/vela/src/core/model/patch.ts');
const diffEngine = read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const native = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
const drawingSlices = read('vendor/vela/src/renderers/native/drawings/IndicatorDrawingSlices.ts');
const facade = read('src/services/core/chart/velaChartFacade.ts');
const semantic = read('src/services/coreSpirit/semanticGraph.ts');
const engine = read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const tcoRuntime = read('src/services/runtime/TradingCoreRuntime.ts');
const workspace = read('src/LiveTradingWorkspace.tsx');
const css = read('src/index.css');
const navbar = read('src/components/navigation/Navbar.tsx');
const shell = read('src/components/workspace/WorkspaceModuleShell.tsx');
const dashboard = read('src/pages/DashboardPage.tsx');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const storage = read('src/services/core/chart/tcoVelaSupabaseStorage.ts');

assert.match(semantic, /function builtinDeterminism/);
assert.match(semantic, /const deterministic = ins\.op === 'call' \? builtinDeterminism/);
assert.match(vector, /from '\.\/statefulIndicatorKernel'/);
assert.match(vector, /copyFrom\(source: FusedSeriesStage/);
assert.match(vector, /clone\(\): CoreSpiritFusedSeriesCursor/);
assert.match(runtime, /fusedCursorSnapshots/);
assert.match(runtime, /cursor\.clone\(\)/);
assert(!runtime.includes("if (this.executionContext.mode === 'realtime') return false;"));

assert.match(engine, /const SINGLE_LOAD_BARS = 5_000/);
assert.match(engine, /LEFT_HISTORY_TRIGGER_BARS/);
assert.match(engine, /currentDepth \+ SINGLE_LOAD_BARS/);
assert.match(provider, /Number\(range\.limit\) \|\| 5000/);
assert.match(tcoRuntime, /olderHistoryCache/);
assert.match(tcoRuntime, /olderHistoryInflight/);
assert.match(tcoRuntime, /Math\.min\(5000/);

assert.match(workspace, /hasConnectedBroker\(\)/);
assert.match(workspace, /Promise\.all\(\[brokerReady, defaultsPromise\]\)/);
assert.match(workspace, /animations:/);
assert.match(workspace, /zoom: 280/);
assert.match(workspace, /pan: 340/);
assert.match(workspace, /scroll: 400/);
assert.match(workspace, /autoscale: 300/);
assert.match(workspace, /intro: \{ style: 'grow', duration: 1200 \}/);
assert.match(css, /--tco-accent: #7c5cff/);
assert.match(css, /--tco-motion-normal: 260ms/);
assert.match(navbar, /var\(--tco-accent\)/);
assert.match(shell, /var\(--tco-accent\)/);
assert.match(dashboard, /var\(--tco-accent\)/);
assert.match(chrome, /rgba\(124,92,255/);
assert.match(storage, /workspace_layouts/);
assert.match(storage, /user_preferences/);
assert.match(storage, /user_settings/);
assert.match(patch, /CollectionPatchName/);
assert.match(diffEngine, /previousSeries = new Map/);
assert.match(diffEngine, /incrementalCollectionDelta/);
assert(!diffEngine.includes('JSON.stringify(current.style)'));
assert.match(native, /drawingRevision/);
assert.match(native, /patch\.collections/);
assert.match(drawingSlices, /lastPrepareKey/);
assert.match(facade, /op = 'append'/);
assert.match(facade, /op = 'replace-last'/);


console.log('TRADINGCORE_V120_FYERS_PAGING_REALTIME_FUSION_AND_UI_CONTRACT_OK');
