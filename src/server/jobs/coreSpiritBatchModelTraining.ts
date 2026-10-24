import { coreSpiritSha256, sealModelArtifact, type ModelProvenance, type TrainingRange } from '../../services/coreSpirit/modelArtifacts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import type { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';
import {
  CoreSpiritDatasetBatchRepository,
  coreSpiritDatasetManifestHash,
  type CoreSpiritDatasetManifest,
} from '../storage/CoreSpiritDatasetBatchRepository.js';
import { createCoreSpiritResearchBudget, getCoreSpiritResearchLimits } from '../coreSpiritResearchLimits.js';
import { CORE_SPIRIT_RUNTIME_VERSION } from '../../services/coreSpirit/VERSION.js';
import {
  assertNoKnownLabelLeakage,
  validateConfirmedResearchRows,
  type ResearchFeatureRow,
  type ResearchSafetySummary,
} from '../../services/coreSpirit/researchValidation.js';

type ChunkedSnapshot = Readonly<{
  id: string;
  datasetVersion: string;
  featureNames: string[];
  trainingRange: TrainingRange;
  sourceProvenance: 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
  sourceVerified: boolean;
  sourceAttestationHash: string | null;
  storageMode: 'chunked-v1';
  batchSessionId: string | null;
  datasetManifest: Record<string, unknown> | null;
  rows: ResearchFeatureRow[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseScalarParameters(value: unknown): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) throw new Error('CoreSpirit batch training parameters must be an object.');
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ||
        !(item === null || typeof item === 'string' || typeof item === 'boolean' ||
          typeof item === 'number' && Number.isFinite(item))) {
      throw new Error('Training parameters must be simple finite JSON scalar values.');
    }
    result[key] = item;
  }
  return result;
}

function parseManifest(value: Record<string, unknown>, snapshot: ChunkedSnapshot): CoreSpiritDatasetManifest {
  const manifest = value as unknown as CoreSpiritDatasetManifest;
  if (manifest.formatVersion !== 1 || manifest.datasetRevision !== 1 ||
      manifest.storageFormat !== 'json-chunks-v1' ||
      manifest.datasetVersion !== snapshot.datasetVersion ||
      typeof manifest.researchArtifactId !== 'string' || manifest.researchArtifactId.length === 0 ||
      !Number.isSafeInteger(manifest.rowCount) || manifest.rowCount < 24 ||
      manifest.rowCount > getCoreSpiritResearchLimits('batch').maxRows ||
      !Number.isSafeInteger(manifest.chunkSize) || manifest.chunkSize < 100 ||
      manifest.chunkSize > getCoreSpiritResearchLimits('batch').maxChunkRows ||
      !Number.isSafeInteger(manifest.chunkCount) || !Array.isArray(manifest.chunks) ||
      manifest.chunks.length !== manifest.chunkCount ||
      manifest.rowCount !== manifest.chunks.reduce((total, chunk) => total + Number(chunk?.rowCount ?? 0), 0) ||
      !manifest.featureSchema || manifest.featureSchema.version !== '1' ||
      !Array.isArray(manifest.featureSchema.orderedNames) ||
      !Array.isArray(manifest.featureSchema.types) ||
      manifest.featureSchema.orderedNames.length !== snapshot.featureNames.length ||
      manifest.featureSchema.orderedNames.some((name, index) => name !== snapshot.featureNames[index]) ||
      manifest.featureSchema.types.length !== snapshot.featureNames.length ||
      manifest.featureSchema.types.some(type => type !== 'number') ||
      !/^[a-f0-9]{64}$/.test(manifest.featureSchema.hash) ||
      !manifest.trainingRange || manifest.trainingRange.from !== snapshot.trainingRange.from ||
      manifest.trainingRange.to !== snapshot.trainingRange.to ||
      manifest.source !== 'user_supplied' || manifest.sourceVerified !== false ||
      manifest.sourceAttestationHash !== null) {
    throw new Error('Chunked dataset manifest has an unsupported schema, source trust state, or row/chunk shape.');
  }
  const firstChunk = manifest.chunks[0];
  const lastChunk = manifest.chunks[manifest.chunks.length - 1];
  if (!firstChunk || !lastChunk || !manifest.observedTimeRange ||
      manifest.observedTimeRange.from !== new Date(firstChunk.firstTimestamp).toISOString() ||
      manifest.observedTimeRange.to !== new Date(lastChunk.lastTimestamp).toISOString()) {
    throw new Error('Dataset manifest observed time range does not match its immutable chunk descriptors.');
  }
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const chunk = manifest.chunks[index]!;
    const expectedRows = index === manifest.chunkCount - 1
      ? manifest.rowCount - index * manifest.chunkSize : manifest.chunkSize;
    if (chunk.index !== index || chunk.rowCount !== expectedRows ||
        !/^[a-f0-9]{64}$/.test(chunk.hash) ||
        !Number.isSafeInteger(chunk.firstTimestamp) || !Number.isSafeInteger(chunk.lastTimestamp) ||
        chunk.lastTimestamp < chunk.firstTimestamp) {
      throw new Error('Chunked dataset manifest contains an invalid chunk descriptor.');
    }
  }
  return manifest;
}

function makeBudget() {
  return createCoreSpiritResearchBudget('batch');
}

async function* iterateVerifiedRows(
  batches: CoreSpiritDatasetBatchRepository,
  sessionId: string,
  manifest: CoreSpiritDatasetManifest,
  featureNames: readonly string[],
  budget: ReturnType<typeof makeBudget>,
): AsyncGenerator<{ index: number; row: ResearchFeatureRow }> {
  let index = 0;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  let nextChunk = 0;
  const from = Date.parse(manifest.trainingRange.from);
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(manifest.trainingRange.to);
  const to = Date.parse(manifest.trainingRange.to) + (dateOnlyTo ? 86_399_999 : 0);
  for await (const chunk of batches.iterateChunks(sessionId)) {
    budget.assertWithinBudget('dataset streaming');
    const descriptor = manifest.chunks[nextChunk];
    if (!descriptor || chunk.chunkIndex !== nextChunk ||
        chunk.rowCount !== descriptor.rowCount || chunk.chunkHash !== descriptor.hash ||
        chunk.firstTimestamp !== descriptor.firstTimestamp || chunk.lastTimestamp !== descriptor.lastTimestamp ||
        chunk.rows.length !== descriptor.rowCount) {
      throw new Error('Stored dataset chunk does not match its sealed manifest descriptor.');
    }
    const rows = validateConfirmedResearchRows(chunk.rows, featureNames, { maxRows: manifest.chunkSize });
    const actualHash = await coreSpiritSha256({
      protocol: 'corespirit-dataset-chunk-v1',
      chunkIndex: chunk.chunkIndex,
      rows,
    });
    if (actualHash !== descriptor.hash || rows[0]!.timestamp !== descriptor.firstTimestamp ||
        rows[rows.length - 1]!.timestamp !== descriptor.lastTimestamp) {
      throw new Error('Dataset chunk content hash or time bounds do not match its immutable manifest.');
    }
    for (const row of rows) {
      if (index % 256 === 0) budget.assertWithinBudget('row validation');
      if (!Number.isSafeInteger(row.timestamp) || !Number.isSafeInteger(row.availableAt) ||
          row.timestamp <= previousTimestamp || row.timestamp < from || row.timestamp > to ||
          row.availableAt > row.timestamp || row.confirmed !== true ||
          (row.phase !== 'historical' && row.phase !== 'confirmed')) {
        throw new Error('Batch dataset contains a non-chronological, unavailable, or unconfirmed observation.');
      }
      previousTimestamp = row.timestamp;
      yield { index, row };
      index += 1;
    }
    nextChunk += 1;
  }
  if (index !== manifest.rowCount || nextChunk !== manifest.chunkCount) {
    throw new Error('Streamed dataset ended before its manifest row/chunk count.');
  }
}

/** Trains only from sealed chunks. The worker never materializes the entire dataset. */
export async function runChunkedCoreSpiritModelTraining(
  ownerUserId: string,
  rawPayload: unknown,
  snapshot: ChunkedSnapshot,
  repository: CoreSpiritArtifactRepository,
): Promise<Record<string, unknown>> {
  if (!isRecord(rawPayload)) throw new Error('CoreSpirit batch training payload must be an object.');
  const trainingRunId = String(rawPayload.trainingRunId ?? '');
  const researchArtifactId = String(rawPayload.researchArtifactId ?? '');
  if (!trainingRunId || !researchArtifactId || !snapshot.batchSessionId || !snapshot.datasetManifest) {
    throw new Error('Batch training requires a sealed dataset session, run ID and research artifact ID.');
  }
  if (String(rawPayload.datasetVersion ?? '') !== snapshot.datasetVersion) {
    throw new Error('Queued dataset version does not match the immutable batch snapshot.');
  }
  if (snapshot.storageMode !== 'chunked-v1') throw new Error('Chunked trainer received a non-chunked snapshot.');
  const featureNames = snapshot.featureNames;
  assertNoKnownLabelLeakage(featureNames);
  const trainingParameters = parseScalarParameters(rawPayload.trainingParameters);
  if (!Number.isSafeInteger(rawPayload.randomSeed) || Number(rawPayload.randomSeed) < 0) {
    throw new Error('randomSeed must be a non-negative safe integer.');
  }
  const validationFraction = trainingParameters.validationFraction ?? 0.2;
  if (typeof validationFraction !== 'number' || validationFraction < 0.1 || validationFraction > 0.4) {
    throw new Error('validationFraction must be between 0.10 and 0.40.');
  }
  const rawPurge = trainingParameters.purgeBars ?? trainingParameters.forecastHorizonBars ?? trainingParameters.horizon ?? 1;
  const forecastHorizonBars = Number(trainingParameters.forecastHorizonBars ?? trainingParameters.targetHorizonBars ?? trainingParameters.horizon ?? 1);
  const purgeBars = rawPurge;
  const rawEmbargo = trainingParameters.embargoBars ?? 0;
  const embargoBars = rawEmbargo;
  if (!Number.isSafeInteger(forecastHorizonBars) || forecastHorizonBars < 1 || forecastHorizonBars > 500 || Number(purgeBars) < forecastHorizonBars) {
    throw new Error('Purged bars must cover the configured forecast horizon (1–500 bars).');
  }
  if (typeof purgeBars !== 'number' || !Number.isInteger(purgeBars) || purgeBars < 0 || purgeBars > 500) {
    throw new Error('purgeBars must be an integer from 0 to 500.');
  }
  if (typeof embargoBars !== 'number' || !Number.isInteger(embargoBars) || embargoBars < 0 || embargoBars > 500) {
    throw new Error('embargoBars must be an integer from 0 to 500.');
  }
  const limits = getCoreSpiritResearchLimits('batch');
  const rawWindow = trainingParameters.trainingWindowRows ?? limits.maxTrainingWindowRows;
  const requestedTrainingWindowRows = rawWindow;
  if (typeof requestedTrainingWindowRows !== 'number' || !Number.isInteger(requestedTrainingWindowRows) ||
      requestedTrainingWindowRows < 48 || requestedTrainingWindowRows > limits.maxTrainingWindowRows) {
    throw new Error('trainingWindowRows must be an integer from 48 to ' + limits.maxTrainingWindowRows + ' for the batch worker class.');
  }
  const rawFitEvery = trainingParameters.fitEvery ?? 64;
  const requestedFitEvery = rawFitEvery;
  if (typeof requestedFitEvery !== 'number' || !Number.isInteger(requestedFitEvery) ||
      requestedFitEvery < 1 || requestedFitEvery > limits.maxTrainingFitEvery) {
    throw new Error('fitEvery must be an integer from 1 to ' + limits.maxTrainingFitEvery + ' for the batch worker class.');
  }

  const budget = makeBudget();
  const batches = new CoreSpiritDatasetBatchRepository(ownerUserId);
  try {
    const manifest = parseManifest(snapshot.datasetManifest, snapshot);
    if (manifest.researchArtifactId !== researchArtifactId) throw new Error('Dataset manifest is bound to a different research artifact.');
    const manifestHash = await coreSpiritDatasetManifestHash({
      researchArtifactId: manifest.researchArtifactId,
      rowCount: manifest.rowCount,
      featureSchema: manifest.featureSchema,
      trainingRange: manifest.trainingRange,
      chunkSize: manifest.chunkSize,
      chunks: manifest.chunks,
    });
    if (manifestHash !== snapshot.datasetVersion) throw new Error('Dataset manifest hash mismatch; refusing to train on changed data.');
    const recomputedFeatureSchemaHash = await coreSpiritSha256({
      version: '1',
      orderedNames: featureNames,
      types: featureNames.map(() => 'number'),
    });
    if (recomputedFeatureSchemaHash !== manifest.featureSchema.hash) {
      throw new Error('Dataset feature-schema hash mismatch.');
    }

    const research = await repository.getResearchArtifact(researchArtifactId);
    if (!research || research.kind !== 'corespirit-research') throw new Error('Research artifact not found for this owner.');
    if (await coreSpiritSha256(research.source) !== research.sourceHash ||
        await coreSpiritSha256(research.featureGraph) !== research.featureGraphHash) {
      throw new Error('Research artifact source or feature-graph integrity check failed.');
    }
    const featureGraph = research.featureGraph as {
      featureNames?: unknown; modelType?: unknown; states?: unknown; covariance?: unknown;
      researchSafety?: ResearchSafetySummary; modelName?: unknown;
    };
    if (!Array.isArray(featureGraph.featureNames) ||
        featureGraph.featureNames.length !== featureNames.length ||
        featureGraph.featureNames.some((name, index) => name !== featureNames[index])) {
      throw new Error('Training feature schema does not match the compiled research artifact.');
    }
    if (featureGraph.modelType !== 'HMM<float>' && featureGraph.modelType !== 'HMM') {
      throw new Error('The configured background trainer supports Gaussian HMM artifacts only.');
    }
    if (!featureGraph.researchSafety || featureGraph.researchSafety.version !== 1) {
      throw new Error('Research artifact has no causal/lookahead safety manifest.');
    }
    if (featureGraph.researchSafety.blockers.length > 0) {
      throw new Error('Research artifact failed causal/lookahead safety validation.');
    }

    const rowCount = manifest.rowCount;
    const boundaryGap = purgeBars + embargoBars;
    if (boundaryGap >= rowCount) throw new Error('Purge and embargo gaps must sum to less than the dataset row count.');
    const evaluableRows = rowCount - boundaryGap;
    const validationCount = Math.floor(evaluableRows * validationFraction);
    const trainingCount = evaluableRows - validationCount;
    const validationStart = trainingCount + boundaryGap;
    const trainingWindowRows = Math.min(trainingCount, requestedTrainingWindowRows);
    // Expensive EM passes run over a bounded window; scale refit cadence with
    // dataset size so the worker does not repeatedly fit almost-identical windows.
    const fitEvery = Math.max(requestedFitEvery, Math.min(limits.maxTrainingFitEvery, Math.ceil(trainingCount / 32)));
    const states = Number(featureGraph.states ?? 3);
    if (!Number.isInteger(states) || states < 2 || states > 12 ||
        trainingCount < Math.max(12, states * 4) || validationCount < 12 ||
        validationStart >= rowCount) {
      throw new Error('Batch dataset is too small for the requested purged chronological holdout.');
    }

    await repository.updateTrainingRun(trainingRunId, { status: 'running', progress: 5 });
    let rowIndex = 0;
    let trainingStartTimestamp: number | null = null;
    let trainingEndTimestamp: number | null = null;
    let validationStartTimestamp: number | null = null;
    let validationEndTimestamp: number | null = null;
    for await (const item of iterateVerifiedRows(batches, snapshot.batchSessionId, manifest, featureNames, budget)) {
      if (item.index === 0) trainingStartTimestamp = item.row.timestamp;
      if (item.index === trainingCount - 1) trainingEndTimestamp = item.row.timestamp;
      if (item.index === validationStart) validationStartTimestamp = item.row.timestamp;
      if (item.index === rowCount - 1) validationEndTimestamp = item.row.timestamp;
      rowIndex += 1;
      if (rowIndex % 10_000 === 0) {
        await repository.updateTrainingRun(trainingRunId, {
          status: 'running',
          progress: Math.min(20, 5 + Math.floor((rowIndex / rowCount) * 15)),
        });
      }
    }
    if (rowIndex !== rowCount || trainingStartTimestamp === null || trainingEndTimestamp === null ||
        validationStartTimestamp === null || validationEndTimestamp === null ||
        trainingEndTimestamp >= validationStartTimestamp) {
      throw new Error('Dataset did not produce strictly separated training and validation ranges.');
    }
    const trainingRange = {
      from: new Date(trainingStartTimestamp).toISOString(),
      to: new Date(trainingEndTimestamp).toISOString(),
    };
    const validationRange = {
      from: new Date(validationStartTimestamp).toISOString(),
      to: new Date(validationEndTimestamp).toISOString(),
    };

    const covariance = featureGraph.covariance === 'diagonal' ? 'diagonal' : 'full';
    const fitIterations = Number(trainingParameters.fitIterations ?? 3);
    if (!Number.isInteger(fitIterations) || fitIterations < 1 || fitIterations > 6) throw new Error('fitIterations must be between 1 and 6.');

    const minimumFitRows = Math.max(12, states * 4);
    const hmm = new CoreSpiritGaussianHMM({
      states, covariance, maxObservations: trainingWindowRows, fitEvery, fitIterations,
      checkBudget: () => budget.checkExecutionBudget('model fitting'),
      refreshPosteriorOnObserve: false,
    });
    const decoded = new Set<number>();
    rowIndex = 0;
    for await (const item of iterateVerifiedRows(batches, snapshot.batchSessionId, manifest, featureNames, budget)) {
      if (item.index < trainingCount) {
        const state = hmm.observe(item.row.values, item.row.timestamp, featureNames);
        const observedCount = item.index + 1;
        const isFitCheckpoint = observedCount === minimumFitRows ||
          (observedCount > minimumFitRows && (observedCount - minimumFitRows) % fitEvery === 0);
        if (state !== null && isFitCheckpoint) decoded.add(state);
      }
      rowIndex += 1;
      if (rowIndex % 10_000 === 0) {
        await repository.updateTrainingRun(trainingRunId, {
          status: 'running',
          progress: Math.min(80, 20 + Math.floor((Math.min(rowIndex, trainingCount) / trainingCount) * 60)),
        });
      }
    }
    if (rowIndex !== rowCount) throw new Error('Dataset changed during model fitting.');
    budget.assertWithinBudget('model fitting');
    // Seal parameters fitted on the latest training window, not the last periodic refit.
    hmm.fitFinal();
    budget.assertWithinBudget('final model fit');
    const finalDecoded = hmm.decodeLatest();
    if (finalDecoded !== null) decoded.add(finalDecoded);
    const fittedState = hmm.exportTrainedState();
    // Learned parameters may use a wider research window, but the sealed state
    // persisted for inference retains the live runtime's 1,024-observation cap.
    const hmmState: CoreSpiritGaussianHMMState = Object.freeze({
      ...fittedState,
      maxObservations: Math.min(fittedState.maxObservations, 1_024),
    });
    const finalPosterior = hmm.posterior();
    const confidence = hmm.probabilityLatest() ?? 0;
    const validationModel = CoreSpiritGaussianHMM.fromTrainedState(hmmState);
    validationModel.setInferenceBoundaryExclusive(trainingEndTimestamp);
    const validationStates = new Set<number>();
    let validationConfidenceSum = 0;
    let validationMinConfidence = Number.POSITIVE_INFINITY;
    let validationMaxConfidence = Number.NEGATIVE_INFINITY;
    let validationSamples = 0;
    rowIndex = 0;
    for await (const item of iterateVerifiedRows(batches, snapshot.batchSessionId, manifest, featureNames, budget)) {
      if (item.index >= validationStart) {
        const prediction = validationModel.predict(item.row.values, featureNames, item.row.timestamp);
        if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
          throw new Error('Chronological holdout validation emitted invalid predictions.');
        }
        validationSamples += 1;
        validationStates.add(prediction.state);
        validationConfidenceSum += prediction.confidence;
        validationMinConfidence = Math.min(validationMinConfidence, prediction.confidence);
        validationMaxConfidence = Math.max(validationMaxConfidence, prediction.confidence);
      }
      rowIndex += 1;
      if (rowIndex % 10_000 === 0) {
        await repository.updateTrainingRun(trainingRunId, {
          status: 'running',
          progress: Math.min(95, 80 + Math.floor((Math.max(0, Math.min(rowIndex - validationStart, validationCount)) / validationCount) * 15)),
        });
      }
    }
    if (rowIndex !== rowCount || validationSamples !== validationCount ||
        !Number.isFinite(validationMinConfidence) || !Number.isFinite(validationMaxConfidence)) {
      throw new Error('Chronological validation stream did not match the declared validation slice.');
    }
    const meanValidationConfidence = validationConfidenceSum / validationSamples;
    const safety = featureGraph.researchSafety;
    const validationProtocol = boundaryGap > 0 ? 'purged-chronological-v1' : 'chronological-holdout-v1';
    const validationResults = {
      protocol: validationProtocol,
      trainingSampleCount: trainingCount,
      sampleCount: validationSamples,
      distinctPredictedStates: validationStates.size,
      meanConfidence: meanValidationConfidence,
      minConfidence: validationMinConfidence,
      maxConfidence: validationMaxConfidence,
      forwardOnly: true,
      noTimestampOverlap: trainingEndTimestamp < validationStartTimestamp,
      featureSchemaMatched: true,
      labelLeakageCheckPassed: true,
      featureAvailabilityCheckPassed: true,
      datasetHashVerified: true,
      sourceCausalityPassed: safety.blockers.length === 0,
      lookaheadCheckPassed: safety.lookahead === 'false' && safety.causality === 'causal' && safety.blockers.length === 0,
    };
    const metrics = {
      observations: trainingCount,
      validationSamples,
      featureCount: featureNames.length,
      stateCount: states,
      distinctDecodedStates: decoded.size,
      finalConfidence: confidence,
      validationDistinctStates: validationStates.size,
      validationMeanConfidence: meanValidationConfidence,
      validationMinConfidence: validationMinConfidence,
      validationMaxConfidence: validationMaxConfidence,
    };
    const provenance: ModelProvenance = {
      sourceHash: research.sourceHash,
      compilerVersion: research.compilerVersion,
      runtimeVersion: CORE_SPIRIT_RUNTIME_VERSION,
      irVersion: research.irVersion,
      featureGraphHash: research.featureGraphHash,
      datasetVersion: snapshot.datasetVersion,
      datasetSource: snapshot.sourceProvenance,
      datasetSourceVerified: snapshot.sourceVerified,
      datasetSourceAttestationHash: snapshot.sourceAttestationHash,
      trainingRange,
      validationRange,
      validationResults,
      researchSafety: safety,
      trainingParameters: {
        ...trainingParameters,
        researchArtifactId,
        datasetSnapshotId: String(rawPayload.datasetSnapshotId ?? ''),
        forecastHorizonBars,
        validationFraction: validationCount / evaluableRows,
        validationProtocol,
        purgeBars,
        purgedDatasetRows: purgeBars,
        embargoBars,
        embargoedDatasetRows: embargoBars,
        states,
        covariance,
        fitIterations,
        requestedFitEvery,
        fitEvery,
        requestedTrainingWindowRows,
        trainingWindowRows,
        maxObservations: hmm.maxObservations,
        inferenceRuntimeMaxObservations: 1_024,
        trainingRowsProcessed: trainingCount,
        fitWindowPolicy: 'sliding-recent-window-bounded-v2',
        initializer: 'deterministic-quantile-v1',
        seedPolicy: 'recorded-for-lineage; built-in HMM initializer is deterministic',
        datasetStorageFormat: 'json-chunks-v1',
        datasetRevision: manifest.datasetRevision,
        datasetChunkCount: manifest.chunkCount,
        datasetRowCount: manifest.rowCount,
        datasetFeatureSchemaHash: manifest.featureSchema.hash,
        workerResourceClass: 'batch',
        workerMaxMemoryBytes: budget.limits.maxMemoryBytes,
        workerMaxExecutionMs: budget.limits.maxExecutionMs,
      },
      randomSeed: Number(rawPayload.randomSeed),
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
        featureNames,
        hmm: hmmState,
      },
      metrics,
    });
    await repository.put(artifact);
    const artifactId = await repository.getModelArtifactIdByHash(artifact.hash);
    await repository.updateTrainingRun(trainingRunId, {
      status: 'succeeded', progress: 100, modelArtifactId: artifactId ?? undefined, metrics, error: null,
    });
    return {
      trainingRunId,
      modelName: artifact.name,
      modelHash: artifact.hash,
      observations: trainingCount,
      validationSamples,
      trainingRange,
      validationRange,
      datasetVersion: snapshot.datasetVersion,
      datasetChunkCount: manifest.chunkCount,
      metrics,
      posterior: finalPosterior ? Array.from(finalPosterior.data) : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CoreSpirit batch training failed.';
    await repository.updateTrainingRun(trainingRunId, {
      status: 'failed', progress: 100, error: message,
    }).catch(() => undefined);
    throw error;
  }
}
