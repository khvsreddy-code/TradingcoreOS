import assert from 'node:assert/strict';
import { validateModelPromotion, type PromotionDatasetSnapshot } from './modelPromotionValidation.ts';
import type { ModelArtifact } from './modelArtifacts.ts';
import type { ResearchFeatureRow } from './researchValidation.ts';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION.ts';

const start = Date.UTC(2026, 0, 1, 9, 15);
const rows: ResearchFeatureRow[] = Array.from({ length: 60 }, (_, index) => ({
  timestamp: start + index * 60_000,
  availableAt: start + index * 60_000,
  confirmed: true,
  phase: 'historical' as const,
  values: [100 + index],
}));
const validReport = {
  protocol: 'chronological-holdout-v1' as const,
  trainingSampleCount: 48,
  sampleCount: 12,
  distinctPredictedStates: 3,
  meanConfidence: 0.7,
  minConfidence: 0.2,
  maxConfidence: 0.9,
  forwardOnly: true,
  noTimestampOverlap: true,
  featureSchemaMatched: true,
  labelLeakageCheckPassed: true,
  featureAvailabilityCheckPassed: true,
  datasetHashVerified: true,
  sourceCausalityPassed: true,
  lookaheadCheckPassed: true,
};
const provenanceRange = {
  trainingRange: { from: new Date(rows[0]!.timestamp).toISOString(), to: new Date(rows[47]!.timestamp).toISOString() },
  validationRange: { from: new Date(rows[48]!.timestamp).toISOString(), to: new Date(rows[59]!.timestamp).toISOString() },
};
function makeArtifact(featureNames: readonly string[] = ['close'], ranges = provenanceRange): ModelArtifact<unknown> {
  return {
    kind: 'corespirit-model',
    schemaVersion: '2',
    name: 'forged-safety-fixture',
    hash: 'f'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    metrics: {},
    weights: { modelType: 'gaussian-hmm', featureNames, hmm: {} },
    provenance: {
      sourceHash: 'a'.repeat(64),
      featureGraphHash: 'b'.repeat(64),
      datasetVersion: 'c'.repeat(64),
      datasetSource: 'user_supplied',
      datasetSourceVerified: false,
      datasetSourceAttestationHash: null,
      compilerVersion: CORE_SPIRIT_COMPILER_VERSION,
      irVersion: String(CORE_SPIRIT_IR_VERSION),
      runtimeVersion: CORE_SPIRIT_RUNTIME_VERSION,
      modelImplementation: 'corespirit-gaussian-hmm-v1',
      backend: 'cpu',
      dependencyVersions: {
        corespiritCompiler: CORE_SPIRIT_COMPILER_VERSION,
        corespiritIr: String(CORE_SPIRIT_IR_VERSION),
        corespiritRuntime: CORE_SPIRIT_RUNTIME_VERSION,
      },
      trainingParameters: {
        researchArtifactId: 'research-1',
        datasetSnapshotId: 'snapshot-1',
        validationFraction: 0.2,
        forecastHorizonBars: 4,
        purgeBars: 0,
        embargoBars: 0,
        states: 3,
      },
      ...ranges,
      validationResults: validReport,
      researchSafety: {
        version: 1,
        causality: 'causal',
        lookahead: 'false',
        realtimeSafe: true,
        backtestLiveEquivalent: true,
        approvalEligible: true,
        blockers: [],
        warnings: [],
      },
      randomSeed: 7,
    },
  } as unknown as ModelArtifact<unknown>;
}
function snapshot(input: {
  rows: readonly ResearchFeatureRow[];
  featureNames?: readonly string[];
  sourceVerified?: boolean;
}): PromotionDatasetSnapshot {
  return {
    id: 'snapshot-1',
    datasetVersion: 'c'.repeat(64),
    featureNames: input.featureNames ?? ['close'],
    trainingRange: { from: new Date(rows[0]!.timestamp).toISOString(), to: new Date(rows[rows.length-1]!.timestamp).toISOString() },
    sourceProvenance: 'user_supplied',
    sourceVerified: input.sourceVerified ?? false,
    sourceAttestationHash: null,
    storageMode: 'inline-v1',
    rows: input.rows,
  };
}
async function validate(artifact: ModelArtifact<unknown>, data: PromotionDatasetSnapshot | null) {
  return validateModelPromotion({
    artifact,
    research: null,
    researchArtifactId: 'research-1',
    snapshot: data,
    currentVersions: {
      compiler: CORE_SPIRIT_COMPILER_VERSION,
      ir: String(CORE_SPIRIT_IR_VERSION),
      runtime: CORE_SPIRIT_RUNTIME_VERSION,
    },
  });
}

const forgedFlags = await validate(makeArtifact(), null);
assert.equal(forgedFlags.productionEligible, false, 'forged all-true report flags cannot replace missing source/data evidence');
assert.equal(forgedFlags.checks.researchArtifactBound, false);
assert.equal(forgedFlags.checks.datasetSnapshotBound, false);
assert.equal(forgedFlags.checks.datasetSourceVerified, false);

const unconfirmedRows = rows.map((row, index) => index === 20 ? { ...row, confirmed: false } : row);
const unconfirmed = await validate(makeArtifact(), snapshot({ rows: unconfirmedRows }));
assert.equal(unconfirmed.productionEligible, false, 'unconfirmed feature rows cannot be promoted');
assert.equal(unconfirmed.checks.confirmedRowsOnly, false);

const leakage = await validate(makeArtifact(['future_return']), snapshot({ rows }));
assert.equal(leakage.productionEligible, false, 'a known future-derived feature cannot be promoted');
assert.equal(leakage.checks.labelLeakageCheckPassed, false);

const mismatchedSchema = await validate(makeArtifact(['close']), snapshot({ rows, featureNames: ['close', 'volume'] }));
assert.equal(mismatchedSchema.productionEligible, false, 'a dataset feature schema different from the model must fail closed');
assert.equal(mismatchedSchema.checks.datasetSnapshotBound, false);
assert.equal(mismatchedSchema.checks.featureSchemaMatched, false);

const overlappingRanges = {
  trainingRange: { from: new Date(rows[0]!.timestamp).toISOString(), to: new Date(rows[50]!.timestamp).toISOString() },
  validationRange: { from: new Date(rows[48]!.timestamp).toISOString(), to: new Date(rows[59]!.timestamp).toISOString() },
};
const overlap = await validate(makeArtifact(['close'], overlappingRanges), snapshot({ rows }));
assert.equal(overlap.productionEligible, false, 'overlapping train/validation timestamps cannot be promoted');
assert.equal(overlap.checks.temporalRangesDisjoint, false);
assert.equal(overlap.checks.forecastHorizonPurged, false);
console.log('CORESPIRIT_MODEL_PROMOTION_FAILS_CLOSED_OK');
