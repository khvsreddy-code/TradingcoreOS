import { createClient } from '@supabase/supabase-js';
import { coreSpiritSha256, type ModelArtifact, type ModelArtifactStore, type ResearchArtifact } from '../../services/coreSpirit/modelArtifacts.js';
import { verifyModelArtifactIntegrity } from '../../services/coreSpirit/modelArtifacts.js';
import { CORESPIRIT_MAX_DATASET_ROWS, validateConfirmedResearchRows, type ResearchFeatureRow } from '../../services/coreSpirit/researchValidation.js';

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('CoreSpirit artifact storage is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type StoredResearchArtifact = Readonly<{ id: string; artifact: ResearchArtifact }>;
export type CoreSpiritModelReleaseStatus = 'candidate' | 'approved' | 'revoked' | 'retired';
export type CoreSpiritModelReleaseControl = Readonly<{
  id: string;
  ownerUserId: string;
  artifactHash: string;
  status: CoreSpiritModelReleaseStatus;
  validationReport: Record<string, unknown>;
  approvalChecks: Record<string, unknown>;
  decisionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type StoredResearchRow = {
  timestamp: number;
  availableAt: number;
  confirmed: boolean;
  phase: ResearchFeatureRow['phase'];
  values: number[];
};

type StoredDatasetSnapshotFields = {
  id: string;
  datasetVersion: string;
  featureNames: string[];
  trainingRange: { from: string; to: string };
  sourceProvenance: 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
  sourceVerified: boolean;
  sourceAttestationHash: string | null;
  rows: StoredResearchRow[];
};

export type CoreSpiritDatasetSnapshot =
  | (StoredDatasetSnapshotFields & {
      storageMode: 'inline-v1';
      batchSessionId: null;
      datasetManifest: null;
    })
  | (StoredDatasetSnapshotFields & {
      storageMode: 'chunked-v1';
      batchSessionId: string;
      datasetManifest: Record<string, unknown>;
    });

export class CoreSpiritArtifactRepository implements ModelArtifactStore<unknown> {
  private readonly db = createServerClient();

  constructor(
    private readonly ownerUserId: string,
    private readonly researchArtifactId?: string,
  ) {
    if (!ownerUserId) throw new Error('CoreSpirit artifact owner is required');
  }

  async putResearchArtifact(artifact: ResearchArtifact): Promise<StoredResearchArtifact> {
    const row = {
      owner_user_id: this.ownerUserId,
      name: artifact.name,
      source_hash: artifact.sourceHash,
      compiler_version: artifact.compilerVersion,
      ir_version: artifact.irVersion,
      feature_graph_hash: artifact.featureGraphHash,
      artifact,
    };
    const { data, error } = await this.db
      .from('corespirit_research_artifacts')
      .upsert(row, { onConflict: 'owner_user_id,name,source_hash,feature_graph_hash', ignoreDuplicates: true })
      .select('id,artifact')
      .maybeSingle();
    if (error) throw new Error('Unable to persist CoreSpirit research artifact: ' + error.message);
    if (data) return { id: String(data.id), artifact: data.artifact as ResearchArtifact };

    const existing = await this.db.from('corespirit_research_artifacts')
      .select('id,artifact')
      .eq('owner_user_id', this.ownerUserId)
      .eq('name', artifact.name)
      .eq('source_hash', artifact.sourceHash)
      .eq('feature_graph_hash', artifact.featureGraphHash)
      .maybeSingle();
    if (existing.error || !existing.data) {
      throw new Error('Research artifact insert was not confirmed' + (existing.error ? ': ' + existing.error.message : ''));
    }
    return { id: String(existing.data.id), artifact: existing.data.artifact as ResearchArtifact };
  }

  async getResearchArtifact(id: string): Promise<ResearchArtifact | null> {
    const { data, error } = await this.db.from('corespirit_research_artifacts')
      .select('artifact')
      .eq('id', id)
      .eq('owner_user_id', this.ownerUserId)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit research artifact: ' + error.message);
    return data ? data.artifact as ResearchArtifact : null;
  }

  async putDatasetSnapshot(input: {
    datasetVersion: string;
    featureNames: readonly string[];
    trainingRange: Readonly<{ from: string; to: string }>;
    rows: readonly ResearchFeatureRow[];
  }): Promise<{ id: string; datasetVersion: string; rowCount: number }> {
    if (!Array.isArray(input.rows) || input.rows.length < 12 || input.rows.length > CORESPIRIT_MAX_DATASET_ROWS) {
      throw new Error('Immutable research snapshots must contain 12–' + CORESPIRIT_MAX_DATASET_ROWS + ' validated rows.');
    }
    const rows = validateConfirmedResearchRows(input.rows, input.featureNames, { maxRows: CORESPIRIT_MAX_DATASET_ROWS });
    if (!/^[a-f0-9]{64}$/.test(input.datasetVersion)) throw new Error('Dataset snapshot requires a SHA-256 identity.');
    const serializedBytes = new TextEncoder().encode(JSON.stringify({
      featureNames: input.featureNames, rows, trainingRange: input.trainingRange,
    })).byteLength;
    if (serializedBytes > 8 * 1024 * 1024) throw new Error('Immutable research snapshot exceeds the 8 MiB storage budget.');
    const calculatedHash = await coreSpiritSha256({ featureNames: input.featureNames, rows, trainingRange: input.trainingRange });
    if (calculatedHash !== input.datasetVersion) throw new Error('Dataset snapshot hash does not match the validated immutable row payload.');
    const { data, error } = await this.db.from('corespirit_dataset_snapshots')
      .upsert({
        owner_user_id: this.ownerUserId,
        dataset_hash: input.datasetVersion,
        feature_names: input.featureNames,
        training_range: input.trainingRange,
        row_count: rows.length,
        rows,
        // This method is fed by the authenticated request body today. Never turn
        // caller-submitted values into a trusted-source assertion by default.
        source_provenance: 'user_supplied',
        source_verified: false,
        source_attestation_hash: null,
        source_attestation: { kind: 'client-submitted-feature-rows', verified: false },
      }, { onConflict: 'owner_user_id,dataset_hash', ignoreDuplicates: true })
      .select('id,dataset_hash,row_count,source_provenance,source_verified,source_attestation_hash')
      .maybeSingle();
    if (error) throw new Error('Unable to persist immutable CoreSpirit dataset snapshot: ' + error.message);
    if (data) return { id: String(data.id), datasetVersion: String(data.dataset_hash), rowCount: Number(data.row_count) };

    const existing = await this.db.from('corespirit_dataset_snapshots')
      .select('id,dataset_hash,row_count,source_provenance,source_verified,source_attestation_hash')
      .eq('owner_user_id', this.ownerUserId)
      .eq('dataset_hash', input.datasetVersion)
      .maybeSingle();
    if (existing.error || !existing.data) {
      throw new Error('Dataset snapshot insert was not confirmed' + (existing.error ? ': ' + existing.error.message : ''));
    }
    return { id: String(existing.data.id), datasetVersion: String(existing.data.dataset_hash), rowCount: Number(existing.data.row_count) };
  }

  async getDatasetSnapshot(id: string): Promise<CoreSpiritDatasetSnapshot | null> {
    const { data, error } = await this.db.from('corespirit_dataset_snapshots')
      .select('id,dataset_hash,feature_names,training_range,rows,row_count,source_provenance,source_verified,source_attestation_hash,storage_mode,batch_session_id,dataset_manifest')
      .eq('id', id)
      .eq('owner_user_id', this.ownerUserId)
      .maybeSingle();
    if (error) throw new Error('Unable to load immutable CoreSpirit dataset snapshot: ' + error.message);
    if (!data) return null;
    const storageMode = data.storage_mode === 'chunked-v1' ? 'chunked-v1' : 'inline-v1';
    const batchSessionId = typeof data.batch_session_id === 'string' ? data.batch_session_id : null;
    const datasetManifest = data.dataset_manifest && typeof data.dataset_manifest === 'object' && !Array.isArray(data.dataset_manifest)
      ? data.dataset_manifest as Record<string, unknown> : null;
    const rowCount = Number(data.row_count);
    if (!Array.isArray(data.rows) ||
        !Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > CORESPIRIT_MAX_DATASET_ROWS ||
        (storageMode === 'inline-v1' && (batchSessionId !== null || datasetManifest !== null || data.rows.length !== rowCount)) ||
        (storageMode === 'chunked-v1' && (data.rows.length !== 0 || !batchSessionId ||
          !datasetManifest || Number(datasetManifest.rowCount) !== rowCount ||
          datasetManifest.datasetVersion !== data.dataset_hash))) {
      throw new Error('Stored CoreSpirit dataset snapshot failed its manifest/row-count integrity check');
    }
    const common: StoredDatasetSnapshotFields = {
      id: String(data.id),
      datasetVersion: String(data.dataset_hash),
      featureNames: data.feature_names as string[],
      trainingRange: data.training_range as { from: string; to: string },
      sourceProvenance: String(data.source_provenance ?? 'user_supplied') as 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline',
      sourceVerified: data.source_verified === true,
      sourceAttestationHash: typeof data.source_attestation_hash === 'string' ? data.source_attestation_hash : null,
      // Chunked snapshots keep only a manifest pointer in this row. The worker streams
      // separately hashed chunks instead of materializing the dataset in this object.
      rows: (data.rows as ResearchFeatureRow[]).map((row) => ({ ...row, values: [...row.values] })),
    };
    if (storageMode === 'chunked-v1') {
      if (!batchSessionId || !datasetManifest) throw new Error('Chunked dataset snapshot is missing its session or manifest.');
      return { ...common, storageMode, batchSessionId, datasetManifest };
    }
    return { ...common, storageMode: 'inline-v1', batchSessionId: null, datasetManifest: null };
  }

  async createTrainingRun(input: {
    researchArtifactId: string;
    datasetSnapshotId: string;
    datasetVersion: string;
    datasetRowCount: number;
    featureNames: readonly string[];
    trainingRange: Readonly<{ from: string; to: string }>;
    trainingParameters: Readonly<Record<string, string | number | boolean | null>>;
    randomSeed: number;
  }): Promise<string> {
    const { data, error } = await this.db.from('corespirit_training_runs').insert({
      owner_user_id: this.ownerUserId,
      research_artifact_id: input.researchArtifactId,
      dataset_snapshot_id: input.datasetSnapshotId,
      dataset_version: input.datasetVersion,
      dataset_row_count: input.datasetRowCount,
      feature_names: input.featureNames,
      training_range: input.trainingRange,
      training_parameters: input.trainingParameters,
      random_seed: input.randomSeed,
      status: 'queued',
    }).select('id').single();
    if (error || !data) throw new Error('Unable to create CoreSpirit training run: ' + (error?.message || 'no row returned'));
    return String(data.id);
  }

  private fromReleaseControl(row: Record<string, unknown>): CoreSpiritModelReleaseControl {
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      artifactHash: String(row.artifact_hash),
      status: String(row.status) as CoreSpiritModelReleaseStatus,
      validationReport: row.validation_report && typeof row.validation_report === 'object' ? row.validation_report as Record<string, unknown> : {},
      approvalChecks: row.approval_checks && typeof row.approval_checks === 'object' ? row.approval_checks as Record<string, unknown> : {},
      decisionReason: typeof row.decision_reason === 'string' ? row.decision_reason : null,
      approvedBy: typeof row.approved_by === 'string' ? row.approved_by : null,
      approvedAt: typeof row.approved_at === 'string' ? row.approved_at : null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }

  /** Ensures a new or legacy artifact has an explicit candidate release record. */
  async ensureModelReleaseControl(hash: string): Promise<CoreSpiritModelReleaseControl> {
    const normalizedHash = hash.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) throw new Error('Model release hash must be a SHA-256 digest.');
    const { data: model, error: modelError } = await this.db.from('corespirit_model_artifacts')
      .select('id,artifact_hash,provenance')
      .eq('owner_user_id', this.ownerUserId)
      .eq('artifact_hash', normalizedHash)
      .maybeSingle();
    if (modelError) throw new Error('Unable to load model artifact for release control: ' + modelError.message);
    if (!model) throw new Error('Model artifact not found for this owner.');
    const provenance = model.provenance && typeof model.provenance === 'object'
      ? model.provenance as Record<string, unknown>
      : {};
    const { error: insertError } = await this.db.from('corespirit_model_release_controls').insert({
      owner_user_id: this.ownerUserId,
      model_artifact_id: model.id,
      artifact_hash: normalizedHash,
      status: 'candidate',
      validation_report: {
        trainingRange: provenance.trainingRange ?? null,
        validationRange: provenance.validationRange ?? null,
        validationResults: provenance.validationResults ?? null,
        researchSafety: provenance.researchSafety ?? null,
      },
      approval_checks: { productionEligible: false, reason: 'Explicit owner approval is required.' },
    });
    if (insertError && insertError.code !== '23505') {
      throw new Error('Unable to initialize model release control: ' + insertError.message);
    }
    const { data, error } = await this.db.from('corespirit_model_release_controls')
      .select('*').eq('owner_user_id', this.ownerUserId).eq('artifact_hash', normalizedHash).single();
    if (error || !data) throw new Error('Unable to load model release control: ' + (error?.message ?? 'record was not returned'));
    return this.fromReleaseControl(data as Record<string, unknown>);
  }

  async transitionModelRelease(input: {
    artifactHash: string;
    status: Exclude<CoreSpiritModelReleaseStatus, 'candidate'>;
    actorUserId: string;
    reason: string;
    approvalChecks: Record<string, unknown>;
    validationReport: Record<string, unknown>;
  }): Promise<CoreSpiritModelReleaseControl> {
    const { data, error } = await this.db.rpc('transition_corespirit_model_release', {
      p_owner_user_id: this.ownerUserId,
      p_artifact_hash: input.artifactHash.toLowerCase(),
      p_target_status: input.status,
      p_actor_user_id: input.actorUserId,
      p_reason: input.reason,
      p_approval_checks: input.approvalChecks,
      p_validation_report: input.validationReport,
    });
    if (error || !data || typeof data !== 'object') {
      throw new Error('Unable to persist CoreSpirit model release decision: ' + (error?.message ?? 'invalid result'));
    }
    return this.fromReleaseControl(data as Record<string, unknown>);
  }

  async updateTrainingRun(id: string, patch: {
    status: 'running' | 'succeeded' | 'failed';
    progress?: number;
    modelArtifactId?: string;
    metrics?: Readonly<Record<string, number>>;
    error?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      status: patch.status,
      updated_at: now,
    };
    if (patch.progress !== undefined) row.progress = patch.progress;
    if (patch.metrics !== undefined) row.metrics = patch.metrics;
    if (patch.modelArtifactId !== undefined) row.model_artifact_id = patch.modelArtifactId;
    if (patch.error !== undefined) row.error = patch.error?.slice(0, 4000) ?? null;
    if (patch.status === 'running') row.started_at = now;
    if (patch.status === 'succeeded' || patch.status === 'failed') row.completed_at = now;
    const { error } = await this.db.from('corespirit_training_runs')
      .update(row)
      .eq('id', id)
      .eq('owner_user_id', this.ownerUserId);
    if (error) throw new Error('Unable to update CoreSpirit training run: ' + error.message);
  }

  async getTrainingRun(id: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.db.from('corespirit_training_runs')
      .select('id,status,progress,model_artifact_id,metrics,error,created_at,started_at,completed_at')
      .eq('id', id)
      .eq('owner_user_id', this.ownerUserId)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit training run: ' + error.message);
    if (!data) return null;
    let modelName: string | null = null;
    let modelHash: string | null = null;
    if (typeof data.model_artifact_id === 'string') {
      const model = await this.db.from('corespirit_model_artifacts')
        .select('name,artifact_hash,provenance')
        .eq('id', data.model_artifact_id)
        .eq('owner_user_id', this.ownerUserId)
        .maybeSingle();
      if (model.error) throw new Error('Unable to load trained model reference: ' + model.error.message);
      if (model.data) {
        modelName = String(model.data.name);
        modelHash = String(model.data.artifact_hash);
        const provenance = model.data.provenance && typeof model.data.provenance === 'object'
          ? model.data.provenance as Record<string, unknown>
          : {};
        const release = await this.ensureModelReleaseControl(modelHash);
        return {
          ...(data as Record<string, unknown>), modelName, modelHash, release,
          trainingRange: provenance.trainingRange ?? null,
          validationRange: provenance.validationRange ?? null,
          validationResults: provenance.validationResults ?? null,
          researchSafety: provenance.researchSafety ?? null,
        };
      }
    }
    return { ...(data as Record<string, unknown>), modelName, modelHash, release: null };
  }

  async put(artifact: ModelArtifact<unknown>): Promise<void> {
    if (!this.researchArtifactId) throw new Error('A research artifact ID is required before a model artifact can be published');
    if (!(await verifyModelArtifactIntegrity(artifact))) throw new Error('Refusing to persist a model artifact with an invalid SHA-256 identity');
    const { error } = await this.db.from('corespirit_model_artifacts').insert({
      owner_user_id: this.ownerUserId,
      research_artifact_id: this.researchArtifactId,
      name: artifact.name,
      artifact_hash: artifact.hash,
      provenance: artifact.provenance,
      artifact,
      metrics: artifact.metrics,
    });
    if (!error) {
      await this.ensureModelReleaseControl(artifact.hash);
      return;
    }

    // A retry after a queue redelivery is idempotent only for the exact same hash.
    if (error.code === '23505') {
      const existing = await this.db.from('corespirit_model_artifacts')
        .select('artifact_hash,artifact')
        .eq('owner_user_id', this.ownerUserId)
        .eq('name', artifact.name)
        .maybeSingle();
      if (!existing.error && existing.data?.artifact_hash === artifact.hash &&
          await verifyModelArtifactIntegrity(existing.data.artifact as ModelArtifact<unknown>)) {
        await this.ensureModelReleaseControl(artifact.hash);
        return;
      }
      throw new Error('Model name already exists with a different immutable hash; publish a new versioned name');
    }
    throw new Error('Unable to persist CoreSpirit model artifact: ' + error.message);
  }

  async getModelArtifactIdByHash(hash: string): Promise<string | null> {
    const { data, error } = await this.db.from('corespirit_model_artifacts')
      .select('id')
      .eq('owner_user_id', this.ownerUserId)
      .eq('artifact_hash', hash)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit model artifact ID: ' + error.message);
    return data ? String(data.id) : null;
  }

  async getByName(name: string): Promise<ModelArtifact<unknown> | null> {
    const { data, error } = await this.db.from('corespirit_model_artifacts')
      .select('artifact')
      .eq('owner_user_id', this.ownerUserId)
      .eq('name', name)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit model by name: ' + error.message);
    return data ? data.artifact as ModelArtifact<unknown> : null;
  }

  async getByHash(hash: string): Promise<ModelArtifact<unknown> | null> {
    const { data, error } = await this.db.from('corespirit_model_artifacts')
      .select('artifact')
      .eq('owner_user_id', this.ownerUserId)
      .eq('artifact_hash', hash)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit model by hash: ' + error.message);
    return data ? data.artifact as ModelArtifact<unknown> : null;
  }
}
