import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const kernels = read('src/services/coreSpirit/statefulIndicatorKernel.ts');
const vector = read('src/services/coreSpirit/seriesVector.ts');
const indicators = read('src/services/marketData/indicatorEngine.ts');
const tape = read('vendor/vela/src/core/model/ColumnarHistoryTape.ts');
const velaEngine = read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const patch = read('vendor/vela/src/core/model/patch.ts');
const model = read('vendor/vela/src/core/model/indicator.ts');
const scripting = read('vendor/vela/src/core/ports/ScriptingEngine.ts');
const coreSpiritEngine = read('src/CoreSpiritVelaEngine.ts');
const renderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const telemetry = read('src/services/marketData/chartPerformanceTelemetry.ts');
const live = read('src/LiveTradingWorkspace.tsx');

for (const name of ['RollingSum','RollingMean','RollingVariance','RollingMinMax','RollingMedian','RollingPercentile','EMAState','WilderState','ATRState','VWAPSessionState']) {
  assert.match(kernels, new RegExp(`export class ${name}`), `${name} missing`);
}
assert.match(kernels, /class MonotonicDeque/);
assert.match(kernels, /class BinaryHeap/);
assert.match(kernels, /centeredRollingExtrema/);
assert.match(vector, /CoreSpiritDualHeapMedian/);
assert.doesNotMatch(vector, /for \(let i = this\.sortedCount/);

assert.match(indicators, /RollingPercentile/);
assert.match(indicators, /centeredRollingExtrema/);
assert.doesNotMatch(indicators, /rollingMean\(vol,p\)\[i\]/);
assert.doesNotMatch(indicators, /slice\(i-p,i\).*Math\.(?:max|min)/);
assert.match(indicators, /kind==='Market Structure Dashboard'/);
assert.match(indicators, /kind==='Pivot Consolidation Zone'/);
assert.match(indicators, /kind==='Stoploss Cascades'/);

assert.match(tape, /class ColumnarHistoryTape/);
assert.match(tape, /replaceColumns/);
assert.match(tape, /prependRows/);
assert.match(tape, /prependColumns/);
assert.match(tape, /replaceLastValues/);
assert.match(velaEngine, /rawTape/);
assert.match(velaEngine, /setBarSeriesColumns/);
assert.match(velaEngine, /rawTape\.prependColumns/);
assert.match(velaEngine, /loadRangeColumns/);
assert.match(velaEngine, /rawTape\.prependRows/);
assert.match(velaEngine, /rangeSeriesDelta/);
assert.match(patch, /replace-range/);
assert.match(model, /dirty\?: DirtyRange/);
assert.match(scripting, /maxLookback\?: number/);
assert.match(scripting, /notifyBars\(reason\?: BarsChangeReason, dirty\?: DirtyRange\)/);
assert.match(coreSpiritEngine, /executionStart = Math\.max\(0, start - maxLookback\)/);
assert.match(coreSpiritEngine, /collectRange/);

assert.match(renderer, /getPerformanceStats\(\)/);
assert.match(renderer, /perfWorstFrameMs/);
assert.match(renderer, /perfLongFrames/);
assert.match(renderer, /p95FrameMs/);
assert.match(renderer, /frameBudgetMissRate/);
assert.match(workspace, /getPerformanceStats\(\)/);
assert.match(telemetry, /ingestRendererSnapshot/);
assert.match(live, /chartPerformanceTelemetry/);
assert.match(live, /15 \* 60 \* 1000/);

console.log('TRADINGCORE_V127_STATEFUL_KERNEL_ARCHITECTURE_OK');
console.log('TRADINGCORE_V127_COLUMNAR_VELA_HISTORY_TAPE_OK');
console.log('TRADINGCORE_V127_DIRTY_SPAN_EXECUTION_PATCH_OK');
console.log('TRADINGCORE_V127_RENDERER_FRAME_TELEMETRY_OK');
