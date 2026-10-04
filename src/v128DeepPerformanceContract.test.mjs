import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const stateful = read('src/services/coreSpirit/statefulIndicatorKernel.ts');
const compatibility = read('src/services/marketData/incrementalIndicatorKernel.ts');
const coreIndicatorEngine = read('src/services/coreSpirit/indicatorEngine.ts');
const runtime = read('src/services/coreSpirit/runtime.ts');
const tape = read('vendor/vela/src/core/model/ColumnarHistoryTape.ts');
const velaEngine = read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const feed = read('vendor/vela/src/data/MultiProviderFeed.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const broker = read('src/services/brokers/BaseBrokerAdapter.ts');
const patch = read('vendor/vela/src/core/model/patch.ts');
const renderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const telemetry = read('src/services/marketData/chartPerformanceTelemetry.ts');
const verifier = read('tools/verify-chart-performance.mjs');

for (const name of ['RollingSum','RollingMean','RollingVariance','RollingMinMax','RollingMedian','RollingPercentile','RollingAbsoluteDeviation','EMAState','WilderState','ATRState','WMAState','VWAPSessionState']) {
  assert.match(stateful, new RegExp('export class ' + name), name + ' missing from CoreSpirit canonical kernel layer');
}
assert.match(stateful, /mode\s*:\s*'append'\s*\|\s*'replace'/);
assert.match(stateful, /replaceCurrentSlot/);
assert.match(stateful, /DualHeapMedian/);
assert.match(stateful, /MonotonicDeque/);
assert.match(compatibility, /export\s*\*\s*from\s*['"]\.\.\/coreSpirit\/statefulIndicatorKernel['"]/);

for (const name of ['Bollinger','Donchian','Stochastic','CCI','MFI']) {
  const lowered = coreIndicatorEngine.toLowerCase();
  assert.match(lowered, new RegExp(name.toLowerCase()), name + ' missing from standard indicator engine');
}
assert.doesNotMatch(coreIndicatorEngine, /slice\([^)]*period[^)]*\).*Math\.(?:max|min)/);
assert.doesNotMatch(coreIndicatorEngine, /values\[[^\]]*\]\.slice\(/);
assert.match(runtime, /directKernelCursors/);
assert.match(runtime, /CoreSpiritFusedSeriesCursor/);

assert.match(tape, /prependColumns\(columns/);
assert.match(tape, /toOHLCVRange\(/);
assert.match(velaEngine, /feed\.loadRangeColumns/);
assert.match(velaEngine, /rawTape\.prependColumns/);
assert.match(velaEngine, /rawTape\.length/);
assert.match(velaEngine, /renderer\.setBarsColumns/);
assert.match(velaEngine, /headBars = this\.rawTape\.toOHLCVRange/);
assert.match(feed, /async loadRangeColumns/);
assert.match(provider, /getHistoricalDataColumns/);
assert.match(broker, /beforeTimestamp/);

assert.match(patch, /replace-range/);
assert.match(velaEngine, /rangeSeriesDelta/);
assert.match(velaEngine, /model\.dirty/);
assert.match(velaEngine, /lookbackBars/);
assert.match(read('src/CoreSpiritVelaEngine.ts'), /executionStart/);
assert.match(read('src/CoreSpiritVelaEngine.ts'), /collectRange/);
assert.match(read('src/CoreSpiritVelaEngine.ts'), /emitModel\(dirty\)/);

assert.match(renderer, /p95FrameMs/);
assert.match(renderer, /frameBudgetMs/);
assert.match(renderer, /frameBudgetMissRate/);
assert.match(renderer, /new Float64Array\(240\)/);
assert.match(workspace, /p95FrameMs/);
assert.match(telemetry, /p95FrameMs/);
assert.match(telemetry, /frameBudgetMissRate/);
assert.match(verifier, /TCO_BROWSER_URLS/);
assert.match(verifier, /TCO_EXPECTED_CELLS/);
assert.match(verifier, /TCO_MAX_P95_FRAME_MS/);
assert.match(verifier, /p95FrameMs/);

assert.ok(fs.existsSync(path.join(root, 'docs/archive/history/README.md')));
assert.ok(fs.existsSync(path.join(root, 'docs/archive/history/CORESPIRIT_BUILD_TRACKER_LEGACY_20261004.md')));
assert.ok(!fs.existsSync(path.join(root, 'docs/history')));
assert.ok(!fs.existsSync(path.join(root, 'docs/archive/compatibility/CORESPIRIT_BUILD_TRACKER.md')));
assert.ok(!fs.existsSync(path.join(root, 'docs/archive/compatibility/CHART_RENDERER_MIGRATION.md')));
assert.ok(!fs.existsSync(path.join(root, 'docs/CHART_RENDERER_MIGRATION.md')));

console.log('TRADINGCORE_V128_STATEFUL_INDICATOR_KERNELS_OK');
console.log('TRADINGCORE_V128_COLUMNAR_BACKFILL_OK');
console.log('TRADINGCORE_V128_DIRTY_SPAN_PATCHING_OK');
console.log('TRADINGCORE_V128_FRAME_TELEMETRY_AND_BROWSER_VERIFY_OK');
console.log('TRADINGCORE_V128_DOC_ARCHIVE_CONSOLIDATION_OK');
