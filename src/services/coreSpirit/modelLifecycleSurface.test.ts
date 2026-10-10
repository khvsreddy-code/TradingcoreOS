import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts.ts';
import {
  lowerCoreSpiritLiveInferenceSource,
  lowerCoreSpiritResearchSource,
  parseCoreSpiritModelLifecycleSurface,
} from './modelLifecycleSurface.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = [
  'model artifact RegimeV7',
  'model RegimeV7: HMM<float> {',
  '  states = 3',
  '  stateLabels = ["bear", "range", "bull"]',
  '  emission = gaussian',
  '}',
  'features = dataset {',
  '  ret1: pctchange(close)',
  '  atr14: atr(14)',
  '}',
  'fit RegimeV7 on features',
  'train RegimeV7 using dataset("NIFTY_5M")',
  '    from "2018-01-01"',
  '    to "2025-12-31"',
  'save RegimeV7 as "nifty-regime-v7"',
  'model = loadModel("nifty-regime-v7")',
  'prediction = model.predict(features)',
  'when prediction.probability("bull") > 0.75:',
  '  signal "LONG"',
].join('\n');

const plan = parseCoreSpiritModelLifecycleSurface(source);
assert(plan.artifactSymbol === 'RegimeV7', 'artifact declaration should be captured');
assert(plan.training?.modelName === 'RegimeV7' && plan.training.datasetName === 'NIFTY_5M',
  'training declaration should preserve model and dataset identity');
assert(plan.training.from === '2018-01-01' && plan.training.to === '2025-12-31',
  'indented training range should be captured');
assert(plan.saveAs === 'nifty-regime-v7', 'save-as should define an immutable versioned model name');
assert(plan.loadModelName === 'nifty-regime-v7' && plan.loadBinding === 'model',
  'loadModel binding should resolve a stable model name');
const surface = extractCoreSpiritSurfaceMetadata(source);
const modelDeclaration = surface.declarations.find(item => item.kind === 'model');
assert(modelDeclaration?.kind === 'model' &&
  modelDeclaration.stateLabels?.join(',') === 'bear,range,bull',
  'HMM state labels should be parsed as model metadata and remain ordered');

const lowered = lowerCoreSpiritResearchSource(source, plan);
assert(!/model artifact|^train |^save /m.test(lowered), 'orchestration statements must not leak into executable CoreScript');
assert(!lowered.includes('loadModel') && !lowered.includes('prediction ='), 'training compilation must stop before live inference code');
assert(lowered.includes('model RegimeV7: HMM<float>') && lowered.includes('ret1: pctchange(close)'),
  'lowering must preserve model and feature declarations');
const compiled = compileCoreSpirit(lowered, 'model-lifecycle-surface-contract', { layer: 'model' });
const invalidLabelsSource = source.replace('["bear", "range", "bull"]', '["bull", "bull", "range"]');
const invalidLabels = compileCoreSpirit(lowerCoreSpiritResearchSource(invalidLabelsSource,
  parseCoreSpiritModelLifecycleSurface(invalidLabelsSource)), 'invalid-hmm-labels-contract', { layer: 'model' });
assert(invalidLabels.diagnostics.some(item => item.code === 'TYPE_HMM_STATE_LABELS'),
  'duplicate HMM state labels must be rejected by semantic validation');
assert(Boolean(compiled.ir) && !compiled.diagnostics.some(item => item.severity === 'error'),
  'lowered lifecycle source must compile through the existing CoreSpirit pipeline: ' +
  compiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('; '));

let mismatch = false;
try {
  parseCoreSpiritModelLifecycleSurface(source.replace('save RegimeV7 as', 'save OtherModel as'));
} catch (error) {
  mismatch = error instanceof Error && /save target must match/.test(error.message);
}
assert(mismatch, 'saved artifact must correspond to the trained model symbol');

let invalidRange = false;
try {
  parseCoreSpiritModelLifecycleSurface(source.replace('to "2025-12-31"', 'to "2017-01-01"'));
} catch (error) {
  invalidRange = error instanceof Error && /from < to/.test(error.message);
}
assert(invalidRange, 'training date range must be validated before enqueue');
const sameDay = parseCoreSpiritModelLifecycleSurface(
  source.replace('from "2018-01-01"', 'from "2025-01-01"').replace('to "2025-12-31"', 'to "2025-01-01"'),
);
assert(sameDay.training?.from === '2025-01-01' && sameDay.training.to === '2025-01-01',
  'a date-only training range should include the full end date and allow a single-day window');

let invalidDatasetName = false;
try {
  parseCoreSpiritModelLifecycleSurface(source.replace('NIFTY_5M', 'D'.repeat(121)));
} catch (error) {
  invalidDatasetName = error instanceof Error && /dataset name must be 1–120 characters/.test(error.message);
}
assert(invalidDatasetName, 'named datasets must be length-bounded before any provider call');

const liveLowered = lowerCoreSpiritLiveInferenceSource(source, plan);
assert(!liveLowered.includes('loadModel') && !/^train |^save /m.test(liveLowered),
  'live chart lowering must strip training-only control-plane declarations');
assert(liveLowered.includes('model("nifty-regime-v7").predict(features)'),
  'live loadModel binding must lower to the existing model(name).predict runtime ABI');
const liveCompiled = compileCoreSpirit(liveLowered, 'model-lifecycle-live-surface-contract', { layer: 'model' });
assert(Boolean(liveCompiled.ir) && !liveCompiled.diagnostics.some(item => item.severity === 'error'),
  'lowered live inference source must compile through the existing CoreSpirit compiler: ' +
  liveCompiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('; '));

const conciseSource = [
  'model artifact RegimeV7',
  'model RegimeV7: HMM<float> {',
  '  states = 3',
  '  stateLabels = ["bear", "range", "bull"]',
  '}',
  'features = featureSet {',
  '  ret1',
  '  ret5',
  '  atr20',
  '  volumeZ',
  '}',
  'train RegimeV7 using dataset("NIFTY_5M") from "2025-01-01" to "2025-01-14"',
  'save RegimeV7 as "nifty-regime-v7"',
  'model = loadModel("nifty-regime-v7")',
  'prediction = model.predict(features)',
  'confidence = model.probability(features, "bull")',
  'plot confidence',
].join('\n');
const concisePlan = parseCoreSpiritModelLifecycleSurface(conciseSource);
const conciseResearch = lowerCoreSpiritResearchSource(conciseSource, concisePlan);
const canonicalFeatures = 'dataset("ret1", pctchange(close, 1), "ret5", pctchange(close, 5), "atr20", atr(close, 20), "volumeZ", zscore(volume, 20))';
assert(conciseResearch.includes(canonicalFeatures),
  'bare featureSet aliases must lower to the same explicit feature expressions used for live inference');
const conciseResearchCompile = compileCoreSpirit(conciseResearch, 'concise-featureSet-research-contract', { layer: 'model' });
assert(Boolean(conciseResearchCompile.ir) && !conciseResearchCompile.diagnostics.some(item => item.severity === 'error'),
  'concise featureSet research source must compile after safe feature lowering');
const conciseLive = lowerCoreSpiritLiveInferenceSource(conciseSource, concisePlan);
assert(conciseLive.includes(canonicalFeatures) && conciseLive.includes('model("nifty-regime-v7").predict(features)'),
  'live source must use the same feature expressions and immutable artifact binding as training');
const conciseLiveCompile = compileCoreSpirit(conciseLive, 'concise-featureSet-live-contract', { layer: 'model' });
assert(Boolean(conciseLiveCompile.ir) && !conciseLiveCompile.diagnostics.some(item => item.severity === 'error'),
  'concise featureSet inference source must compile through the existing chart VM');

console.log('CORESPIRIT_MODEL_LIFECYCLE_SURFACE_OK');
