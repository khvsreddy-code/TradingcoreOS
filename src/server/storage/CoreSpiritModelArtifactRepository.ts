import { createClient } from '@supabase/supabase-js';
import {
  canonicalCoreSpiritJson,
  type CoreSpiritDatasetSnapshot,
  type CoreSpiritImmutableModelArtifact,
  type CoreSpiritModelArtifactRepository,
  type CoreSpiritResolvedModelArtifact,
} from '../../services/coreSpirit/modelArtifactProvenance';

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('CoreSpirit model artifact storage requires server-side Supabase credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function modelReference(row: Record<string, unknown>): CoreSpiritResolvedModelArtifact {
  return Object.freeze({
    modelName: String(row.model_name),
    modelVersion: String(row.model_version),
    artifactHash: String(row.artifact_hash),
    alias: String(row.alias_name ?? ''),
    inputNames: Object.freeze(Array.isArray(row.input_names) ? row.input_names.map(String) : []),
    outputNames: Object.freeze(Array.isArray(row.output_names) ? row.output_names.map(String) : []),
  });
}

/**
 * Server-only metadata repository. It persists metadata and mutable alias pointers;
 * model weights remain in a private artifact store addressed by a SHA-256 URI.
 * Realtime chart code must never import this class or its service-role client.
 */
export class SupabaseCoreSpiritModelArtifactRepository implements CoreSpiritModelArtifactRepository {
  private readonly db = createServerClient();

  async beginTrainingRun(input: Parameters<CoreSpiritModelArtifactRepository['beginTrainingRun']>[0]): Promise<string> {
    const { data, error } = await this.db.from('core_spirit_model_training_runs').insert({
      owner_user_id: input.ownerUserId,
      model_name: input.modelName,
      alias_name: input.alias,
      source_hash: input.sourceHash,
      research_artifact_hash: input.researchArtifactHash,
      feature_graph_hash: input.featureGraphHash,
      dataset_id: input.datasetId,
      requested_from: input.requestedFrom,
      requested_to: input.requestedTo,
      random_seed: input.randomSeed,
      model_implementation: input.implementation,
      backend: input.backend,
      training_parameters: input.trainingParameters,
      status: 'queued',
    }).select('id').single();
    if (error || !data) throw new Error('Unable to create CoreSpirit training run: ' + (error?.message || 'no row returned'));
    return String(data.id);
  }

  async markTrainingRunRunning(runId: string, dataset: CoreSpiritDatasetSnapshot): Promise<void> {
    const { error } = await this.db.from('core_spirit_model_training_runs').update({
      status: 'running',
      dataset_version: dataset.datasetVersion,
      dataset_uri: dataset.artifactUri,
      dataset_hash: dataset.contentSha256,
      started_at: new Date().toISOString(),
      failure_summary: null,
    }).eq('id', runId).in('status', ['queued', 'running']);
    if (error) throw new Error('Unable to mark CoreSpirit training run running: ' + error.message);
  }

  async markTrainingRunFailed(runId: string, failure: string): Promise<void> {
    const { error } = await this.db.from('core_spirit_model_training_runs').update({
      status: 'failed',
      failure_summary: failure.slice(0, 4000),
      completed_at: new Date().toISOString(),
    }).eq('id', runId).neq('status', 'completed');
    if (error) throw new Error('Unable to mark CoreSpirit training run failed: ' + error.message);
  }

  async commitImmutableArtifact(
    artifact: CoreSpiritImmutableModelArtifact,
    inputNames: readonly string[],
    outputNames: readonly string[],
  ): Promise<void> {
    const { data: existing, error: lookupError } = await this.db
      .from('core_spirit_model_artifacts')
      .select('artifact_hash, owner_user_id, model_name, model_version, artifact_uri, payload_sha256, provenance')
      .eq('artifact_hash', artifact.artifactHash)
      .maybeSingle();
    if (lookupError) throw new Error('Unable to inspect immutable model artifact: ' + lookupError.message);

    if (existing) {
      const isSame = String(existing.owner_user_id) === artifact.ownerUserId &&
        String(existing.model_name) === artifact.modelName &&
        String(existing.model_version) === artifact.modelVersion &&
        String(existing.artifact_uri) === artifact.artifactUri &&
        String(existing.payload_sha256) === artifact.payloadSha256 &&
        canonicalCoreSpiritJson(existing.provenance) === canonicalCoreSpiritJson(artifact.provenance);
      if (!isSame) throw new Error('Artifact hash collision or attempted immutable artifact mutation');
    } else {
      const p = artifact.provenance;
      const { error } = await this.db.from('core_spirit_model_artifacts').insert({
        artifact_hash: artifact.artifactHash,
        owner_user_id: artifact.ownerUserId,
        model_name: artifact.modelName,
        model_version: artifact.modelVersion,
        artifact_uri: artifact.artifactUri,
        payload_sha256: artifact.payloadSha256,
        source_hash: p.sourceHash,
        research_artifact_hash: p.researchArtifactHash,
        compiler_version: p.compilerVersion,
        ir_version: p.irVersion,
        feature_graph_hash: p.featureGraphHash,
        dataset_id: p.datasetId,
        dataset_version: p.datasetVersion,
        training_from: p.trainingRange.from,
        training_to: p.trainingRange.to,
        training_parameters: p.trainingParameters,
        random_seed: p.randomSeed,
        model_implementation: p.modelImplementation,
        backend: p.backend,
        dependency_versions: p.dependencyVersions,
        provenance: p,
        metrics: artifact.metrics,
        input_names: inputNames,
        output_names: outputNames,
        created_at: artifact.createdAt,
      });
      if (error) throw new Error('Unable to persist immutable model artifact: ' + error.message);
    }

    // Aliases are intentionally mutable pointers. The artifact rows behind them are not.
    const { error: aliasError } = await this.db.from('core_spirit_model_aliases').upsert({
      owner_user_id: artifact.ownerUserId,
      alias_name: artifact.alias,
      artifact_hash: artifact.artifactHash,
      input_names: inputNames,
      output_names: outputNames,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,alias_name' });
    if (aliasError) throw new Error('Artifact persisted but immutable alias pointer could not be updated: ' + aliasError.message);
  }

  async markTrainingRunCompleted(runId: string, artifactHash: string, metrics: Readonly<Record<string, number>>): Promise<void> {
    const { error } = await this.db.from('core_spirit_model_training_runs').update({
      status: 'completed',
      artifact_hash: artifactHash,
      metrics,
      completed_at: new Date().toISOString(),
      failure_summary: null,
    }).eq('id', runId);
    if (error) throw new Error('Unable to complete CoreSpirit training run: ' + error.message);
  }

  async resolveAlias(ownerUserId: string, alias: string): Promise<CoreSpiritResolvedModelArtifact | undefined> {
    const { data, error } = await this.db.from('core_spirit_model_aliases')
      .select('alias_name, artifact_hash, input_names, output_names')
      .eq('owner_user_id', ownerUserId)
      .eq('alias_name', alias)
      .maybeSingle();
    if (error) throw new Error('Unable to resolve model alias: ' + error.message);
    if (!data) return undefined;
    const { data: artifact, error: artifactError } = await this.db.from('core_spirit_model_artifacts')
      .select('model_name, model_version, artifact_hash')
      .eq('owner_user_id', ownerUserId)
      .eq('artifact_hash', data.artifact_hash)
      .single();
    if (artifactError || !artifact) throw new Error('Model alias points to an unavailable immutable artifact: ' + (artifactError?.message || 'no artifact'));
    return modelReference({ ...artifact, ...data });
  }

  async getArtifactByHash(ownerUserId: string, artifactHash: string): Promise<CoreSpiritResolvedModelArtifact | undefined> {
    const { data, error } = await this.db.from('core_spirit_model_artifacts')
      .select('model_name, model_version, artifact_hash, input_names, output_names')
      .eq('owner_user_id', ownerUserId)
      .eq('artifact_hash', artifactHash)
      .maybeSingle();
    if (error) throw new Error('Unable to load immutable model reference: ' + error.message);
    return data ? modelReference({ ...data, alias: artifactHash }) : undefined;
  }
}
