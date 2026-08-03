import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const DEFAULT_URL = 'https://ebipptifbihjxejtxlsm.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViaXBwdGlmYmloanhlanR4bHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NDAzMTIsImV4cCI6MjEwMTMxNjMxMn0.HYJwMZg_s4iOJFQmrC-lLvvmrtExq35Nt2vJEnegAPw';

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const supabaseUrl = (rawUrl && !rawUrl.includes('your-supabase-project')) ? rawUrl : DEFAULT_URL;
  const supabaseAnonKey = (rawKey && !rawKey.includes('your-supabase-anon-key')) ? rawKey : DEFAULT_ANON_KEY;

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
