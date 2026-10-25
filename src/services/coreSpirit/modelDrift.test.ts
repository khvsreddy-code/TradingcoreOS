import assert from 'node:assert/strict';
import { monitorCoreSpiritFeatureDrift } from './modelDrift.ts';

const artifactHash = 'a'.repeat(64);
const featureSchemaHash = 'b'.repeat(64);
const names = ['returns', 'volatility'];
const baseline = Array.from({ length: 200 }, (_, index) => ({
  timestamp: 1_700_000_000_000 + index * 60_000,
  availableAt: 1_700_000_000_000 + index * 60_000,
  confirmed: true,
  phase: 'historical' as const,
  values: [Math.sin(index / 7), Math.abs(Math.cos(index / 9))],
}));
const stableObserved = Array.from({ length: 60 }, (_, index) => ({
  timestamp: 1_700_000_000_000 + (200 + index) * 60_000,
  availableAt: 1_700_000_000_000 + (200 + index) * 60_000,
  confirmed: true,
  phase: 'confirmed' as const,
  values: [Math.sin((200 + index) / 7), Math.abs(Math.cos((200 + index) / 9))],
}));
const stable = monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: names, baseline, observed: stableObserved,
});
assert.equal(stable.status, 'healthy', 'a similarly distributed, adequately sized sample should be healthy');
assert.equal(stable.features.length, 2);
assert.equal(stable.artifactHash, artifactHash);

const shiftedObserved = stableObserved.map((row, index) => ({
  ...row,
  values: [10 + index / 100, 5 + index / 100],
}));
const shifted = monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: names, baseline, observed: shiftedObserved,
});
assert.equal(shifted.status, 'critical', 'a large distribution shift should be flagged critical');
assert.ok(shifted.features.some(feature => feature.status === 'critical'));

const developingObserved = stableObserved.map((row, index) => index < 12
  ? { ...row, confirmed: false, phase: 'developing' as const }
  : row);
const excluded = monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: names, baseline, observed: developingObserved,
});
assert.equal(excluded.temporalViolations, 12, 'developing or unconfirmed observations must not enter drift calculations');
assert.ok(excluded.eligibleObservedRows < excluded.observedRows);

const insufficient = monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: names, baseline: baseline.slice(0, 40), observed: stableObserved.slice(0, 15),
});
assert.equal(insufficient.status, 'insufficient-evidence', 'small samples must never be marked healthy');

assert.throws(() => monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: ['returns', 'returns'], baseline, observed: stableObserved,
}), /unique/);
assert.throws(() => monitorCoreSpiritFeatureDrift({
  artifactHash, featureSchemaHash, featureNames: names, baseline,
  observed: [{ ...stableObserved[0]!, availableAt: stableObserved[0]!.timestamp + 1 }],
}), /unavailable/);
console.log('CORESPIRIT_FEATURE_DRIFT_MONITORING_OK');
