import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { Session as SupabaseSession, AuthChangeEvent } from '@supabase/supabase-js';
import { Session } from '../../auth/types';

const SESSION_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), SESSION_TIMEOUT_MS)),
  ]);
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
   * Get the persisted Supabase session. A transient network delay must not be
   * interpreted as a logout; if the cached access token is expired we attempt a
   * refresh before returning an unauthenticated result.
   */
  async getSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) return { session: null, error: new Error('Supabase credentials not configured') };
    try {
      const supabase = getSupabaseClient();
      const result = await withTimeout(supabase.auth.getSession(), 'Supabase session check timed out');
      if (result.error) return { session: null, error: result.error };
      if (result.data.session) return { session: result.data.session, error: null };

      const refreshed = await withTimeout(supabase.auth.refreshSession(), 'Supabase session refresh timed out');
      if (refreshed.error) return { session: null, error: refreshed.error };
      return { session: refreshed.data.session, error: null };
    } catch (err: any) {
      return { session: null, error: err };
    }
  },

  async refreshSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) return { session: null, error: new Error('Supabase credentials not configured') };
    try {
      const supabase = getSupabaseClient();
      const result = await withTimeout(supabase.auth.refreshSession(), 'Supabase session refresh timed out');
      if (result.error) return { session: null, error: result.error };
      return { session: result.data.session, error: null };
    } catch (err: any) {
      return { session: null, error: err };
    }
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: SupabaseSession | null) => void): { unsubscribe: () => void } {
    if (!isSupabaseConfigured()) return { unsubscribe: () => {} };
    const supabase = getSupabaseClient();
    // Supabase auth callbacks run inside the auth lock. Defer all application
    // async work until the callback returns so profile/settings/network calls
    // cannot deadlock the auth state machine.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      queueMicrotask(() => callback(event, session));
    });
    return { unsubscribe: () => subscription.unsubscribe() };
  },
};
