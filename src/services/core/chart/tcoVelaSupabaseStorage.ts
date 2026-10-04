import type { VelaStorage } from './velaChartFacade';
import { getSupabaseClient } from '../../auth/supabaseClient';

const LOCAL_PREFIX = 'tradingcore:vela:fallback:';

async function currentUserId(): Promise<string | null> {
  try { return (await getSupabaseClient().auth.getUser()).data.user?.id ?? null; } catch { return null; }
}

function localGet(key: string): string | null { try { return localStorage.getItem(LOCAL_PREFIX + key); } catch { return null; } }
function localSet(key: string, value: string): void { try { localStorage.setItem(LOCAL_PREFIX + key, value); } catch {} }

export function createTcoVelaSupabaseStorage(broker = 'fyers'): VelaStorage {
  return {
    async get(key) {
      const id = await currentUserId();
      if (!id) return localGet(key);
      try {
        const { data, error } = await getSupabaseClient().from('workspace_layouts')
          .select('snapshot').eq('user_id', id).eq('broker', broker).maybeSingle();
        if (error || !data?.snapshot) return localGet(key);
        return JSON.stringify(data.snapshot);
      } catch { return localGet(key); }
    },
    async set(key, value) {
      localSet(key, value);
      const id = await currentUserId();
      if (!id) return;
      try {
        const snapshot = JSON.parse(value) as Record<string, unknown>;
        await getSupabaseClient().from('workspace_layouts').upsert({
          user_id: id, broker, layout: typeof snapshot.layout === 'string' ? snapshot.layout : null,
          snapshot, updated_at: new Date().toISOString(),
        });
      } catch {}
    },
    async remove(key) {
      try { localStorage.removeItem(LOCAL_PREFIX + key); } catch {}
      const id = await currentUserId();
      if (!id) return;
      try { await getSupabaseClient().from('workspace_layouts').delete().eq('user_id', id).eq('broker', broker); } catch {}
    },
  };
}

export async function loadTcoVelaDefaults(): Promise<{ layout?: string; timeframe?: string }> {
  const id = await currentUserId();
  if (!id) return {};
  try {
    const { data, error } = await getSupabaseClient().from('user_preferences')
      .select('default_layout,default_timeframe').eq('user_id', id).maybeSingle();
    if (error || !data) return {};
    return {
      layout: typeof data.default_layout === 'string' ? data.default_layout : undefined,
      timeframe: typeof data.default_timeframe === 'string' ? data.default_timeframe : undefined,
    };
  } catch { return {}; }
}

export async function loadTcoVelaJournal(): Promise<string | null> {
  const id = await currentUserId();
  if (!id) return localGet('journal');
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error || !data?.settings || typeof data.settings !== 'object') return localGet('journal');
    const value = (data.settings as Record<string, unknown>).journal;
    return typeof value === 'string' ? value : localGet('journal');
  } catch { return localGet('journal'); }
}

export async function saveTcoVelaJournal(note: string): Promise<void> {
  localSet('journal', note);
  const id = await currentUserId();
  if (!id) return;
  try {
    const client = getSupabaseClient();
    const existing = await client.from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    const base = existing.data?.settings && typeof existing.data.settings === 'object' ? existing.data.settings as Record<string, unknown> : {};
    await client.from('user_settings').upsert({ user_id: id, settings: { ...base, journal: note }, updated_at: new Date().toISOString() });
  } catch {}
}
