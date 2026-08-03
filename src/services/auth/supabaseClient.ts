import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const isValidUrl =
    supabaseUrl &&
    !supabaseUrl.includes('your-supabase-project') &&
    (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'));

  const isValidKey =
    supabaseAnonKey &&
    !supabaseAnonKey.includes('your-supabase-anon-key');

  if (!isValidUrl || !isValidKey) {
    // Return a dummy client or throw a structured error handled by auth services
    // For clean creation, we create a fallback client pointing to local domain if needed,
    // or create client with provided strings and catch network/auth errors cleanly.
    // However createClient requires valid URL format string
    const fallbackUrl = isValidUrl ? supabaseUrl : 'https://placeholder-project.supabase.co';
    const fallbackKey = isValidKey ? supabaseAnonKey : 'placeholder-anon-key';
    
    supabaseInstance = createClient(fallbackUrl, fallbackKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseInstance;
  }

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
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return (
    Boolean(url) &&
    !url.includes('your-supabase-project') &&
    Boolean(key) &&
    !key.includes('your-supabase-anon-key')
  );
}
