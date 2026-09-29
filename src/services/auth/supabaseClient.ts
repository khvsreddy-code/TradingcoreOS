import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const DEFAULT_URL = 'https://atoxvshsefhouadmunos.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_sba0Innnh-Ok2IybSLNGxQ__0xvkPeK';

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase is not configured.');

  supabaseInstance = createClient(supabaseUrl, supabaseKey, {
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
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_PUBLISHABLE_KEY;
  return Boolean(url && key && !url.includes('your-supabase-project') && !key.includes('your-supabase-anon-key'));
}
