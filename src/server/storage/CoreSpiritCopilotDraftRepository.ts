import { createClient } from '@supabase/supabase-js';

export type CoreSpiritCopilotDraftStoredArtifact = Readonly<{
  artifact: Record<string, unknown>;
  source: string;
  summary: string;
  assumptions: readonly string[];
  tests: readonly string[];
  backtestScenarios: readonly unknown[];
  diagnostics: readonly unknown[];
  safetyReview: Record<string, unknown>;
}>;

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export class CoreSpiritCopilotDraftRepository {
  static async create(userId: string, record: CoreSpiritCopilotDraftStoredArtifact): Promise<{ id: string; artifactHash: string; createdAt: string }> {
    const db = createServerClient();
    if (!db) throw new Error('CoreSpirit Copilot draft storage is not configured.');
    const artifact = record.artifact;
    const payload = {
      ...record,
      // The raw user prompt is intentionally not persisted; promptHash is enough
      // to bind audit metadata without retaining more sensitive user context.
    };
    const { data, error } = await db.from('corespirit_copilot_drafts').insert({
      user_id: userId,
      artifact_hash: String(artifact.artifactHash || ''),
      artifact_kind: String(artifact.kind || 'corespirit-copilot-draft'),
      schema_version: Number(artifact.schemaVersion || 1),
      version: Number(artifact.version || 1),
      mode: String(artifact.mode || 'unknown'),
      model_version: String(artifact.model || 'unknown'),
      compiler_version: String(artifact.compilerVersion || 'unknown'),
      runtime_version: String(artifact.runtimeVersion || 'unknown'),
      source_hash: String(artifact.sourceHash || ''),
      base_source_hash: String(artifact.baseSourceHash || ''),
      prompt_hash: String(artifact.promptHash || ''),
      diagnostics_hash: String(artifact.diagnosticsHash || ''),
      payload,
    }).select('id,artifact_hash,created_at').single();
    if (error || !data) throw new Error('Unable to persist CoreSpirit Copilot draft: ' + (error?.message || 'no row returned'));
    return {
      id: String(data.id),
      artifactHash: String(data.artifact_hash),
      createdAt: String(data.created_at),
    };
  }

  static async listForUser(userId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
    const db = createServerClient();
    if (!db) throw new Error('CoreSpirit Copilot draft storage is not configured.');
    const { data, error } = await db.from('corespirit_copilot_drafts')
      .select('id,artifact_hash,artifact_kind,version,mode,model_version,compiler_version,runtime_version,source_hash,base_source_hash,created_at,payload')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(50, Math.trunc(limit))));
    if (error) throw new Error('Unable to list CoreSpirit Copilot drafts: ' + error.message);
    return (data ?? []).map(row => {
      const payload = isRecord(row.payload) ? row.payload : {};
      const summary = typeof payload.summary === 'string' ? payload.summary : '';
      return {
        id: String(row.id),
        artifactHash: String(row.artifact_hash),
        kind: String(row.artifact_kind),
        version: Number(row.version || 1),
        mode: String(row.mode || 'unknown'),
        modelVersion: String(row.model_version || 'unknown'),
        compilerVersion: String(row.compiler_version || 'unknown'),
        runtimeVersion: String(row.runtime_version || 'unknown'),
        sourceHash: String(row.source_hash || ''),
        baseSourceHash: String(row.base_source_hash || ''),
        createdAt: String(row.created_at),
        summary: summary.slice(0, 1_000),
      };
    });
  }

  static async getForUser(userId: string, id: string): Promise<Record<string, unknown> | null> {
    const db = createServerClient();
    if (!db) throw new Error('CoreSpirit Copilot draft storage is not configured.');
    const { data, error } = await db.from('corespirit_copilot_drafts')
      .select('id,artifact_hash,artifact_kind,version,mode,model_version,compiler_version,runtime_version,source_hash,base_source_hash,prompt_hash,diagnostics_hash,created_at,payload')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error('Unable to load CoreSpirit Copilot draft: ' + error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      artifactHash: String(data.artifact_hash),
      kind: String(data.artifact_kind),
      version: Number(data.version || 1),
      mode: String(data.mode || 'unknown'),
      modelVersion: String(data.model_version || 'unknown'),
      compilerVersion: String(data.compiler_version || 'unknown'),
      runtimeVersion: String(data.runtime_version || 'unknown'),
      sourceHash: String(data.source_hash || ''),
      baseSourceHash: String(data.base_source_hash || ''),
      promptHash: String(data.prompt_hash || ''),
      diagnosticsHash: String(data.diagnostics_hash || ''),
      createdAt: String(data.created_at),
      payload: isRecord(data.payload) ? data.payload : {},
    };
  }
}
