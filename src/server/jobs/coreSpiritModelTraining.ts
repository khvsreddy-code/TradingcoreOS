import { coreSpiritSha256, sealModelArtifact, type ModelProvenance } from '../../services/coreSpirit/modelArtifacts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';
import { CORE_SPIRIT_RUNTIME_VERSION } from '../../services/coreSpirit/VERSION.js';
import { runChunkedCoreSpiritModelTraining } from './coreSpiritBatchModelTraining.js';
import {
  assertNoKnownLabelLeakage,
  splitChronologicalResearchRows,
  validateConfirmedResearchRows,
  type ResearchFeatureRow,
  type ResearchSafetySummary,
} from '../../services/coreSpirit/researchValidation.js';

type TrainingRow = ResearchFeatureRow;
const MAX_HMM_TRAINING_ROWS = 5_000;
type TrainingPayload = Readonly<{
  trainingRunId: string;
  researchArtifactId: string;
  datasetVersion: string;
  datasetSource: 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
  datasetSourceVerified: boolean;
  datasetSourceAttestationHash: string | null;
  rows: readonly TrainingRow[];
  featureNames: readonly string[];
  trainingRange: Readonly<{ from: string; to: string }>;
  trainingParameters: Readonly<Record<string, string | number | boolean | null>>;
  randomSeed: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parsePayload(value: unknown): TrainingPayload {
  if (!isRecord(value)) throw new Error('CoreSpirit training payload must be an object');
  const rows = value.rows;
  const featureNames = value.featureNames;
  const trainingRange = value.trainingRange;
  const trainingParameters = value.trainingParameters;
  if (!Array.isArray(rows) || rows.length < 12 || rows.length > MAX_HMM_TRAINING_ROWS) {
    throw new Error('CoreSpirit HMM training requires 12–' + MAX_HMM_TRAINING_ROWS + ' immutable historical rows');
  }
  if (!Array.isArray(featureNames) || featureNames.length < 1 || featureNames.length > 16 ||
      featureNames.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('CoreSpirit HMM training requires 1–16 named features');
  }
  if (!isRecord(trainingRange) || typeof trainingRange.from !== 'string' || typeof trainingRange.to !== 'string') {
    throw new Error('CoreSpirit training range is required');
  }
  const from = Date.parse(trainingRange.from);
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(trainingRange.to);
  const to = Date.parse(trainingRange.to) + (dateOnlyTo ? 86_399_999 : 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Invalid CoreSpirit training date range');
  if (!isRecord(trainingParameters)) throw new Error('CoreSpirit training parameters must be an object');
  if (typeof value.trainingRunId !== 'string' || typeof value.researchArtifactId !== 'string' ||
      typeof value.datasetVersion !== 'string' || !/^[a-f0-9]{64}$/.test(value.datasetVersion)) {
    throw new Error('CoreSpirit training run, research artifact and dataset identity are required');
  }
  if (!Number.isSafeInteger(value.randomSeed) || Number(value.randomSeed) < 0) throw new Error('randomSeed must be a non-negative safe integer');

  assertNoKnownLabelLeakage(featureNames as string[]);
  const normalizedRows = validateConfirmedResearchRows(rows as TrainingRow[], featureNames as string[], { maxRows: MAX_HMM_TRAINING_ROWS })
    .map((row, index) => {
      if (row.timestamp < from || row.timestamp > to) {
        throw new Error('Invalid feature row at index ' + index + ': decision timestamp falls outside the immutable dataset range');
      }
      return row;
    });
  const datasetSource = value.datasetSource;
  const datasetSourceVerified = value.datasetSourceVerified;
  const datasetSourceAttestationHash = value.datasetSourceAttestationHash;
  if (!['user_supplied','broker_history','trusted_feature_pipeline'].includes(String(datasetSource)) ||
      typeof datasetSourceVerified !== 'boolean') {
    throw new Error('CoreSpirit training dataset must record source provenance separately from its content hash');
  }
  if (datasetSourceVerified) {
    if (datasetSource === 'user_supplied' || typeof datasetSourceAttestationHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(datasetSourceAttestationHash)) {
      throw new Error('Verified CoreSpirit dataset source requires a trusted source and an attestation hash');
    }
  } else if (datasetSourceAttestationHash !== null) {
    throw new Error('Unverified CoreSpirit dataset must not carry a trusted attestation hash');
  }
  const validationFraction = trainingParameters.validationFraction ?? 0.2;
  if (typeof validationFraction !== 'number' || !Number.isFinite(validationFraction) ||
      validationFraction < 0.1 || validationFraction > 0.4) {
    throw new Error('validationFraction must be between 0.10 and 0.40');
  }
  return {
    trainingRunId: value.trainingRunId,
    researchArtifactId: value.researchArtifactId,
    datasetVersion: value.datasetVersion,
    datasetSource: datasetSource as TrainingPayload['datasetSource'],
    datasetSourceVerified,
    datasetSourceAttestationHash: datasetSourceAttestationHash as string | null,
    rows: normalizedRows,
    featureNames: [...featureNames] as string[],
    trainingRange: { from: trainingRange.from, to: trainingRange.to },
    trainingParameters: trainingParameters as TrainingPayload['trainingParameters'],
    randomSeed: Number(value.randomSeed),
  };
}

export async function runCoreSpiritModelTraining(ownerUserId: string, rawPayload: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(rawPayload)) throw new Error('CoreSpirit training payload must be an object');
  const researchArtifactId = String(rawPayload.researchArtifactId ?? '');
  const datasetSnapshotId = String(rawPayload.datasetSnapshotId ?? '');
  const repository = new CoreSpiritArtifactRepository(ownerUserId, researchArtifactId);
  if (!researchArtifactId || !datasetSnapshotId) throw new Error('Research artifact and immutable dataset snapshot IDs are required');
  const snapshot = await repository.getDatasetSnapshot(datasetSnapshotId);
  if (!snapshot) throw new Error('Immutable dataset snapshot not found for this owner');
  if (String(rawPayload.datasetVersion ?? '') !== snapshot.datasetVersion) {
    throw new Error('Queued dataset version does not match the immutable snapshot');
  }
  if (snapshot.storageMode === 'chunked-v1') {
    return runChunkedCoreSpiritModelTraining(ownerUserId, rawPayload, snapshot, repository);
  }
  const payload = parsePayload({
    ...rawPayload,
    rows: snapshot.rows,
    featureNames: snapshot.featureNames,
    trainingRange: snapshot.trainingRange,
    datasetSource: snapshot.sourceProvenance,
    datasetSourceVerified: snapshot.sourceVerified,
    datasetSourceAttestationHash: snapshot.sourceAttestationHash,
  });
  await repository.updateTrainingRun(payload.trainingRunId, { status: 'running', progress: 5 });

  try {
    const research = await repository.getResearchArtifact(payload.researchArtifactId);
    if (!research) throw new Error('Research artifact not found for this owner');
    if (research.kind !== 'corespirit-research') throw new Error('Unsupported CoreSpirit research artifact kind');
    if (await coreSpiritSha256(research.source) !== research.sourceHash ||
        await coreSpiritSha256(research.featureGraph) !== research.featureGraphHash) {
      throw new Error('Research artifact source or feature-graph integrity check failed');
    }

    const featureGraph = research.featureGraph as { featureNames?: unknown; modelType?: unknown; states?: unknown; covariance?: unknown; researchSafety?: ResearchSafetySummary };
    if (!Array.isArray(featureGraph?.featureNames) ||
        featureGraph.featureNames.length !== payload.featureNames.length ||
        featureGraph.featureNames.some((name, index) => name !== payload.featureNames[index])) {
      throw new Error('Training feature schema does not match the compiled research artifact');
    }
    if (featureGraph.modelType !== 'HMM<float>' && featureGraph.modelType !== 'HMM') {
      throw new Error('The built-in background trainer currently supports Gaussian HMM artifacts; other model families need a registered training backend');
    }
    if (!featureGraph.researchSafety || featureGraph.researchSafety.version !== 1) {
      throw new Error('Research artifact has no causal/lookahead safety manifest; recompile it with the current CoreSpirit research compiler.');
    }
    const expectedDatasetVersion = await coreSpiritSha256({
      featureNames: payload.featureNames,
      rows: payload.rows,
      trainingRange: payload.trainingRange,
    });
    if (expectedDatasetVersion !== payload.datasetVersion) throw new Error('Dataset snapshot hash mismatch; refusing to train on changed data');

    const states = Number(featureGraph.states ?? 3);
    const rawPurgeBars = payload.trainingParameters.purgeBars ?? payload.trainingParameters.forecastHorizonBars ?? payload.trainingParameters.horizon ?? 1;
    const purgeBars = Number(rawPurgeBars);
    if (!Number.isInteger(purgeBars) || purgeBars < 0 || purgeBars > 500) {
      throw new Error('purgeBars must be an integer from 0 to 500.');
    }
    const split = splitChronologicalResearchRows(
      payload.rows,
      Number(payload.trainingParameters.validationFraction ?? 0.2),
      Math.max(12, states * 4),
      12,
      { maxRows: MAX_HMM_TRAINING_ROWS, purgeBars },
    );
    const trainingRows = split.trainingRows;
    const validationRows = split.validationRows;
    const covariance = featureGraph.covariance === 'diagonal' ? 'diagonal' : 'full';
    const fitIterations = Number(payload.trainingParameters.fitIterations ?? 3);
    const fitEvery = Number(payload.trainingParameters.fitEvery ?? 64);
    if (!Number.isInteger(fitIterations) || fitIterations < 1 || fitIterations > 6) {
      throw new Error('fitIterations must be between 1 and 6');
    }
    if (!Number.isInteger(fitEvery) || fitEvery < 1 || fitEvery > 64) {
      throw new Error('fitEvery must be between 1 and 64');
    }

    await repository.updateTrainingRun(payload.trainingRunId, { status: 'running', progress: 15 });
    const hmm = new CoreSpiritGaussianHMM({
      states,
      covariance,
      maxObservations: trainingRows.length,
      fitEvery,
      fitIterations,
    });
    const decoded = new Set<number>();
    for (let index = 0; index < trainingRows.length; index += 1) {
      const row = trainingRows[index]!;
      const state = hmm.observe(row.values, row.timestamp, payload.featureNames);
      if (state !== null) decoded.add(state);
      if (index % 64 === 0) {
        await repository.updateTrainingRun(payload.trainingRunId, {
          status: 'running',
          progress: Math.min(85, 15 + Math.floor((index / trainingRows.length) * 70)),
        });
      }
    }

    const hmmState: CoreSpiritGaussianHMMState = hmm.exportTrainedState();
    const finalPosterior = hmm.posterior();
    const confidence = hmm.probabilityLatest() ?? 0;

    // Holdout evaluation uses the frozen fitted state and chronological validation
    // rows only. predict() never calls fitBounded() and cannot update learned weights.
    const validationModel = CoreSpiritGaussianHMM.fromTrainedState(hmmState);
    const trainingEndTimestamp = trainingRows[trainingRows.length - 1]!.timestamp;
    validationModel.setInferenceBoundaryExclusive(trainingEndTimestamp);
    const validationStates = new Set<number>();
    const validationConfidences: number[] = [];
    for (const row of validationRows) {
      const prediction = validationModel.predict(row.values, payload.featureNames, row.timestamp);
      validationStates.add(prediction.state);
      validationConfidences.push(prediction.confidence);
    }
    if (validationConfidences.length !== validationRows.length ||
        !validationConfidences.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Chronological holdout validation emitted invalid predictions.');
    }
    const meanValidationConfidence = validationConfidences.reduce((sum, value) => sum + value, 0) / validationConfidences.length;
    const minValidationConfidence = Math.min(...validationConfidences);
    const maxValidationConfidence = Math.max(...validationConfidences);
    const safety = featureGraph.researchSafety;
    const validationResults = {
      protocol: split.validationProtocol,
      trainingSampleCount: trainingRows.length,
      sampleCount: validationRows.length,
      distinctPredictedStates: validationStates.size,
      meanConfidence: meanValidationConfidence,
      minConfidence: minValidationConfidence,
      maxConfidence: maxValidationConfidence,
      forwardOnly: true,
      noTimestampOverlap: trainingEndTimestamp < validationRows[0]!.timestamp,
      featureSchemaMatched: true,
      labelLeakageCheckPassed: true,
      featureAvailabilityCheckPassed: payload.rows.every(row => row.confirmed === true && row.availableAt <= row.timestamp),
      datasetHashVerified: true,
      sourceCausalityPassed: safety.blockers.length === 0,
      lookaheadCheckPassed: safety.lookahead === 'false' && safety.causality === 'causal' && safety.blockers.length === 0,
    };
    const metrics = {
      observations: trainingRows.length,
      validationSamples: validationRows.length,
      featureCount: payload.featureNames.length,
      stateCount: states,
      distinctDecodedStates: decoded.size,
      finalConfidence: confidence,
      validationDistinctStates: validationStates.size,
      validationMeanConfidence: meanValidationConfidence,
      validationMinConfidence: minValidationConfidence,
      validationMaxConfidence: maxValidationConfidence,
    };
    const provenance: ModelProvenance = {
      sourceHash: research.sourceHash,
      compilerVersion: research.compilerVersion,
      runtimeVersion: CORE_SPIRIT_RUNTIME_VERSION,
      irVersion: research.irVersion,
      featureGraphHash: research.featureGraphHash,
      datasetVersion: payload.datasetVersion,
      datasetSource: payload.datasetSource,
      datasetSourceVerified: payload.datasetSourceVerified,
      datasetSourceAttestationHash: payload.datasetSourceAttestationHash,
      trainingRange: split.trainingRange,
      validationRange: split.validationRange,
      validationResults,
      researchSafety: safety,
      trainingParameters: {
        ...payload.trainingParameters,
        validationFraction: split.validationFraction,
        validationProtocol: split.validationProtocol,
        purgeBars: split.purgedCount,
        purgedDatasetRows: split.purgedCount,
        states,
        covariance,
        fitIterations,
        fitEvery,
        maxObservations: trainingRows.length,
        initializer: 'deterministic-quantile-v1',
        seedPolicy: 'recorded-for-lineage; built-in HMM initializer is deterministic',
      },
      randomSeed: payload.randomSeed,
      modelImplementation: 'corespirit-gaussian-hmm-v1',
      backend: 'cpu',
      dependencyVersions: {
        corespiritCompiler: research.compilerVersion,
        corespiritRuntime: CORE_SPIRIT_RUNTIME_VERSION,
        corespiritIr: research.irVersion,
        node: process.version,
      },
    };
    const artifact = await sealModelArtifact({
      research,
      provenance,
      weights: {
        modelType: 'gaussian-hmm',
        modelAlias: String(featureGraph.modelName ?? research.name),
        featureNames: payload.featureNames,
        hmm: hmmState,
      },
      metrics,
    });
    await repository.put(artifact);
    const artifactId = await repository.getModelArtifactIdByHash(artifact.hash);
    await repository.updateTrainingRun(payload.trainingRunId, {
      status: 'succeeded',
      progress: 100,
      modelArtifactId: artifactId ?? undefined,
      metrics,
      error: null,
    });
    return {
      trainingRunId: payload.trainingRunId,
      modelName: artifact.name,
      modelHash: artifact.hash,
      observations: trainingRows.length,
      validationSamples: validationRows.length,
      validationRange: split.validationRange,
      metrics,
      posterior: finalPosterior ? Array.from(finalPosterior.data) : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CoreSpirit training failed';
    await repository.updateTrainingRun(payload.trainingRunId, {
      status: 'failed',
      progress: 100,
      error: message,
    }).catch(() => undefined);
    throw error;
  }
}
