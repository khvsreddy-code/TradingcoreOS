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

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch') || lower.includes('timeout')) {
    return 'TradingCore could not reach the authentication service. Your saved session was not cleared. Check your connection and retry.';
  }

  if (
    lower.includes('placeholder') ||
    lower.includes('invalid_api_key') ||
    lower.includes('not configured') ||
    lower.includes('supabase is not configured')
  ) {
    return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.';
  }

  if (lower.includes('jwt expired') || lower.includes('session expired') || lower.includes('invalid_grant')) {
    return 'Your authentication session has expired or been revoked. Please sign in again with Google.';
  }

  if (lower.includes('provider') || lower.includes('disabled')) {
    return 'Google OAuth is disabled or unavailable in the Supabase project configuration.';
  }

  return message || 'Authentication failed. Please try again.';
}
