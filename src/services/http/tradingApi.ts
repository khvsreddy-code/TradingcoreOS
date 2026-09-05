import { getSupabaseClient } from '../auth/supabaseClient';
import type { Session as SupabaseSession } from '@supabase/supabase-js';

let cachedSession: SupabaseSession | null | undefined;
let refreshPromise: Promise<SupabaseSession | null> | undefined;

function ensureSessionListener() {
  const supabase = getSupabaseClient();
  if (cachedSession !== undefined) return;
  cachedSession = null;
  supabase.auth.onAuthStateChange((_event, session) => { cachedSession = session; });
}

async function getFastSession(): Promise<SupabaseSession | null> {
  ensureSessionListener();
  const supabase = getSupabaseClient();
  if (cachedSession && (!cachedSession.expires_at || cachedSession.expires_at * 1000 > Date.now() + 30_000)) return cachedSession;
  if (!refreshPromise) {
    refreshPromise = supabase.auth.getSession().then(({ data }) => data.session).then(async (session) => {
      if (session && (!session.expires_at || session.expires_at * 1000 > Date.now() + 30_000)) { cachedSession = session; return session; }
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      cachedSession = refreshed.data.session;
      return cachedSession;
    }).finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
}

/** Authenticated API helper. Reuses the in-memory session and refreshes only when necessary. */
export async function tradingApi(path: string, options: RequestInit = {}): Promise<Response> {
  const session = await getFastSession();
  if (!session?.access_token) throw new Error('Your TradingCore login session expired. Please sign in again.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
}
