import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { Session as SupabaseSession, AuthChangeEvent } from '@supabase/supabase-js';
import { Session } from '../../auth/types';

export const sessionService = {
  /**
   * Helper to map Supabase Session to decoupled Session type
   */
  mapSupabaseSession(supabaseSession: SupabaseSession | null): Session | null {
    if (!supabaseSession) return null;
    return {
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at,
      user: {
        id: supabaseSession.user.id,
        email: supabaseSession.user.email,
      },
    };
  },

  /**
   * Get the current active session
   */
  async getSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { session: null, error: new Error('Supabase credentials not configured') };
    }

    try {
      const supabase = getSupabaseClient();
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Supabase session check timed out')), 5000)),
      ]);
      const { data, error } = result;
      if (error) return { session: null, error };
      return { session: data.session, error: null };
    } catch (err: any) {
      return { session: null, error: err };
    }
  },

  /**
   * Refresh the active session
   */
  async refreshSession(): Promise<{ session: SupabaseSession | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { session: null, error: new Error('Supabase credentials not configured') };
    }

    try {
      const supabase = getSupabaseClient();
      const result = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Supabase session refresh timed out')), 5000)),
      ]);
      const { data, error } = result;
      if (error) return { session: null, error };
      return { session: data.session, error: null };
    } catch (err: any) {
      return { session: null, error: err };
    }
  },

  /**
   * Subscribe to authentication state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
   */
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: SupabaseSession | null) => void
  ): { unsubscribe: () => void } {
    if (!isSupabaseConfigured()) {
      return { unsubscribe: () => {} };
    }

    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);

    return {
      unsubscribe: () => {
        subscription.unsubscribe();
      },
    };
  },
};
