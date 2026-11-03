import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const limits = read('./server/coreSpiritResearchLimits.ts');
const batchRepository = read('./server/storage/CoreSpiritDatasetBatchRepository.ts');
const snapshotRepository = read('./server/storage/CoreSpiritArtifactRepository.ts');
const batchWorker = read('./server/jobs/coreSpiritBatchModelTraining.ts');
const trainingWorker = read('./server/jobs/coreSpiritModelTraining.ts');
const routes = read('./server/routes/coreSpirit-models.routes.ts');
const artifacts = read('./services/coreSpirit/modelArtifacts.ts');
const quantMath = read('./services/coreSpirit/quantMath.ts');
const migration = read('../supabase/migrations/20261024120000_corespirit_batch_dataset_chunks.sql');
const lifecycleMigration = read('../supabase/migrations/20261024133000_corespirit_dataset_batch_session_guards.sql');
const reuseMigration = read('../supabase/migrations/20261024140000_allow_dataset_manifest_reuse.sql');
const server = read('../server.ts');

assert.match(limits, /CORESPIRIT_BATCH_MAX_DATASET_ROWS/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_MEMORY_BYTES/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_EXECUTION_MS/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_TRAINING_WINDOW_ROWS/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_FIT_EVERY/);
assert.match(limits, /HARD_MAX_TRAINING_WINDOW_ROWS = 4_096/);
assert.match(limits, /HARD_MAX_TRAINING_FIT_EVERY = 65_536/);
assert.match(limits, /CORESPIRIT_RESEARCH_HARD_MAX_ROWS = 1_000_000/);
assert.match(routes, /const MAX_ROWS = getCoreSpiritResearchLimits\('interactive'\)\.maxRows/,
  'synchronous training payloads must remain separately capped');
assert.match(routes, /post\('\/dataset-batches'/);
assert.match(routes, /put\('\/dataset-batches\/:sessionId\/chunks\/:chunkIndex'/);
assert.match(routes, /post\('\/dataset-batches\/:sessionId\/finalize'/);
assert.match(routes, /post\('\/training-runs\/from-dataset'/);

assert.match(batchRepository, /corespirit-dataset-chunk-v1/);
assert.match(batchRepository, /coreSpiritDatasetManifestHash/);
assert.match(batchRepository, /storageFormat: 'json-chunks-v1'/);
assert.match(batchRepository, /observedTimeRange/);
assert.match(batchWorker, /observed time range does not match its immutable chunk descriptors/);
assert.match(batchRepository, /status: 'sealing'/);
assert.match(batchRepository, /status: 'sealed'/);
assert.match(batchRepository, /async \*iterateChunks/);
assert.match(batchRepository, /rows:\s*\[\],\s*storage_mode: 'chunked-v1'/);
assert.match(snapshotRepository, /storageMode === 'chunked-v1'/,
  'snapshot reads must not require all chunked rows to be embedded in one JSON object');

assert.match(limits, /process\.memoryUsage\(\)\.rss/);
assert.match(batchWorker, /maxExecutionMs/);
assert.match(limits, /createCoreSpiritResearchBudget/);
assert.match(trainingWorker, /createCoreSpiritResearchBudget\('interactive'\)/);
assert.match(batchWorker, /checkExecutionBudget\('model fitting'\)/);
assert.match(batchWorker, /hmm\.fitFinal\(\)/);
assert.match(trainingWorker, /hmm\.fitFinal\(\)/);
assert.match(quantMath, /checkBudget\?: \(\) => void/);
assert.match(quantMath, /this\.checkBudget\?\.\(\)/);
assert.match(quantMath, /this\.fitted && this\.refreshPosteriorOnObserve/);
assert.match(batchWorker, /refreshPosteriorOnObserve: false/);
assert.match(trainingWorker, /refreshPosteriorOnObserve: false/);
assert.match(quantMath, /const requestedMaxObservations = options\.maxObservations \?\? 512;/);
assert.match(quantMath, /Math\.min\(4_096, Math\.floor\(requestedMaxObservations\)\)/,
  'research fitting retains the hard 4,096-observation cap after resolving the requested window');
assert.doesNotMatch(quantMath, /this\.observations\.shift\(\)/, 'bounded HMM ingestion must not shift the full window for every row');
assert.match(quantMath, /snapshot\.maxObservations > 1024/, 'sealed model inference state remains capped independently of wider research fitting');
assert.match(batchWorker, /for await \(const item of iterateVerifiedRows/);
assert.match(batchWorker, /Dataset chunk content hash or time bounds/);
assert.match(batchWorker, /validationStart = trainingCount \+ boundaryGap/);
assert.match(batchWorker, /embargoedDatasetRows: embargoBars/);
assert.match(batchWorker, /trainingWindowRows/);
assert.match(batchWorker, /requestedFitEvery/);
assert.match(batchWorker, /requestedTrainingWindowRows/);
assert.match(trainingWorker, /requestedFitEvery/);
assert.match(trainingWorker, /requestedTrainingWindowRows/);
assert.match(batchWorker, /inferenceRuntimeMaxObservations: 1_024/);
assert.match(batchWorker, /maxObservations: Math\.min\(fittedState\.maxObservations, 1_024\)/);
assert.match(batchWorker, /validationModel\.setInferenceBoundaryExclusive\(trainingEndTimestamp\)/);
assert.match(batchWorker, /datasetStorageFormat: 'json-chunks-v1'/);
assert.match(trainingWorker, /runChunkedCoreSpiritModelTraining/);
assert.match(trainingWorker, /embargoBars: split\.embargoedCount/);
assert.match(trainingWorker, /trainingWindowRows/);
assert.match(artifacts, /\['chronological-holdout-v1', 'purged-chronological-v1'\]/);

assert.match(migration, /row_count between 12 and 1000000/);
assert.match(server, /api\/corespirit\/dataset-batches', express\.json\(\{ limit: '5mb' \}\)/,
  'bounded batch uploads must pass a route-specific body parser before the global 512 KiB parser');
assert.match(migration, /corespirit_dataset_batch_chunks_immutable/);
assert.match(migration, /guard_corespirit_dataset_batch_chunk_insert/);
assert.match(migration, /revoke all on public\.corespirit_dataset_batch_sessions, public\.corespirit_dataset_batch_chunks from anon, authenticated/);
assert.match(lifecycleMigration, /guard_corespirit_dataset_batch_session_update/,
  'session lifecycle transitions and immutable declarations must be enforced in the database');
assert.match(reuseMigration, /drop index if exists public\.corespirit_dataset_batch_session_snapshot_unique/,
  'identical immutable manifests may be reused across sessions without duplicate-content collisions');
console.log('CORESPIRIT_BOUNDED_CHUNKED_RESEARCH_CONTRACT_OK');
