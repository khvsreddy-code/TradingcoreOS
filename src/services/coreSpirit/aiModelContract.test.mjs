import assert from 'node:assert/strict';
import { aiPredictionFromResult, validateCoreSpiritAiManifest } from './aiModel.ts';

const manifest = {
  contractVersion: 2,
  abiVersion: 1,
  modelId: 'nifty-direction',
  version: 'a'.repeat(64),
  modelKind: 'ai',
  aiOutput: {
    directionMetadataKey: 'direction',
    regimeMetadataKey: 'regime',
    longProbabilityMetadataKey: 'probability_long',
    shortProbabilityMetadataKey: 'probability_short',
    flatProbabilityMetadataKey: 'probability_flat',
  },
  implementation: 'python',
  transport: 'host',
  deterministic: true,
  state: 'stateless',
  rollbackSafe: true,
  inputSchema: [{ name: 'features', dtype: 'f64', shape: [3], required: true, semantic: 'feature' }],
  outputSchema: [
    { name: 'prediction', dtype: 'f64', shape: [3], required: true, semantic: 'prediction' },
    { name: 'confidence', dtype: 'f64', shape: [], required: true, semantic: 'confidence', representation: 'scalar' },
  ],
  primaryPredictionField: 'prediction',
  confidenceField: 'confidence',
  metadataFields: ['direction', 'regime', 'probability_long', 'probability_short', 'probability_flat', 'valid_until_ms', 'probability_calibration', 'data_quality', 'feature_schema_version', 'dataset_hash', 'artifact_hash', 'expected_return', 'release_status', 'production_eligible'],
  maxMemoryBytes: 64 * 1024,
  maxSteps: 100_000,
  maxInputBytes: 1024,
  maxOutputBytes: 1024,
  capabilities: ['read-features', 'write-output'],
};
const result = {
  prediction: { dtype: 'f64', shape: [3], data: [0.62, 0.2, 0.18] },
  confidence: 0.8,
  metadata: {
    direction: 'BEARISH',
    regime: 'high-volatility',
    probability_long: 0.62,
    probability_short: 0.2,
    probability_flat: 0.18,
  },
};
validateCoreSpiritAiManifest(manifest);
const prediction = aiPredictionFromResult(manifest, result);
assert.equal(prediction.direction, 'SHORT');
assert.equal(prediction.probability, 0.2, 'the directional probability must match the selected direction, not always index zero');
assert.equal(prediction.confidence, 0.8);
assert.equal(prediction.regime, 'high-volatility');
assert.deepEqual(prediction.probabilities, { LONG: 0.62, SHORT: 0.2, FLAT: 0.18 });
assert.equal(prediction.modelId, 'nifty-direction');
assert.equal(prediction.modelVersion, 'a'.repeat(64));
assert.equal(prediction.calibrationStatus, 'unknown');
assert.equal(prediction.dataQuality, 'unknown');
assert.equal(prediction.productionEligible, false);

const provenancePrediction = aiPredictionFromResult(manifest, {
  ...result,
  metadata: {
    ...result.metadata,
    valid_until_ms: 1_700_000_600_000,
    probability_calibration: 'calibrated',
    data_quality: 'verified',
    feature_schema_version: 'ohlcv-v3',
    dataset_hash: 'b'.repeat(64),
    artifact_hash: 'c'.repeat(64),
    expected_return: 0.004,
    release_status: 'approved',
    production_eligible: true,
  },
}, { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5m', timestamp: 1_700_000_000_000 });
assert.equal(provenancePrediction.instrument, 'NSE:NIFTY50-INDEX');
assert.equal(provenancePrediction.timeframe, '5m');
assert.equal(provenancePrediction.generatedAt, 1_700_000_000_000);
assert.equal(provenancePrediction.validUntil, 1_700_000_600_000);
assert.equal(provenancePrediction.predictionHorizonBars, null);
assert.equal(provenancePrediction.featureVersion, 'ohlcv-v3');
assert.equal(provenancePrediction.datasetHash, 'b'.repeat(64));
assert.equal(provenancePrediction.artifactHash, 'c'.repeat(64));
assert.equal(provenancePrediction.expectedReturn, 0.004);
assert.equal(provenancePrediction.productionEligible, true,
  'the semantic AI view may report production eligibility only when approval, calibration and verified data are all present');

assert.throws(() => aiPredictionFromResult(manifest, {
  ...result,
  metadata: { ...result.metadata, probability_short: 1.2 },
}), /finite number in \[0,1\]/, 'invalid model probabilities must be rejected, never clamped');
assert.throws(() => aiPredictionFromResult(manifest, {
  ...result,
  confidence: -0.1,
}), /finite number in \[0,1\]/);
assert.throws(() => aiPredictionFromResult(manifest, {
  ...result,
  metadata: { ...result.metadata, probability_long: 0.5, probability_short: 0.1, probability_flat: 0.1 },
}), /sum to one/);
assert.throws(() => aiPredictionFromResult(manifest, {
  ...result,
  metadata: { ...result.metadata, probability_flat: undefined },
}), /must provide LONG, SHORT and FLAT/);
assert.throws(() => aiPredictionFromResult(manifest, {
  ...result,
  metadata: { ...result.metadata, direction: 'SIDEWAYS' },
}), /invalid direction/);
assert.throws(() => validateCoreSpiritAiManifest({
  ...manifest,
  aiOutput: { ...manifest.aiOutput, longProbabilityMetadataKey: 'not_declared' },
}), /declared metadata fields/);
assert.throws(() => aiPredictionFromResult(scalarManifest, {
  prediction: { dtype: 'f64', shape: [3], data: [0.6, 0.2, 0.2] },
  confidence: 0.7,
  metadata: { direction: 'LONG' },
}), /explicit LONG\/SHORT\/FLAT probability mapping/);

const scalarManifest = {
  ...manifest,
  aiOutput: { directionMetadataKey: 'direction' },
  metadataFields: ['direction'],
};
const scalarPrediction = aiPredictionFromResult(scalarManifest, {
  prediction: { dtype: 'f64', shape: [1], data: [0.73] },
  confidence: 0.66,
  metadata: { direction: 'BULLISH' },
});
assert.equal(scalarPrediction.direction, 'LONG');
assert.equal(scalarPrediction.probability, 0.73);
assert.equal(scalarPrediction.probabilities, undefined);

console.log('CORESPIRIT_AI_MODEL_SEMANTICS_OK');
