import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseBrokerAdmission = Readonly<{ admitted: boolean; code: string; retryAfterMs: number }>;
type AdmissionInput = Readonly<{ gateKey: string; minIntervalMs: number; maxPerMinute: number; maxPerDay?: number; priority: 'interactive' | 'normal' | 'background' }>;
type AdmissionRpcResult = { admitted?: unknown; code?: unknown; retryAfterMs?: unknown };

let client: SupabaseClient | null = null;
let clientUrl = '';
let clientKey = '';

function configuredCredentials(): { url: string; key: string } | null {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  return url && key ? { url, key } : null;
}

function getCoordinationClient(): SupabaseClient | null {
  const credentials = configuredCredentials();
  if (!credentials) return null;
  if (!client || clientUrl !== credentials.url || clientKey !== credentials.key) {
    clientUrl = credentials.url;
    clientKey = credentials.key;
    client = createClient(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Server-only service-role RPC client; do not import this module into browser code. */
export function supabaseBrokerCoordinationConfigured(): boolean {
  return getCoordinationClient() !== null;
}

export async function supabaseBrokerCoordinationHealthy(signal?: AbortSignal): Promise<boolean> {
  const db = getCoordinationClient();
  if (!db) return false;
  try {
    const response = await db.rpc('broker_coordination_health').abortSignal(signal || AbortSignal.timeout(1_500));
    return !response.error && response.data === true;
  } catch {
    return false;
  }
}

export async function admitSupabaseBrokerRequest(input: AdmissionInput, signal?: AbortSignal): Promise<SupabaseBrokerAdmission> {
  const db = getCoordinationClient();
  if (!db) throw new Error('Shared Supabase Postgres coordination is not configured.');
  if (signal?.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });
  const { data, error } = await db.rpc('admit_broker_request', {
    p_gate_key: input.gateKey,
    p_min_interval_ms: Math.max(0, Math.floor(input.minIntervalMs)),
    p_max_per_minute: Math.max(1, Math.floor(input.maxPerMinute)),
    p_max_per_day: input.maxPerDay == null ? null : Math.max(1, Math.floor(input.maxPerDay)),
    p_priority: input.priority,
  }).abortSignal(signal || AbortSignal.timeout(2_000));
  if (error) throw new Error('Shared Postgres broker admission failed: ' + error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Shared Postgres broker admission returned an invalid response.');
  const result = data as AdmissionRpcResult;
  if (typeof result.admitted !== 'boolean' || typeof result.code !== 'string') throw new Error('Shared Postgres broker admission response is incomplete.');
  const retryAfterMs = Number(result.retryAfterMs);
  return Object.freeze({ admitted: result.admitted, code: result.code, retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, Math.floor(retryAfterMs)) : 0 });
}
