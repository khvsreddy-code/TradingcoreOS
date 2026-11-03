import { coreSpiritSha256, verifyModelArtifactIntegrity, type ModelArtifact, type ResearchArtifact } from './modelArtifacts.js';
import {
  assertNoKnownLabelLeakage,
  splitChronologicalResearchRows,
  summarizeResearchSafety,
  validateConfirmedResearchRows,
  type ResearchFeatureRow,
} from './researchValidation.js';
import { compileCoreSpirit, parseCoreSpirit } from './coreSpiritPipeline.js';
import { analyzeCoreSpiritCausality } from './causalityAnalysis.js';
import { analyzeCoreSpiritRepaintSafety } from './repaintSafety.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from './quantMath.js';

export type PromotionDatasetSnapshot = Readonly<{
  id: string;
  datasetVersion: string;
  featureNames: readonly string[];
  trainingRange: Readonly<{ from: string; to: string }>;
  sourceProvenance: 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
  sourceVerified: boolean;
  sourceAttestationHash: string | null;
  storageMode: 'inline-v1' | 'chunked-v1';
  rows: readonly ResearchFeatureRow[];
}>;

export type ModelPromotionValidation = Readonly<{
  productionEligible: boolean;
  checks: Readonly<Record<string, boolean>>;
  report: Readonly<Record<string, unknown>>;
}>;

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function sameRange(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return Date.parse(a.from) === Date.parse(b.from) && Date.parse(a.to) === Date.parse(b.to);
}
function closeEnough(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7;
}
function endOfRange(value: string): number {
  const timestamp = Date.parse(value);
  return timestamp + (/^\d{4}-\d{2}-\d{2}$/.test(value) ? 86_399_999 : 0);
}

/**
 * Promotion-time verification is deliberately independent of the training report.
 * Report booleans are necessary evidence but are never treated as proof on their own.
 */
export async function validateModelPromotion(input: {
  artifact: ModelArtifact<unknown>;
  research: ResearchArtifact | null;
  researchArtifactId: string;
  snapshot: PromotionDatasetSnapshot | null;
  currentVersions: { compiler: string; ir: string; runtime: string };
}): Promise<ModelPromotionValidation> {
  const { artifact, research, researchArtifactId, snapshot, currentVersions } = input;
  const provenance = artifact.provenance;
  const validation = provenance.validationResults;
  const parameters = provenance.trainingParameters;
  const expectedSnapshotId = String(parameters.datasetSnapshotId ?? '');
  const expectedResearchId = String(parameters.researchArtifactId ?? '');
  const weights = artifact.weights && typeof artifact.weights === 'object'
    ? artifact.weights as Record<string, unknown>
    : {};
  const modelFeatureNames: unknown[] = Array.isArray(weights.featureNames) ? weights.featureNames : [];
  const graph = research?.featureGraph && typeof research.featureGraph === 'object'
    ? research.featureGraph as Record<string, unknown>
    : {};
  const graphFeatureNames: unknown[] = Array.isArray(graph.featureNames) ? graph.featureNames : [];
  const states = Number(graph.states ?? parameters.states ?? 3);
  const forecastHorizon = Number(parameters.forecastHorizonBars ?? parameters.targetHorizonBars ?? parameters.horizon ?? 1);
  const purgeBars = Number(parameters.purgeBars ?? forecastHorizon);
  const embargoBars = Number(parameters.embargoBars ?? 0);

  const checks: Record<string, boolean> = {
    artifactIntegrityVerified: false,
    researchArtifactBound: false,
    datasetSnapshotBound: false,
    datasetHashVerified: false,
    confirmedRowsOnly: false,
    featureSchemaMatched: false,
    labelLeakageCheckPassed: false,
    chronologicalSplitRecomputed: false,
    temporalRangesDisjoint: false,
    forecastHorizonPurged: false,
    validationPredictionsRecomputed: false,
    nonDegenerateValidation: false,
    sourceCausalityRecomputed: false,
    lookaheadCheckRecomputed: false,
    datasetSourceVerified: false,
    compilerCompatible: false,
    irCompatible: false,
    runtimeCompatible: false,
    modelImplementationCompatible: false,
  };

  try {
    checks.artifactIntegrityVerified = await verifyModelArtifactIntegrity(artifact);
    checks.researchArtifactBound = Boolean(
      research &&
      research.kind === 'corespirit-research' &&
      expectedResearchId === researchArtifactId &&
      provenance.sourceHash === research.sourceHash &&
      provenance.featureGraphHash === research.featureGraphHash &&
      provenance.compilerVersion === research.compilerVersion &&
      provenance.irVersion === research.irVersion &&
      await coreSpiritSha256(research.source) === research.sourceHash &&
      await coreSpiritSha256(research.featureGraph) === research.featureGraphHash
    );
  } catch {
    checks.artifactIntegrityVerified = false;
    checks.researchArtifactBound = false;
  }

  checks.compilerCompatible = provenance.compilerVersion === currentVersions.compiler &&
    research?.compilerVersion === currentVersions.compiler &&
    provenance.dependencyVersions.corespiritCompiler === currentVersions.compiler;
  checks.irCompatible = provenance.irVersion === currentVersions.ir &&
    research?.irVersion === currentVersions.ir &&
    provenance.dependencyVersions.corespiritIr === currentVersions.ir;
  checks.runtimeCompatible = provenance.runtimeVersion === currentVersions.runtime &&
    provenance.dependencyVersions.corespiritRuntime === currentVersions.runtime;
  checks.modelImplementationCompatible = provenance.modelImplementation === 'corespirit-gaussian-hmm-v1' &&
    weights.modelType === 'gaussian-hmm' && Boolean(weights.hmm);

  checks.datasetSnapshotBound = Boolean(
    snapshot &&
    snapshot.id === expectedSnapshotId &&
    snapshot.datasetVersion === provenance.datasetVersion &&
    snapshot.datasetVersion === artifact.contract?.datasetSnapshot?.hash &&
    snapshot.featureNames.length === modelFeatureNames.length &&
    snapshot.featureNames.every((name, index) => name === modelFeatureNames[index])
  );

  let rows: ResearchFeatureRow[] = [];
  let split: ReturnType<typeof splitChronologicalResearchRows<ResearchFeatureRow>> | undefined;
  // Chunked datasets are intentionally rejected here until promotion streams and rehashes
  // every sealed chunk. Empty placeholder rows are never accepted as evidence.
  if (snapshot && snapshot.storageMode === 'inline-v1' && snapshot.rows.length > 0 &&
      snapshot.rows.length <= 1_000_000 && snapshot.featureNames.length > 0) {
    try {
      assertNoKnownLabelLeakage(snapshot.featureNames);
      rows = validateConfirmedResearchRows(snapshot.rows, snapshot.featureNames, { maxRows: snapshot.rows.length });
      const rangeStart = Date.parse(snapshot.trainingRange.from);
      const rangeEnd = endOfRange(snapshot.trainingRange.to);
      if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeStart < rangeEnd &&
          rows.every(row => row.timestamp >= rangeStart && row.timestamp <= rangeEnd)) {
        const actualDatasetHash = await coreSpiritSha256({
          featureNames: snapshot.featureNames,
          rows,
          trainingRange: snapshot.trainingRange,
        });
        checks.datasetHashVerified = validHash(actualDatasetHash) &&
          actualDatasetHash === snapshot.datasetVersion &&
          actualDatasetHash === provenance.datasetVersion;
        checks.confirmedRowsOnly = true;
      }
    } catch {
      rows = [];
      checks.datasetHashVerified = false;
      checks.confirmedRowsOnly = false;
    }
  }

  // Hash integrity is intentionally independent from provider/source trust.
  checks.datasetSourceVerified = Boolean(
    snapshot &&
    snapshot.sourceVerified === true &&
    snapshot.sourceProvenance !== 'user_supplied' &&
    snapshot.sourceProvenance === provenance.datasetSource &&
    provenance.datasetSourceVerified === true &&
    validHash(snapshot.sourceAttestationHash) &&
    snapshot.sourceAttestationHash === provenance.datasetSourceAttestationHash
  );

  const contract = artifact.contract;
  const schema = contract?.featureSchema;
  let contractSchemaHash = '';
  if (schema) {
    contractSchemaHash = await coreSpiritSha256({
      version: schema.version,
      orderedNames: schema.orderedNames,
      types: schema.types,
    });
  }
  checks.featureSchemaMatched = Boolean(
    snapshot && research && schema &&
    snapshot.featureNames.length === graphFeatureNames.length &&
    snapshot.featureNames.every((name, index) => name === graphFeatureNames[index]) &&
    graphFeatureNames.length === modelFeatureNames.length &&
    graphFeatureNames.every((name, index) => name === modelFeatureNames[index]) &&
    schema.orderedNames.length === graphFeatureNames.length &&
    schema.orderedNames.every((name, index) => name === graphFeatureNames[index]) &&
    contractSchemaHash === schema.hash &&
    contract.validation.protocol === validation.protocol &&
    contract.temporal.validationProtocol === validation.protocol
  );
  try {
    // Check every declared feature boundary independently. A malicious or stale
    // artifact must not hide a future-derived model input by presenting a
    // different, apparently safe dataset snapshot schema.
    const leakageFeatureNames = [
      ...(snapshot?.featureNames ?? []),
      ...modelFeatureNames.filter((name): name is string => typeof name === 'string'),
      ...graphFeatureNames.filter((name): name is string => typeof name === 'string'),
    ];
    assertNoKnownLabelLeakage(leakageFeatureNames);
    checks.labelLeakageCheckPassed = Boolean(
      snapshot?.featureNames.length &&
      modelFeatureNames.length &&
      modelFeatureNames.every(name => typeof name === 'string' && name.trim()) &&
      graphFeatureNames.length &&
      graphFeatureNames.every(name => typeof name === 'string' && name.trim())
    );
  } catch {
    checks.labelLeakageCheckPassed = false;
  }

  try {
    if (rows.length && Number.isSafeInteger(forecastHorizon) && forecastHorizon >= 1 &&
        Number.isSafeInteger(purgeBars) && purgeBars >= 0 &&
        Number.isSafeInteger(embargoBars) && embargoBars >= 0) {
      split = splitChronologicalResearchRows(
        rows,
        Number(parameters.validationFraction ?? 0.2),
        Math.max(12, Number.isInteger(states) ? states * 4 : 12),
        12,
        { maxRows: rows.length, purgeBars, embargoBars },
      );
      checks.chronologicalSplitRecomputed =
        split.validationProtocol === validation.protocol &&
        split.trainingRows.length === validation.trainingSampleCount &&
        split.validationRows.length === validation.sampleCount &&
        sameRange(split.trainingRange, provenance.trainingRange) &&
        sameRange(split.validationRange, provenance.validationRange) &&
        contract?.temporal.validationProtocol === split.validationProtocol;
      const trainingEnd = split.trainingRows.at(-1)?.timestamp ?? Number.POSITIVE_INFINITY;
      const validationStart = split.validationRows[0]?.timestamp ?? Number.NEGATIVE_INFINITY;
      const validationEnd = split.validationRows.at(-1)?.timestamp ?? Number.NEGATIVE_INFINITY;
      checks.temporalRangesDisjoint =
        trainingEnd < validationStart &&
        validationStart <= validationEnd &&
        endOfRange(provenance.trainingRange.to) < Date.parse(provenance.validationRange.from);
      checks.forecastHorizonPurged =
        Number.isSafeInteger(forecastHorizon) &&
        forecastHorizon >= 1 &&
        Number.isSafeInteger(purgeBars) &&
        purgeBars >= forecastHorizon &&
        contract?.target.forecastHorizonBars === forecastHorizon;
    }
  } catch {
    checks.chronologicalSplitRecomputed = false;
    checks.temporalRangesDisjoint = false;
    checks.forecastHorizonPurged = false;
  }

  try {
    if (research && checks.researchArtifactBound && rows.length > 0 && split) {
      const compiled = compileCoreSpirit(research.source, 'promotion:' + artifact.hash, { layer: 'model' });
      const ast = parseCoreSpirit(research.source);
      const safety = summarizeResearchSafety(
        analyzeCoreSpiritCausality(ast),
        analyzeCoreSpiritRepaintSafety(ast),
      );
      checks.sourceCausalityRecomputed = safety.causality === 'causal' &&
        safety.blockers.length === 0 && validation.sourceCausalityPassed === true;
      checks.lookaheadCheckRecomputed =
        safety.lookahead === 'false' &&
        safety.realtimeSafe === true &&
        safety.backtestLiveEquivalent === true &&
        safety.approvalEligible === true &&
        safety.blockers.length === 0 &&
        validation.lookaheadCheckPassed === true &&
        compiled.ir != null &&
        !compiled.diagnostics.some(item => item.severity === 'error');
    }
  } catch {
    checks.sourceCausalityRecomputed = false;
    checks.lookaheadCheckRecomputed = false;
  }

  try {
    if (split && checks.featureSchemaMatched && weights.hmm && Array.isArray(modelFeatureNames)) {
      const model = CoreSpiritGaussianHMM.fromTrainedState(weights.hmm as CoreSpiritGaussianHMMState);
      model.setInferenceBoundaryExclusive(split.trainingRows.at(-1)!.timestamp);
      const statesSeen = new Set<number>();
      const confidence: number[] = [];
      for (const row of split.validationRows) {
        const prediction = model.predict(row.values, modelFeatureNames as string[], row.timestamp);
        if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
          throw new Error('Holdout prediction confidence is invalid.');
        }
        statesSeen.add(prediction.state);
        confidence.push(prediction.confidence);
      }
      const mean = confidence.reduce((sum, value) => sum + value, 0) / confidence.length;
      const min = Math.min(...confidence);
      const max = Math.max(...confidence);
      // A model that emits only one state across the holdout has no
      // demonstrated regime separation and cannot be promoted to production.
      checks.nonDegenerateValidation =
        statesSeen.size >= 2 &&
        validation.distinctPredictedStates >= 2;
      checks.validationPredictionsRecomputed =
        confidence.length === validation.sampleCount &&
        statesSeen.size === validation.distinctPredictedStates &&
        closeEnough(mean, validation.meanConfidence) &&
        closeEnough(min, validation.minConfidence) &&
        closeEnough(max, validation.maxConfidence) &&
        validation.forwardOnly === true &&
        validation.noTimestampOverlap === true &&
        validation.featureAvailabilityCheckPassed === true &&
        validation.datasetHashVerified === true;
    }
  } catch {
    checks.validationPredictionsRecomputed = false;
  }

  const safety = provenance.researchSafety;
  const productionEligible = Object.values(checks).every(Boolean) &&
    validation.forwardOnly === true &&
    validation.noTimestampOverlap === true &&
    validation.featureSchemaMatched === true &&
    validation.labelLeakageCheckPassed === true &&
    validation.featureAvailabilityCheckPassed === true &&
    validation.datasetHashVerified === true &&
    validation.sourceCausalityPassed === true &&
    validation.lookaheadCheckPassed === true &&
    safety.approvalEligible === true &&
    safety.blockers.length === 0 &&
    safety.causality === 'causal' &&
    safety.lookahead === 'false' &&
    safety.realtimeSafe === true &&
    safety.backtestLiveEquivalent === true;

  return Object.freeze({
    productionEligible,
    checks: Object.freeze(checks),
    report: Object.freeze({
      artifactHash: artifact.hash,
      researchArtifactId,
      datasetSnapshotId: expectedSnapshotId,
      datasetHash: provenance.datasetVersion,
      datasetSource: snapshot?.sourceProvenance ?? provenance.datasetSource,
      datasetSourceVerified: checks.datasetSourceVerified,
      datasetSourceAttestationHash: snapshot?.sourceAttestationHash ?? null,
      trainingRange: provenance.trainingRange,
      validationRange: provenance.validationRange,
      validationProtocol: validation.protocol,
      forecastHorizonBars: forecastHorizon,
      trainingSampleCount: validation.trainingSampleCount,
      validationSampleCount: validation.sampleCount,
      modelImplementation: provenance.modelImplementation,
      compilerVersion: provenance.compilerVersion,
      irVersion: provenance.irVersion,
      runtimeVersion: provenance.runtimeVersion,
      validationResults: validation,
      researchSafety: safety,
      checks,
      productionEligible,
    }),
  });
}
