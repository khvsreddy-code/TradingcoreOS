import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const DEFAULT_URL = '';
const DEFAULT_ANON_KEY = '';

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const supabaseUrl = rawUrl || DEFAULT_URL;
  const supabaseAnonKey = rawKey || DEFAULT_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  return (
    Boolean(url) &&
    !url.includes('your-supabase-project') &&
    Boolean(key) &&
    !key.includes('your-supabase-anon-key')
  );
}
