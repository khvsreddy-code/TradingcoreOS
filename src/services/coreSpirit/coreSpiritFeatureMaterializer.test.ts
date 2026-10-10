import { extractCoreSpiritFeatureDefinitions, materializeCoreSpiritFeatureRows } from './coreSpiritFeatureMaterializer.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = [
  'model regime: HMM<float> {',
  '  states = 3',
  '}',
  'features = dataset {',
  '  ret1: pctchange(close)',
  '  atr14: atr(14)',
  '  momentum: rsi(close, 14)',
  '  volumeZ: zscore(volume, 20)',
  '}',
].join('\n');
const definitions = extractCoreSpiritFeatureDefinitions(source);
assert(definitions.length === 4, 'feature materializer should extract all named expressions from a dataset block');
assert(definitions[0]?.name === 'ret1' && definitions[2]?.expression === 'rsi(close, 14)',
  'feature names and expressions must retain declaration order');


const shorthandSource = [
  'features = featureSet {',
  '  ret1',
  '  ret5',
  '  atr20',
  '  volumeZ',
  '}',
].join('\\n');
const shorthandDefinitions = extractCoreSpiritFeatureDefinitions(shorthandSource);
assert(shorthandDefinitions.length === 4 &&
  shorthandDefinitions.every((definition, index) => definition.name === ['ret1', 'ret5', 'atr20', 'volumeZ'][index] &&
    definition.expression === definition.name),
  'concise featureSet aliases should be accepted as both output name and supported expression');

const callSource = 'model regime: HMM<float> { states = 3 }\nfeatures = dataset("returns", pctchange(close), "volatility", atr(14))';
const callDefinitions = extractCoreSpiritFeatureDefinitions(callSource);
assert(callDefinitions.length === 2 && callDefinitions[0]?.expression === 'pctchange(close)' &&
  callDefinitions[1]?.expression === 'atr(14)',
  'dataset(...) parser must preserve nested function calls and ordered feature pairs');

const start = Date.parse('2025-01-01T00:00:00.000Z');
const bars = Array.from({ length: 90 }, (_, index) => {
  const close = 100 + index * 0.15 + Math.sin(index / 3) * 0.7;
  return {
    timestamp: start + index * 60_000,
    open: close - 0.1,
    high: close + 0.8,
    low: close - 0.9,
    close,
    volume: 1_000 + index * 3 + Math.sin(index) * 50,
  };
});
const result = materializeCoreSpiritFeatureRows({
  source,
  bars,
  trainingRange: { from: '2025-01-01', to: '2025-01-02' },
  expectedFeatureNames: ['ret1', 'atr14', 'momentum', 'volumeZ'],
});
assert(result.rows.length >= 65 && result.rows.length <= 90, 'warm-up rows should be dropped while aligned rows remain');
assert(result.droppedWarmupRows > 0, 'warm-up exclusions should be measurable');
assert(result.rows.every(row => row.values.length === 4 && row.values.every(Number.isFinite)),
  'materialized features must be aligned and finite');
assert(result.rows.every((row, index) => index === 0 || row.timestamp > result.rows[index - 1]!.timestamp),
  'materialized observations must be strictly chronological');

const shorthandResult = materializeCoreSpiritFeatureRows({
  source: shorthandSource,
  bars,
  trainingRange: { from: '2025-01-01', to: '2025-01-02' },
  expectedFeatureNames: ['ret1', 'ret5', 'atr20', 'volumeZ'],
});
assert(shorthandResult.rows.length >= 50 &&
  shorthandResult.rows.every(row => row.values.length === 4 && row.values.every(Number.isFinite)),
  'the concise featureSet form in the CoreScript authoring example must materialize aligned finite rows');

let mismatchedNames = false;
try {
  materializeCoreSpiritFeatureRows({
    source, bars, trainingRange: { from: '2025-01-01', to: '2025-01-02' },
    expectedFeatureNames: ['atr14', 'ret1', 'momentum', 'volumeZ'],
  });
} catch (error) {
  mismatchedNames = error instanceof Error && /ordered names/.test(error.message);
}
assert(mismatchedNames, 'feature name/order mismatch must fail closed');

let unsupported = false;
try {
  materializeCoreSpiritFeatureRows({
    source: 'features = dataset { secret: fetch(process.env.SECRET) }',
    bars, trainingRange: { from: '2025-01-01', to: '2025-01-02' },
  });
} catch (error) {
  unsupported = error instanceof Error && /Unsupported feature expression/.test(error.message);
}
assert(unsupported, 'unsupported feature expressions must not be evaluated as arbitrary JavaScript');

let invalidChronology = false;
try {
  materializeCoreSpiritFeatureRows({
    source: 'features = dataset { closeValue: close }',
    bars: [bars[1], bars[0], ...bars.slice(2)],
    trainingRange: { from: '2025-01-01', to: '2025-01-02' },
  });
} catch (error) {
  invalidChronology = error instanceof Error && /strictly chronological/.test(error.message);
}
assert(invalidChronology, 'out-of-order bars must be rejected');

console.log('CORESPIRIT_RESEARCH_FEATURE_MATERIALIZER_OK');
