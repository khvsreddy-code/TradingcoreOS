import { getSupabaseClient, isSupabaseConfigured } from './auth/supabaseClient';

const BLOCKED_KEY = /(?:supabase|fyers|upstox).*(?:token|secret|credential|password|private|api[_-]?key)|(?:access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|client[_-]?secret|api[_-]?secret|private[_-]?key|password|credential)/i;
const SETTINGS_OWNER_KEY = 'tc_user_settings_owner';
const INTERNAL_KEYS = new Set(['tc_user_settings_sync', SETTINGS_OWNER_KEY]);
const MANAGED_KEY = /^(tradingcore:|tradingcore_|tc_)/i;

function isManagedKey(key: string) {
  return MANAGED_KEY.test(key) && !INTERNAL_KEYS.has(key) && !BLOCKED_KEY.test(key);
}

function currentOwnerId(): string | null {
  try { return localStorage.getItem(SETTINGS_OWNER_KEY); } catch { return null; }
}

function setOwnerId(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(SETTINGS_OWNER_KEY, userId);
    else localStorage.removeItem(SETTINGS_OWNER_KEY);
  } catch { /* ignore storage failures */ }
}

function clearManagedLocalSettings(): void {
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && isManagedKey(key)) remove.push(key);
  }
  remove.forEach(key => { try { localStorage.removeItem(key); } catch { /* ignore */ } });
}

export function collectManagedSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !isManagedKey(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw.length > 200_000) continue;
      try { settings[key] = JSON.parse(raw); } catch { settings[key] = raw; }
    } catch { /* ignore unreadable browser storage entries */ }
  }
  return settings;
}

export function restoreManagedSettings(settings: Record<string, unknown>) {
  Object.entries(settings || {}).forEach(([key, value]) => {
    if (!isManagedKey(key)) return;
    try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* ignore quota/serialization errors */ }
  });
}

export const userSettingsService = {
  /**
   * Clear browser-side TradingCore preferences on account sign-out or before
   * switching accounts. This prevents a transient cloud failure from exposing
   * another user's workspace state.
   */
  clearLocal(): void {
    clearManagedLocalSettings();
    setOwnerId(null);
  },

  async load(userId: string): Promise<Record<string, unknown> | null> {
    if (!isSupabaseConfigured()) return null;

    // Account switching is an isolation boundary. Clear the old account's
    // browser state before making the new account's cloud request.
    if (currentOwnerId() !== userId) {
      clearManagedLocalSettings();
      setOwnerId(userId);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;

      // The cloud row is authoritative after a successful read.
      clearManagedLocalSettings();

      if (!data?.settings) {
        const emptySettings: Record<string, unknown> = {};
        const { error: seedError } = await supabase.from('user_settings').upsert(
          { user_id: userId, settings: emptySettings, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        if (seedError) throw seedError;
        return emptySettings;
      }

      restoreManagedSettings(data.settings as Record<string, unknown>);
      return data.settings as Record<string, unknown>;
    } catch (error) {
      // Do not clear same-user local state on a transient cloud outage; it can
      // still be persisted later. Cross-account state was already cleared above.
      console.warn('User settings load failed:', error);
      return null;
    }
  },

  async save(userId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    if (currentOwnerId() !== userId) return false;

    try {
      const supabase = getSupabaseClient();
      const settings = collectManagedSettings();
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, settings, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn('User settings save failed:', error);
      return false;
    }
  },

  startSync(userId: string, intervalMs = 5000): () => void {
    let last = '';
    let stopped = false;
    let syncing = false;

    const sync = async () => {
      if (stopped || syncing || currentOwnerId() !== userId) return;
      syncing = true;
      try {
        const current = JSON.stringify(collectManagedSettings());
        if (current === last) return;
        if (await this.save(userId)) last = current;
      } catch { /* best effort */ }
      finally { syncing = false; }
    };

    void sync();
    const timer = window.setInterval(sync, intervalMs);
    const onPageHide = () => { void this.save(userId); };

    window.addEventListener('pagehide', onPageHide);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
    };
  },
};
