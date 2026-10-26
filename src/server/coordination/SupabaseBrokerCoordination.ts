import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseBrokerAdmission = Readonly<{ admitted: boolean; code: string; retryAfterMs: number }>;
type AdmissionInput = Readonly<{ gateKey: string; minIntervalMs: number; maxPerMinute: number; maxPerDay?: number; priority: 'interactive' | 'normal' | 'background' }>;
type AdmissionRpcResult = { admitted?: unknown; code?: unknown; retryAfterMs?: unknown };
type CoordinationMode = 'service-role' | 'shared-secret';
type CoordinationCredentials = Readonly<{
  url: string;
  key: string;
  mode: CoordinationMode;
  sharedSecret?: string;
}>;

let client: SupabaseClient | null = null;
let clientUrl = '';
let clientKey = '';
let clientMode: CoordinationMode | '' = '';
let clientSharedSecret = '';

/**
 * Prefer an isolated coordination-only project when configured. Its public API
 * key can call only the two secret-checked RPC wrappers; it cannot read the
 * service-role-protected gate table or call the underlying admission function.
 * The application's primary Supabase URL and service key remain untouched.
 */
function configuredCredentials(): CoordinationCredentials | null {
  const isolatedUrl = String(process.env.TCO_BROKER_COORDINATION_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (isolatedUrl) {
    const key = String(process.env.TCO_BROKER_COORDINATION_SUPABASE_KEY || '').trim();
    const sharedSecret = String(process.env.TCO_BROKER_COORDINATION_SHARED_SECRET || '').trim();
    // Do not silently fall back to the application's database if the dedicated
    // coordination configuration is incomplete: the quota gate must fail closed.
    if (!key || sharedSecret.length < 32) return null;
    return { url: isolatedUrl, key, mode: 'shared-secret', sharedSecret };
  }

  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  return url && key ? { url, key, mode: 'service-role' } : null;
}

function getCoordinationCredentialsAndClient(): { credentials: CoordinationCredentials; client: SupabaseClient } | null {
  const credentials = configuredCredentials();
  if (!credentials) return null;
  const sharedSecret = credentials.sharedSecret || '';
  if (
    !client ||
    clientUrl !== credentials.url ||
    clientKey !== credentials.key ||
    clientMode !== credentials.mode ||
    clientSharedSecret !== sharedSecret
  ) {
    clientUrl = credentials.url;
    clientKey = credentials.key;
    clientMode = credentials.mode;
    clientSharedSecret = sharedSecret;
    client = createClient(credentials.url, credentials.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return { credentials, client };
}

/** Server-only coordination client; never import this module into browser code. */
export function supabaseBrokerCoordinationConfigured(): boolean {
  return getCoordinationCredentialsAndClient() !== null;
}

export async function supabaseBrokerCoordinationHealthy(signal?: AbortSignal): Promise<boolean> {
  const configured = getCoordinationCredentialsAndClient();
  if (!configured) return false;
  const { credentials, client: db } = configured;
  try {
    const response = credentials.mode === 'shared-secret'
      ? await db.rpc('broker_coordination_health_secure', {
          p_shared_secret: credentials.sharedSecret,
        }).abortSignal(signal || AbortSignal.timeout(1_500))
      : await db.rpc('broker_coordination_health').abortSignal(signal || AbortSignal.timeout(1_500));
    return !response.error && response.data === true;
  } catch {
    return false;
  }
}

export async function admitSupabaseBrokerRequest(input: AdmissionInput, signal?: AbortSignal): Promise<SupabaseBrokerAdmission> {
  const configured = getCoordinationCredentialsAndClient();
  if (!configured) throw new Error('Shared Supabase Postgres coordination is not configured.');
  if (signal?.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });
  const { credentials, client: db } = configured;
  const params = {
    p_gate_key: input.gateKey,
    p_min_interval_ms: Math.max(0, Math.floor(input.minIntervalMs)),
    p_max_per_minute: Math.max(1, Math.floor(input.maxPerMinute)),
    p_max_per_day: input.maxPerDay == null ? null : Math.max(1, Math.floor(input.maxPerDay)),
    p_priority: input.priority,
  };
  const { data, error } = (credentials.mode === 'shared-secret'
    ? await db.rpc('admit_broker_request_secure', {
        ...params,
        p_shared_secret: credentials.sharedSecret,
      })
    : await db.rpc('admit_broker_request', params)
  ).abortSignal(signal || AbortSignal.timeout(2_000));
  if (error) throw new Error('Shared Postgres broker admission failed: ' + error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Shared Postgres broker admission returned an invalid response.');
  const result = data as AdmissionRpcResult;
  if (typeof result.admitted !== 'boolean' || typeof result.code !== 'string') throw new Error('Shared Postgres broker admission response is incomplete.');
  const retryAfterMs = Number(result.retryAfterMs);
  return Object.freeze({ admitted: result.admitted, code: result.code, retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, Math.floor(retryAfterMs)) : 0 });
}
