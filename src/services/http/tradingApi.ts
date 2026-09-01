import { getSupabaseClient } from '../auth/supabaseClient';

/** Authenticated API helper. Refreshes an expired Supabase session once before failing. */
export async function tradingApi(path: string, options: RequestInit = {}): Promise<Response> {
  const supabase = getSupabaseClient();
  let { data } = await supabase.auth.getSession();
  let session = data.session;

  if (!session?.access_token || (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000)) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
    if (refreshed.error || !session?.access_token) {
      throw new Error('Your TradingCore login session expired. Please sign in again.');
    }
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
}
