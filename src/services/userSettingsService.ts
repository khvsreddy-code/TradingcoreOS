import { getSupabaseClient, isSupabaseConfigured } from './auth/supabaseClient';

const BLOCKED_KEY = /(?:supabase|fyers|upstox).*(?:token|secret|credential|password|private|api[_-]?key)|(?:access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|client[_-]?secret|api[_-]?secret|private[_-]?key|password|credential)/i;
const INTERNAL_KEYS = new Set(['tc_user_settings_sync']);
const MANAGED_KEY = /^(tradingcore:|tradingcore_|tc_)/i;

function isManagedKey(key: string) { return MANAGED_KEY.test(key) && !INTERNAL_KEYS.has(key) && !BLOCKED_KEY.test(key); }

function clearManagedLocalSettings() {
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
  async load(userId: string): Promise<Record<string, unknown> | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('user_settings').select('settings').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      // Never let a previous signed-in user leak workspace state into another account.
      clearManagedLocalSettings();
      if (!data?.settings) return null;
      restoreManagedSettings(data.settings as Record<string, unknown>);
      return data.settings as Record<string, unknown>;
    } catch (error) {
      console.warn('User settings load failed:', error);
      return null;
    }
  },

  async save(userId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const settings = collectManagedSettings();
      const { error } = await supabase.from('user_settings').upsert({ user_id: userId, settings }, { onConflict: 'user_id' });
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
    const sync = async () => {
      if (stopped) return;
      try {
        const current = JSON.stringify(collectManagedSettings());
        if (current === last) return;
        if (await this.save(userId)) last = current;
      } catch { /* best effort */ }
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
