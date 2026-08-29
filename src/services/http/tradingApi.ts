import { getSupabaseClient } from '../auth/supabaseClient';

export async function tradingApi(path: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await getSupabaseClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sign in to TradingCore before connecting a broker.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...options, headers });
}
