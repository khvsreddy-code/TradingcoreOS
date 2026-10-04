import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const vector = read('src/services/coreSpirit/seriesVector.ts');
const fusion = read('src/services/coreSpirit/seriesFusion.ts');
const runtime = read('src/services/coreSpirit/runtime.ts');
const stdlib = read('src/services/coreSpirit/standardLibrary.ts');

if (!vector.includes('export class CoreSpiritFusedSeriesCursor')) throw new Error('fused cursor missing');
if (!vector.includes('const output = new Float64Array(source.length)')) throw new Error('final output buffer missing');
if (!vector.includes('intermediateAllocations: 0')) throw new Error('zero-intermediate contract missing');
if (!vector.includes('copyFrom(source: CoreSpiritFusedSeriesCursor)')) throw new Error('reusable cursor checkpoint missing');
if (!vector.includes('updateInto(sourceValue: number, absoluteIndex: number')) throw new Error('scalar fused output seam missing');
if (/current\s*=\s*executeOne/.test(vector)) throw new Error('legacy full-series stage loop remains');
if (vector.includes('executeLegacySingleOperation')) throw new Error('legacy production executor remains');
if (!fusion.includes('isCoreSpiritSeriesOperationFusible')) throw new Error('fusion eligibility is not tied to kernel registry');
if (/b\?\.pure&&b\.seriesExecution/.test(fusion)) throw new Error('stateful fusible operations are still blocked by pure-only planner');
if (!runtime.includes('installSeriesFusion')) throw new Error('VM does not install the fusion plan');
if (!runtime.includes('fusedStageValues')) throw new Error('VM fused-stage execution seam missing');
if (!stdlib.includes("name:'ema'") || !stdlib.includes("fusible:true,strategy:'stateful'")) throw new Error('EMA stateful fusion contract missing');
if (!stdlib.includes("name:'rma'") || !stdlib.includes("fusible:true,strategy:'stateful'")) throw new Error('RMA stateful fusion contract missing');

console.log('TRADINGCORE_V119_TRUE_CORESPIRIT_FUSION_CONTRACT_OK');
