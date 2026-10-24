import { createClient } from '@supabase/supabase-js';
import { coreSpiritSha256 } from '../../services/coreSpirit/modelArtifacts.js';
import {
  validateConfirmedResearchRows,
  type ResearchFeatureRow,
  type ResearchDateRange,
} from '../../services/coreSpirit/researchValidation.js';
import { getCoreSpiritResearchLimits } from '../coreSpiritResearchLimits.js';

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('CoreSpirit dataset storage is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type DatasetChunkDescriptor = Readonly<{
  index: number;
  rowCount: number;
  hash: string;
  firstTimestamp: number;
  lastTimestamp: number;
}>;

export type CoreSpiritDatasetManifest = Readonly<{
  formatVersion: 1;
  datasetRevision: number;
  researchArtifactId: string;
  datasetVersion: string;
  rowCount: number;
  featureSchema: Readonly<{ version: '1'; orderedNames: readonly string[]; types: readonly 'number'[]; hash: string }>;
  trainingRange: ResearchDateRange;
  chunkSize: number;
  chunkCount: number;
  chunks: readonly DatasetChunkDescriptor[];
  source: 'user_supplied';
  sourceVerified: false;
  sourceAttestationHash: null;
  storageFormat: 'json-chunks-v1';
}>;

export type CoreSpiritDatasetBatchSession = Readonly<{
  id: string;
  expectedRowCount: number;
  featureNames: string[];
  trainingRange: ResearchDateRange;
  chunkSize: number;
  expectedChunkCount: number;
  status: 'uploading' | 'sealing' | 'sealed' | 'failed';
  datasetHash: string | null;
  datasetSnapshotId: string | null;
  datasetManifest: CoreSpiritDatasetManifest | null;
}>;

export type StoredDatasetChunk = Readonly<{
  chunkIndex: number;
  rowCount: number;
  chunkHash: string;
  firstTimestamp: number;
  lastTimestamp: number;
  rows: ResearchFeatureRow[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseSession(row: Record<string, unknown>): CoreSpiritDatasetBatchSession {
  const range = row.training_range as ResearchDateRange;
  return {
    id: String(row.id),
    expectedRowCount: Number(row.expected_row_count),
    featureNames: Array.isArray(row.feature_names) ? row.feature_names.map(String) : [],
    trainingRange: { from: String(range?.from ?? ''), to: String(range?.to ?? '') },
    chunkSize: Number(row.chunk_size),
    expectedChunkCount: Number(row.expected_chunk_count),
    status: String(row.status) as CoreSpiritDatasetBatchSession['status'],
    datasetHash: typeof row.dataset_hash === 'string' ? row.dataset_hash : null,
    datasetSnapshotId: typeof row.dataset_snapshot_id === 'string' ? row.dataset_snapshot_id : null,
    datasetManifest: isRecord(row.dataset_manifest) ? row.dataset_manifest as unknown as CoreSpiritDatasetManifest : null,
  };
}

export async function coreSpiritDatasetManifestHash(input: {
  rowCount: number;
  featureSchema: CoreSpiritDatasetManifest['featureSchema'];
  trainingRange: ResearchDateRange;
  chunkSize: number;
  chunks: readonly DatasetChunkDescriptor[];
}): Promise<string> {
  return coreSpiritSha256({
    protocol: 'corespirit-dataset-manifest-v1',
    datasetRevision: 1,
    rowCount: input.rowCount,
    featureSchema: input.featureSchema,
    trainingRange: input.trainingRange,
    chunkSize: input.chunkSize,
    chunks: input.chunks,
  });
}

export class CoreSpiritDatasetBatchRepository {
  private readonly db = createServerClient();
  constructor(private readonly ownerUserId: string) {
    if (!ownerUserId) throw new Error('CoreSpirit dataset owner is required');
  }

  async createSession(input: {
    researchArtifactId: string;
    featureNames: readonly string[];
    trainingRange: ResearchDateRange;
    rowCount: number;
    chunkSize?: number;
  }): Promise<CoreSpiritDatasetBatchSession> {
    const limits = getCoreSpiritResearchLimits('batch');
    const featureNames = [...input.featureNames];
    if (!input.researchArtifactId || featureNames.length < 1 || featureNames.length > 16 ||
        featureNames.some(name => !name.trim()) || new Set(featureNames).size !== featureNames.length) {
      throw new Error('Batch dataset requires a research artifact and 1–16 unique feature names.');
    }
    if (!Number.isSafeInteger(input.rowCount) || input.rowCount < 24 || input.rowCount > limits.maxRows) {
      throw new Error('Batch dataset rowCount must be between 24 and ' + limits.maxRows + ' for the configured worker class.');
    }
    const from = Date.parse(input.trainingRange.from);
    const to = Date.parse(input.trainingRange.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Batch training range is invalid.');
    const chunkSize = input.chunkSize ?? limits.maxChunkRows;
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 100 || chunkSize > Math.min(1_000, limits.maxChunkRows)) {
      throw new Error('Batch chunkSize must be between 100 and the configured chunk-row limit.');
    }
    const expectedChunkCount = Math.ceil(input.rowCount / chunkSize);
    const { data, error } = await this.db.from('corespirit_dataset_batch_sessions').insert({
      owner_user_id: this.ownerUserId,
      research_artifact_id: input.researchArtifactId,
      feature_names: featureNames,
      training_range: input.trainingRange,
      expected_row_count: input.rowCount,
      chunk_size: chunkSize,
      expected_chunk_count: expectedChunkCount,
      status: 'uploading',
    }).select('*').single();
    if (error || !data) throw new Error('Unable to create dataset batch: ' + (error?.message ?? 'no row returned'));
    return parseSession(data as Record<string, unknown>);
  }

  async getSession(id: string): Promise<CoreSpiritDatasetBatchSession | null> {
    const { data, error } = await this.db.from('corespirit_dataset_batch_sessions')
      .select('*').eq('id', id).eq('owner_user_id', this.ownerUserId).maybeSingle();
    if (error) throw new Error('Unable to load dataset batch session: ' + error.message);
    return data ? parseSession(data as Record<string, unknown>) : null;
  }

  async appendChunk(sessionId: string, chunkIndex: number, inputRows: unknown): Promise<{
    sessionId: string; chunkIndex: number; rowCount: number; chunkHash: string; idempotent: boolean;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Dataset batch session not found for this owner.');
    if (session.status !== 'uploading') throw new Error('Dataset batch no longer accepts chunks.');
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.expectedChunkCount) {
      throw new Error('chunkIndex is outside the declared dataset manifest.');
    }
    const expected = chunkIndex === session.expectedChunkCount - 1
      ? session.expectedRowCount - chunkIndex * session.chunkSize
      : session.chunkSize;
    if (!Array.isArray(inputRows) || inputRows.length !== expected) {
      throw new Error('Chunk ' + chunkIndex + ' must contain exactly ' + expected + ' rows.');
    }
    const limits = getCoreSpiritResearchLimits('batch');
    const bytes = new TextEncoder().encode(JSON.stringify(inputRows)).byteLength;
    if (bytes > limits.maxChunkBytes) throw new Error('Chunk exceeds the configured serialized byte budget.');
    const rows = validateConfirmedResearchRows(inputRows as ResearchFeatureRow[], session.featureNames, { maxRows: session.chunkSize });
    const rangeStart = Date.parse(session.trainingRange.from);
    const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(session.trainingRange.to);
    const rangeEnd = Date.parse(session.trainingRange.to) + (dateOnlyTo ? 86_399_999 : 0);
    rows.forEach((row, index) => {
      if (row.timestamp < rangeStart || row.timestamp > rangeEnd) {
        throw new Error('Chunk row ' + index + ' is outside the declared immutable training range.');
      }
    });
    const chunkHash = await coreSpiritSha256({
      protocol: 'corespirit-dataset-chunk-v1',
      chunkIndex,
      rows,
    });
    const firstTimestamp = rows[0]!.timestamp;
    const lastTimestamp = rows[rows.length - 1]!.timestamp;
    const { error } = await this.db.from('corespirit_dataset_batch_chunks').insert({
      session_id: sessionId,
      owner_user_id: this.ownerUserId,
      chunk_index: chunkIndex,
      row_count: rows.length,
      first_timestamp: firstTimestamp,
      last_timestamp: lastTimestamp,
      chunk_hash: chunkHash,
      rows,
    });
    if (error?.code === '23505') {
      const existing = await this.db.from('corespirit_dataset_batch_chunks')
        .select('row_count,chunk_hash').eq('session_id', sessionId).eq('chunk_index', chunkIndex).maybeSingle();
      if (existing.error || !existing.data || existing.data.chunk_hash !== chunkHash || Number(existing.data.row_count) !== rows.length) {
        throw new Error('A different chunk already occupies this immutable chunk index.');
      }
      return { sessionId, chunkIndex, rowCount: rows.length, chunkHash, idempotent: true };
    }
    if (error) throw new Error('Unable to store dataset chunk: ' + error.message);
    return { sessionId, chunkIndex, rowCount: rows.length, chunkHash, idempotent: false };
  }

  async finalize(sessionId: string): Promise<{
    datasetSnapshotId: string; datasetVersion: string; rowCount: number; manifest: CoreSpiritDatasetManifest;
  }> {
    let session = await this.getSession(sessionId);
    if (!session) throw new Error('Dataset batch session not found for this owner.');
    if (session.status === 'sealed' && session.datasetSnapshotId && session.datasetHash && session.datasetManifest) {
      return { datasetSnapshotId: session.datasetSnapshotId, datasetVersion: session.datasetHash,
        rowCount: session.expectedRowCount, manifest: session.datasetManifest };
    }
    if (session.status === 'uploading') {
      const { error } = await this.db.from('corespirit_dataset_batch_sessions').update({
        status: 'sealing', updated_at: new Date().toISOString(),
      }).eq('id', sessionId).eq('owner_user_id', this.ownerUserId).eq('status', 'uploading');
      if (error) throw new Error('Unable to close dataset chunk ingestion: ' + error.message);
      session = await this.getSession(sessionId);
      if (!session) throw new Error('Dataset batch session not found after sealing began.');
    }
    if (session.status !== 'sealing') throw new Error('Dataset batch session cannot be finalized from its current state.');

    const { data: chunkRows, error: chunksError } = await this.db.from('corespirit_dataset_batch_chunks')
      .select('chunk_index,row_count,first_timestamp,last_timestamp,chunk_hash')
      .eq('session_id', sessionId).eq('owner_user_id', this.ownerUserId)
      .order('chunk_index', { ascending: true });
    if (chunksError) throw new Error('Unable to verify dataset chunks: ' + chunksError.message);
    if (!Array.isArray(chunkRows) || chunkRows.length !== session.expectedChunkCount) {
      throw new Error('Dataset batch is incomplete: every declared chunk must be uploaded before finalization.');
    }
    let observedRows = 0;
    let previousLast = Number.NEGATIVE_INFINITY;
    const descriptors: DatasetChunkDescriptor[] = chunkRows.map((chunk: Record<string, unknown>, expectedIndex: number) => {
      const index = Number(chunk.chunk_index);
      const rowCount = Number(chunk.row_count);
      const expectedCount = index === session.expectedChunkCount - 1
        ? session.expectedRowCount - index * session.chunkSize : session.chunkSize;
      const firstTimestamp = Number(chunk.first_timestamp);
      const lastTimestamp = Number(chunk.last_timestamp);
      if (index !== expectedIndex || rowCount !== expectedCount || !/^[a-f0-9]{64}$/.test(String(chunk.chunk_hash)) ||
          firstTimestamp <= previousLast || lastTimestamp < firstTimestamp) {
        throw new Error('Dataset chunk metadata is not contiguous, chronological, or complete.');
      }
      previousLast = lastTimestamp;
      observedRows += rowCount;
      return { index, rowCount, hash: String(chunk.chunk_hash), firstTimestamp, lastTimestamp };
    });
    if (observedRows !== session.expectedRowCount) throw new Error('Dataset row count does not match its immutable upload declaration.');
    const featureSchema = {
      version: '1' as const,
      orderedNames: session.featureNames,
      types: session.featureNames.map(() => 'number' as const),
      hash: await coreSpiritSha256({ version: '1', orderedNames: session.featureNames, types: session.featureNames.map(() => 'number') }),
    };
    const datasetVersion = await coreSpiritDatasetManifestHash({
      rowCount: session.expectedRowCount, featureSchema, trainingRange: session.trainingRange,
      chunkSize: session.chunkSize, chunks: descriptors,
    });
    const manifest: CoreSpiritDatasetManifest = Object.freeze({
      formatVersion: 1,
      datasetRevision: 1,
      researchArtifactId: (await this.getSession(sessionId)) ? String((await this.getResearchArtifactId(sessionId))) : '',
      datasetVersion,
      rowCount: session.expectedRowCount,
      featureSchema,
      trainingRange: session.trainingRange,
      chunkSize: session.chunkSize,
      chunkCount: descriptors.length,
      chunks: Object.freeze(descriptors),
      source: 'user_supplied',
      sourceVerified: false,
      sourceAttestationHash: null,
      storageFormat: 'json-chunks-v1',
    });
    const { data: snapshot, error: snapshotError } = await this.db.from('corespirit_dataset_snapshots').upsert({
      owner_user_id: this.ownerUserId,
      dataset_hash: datasetVersion,
      feature_names: session.featureNames,
      training_range: session.trainingRange,
      row_count: session.expectedRowCount,
      rows: [],
      storage_mode: 'chunked-v1',
      batch_session_id: sessionId,
      dataset_manifest: manifest,
      source_provenance: 'user_supplied',
      source_verified: false,
      source_attestation_hash: null,
      source_attestation: { kind: 'client-submitted-chunked-feature-rows', verified: false },
    }, { onConflict: 'owner_user_id,dataset_hash', ignoreDuplicates: true })
      .select('id,dataset_hash,row_count').maybeSingle();
    if (snapshotError) throw new Error('Unable to create immutable dataset manifest: ' + snapshotError.message);
    let snapshotRow = snapshot;
    if (!snapshotRow) {
      const existing = await this.db.from('corespirit_dataset_snapshots')
        .select('id,dataset_hash,row_count')
        .eq('owner_user_id', this.ownerUserId).eq('dataset_hash', datasetVersion).maybeSingle();
      if (existing.error || !existing.data) throw new Error('Immutable dataset manifest insert was not confirmed.');
      snapshotRow = existing.data;
    }
    const { error: sealError } = await this.db.from('corespirit_dataset_batch_sessions').update({
      status: 'sealed',
      dataset_hash: datasetVersion,
      dataset_snapshot_id: String(snapshotRow.id),
      dataset_manifest: manifest,
      sealed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId).eq('owner_user_id', this.ownerUserId).eq('status', 'sealing');
    if (sealError) throw new Error('Dataset manifest was created but upload session did not seal: ' + sealError.message);
    return { datasetSnapshotId: String(snapshotRow.id), datasetVersion, rowCount: session.expectedRowCount, manifest };
  }

  private async getResearchArtifactId(sessionId: string): Promise<string> {
    const { data, error } = await this.db.from('corespirit_dataset_batch_sessions')
      .select('research_artifact_id').eq('id', sessionId).eq('owner_user_id', this.ownerUserId).single();
    if (error || !data) throw new Error('Unable to load dataset session lineage.');
    return String(data.research_artifact_id);
  }

  async *iterateChunks(sessionId: string): AsyncGenerator<StoredDatasetChunk> {
    const session = await this.getSession(sessionId);
    if (!session || session.status !== 'sealed') throw new Error('Immutable dataset batch is not sealed.');
    const descriptors = session.datasetManifest?.chunks;
    if (!descriptors || descriptors.length !== session.expectedChunkCount) throw new Error('Dataset batch manifest is incomplete.');
    const pageSize = 10;
    for (let offset = 0; offset < session.expectedChunkCount; offset += pageSize) {
      const { data, error } = await this.db.from('corespirit_dataset_batch_chunks')
        .select('chunk_index,row_count,first_timestamp,last_timestamp,chunk_hash,rows')
        .eq('session_id', sessionId).eq('owner_user_id', this.ownerUserId)
        .order('chunk_index', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error || !Array.isArray(data)) throw new Error('Unable to stream immutable dataset chunks: ' + (error?.message ?? 'invalid page'));
      for (const row of data as Array<Record<string, unknown>>) {
        const rows = row.rows;
        if (!Array.isArray(rows)) throw new Error('Stored dataset chunk is not an array.');
        yield {
          chunkIndex: Number(row.chunk_index),
          rowCount: Number(row.row_count),
          chunkHash: String(row.chunk_hash),
          firstTimestamp: Number(row.first_timestamp),
          lastTimestamp: Number(row.last_timestamp),
          rows: rows as ResearchFeatureRow[],
        };
      }
    }
  }
}
