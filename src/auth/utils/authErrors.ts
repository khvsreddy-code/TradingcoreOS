export function formatAuthError(error: unknown): string {
  if (!error) return 'An unknown authentication error occurred.';

  const message = typeof error === 'string' ? error : (error as any)?.message || String(error);

  const lower = message.toLowerCase();

  if (lower.includes('popup') || lower.includes('blocked') || lower.includes('window.open')) {
    return 'Authentication popup was blocked by your browser. Please allow popups for this site and try again.';
  }

  if (lower.includes('cancel') || lower.includes('closed') || lower.includes('user_cancelled')) {
    return 'Sign-in request was cancelled. Click "Sign in with Google" to try again.';
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Network connection failed. Please check your internet connection and try again.';
  }

  if (lower.includes('placeholder') || lower.includes('invalid_api_key') || lower.includes('not configured')) {
    return 'Supabase project credentials are not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  }

  if (lower.includes('jwt expired') || lower.includes('session expired') || lower.includes('invalid_grant')) {
    return 'Your session has expired. Please sign in again with Google.';
  }

  if (lower.includes('provider') || lower.includes('disabled')) {
    return 'Google OAuth provider is disabled in your Supabase project settings.';
  }

  return message || 'Authentication failed. Please try again.';
}
