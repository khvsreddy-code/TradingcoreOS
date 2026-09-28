import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const required = [
  'src/services/coreSpirit/coreSpiritExecutionModel.ts',
  'src/services/coreSpirit/coreSpiritPerformance.ts',
  'src/services/coreSpirit/coreSpiritComponents.ts',
  'src/services/coreSpirit/incrementalCompiler.ts',
  'src/services/coreSpirit/artifactCache.ts',
  'src/services/coreSpirit/coreSpiritLineage.ts',
  'src/services/coreSpirit/coreSpiritPackage.ts',
  'src/services/coreSpirit/coreSpiritAuthoring.ts',
  'src/services/coreSpirit/coreSpiritWorkerPool.ts',
  'src/services/coreSpirit/semanticGraph.ts',
  'src/services/coreSpirit/reactiveEngine.ts',
  'src/services/coreSpirit/dataCache.ts',
  'src/services/coreSpirit/dataPlanner.ts',
  'src/services/coreSpirit/artifact.ts',
  'src/services/core/chart/chartUpdateScheduler.ts',
  'src/services/core/calculation/realtimeCalculationEngine.ts',
];
for (const rel of required) if (!exists(rel)) throw new Error(`V88 missing required implementation: ${rel}`);

const packageJson = JSON.parse(read('package.json'));
if (!packageJson.scripts?.test?.toString?.()) {
  // no-op: project intentionally uses architecture:check/test:contracts rather than a generic test script.
}

const runtimeModel = read('src/services/coreSpirit/coreSpiritExecutionModel.ts');
for (const token of ['DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE']) {
  if (!read('src/services/coreSpirit/languageSpec.ts').includes(token)) throw new Error(`V88 language surface regression: ${token}`);
}
for (const token of ['simple', 'advanced', 'professional', 'live', 'backtest', 'replay', 'scan', 'research', 'optimization']) {
  if (!runtimeModel.includes(`'${token}'`)) throw new Error(`V88 execution/authoring contract missing '${token}'`);
}

const reactivePlan = read('src/services/coreSpirit/semanticGraph.ts');
if (!reactivePlan.includes('sourceDependents')) throw new Error('V88 reactive source index missing');
const reactive = read('src/services/coreSpirit/reactiveEngine.ts');
if (reactive.includes('.shift()')) throw new Error('V88 reactive hot queue regressed to O(n) shift');
if (!reactive.includes('sourceDependents[input]')) throw new Error('V88 reactive invalidation is not indexed by source input');

const chart = read('src/components/workspace/LiveChart.tsx');
if (!chart.includes("scheduleLatest('realtime-bar'")) throw new Error('V88 realtime chart patch coalescing missing');
const workspace = read('src/LiveTradingWorkspace.tsx');
if (!workspace.includes('const pending=new Map<string,NormalizedMarketTick>()') || !workspace.includes('requestAnimationFrame')) throw new Error('V88 workspace tick backpressure missing');
if (!chart.includes('useMemo(()=>loadChartState')) throw new Error('V88 chart persisted-state parsing is not memoized');

const realtime = read('src/services/core/calculation/realtimeCalculationEngine.ts');
for (const banned of ['slice(-250)', 'emaLast(', 'rsiLast(', 'atrLast(']) {
  if (realtime.includes(banned)) throw new Error(`V88 realtime calculation still contains window recomputation: ${banned}`);
}
if (!realtime.includes('const ema20 = this.state.ema20') || !realtime.includes('const avgGain = (this.state.avgGain14 * 13 + gain) / 14') || !realtime.includes('sma20Window')) throw new Error('V88 incremental developing-bar previews missing');
if (!realtime.includes('timestampMs(last.timestamp) === timestampMs(bar.timestamp)')) throw new Error('V88 realtime timestamp normalization missing');
if (!realtime.includes('rebuildCommittedState')) throw new Error('V88 committed correction rebuild missing');

const pool = read('src/services/coreSpirit/coreSpiritWorkerPool.ts');
if (!pool.includes('long-lived') || !pool.includes('postMessage')) throw new Error('V88 reusable worker pool contract missing');

const artifact = read('src/services/coreSpirit/artifact.ts');
if (!artifact.includes('Object.keys(object).sort()')) throw new Error('V88 canonical artifact serialization missing');
const artifactCache = read('src/services/coreSpirit/artifactCache.ts');
if (!artifactCache.includes('canonicalJson') || !artifactCache.includes('sha256Hex')) throw new Error('V88 canonical SHA-256 artifact cache key missing');
const history = read('src/services/marketData/HistoryStore.ts');
if (history.includes('Math.min(...times)') || history.includes('Math.max(...times)')) throw new Error('V88 history storage still uses spread-argument min/max');

const packageRegistry = read('src/services/coreSpirit/coreSpiritPackage.ts');
if (!packageRegistry.includes('comparePackageVersions')) throw new Error('V88 package registry version ordering missing');
const planner = read('src/services/coreSpirit/executionPlanner.ts');
for (const token of ['cacheKey', 'lanes', 'barriers']) if (!planner.includes(token)) throw new Error(`V88 execution planner enhancement missing: ${token}`);

// Syntax-parse changed TS/TSX using the repository's global TypeScript installation when available.
try {
  const require = createRequire(import.meta.url);
  const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
  const changed = [
    ...required,
    'src/components/workspace/LiveChart.tsx',
    'src/services/coreSpirit/runtime.ts',
    'src/services/coreSpirit/coreSpiritPipeline.ts',
    'src/services/coreSpirit/editorModel.ts',
    'src/services/coreSpirit/index.ts',
  ];
  let errorCount = 0;
  for (const rel of changed) {
    const file = path.join(root, rel);
    const source = fs.readFileSync(file, 'utf8');
    const scriptKind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, scriptKind);
    const parseDiagnostics = sourceFile.parseDiagnostics ?? [];
    if (parseDiagnostics.length) {
      errorCount += parseDiagnostics.length;
      console.error(rel, parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
    }
  }
  if (errorCount) throw new Error(`V88 TypeScript syntax parse failed with ${errorCount} diagnostic(s)`);
} catch (error) {
  if (String(error?.message || error).includes('Cannot find module')) console.warn('[V88] TypeScript parser unavailable; repository contract checks still ran.');
  else throw error;
}


for (const rel of [
  'src/services/core/chart/chartDataModel.ts',
  'src/services/core/chart/chartLevelOfDetail.ts',
  'src/services/core/chart/chartScene.ts',
  'src/services/core/chart/chartRenderer.ts',
  'src/services/core/chart/chartCore.ts',
  'src/services/coreSpirit/coreComputeScheduler.ts',
  'src/pages/CoreSpiritDocsPage.tsx',
  'src/theme/theme.ts',
  'src/theme/ThemeContext.tsx',
]) if (!exists(rel)) throw new Error(`V88+ foundation file missing: ${rel}`);
if (!read('src/routing/appRoutes.ts').includes("'/corespirit/docs'")) throw new Error('CoreSpirit docs route missing');
if (!read('src/components/navigation/Navbar.tsx').includes('ThemeToggle')) throw new Error('global theme toggle missing');
if (!read('src/components/workspace/WorkspaceModuleShell.tsx').includes('ThemeToggle')) throw new Error('workspace theme toggle missing');

console.log('CORESPIRIT_V88_COMPLEXITY_ABSORPTION_PERFORMANCE_CONTRACT_OK');
