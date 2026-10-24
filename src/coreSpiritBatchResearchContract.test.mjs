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
const migration = read('../supabase/migrations/20261024120000_corespirit_batch_dataset_chunks.sql');

assert.match(limits, /CORESPIRIT_BATCH_MAX_DATASET_ROWS/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_MEMORY_BYTES/);
assert.match(limits, /CORESPIRIT_BATCH_MAX_EXECUTION_MS/);
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
assert.match(batchRepository, /status: 'sealing'/);
assert.match(batchRepository, /status: 'sealed'/);
assert.match(batchRepository, /async \*iterateChunks/);
assert.match(batchRepository, /rows,\s*storage_mode: 'chunked-v1'/);
assert.match(snapshotRepository, /storageMode === 'chunked-v1'/,
  'snapshot reads must not require all chunked rows to be embedded in one JSON object');

assert.match(batchWorker, /process\.memoryUsage\(\)\.rss/);
assert.match(batchWorker, /maxExecutionMs/);
assert.match(batchWorker, /for await \(const item of iterateVerifiedRows/);
assert.match(batchWorker, /Dataset chunk content hash or time bounds/);
assert.match(batchWorker, /validationStart = trainingCount \+ purgeBars/);
assert.match(batchWorker, /validationModel\.setInferenceBoundaryExclusive\(trainingEndTimestamp\)/);
assert.match(batchWorker, /datasetStorageFormat: 'json-chunks-v1'/);
assert.match(trainingWorker, /runChunkedCoreSpiritModelTraining/);
assert.match(artifacts, /\['chronological-holdout-v1', 'purged-chronological-v1'\]/);

assert.match(migration, /row_count between 12 and 1000000/);
assert.match(migration, /corespirit_dataset_batch_chunks_immutable/);
assert.match(migration, /guard_corespirit_dataset_batch_chunk_insert/);
assert.match(migration, /revoke all on public\.corespirit_dataset_batch_sessions, public\.corespirit_dataset_batch_chunks from anon, authenticated/);
console.log('CORESPIRIT_BOUNDED_CHUNKED_RESEARCH_CONTRACT_OK');
