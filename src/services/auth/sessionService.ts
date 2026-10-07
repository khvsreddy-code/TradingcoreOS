import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { Session as SupabaseSession, AuthChangeEvent } from '@supabase/supabase-js';
import { Session } from '../../auth/types';

const SESSION_TIMEOUT_MS = 2_500;
const RETRY_DELAYS_MS = [200, 600] as const;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), SESSION_TIMEOUT_MS);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const sessionService = {
  mapSupabaseSession(supabaseSession: SupabaseSession | null): Session | null {
    if (!supabaseSession) return null;
    return {
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at,
      user: { id: supabaseSession.user.id, email: supabaseSession.user.email },
    };
  },

  /**
   * Load the session Supabase has persisted for this browser.
   *
   * getSession() already refreshes an expired access token when possible.
   * We intentionally do not call refreshSession() again for a null result:
   * doing so doubles the network/auth work and can race refresh-token rotation.
   * Transient failures are retried, then surfaced as an auth-unavailable state
   * rather than being treated as a signed-out user.
   */
  async getSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) return { session: null, error: new Error('Supabase credentials not configured') };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt += 1) {
      try {
        const supabase = getSupabaseClient();
        const result = await withTimeout(supabase.auth.getSession(), 'Supabase session check timed out');
        if (result.error) throw result.error;
        return { session: result.data.session, error: null };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay != null) await wait(delay);
      }
    }

    return { session: null, error: lastError || new Error('Unable to restore Supabase session') };
  },

  async refreshSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) return { session: null, error: new Error('Supabase credentials not configured') };
    try {
      const supabase = getSupabaseClient();
      const result = await withTimeout(supabase.auth.refreshSession(), 'Supabase session refresh timed out');
      if (result.error) return { session: null, error: result.error };
      return { session: result.data.session, error: null };
    } catch (err: any) {
      return { session: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: SupabaseSession | null) => void): { unsubscribe: () => void } {
    if (!isSupabaseConfigured()) return { unsubscribe: () => {} };
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return { unsubscribe: () => subscription.unsubscribe() };
  },
};
