import { coreSpiritDatasetVersion, coreSpiritSha256, sealModelArtifact, type ModelProvenance } from '../../services/coreSpirit/modelArtifacts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';

type TrainingRow = Readonly<{ timestamp: number; values: readonly number[] }>;
type TrainingPayload = Readonly<{
  trainingRunId: string;
  researchArtifactId: string;
  datasetVersion: string;
  rows: readonly TrainingRow[];
  featureNames: readonly string[];
  trainingRange: Readonly<{ from: string; to: string }>;
  trainingParameters: Readonly<Record<string, string | number | boolean | null>>;
  randomSeed: number;
  modelArtifactName?: string;
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
  if (!Array.isArray(rows) || rows.length < 12 || rows.length > 1024) {
    throw new Error('CoreSpirit HMM training requires 12–1024 historical rows');
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

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const normalizedRows = rows.map((item, index) => {
    if (!isRecord(item) || typeof item.timestamp !== 'number' || !Number.isFinite(item.timestamp) ||
        item.timestamp < from || item.timestamp > to || !Array.isArray(item.values) ||
        item.values.length !== featureNames.length ||
        item.values.some(number => typeof number !== 'number' || !Number.isFinite(number))) {
      throw new Error('Invalid feature row at index ' + index + ': timestamps must be in range and values must match the feature schema');
    }
    if (item.timestamp <= previousTimestamp) throw new Error('Training rows must be strictly chronological with no duplicate timestamps');
    previousTimestamp = item.timestamp;
    return { timestamp: item.timestamp, values: [...item.values] as number[] };
  });
  return {
    trainingRunId: value.trainingRunId,
    researchArtifactId: value.researchArtifactId,
    datasetVersion: value.datasetVersion,
    rows: normalizedRows,
    featureNames: [...featureNames] as string[],
    trainingRange: { from: trainingRange.from, to: trainingRange.to },
    trainingParameters: trainingParameters as TrainingPayload['trainingParameters'],
    randomSeed: Number(value.randomSeed),
    ...(typeof value.modelArtifactName === 'string' && value.modelArtifactName.trim()
      ? { modelArtifactName: value.modelArtifactName.trim() } : {}),
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
  const payload = parsePayload({
    ...rawPayload,
    rows: snapshot.rows,
    featureNames: snapshot.featureNames,
    trainingRange: snapshot.trainingRange,
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

    const featureGraph = research.featureGraph as { featureNames?: unknown; modelType?: unknown; states?: unknown; covariance?: unknown; stateLabels?: unknown; lifecyclePlan?: { saveAs?: unknown } };
    if (!Array.isArray(featureGraph?.featureNames) ||
        featureGraph.featureNames.length !== payload.featureNames.length ||
        featureGraph.featureNames.some((name, index) => name !== payload.featureNames[index])) {
      throw new Error('Training feature schema does not match the compiled research artifact');
    }
    if (featureGraph.modelType !== 'HMM<float>' && featureGraph.modelType !== 'HMM') {
      throw new Error('The built-in background trainer currently supports Gaussian HMM artifacts; other model families need a registered training backend');
    }
    const datasetName = String(payload.trainingParameters.datasetName ?? 'uploaded-feature-snapshot');
    const datasetSource = String(payload.trainingParameters.datasetSource ?? 'precomputed-features');
    if (!datasetName.trim() || datasetName.length > 120 ||
        !['fyers-history', 'provided-ohlcv', 'precomputed-features'].includes(datasetSource)) {
      throw new Error('Dataset provenance is missing or invalid; refusing to train on an unidentified snapshot');
    }
    const expectedDatasetVersion = await coreSpiritDatasetVersion({
      datasetName,
      datasetSource: datasetSource as 'fyers-history' | 'provided-ohlcv' | 'precomputed-features',
      featureNames: payload.featureNames,
      rows: payload.rows,
      trainingRange: payload.trainingRange,
    });
    if (expectedDatasetVersion !== payload.datasetVersion) throw new Error('Dataset snapshot hash mismatch; refusing to train on changed data');

    const states = Number(featureGraph.states ?? 3);
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
      maxObservations: payload.rows.length,
      fitEvery,
      fitIterations,
    });
    if (featureGraph.stateLabels !== undefined) {
      if (!Array.isArray(featureGraph.stateLabels)) throw new Error('Research artifact stateLabels must be an array');
      hmm.setStateLabels(featureGraph.stateLabels as string[]);
    }
    const decoded = new Set<number>();
    for (let index = 0; index < payload.rows.length; index += 1) {
      const row = payload.rows[index]!;
      const state = hmm.observe(row.values, row.timestamp, payload.featureNames);
      if (state !== null) decoded.add(state);
      if (index % 64 === 0) {
        await repository.updateTrainingRun(payload.trainingRunId, {
          status: 'running',
          progress: Math.min(85, 15 + Math.floor((index / payload.rows.length) * 70)),
        });
      }
    }

    const hmmState: CoreSpiritGaussianHMMState = hmm.exportTrainedState();
    const finalPosterior = hmm.posterior();
    const confidence = hmm.probabilityLatest() ?? 0;
    const metrics = {
      observations: payload.rows.length,
      featureCount: payload.featureNames.length,
      stateCount: states,
      distinctDecodedStates: decoded.size,
      finalConfidence: confidence,
    };
    const provenance: ModelProvenance = {
      sourceHash: research.sourceHash,
      compilerVersion: research.compilerVersion,
      irVersion: research.irVersion,
      featureGraphHash: research.featureGraphHash,
      datasetVersion: payload.datasetVersion,
      trainingRange: payload.trainingRange,
      trainingParameters: {
        ...payload.trainingParameters,
        states,
        covariance,
        fitIterations,
        fitEvery,
        maxObservations: payload.rows.length,
        initializer: 'deterministic-quantile-v1',
        seedPolicy: 'recorded-for-lineage; built-in HMM initializer is deterministic',
        artifactName: payload.modelArtifactName ?? String(featureGraph.lifecyclePlan?.saveAs ?? research.name),
      },
      randomSeed: payload.randomSeed,
      modelImplementation: 'corespirit-gaussian-hmm-v1',
      backend: 'cpu',
      dependencyVersions: {
        corespiritCompiler: research.compilerVersion,
        corespiritIr: research.irVersion,
        node: process.version,
      },
    };
    const artifact = await sealModelArtifact({
      research,
      name: payload.modelArtifactName ?? String(featureGraph.lifecyclePlan?.saveAs ?? research.name),
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
      observations: payload.rows.length,
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
