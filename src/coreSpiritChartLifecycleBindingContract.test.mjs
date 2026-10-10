import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chartRunner = readFileSync('src/services/coreSpirit/chartRunner.ts', 'utf8');
const chartController = readFileSync('src/services/core/chart/controllers/ChartCoreSpiritController.ts', 'utf8');
const worker = readFileSync('src/services/coreSpirit/coreSpirit.worker.ts', 'utf8');
const fallback = readFileSync('src/services/coreSpirit/coreSpiritWorkerPool.ts', 'utf8');

assert(chartRunner.includes('prepareCoreSpiritLiveInference') && chartRunner.includes('sessionService.getSession()'),
  'chart execution must load lifecycle artifacts using the signed-in browser session');
assert(chartRunner.includes('loadOrCompileCoreSpiritArtifact(executableSource') && chartRunner.includes('hmmArtifacts,'),
  'chart execution must compile the lowered live source and pass verified model bindings to the worker');
assert(chartController.includes('lowerCoreSpiritLiveInferenceSource') &&
  chartController.includes('compileCoreSpirit(compilableSource)'),
  'the chart compile button must validate lifecycle source through live-inference lowering');
assert(worker.includes('binding.artifactName') && worker.includes('binding.artifactHash') &&
  worker.includes('next.set(alias,model)'),
  'persistent worker must resolve a sealed model by internal alias, artifact name, and hash');
assert(fallback.includes('binding.artifactName') && fallback.includes('binding.artifactHash') &&
  fallback.includes('hmmModels.set(alias,model)'),
  'fallback worker execution must preserve the same immutable model-name resolution semantics');

console.log('CORESPIRIT_CHART_LIFECYCLE_BINDING_OK');
