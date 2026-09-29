import { getSupabaseClient } from '../auth/supabaseClient';
import type { CoreSpiritCompileResult } from './compiler';
import { buildCoreSpiritArtifactIdentity } from './artifactIdentity';
import { CORE_SPIRIT_VERSION, CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION, CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION } from './VERSION';
import { versionedStorageKey } from './storageSchema';

export type CoreSpiritScript = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source: string;
  language_version: string;
  status: string;
  is_published: boolean;
  active_version_id: string | null;
  metadata: Record<string, unknown>;
};

export type CoreSpiritScriptVersion = {
  id: string;
  script_id: string;
  version: number;
  source: string;
  compiled_ir: unknown | null;
  compiler_version: string | null;
  compile_status: string;
  compile_errors: unknown[];
  source_hash: string | null;
  artifact_identity?: string | null;
  ir_version?: number | null;
  artifact_schema_version?: number | null;
};

const SCRIPT_ID_KEY = versionedStorageKey('editor-script-id');
const LEGACY_SCRIPT_ID_KEY = 'tradingcore:corespirit:editor-script-id';

async function hashSource(source: string) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getCurrentUser() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function loadEditorScript(): Promise<CoreSpiritScript | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const client = getSupabaseClient();
  const savedId = localStorage.getItem(SCRIPT_ID_KEY) || localStorage.getItem(LEGACY_SCRIPT_ID_KEY);
  if (savedId && !localStorage.getItem(SCRIPT_ID_KEY)) { try { localStorage.setItem(SCRIPT_ID_KEY, savedId); } catch { /* storage boundary */ } }

  if (savedId) {
    const { data } = await client.from('corespirit_scripts').select('*').eq('id', savedId).eq('user_id', user.id).maybeSingle();
    if (data) return data as CoreSpiritScript;
  }

  const { data, error } = await client
    .from('corespirit_scripts')
    .select('*')
    .eq('user_id', user.id)
    .eq('name', 'CoreSpirit Trend')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  localStorage.setItem(SCRIPT_ID_KEY, data.id);
  return data as CoreSpiritScript;
}

async function ensureEditorScript(source: string): Promise<CoreSpiritScript> {
  const existing = await loadEditorScript();
  if (existing) return existing;
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in to save CoreSpirit scripts to the cloud.');

  const { data, error } = await getSupabaseClient()
    .from('corespirit_scripts')
    .insert({ user_id: user.id, name: 'CoreSpirit Trend', source, language_version: CORE_SPIRIT_VERSION, status: 'draft' })
    .select('*')
    .single();
  if (error) throw error;
  localStorage.setItem(SCRIPT_ID_KEY, data.id);
  return data as CoreSpiritScript;
}

export async function saveEditorScript(source: string, compile?: CoreSpiritCompileResult) {
  const script = await ensureEditorScript(source);
  const client = getSupabaseClient();
  const hash = await hashSource(source);

  const { data: latest, error: latestError } = await client
    .from('corespirit_script_versions')
    .select('version')
    .eq('script_id', script.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const nextVersion = (latest?.version ?? 0) + 1;
  const compileSucceeded = Boolean(compile?.ir && !(compile.diagnostics || []).some((d) => d.severity === 'error'));
  const diagnostics = (compile?.diagnostics || []).filter((d) => d.severity === 'error');
  const artifactIdentity = compileSucceeded && compile?.ir ? await buildCoreSpiritArtifactIdentity(compile.ir, source) : null;

  const { data: version, error: versionError } = await client
    .from('corespirit_script_versions')
    .insert({
      script_id: script.id,
      user_id: script.user_id,
      version: nextVersion,
      source,
      compiled_ir: compileSucceeded ? compile?.ir ?? null : null,
      compiler_version: compile ? CORE_SPIRIT_COMPILER_VERSION : null,
      compile_status: compile ? (compileSucceeded ? 'success' : 'error') : 'pending',
      compile_errors: diagnostics,
      source_hash: hash,
      artifact_identity: artifactIdentity?.artifactHash ?? null,
      ir_version: compileSucceeded ? CORE_SPIRIT_IR_VERSION : null,
      artifact_schema_version: compileSucceeded ? CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION : null,
    })
    .select('*')
    .single();
  if (versionError) throw versionError;

  const { data: updated, error: updateError } = await client
    .from('corespirit_scripts')
    .update({
      source,
      status: compile ? (compileSucceeded ? 'ready' : 'error') : 'draft',
      active_version_id: compileSucceeded ? version.id : script.active_version_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', script.id)
    .eq('user_id', script.user_id)
    .select('*')
    .single();
  if (updateError) throw updateError;

  return { script: updated as CoreSpiritScript, version: version as CoreSpiritScriptVersion };
}

export async function saveExecutionRun(input: {
  scriptId: string;
  versionId?: string | null;
  deploymentId?: string | null;
  executionType: 'chart' | 'alert' | 'automation' | 'backtest' | 'replay' | 'compile';
  symbol?: string;
  timeframe?: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  barsProcessed?: number;
  plotsEmitted?: number;
  signalsEmitted?: number;
  webhookCount?: number;
  error?: string | null;
  metrics?: Record<string, unknown>;
  manifest?: Record<string, unknown> | null;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient().from('corespirit_execution_runs').insert({
    script_id: input.scriptId,
    version_id: input.versionId ?? null,
    deployment_id: input.deploymentId ?? null,
    user_id: user.id,
    execution_type: input.executionType,
    symbol: input.symbol ?? null,
    timeframe: input.timeframe ?? null,
    status: input.status,
    completed_at: input.status === 'running' ? null : new Date().toISOString(),
    bars_processed: input.barsProcessed ?? 0,
    plots_emitted: input.plotsEmitted ?? 0,
    signals_emitted: input.signalsEmitted ?? 0,
    webhook_count: input.webhookCount ?? 0,
    error: input.error ?? null,
    metrics: input.metrics ?? {},
    manifest: input.manifest ?? null,
  }).select('*').single();
  if (error) throw error;
  return data;
}
