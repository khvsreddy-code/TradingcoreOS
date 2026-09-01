import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { formatAuthError } from '../../auth/utils/authErrors';

export const authService = {
  /**
   * Initiate Google OAuth sign in flow
   */
  async signInWithGoogle(options?: { redirectTo?: string }): Promise<{ error?: string }> {
    if (!isSupabaseConfigured()) {
      return {
        error: 'Supabase project credentials are missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.',
      };
    }

    try {
      const supabase = getSupabaseClient();
      const configuredAppUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '');
      const redirectUrl = options?.redirectTo || configuredAppUrl || window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { error: formatAuthError(error) };
      }

      return {};
    } catch (err: any) {
      return { error: formatAuthError(err) };
    }
  },

  /**
   * Sign out the user securely
   */
  async signOut(): Promise<{ error?: string }> {
    if (!isSupabaseConfigured()) {
      return {};
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { error: formatAuthError(error) };
      }
      return {};
    } catch (err: any) {
      return { error: formatAuthError(err) };
    }
  },
};
