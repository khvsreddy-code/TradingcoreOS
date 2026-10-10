import { createClient } from '@supabase/supabase-js';
import type { ModelArtifact, ModelArtifactStore, ResearchArtifact } from '../../services/coreSpirit/modelArtifacts.js';
import { verifyModelArtifactIntegrity } from '../../services/coreSpirit/modelArtifacts.js';

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('CoreSpirit artifact storage is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type StoredResearchArtifact = Readonly<{ id: string; artifact: ResearchArtifact }>;

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
      .upsert(row, { onConflict: 'owner_user_id,source_hash,feature_graph_hash', ignoreDuplicates: true })
      .select('id,artifact')
      .maybeSingle();
    if (error) throw new Error('Unable to persist CoreSpirit research artifact: ' + error.message);
    if (data) return { id: String(data.id), artifact: data.artifact as ResearchArtifact };

    const existing = await this.db.from('corespirit_research_artifacts')
      .select('id,artifact')
      .eq('owner_user_id', this.ownerUserId)
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

  async createTrainingRun(input: {
    researchArtifactId: string;
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
    return data as Record<string, unknown> | null;
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
    if (!error) return;

    // A retry after a queue redelivery is idempotent only for the exact same hash.
    if (error.code === '23505') {
      const existing = await this.db.from('corespirit_model_artifacts')
        .select('artifact_hash,artifact')
        .eq('owner_user_id', this.ownerUserId)
        .eq('name', artifact.name)
        .maybeSingle();
      if (!existing.error && existing.data?.artifact_hash === artifact.hash &&
          await verifyModelArtifactIntegrity(existing.data.artifact as ModelArtifact<unknown>)) return;
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
