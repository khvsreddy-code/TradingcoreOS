import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd(); const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const legacy=read('src/services/coreSpirit/indicatorKernel.ts');
const standard=read('src/services/marketData/indicatorEngine.ts');
const marketKernel=read('src/services/marketData/coreIndicatorKernel.ts');
const stateful=read('src/services/coreSpirit/statefulIndicatorKernel.ts');
const runtime=read('src/services/coreSpirit/runtime.ts');
const tape=read('vendor/vela/src/core/model/ColumnarHistoryTape.ts');
const structure=read('src/services/marketData/structureEngine.ts');
const vela=read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const engine=read('src/CoreSpiritVelaEngine.ts');
const telemetry=read('src/services/marketData/chartPerformanceTelemetry.ts');

for(const pattern of [/\.slice\([^)]*period[^)]*\)/,/\.slice\([^)]*length[^)]*\)/,/Math\.(?:max|min)\(\.\.\./,/\.reduce\(/,/\.sort\(/]) assert.doesNotMatch(legacy,pattern);
for(const name of ['RollingSum','RollingMean','RollingVariance','RollingMinMax','RollingMedian','RollingPercentile','RollingAbsoluteDeviation','EMAState','WilderState','ATRState','WMAState','VWAPSessionState']) assert.match(stateful,new RegExp('export class '+name));
for(const name of ['bollinger','donchian','stochastic','cci','mfi']) assert.match(standard.toLowerCase(),new RegExp(name));
assert.doesNotMatch(runtime,/trHistory\.slice\(-length\)\.reduce/);
assert.match(runtime,/if\(name==='atr'\)/);
assert.match(runtime,/new ATRState\(length\)/);
assert.match(runtime,/kernel\.update\(Number\(bar\.high\),\s*Number\(bar\.low\),\s*Number\(bar\.close\),\s*mode\)/);
assert.doesNotMatch(marketKernel,/gains\.slice\(0,p\)\.reduce/);
assert.doesNotMatch(marketKernel,/for\(let j=i-p\+1;j<=i;j\+=1\)/);
assert.match(structure,/centeredRollingExtrema\(highs, period/);
assert.match(structure,/centeredRollingExtrema\(lows, period/);
assert.match(structure,/const atrSeries = canonicalAtrSeries\(c, 14\)/);
assert.match(structure,/heapPop\(demandHeap, 'maxUpper'\)/);
assert.match(structure,/heapPop\(supplyHeap, 'minLower'\)/);
assert.doesNotMatch(structure,/for\s*\(let j = 1; j <= period; j \+= 1\)/);
assert.doesNotMatch(structure,/atrValue\(c\.slice\(0, i \+ 1\), 14\)/);
assert.match(stateful,/mode\\s*===\\s*'replace'\\s*&&\\s*this\\.count/);
assert.match(stateful,/this\\.replaceCurrentSlot\\(v\\)/);
assert.match(stateful,/this\\.tree\\.set\\(slot,v\\)/);
assert.match(legacy,/RollingMean/);
assert.match(legacy,/RollingVariance/);
assert.match(legacy,/RollingMinMax/);
assert.match(runtime,/maxLookback/);

for(const method of ['timeAt','lastIndexAtOrBefore','firstIndexAtOrAfter','countTimeRange']) assert.match(tape,new RegExp(method+'\\('));
assert.match(vela,/rawTape\.countTimeRange/); assert.match(vela,/rawTape\.lastIndexAtOrBefore/); assert.match(vela,/rawTape\.timeAt/);

assert.match(engine,/notifyBars\(reason,dirtyRange\)/);
assert.match(engine,/collectRange\(rangeResult\.outputs,dirtyRange\)/);
assert.match(engine,/executionStart = Math\.max\(0,start - maxLookback\)/);
assert.doesNotMatch(engine,/reason === 'backfill'[\s\S]{0,700}points\.clear\(\)/);

for(const stage of ['transport','compute','patch','renderer','frame']) assert.match(telemetry,new RegExp(stage));
assert.match(telemetry,/recordStage/);
assert.ok(fs.existsSync(path.join(root,'tools/verify-chart-performance.mjs')));
assert.ok(fs.existsSync(path.join(root,'docs/CORESPIRIT_BUILD_TRACKER.md')));
assert.ok(fs.existsSync(path.join(root,'docs/archive/history/CORESPIRIT_BUILD_TRACKER_LEGACY_20261004.md')));
assert.ok(!fs.existsSync(path.join(root,'docs/CHART_RENDERER_MIGRATION.md')));
assert.ok(!fs.existsSync(path.join(root,'docs/archive/compatibility/CORESPIRIT_BUILD_TRACKER.md')));
assert.ok(!fs.existsSync(path.join(root,'docs/archive/compatibility/CHART_RENDERER_MIGRATION.md')));

console.log('TRADINGCORE_V129_STATEFUL_ROLLING_KERNELS_OK');
console.log('TRADINGCORE_V129_COLUMNAR_TAPE_CONSUMER_MIGRATION_OK');
console.log('TRADINGCORE_V129_DIRTY_SPAN_CORRECTNESS_OK');
console.log('TRADINGCORE_V129_STAGE_TELEMETRY_AND_DOC_HONESTY_OK');