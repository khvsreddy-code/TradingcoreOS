import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const model = read('src/services/core/data/marketDataStore.ts');
const lod = read('src/services/core/chart/chartLevelOfDetail.ts');
const gpu = read('src/services/core/chart/chartGpuBuffer.ts');
const core = read('src/services/core/chart/chartCore.ts');
const webgl = read('src/services/core/chart/webgl2ChartRenderer.ts');
const renderer = read('src/services/core/chart/chartRenderer.ts');
const derived = read('src/services/core/data/derivedDataStores.ts');
const chartDocs = read('docs/CHART_ENGINE_ARCHITECTURE.md');
const migration = read('docs/CHART_RENDERER_MIGRATION.md');
const tracker = read('docs/CORESPIRIT_BUILD_TRACKER.md');
const v95Docs = read('docs/CHART_ENGINE_ARCHITECTURE.md');

for (const token of ['MarketDataStore', 'timelineKey', 'oi', 'bid', 'ask', 'bidVolume', 'askVolume', 'trades', 'session', 'metadata']) {
  if (!model.includes(token)) throw new Error(`canonical market-data contract missing ${token}`);
}
for (const token of ['createLodIndex', 'updateLodIndex', 'dirtyFromBucket', 'dirtyToBucket', 'capacity']) {
  if (!lod.includes(token)) throw new Error(`incremental LOD contract missing ${token}`);
}
for (const token of ['ChartGpuCandleBuffer', 'Float32Array', 'ensureCapacity', 'sourceRevision']) {
  if (!gpu.includes(token)) throw new Error(`retained GPU buffer contract missing ${token}`);
}
if (core.includes('toArray()') || core.includes('reduceCandlesForPixels')) throw new Error('ChartCore still uses object LOD in native path');
for (const token of ['drawArraysInstanced', 'bufferSubData', 'ChartGpuCandleBuffer']) {
  if (!webgl.includes(token)) throw new Error(`native renderer missing zero-copy GPU contract ${token}`);
}
for (const token of ['setCandlesStore', 'setReducedCandlesIndex']) if (!renderer.includes(token)) throw new Error(`renderer ABI missing ${token}`);
for (const token of ['IndicatorStore', 'ModelStore', 'StructureStore', 'LiquidityStore', 'OrderFlowStore', 'timeline']) {
  if (!derived.includes(token)) throw new Error(`derived canonical store missing ${token}`);
}
for (const token of ['canonical columnar data plane', 'Vela NativeRenderer', 'object materialization', 'zero-object LOD']) {
  if (!chartDocs.includes(token) && !migration.includes(token)) throw new Error(`chart documentation contract missing ${token}`);
}
if (!tracker.includes('v94 implementation record') || !tracker.includes('zero-copy canonical chart data plane')) throw new Error('tracker missing v94 zero-copy record');
if (!v95Docs.includes('v95 — full chart engine decomposition')) throw new Error('v95 chart engine decomposition documentation missing');

console.log('STAGE94_ZERO_COPY_SOURCE_CONTRACT_OK');
console.log('STAGE94_CHART_DOCUMENTATION_CONTRACT_OK');
console.log('STAGE94_TRACKER_CONTRACT_OK');
