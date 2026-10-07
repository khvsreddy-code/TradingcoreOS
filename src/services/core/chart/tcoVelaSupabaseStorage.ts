import type { VelaStorage } from './velaChartFacade';
import { getSupabaseClient } from '../../auth/supabaseClient';

const LOCAL_PREFIX = 'tradingcore:vela:fallback:';

async function currentUserId(): Promise<string | null> {
  try { return (await getSupabaseClient().auth.getUser()).data.user?.id ?? null; } catch { return null; }
}

type BrokerScope = string | (() => string | null | undefined);

function resolveBroker(scope: BrokerScope): string {
  const value = typeof scope === 'function' ? scope() : scope;
  return String(value || 'fyers').trim().toLowerCase();
}

function localKey(broker: string, key: string): string {
  return `${LOCAL_PREFIX}${broker}:${key}`;
}

function localGet(broker: string, key: string): string | null {
  try { return localStorage.getItem(localKey(broker, key)) ?? localStorage.getItem(LOCAL_PREFIX + key); } catch { return null; }
}

function localSet(broker: string, key: string, value: string): void {
  try { localStorage.setItem(localKey(broker, key), value); } catch {}
}

function journalLocalGet(): string | null {
  try { return localStorage.getItem(LOCAL_PREFIX + 'journal') ?? null; } catch { return null; }
}
function journalLocalSet(value: string): void {
  try { localStorage.setItem(LOCAL_PREFIX + 'journal', value); } catch {}
}

export function createTcoVelaSupabaseStorage(brokerScope: BrokerScope = 'fyers'): VelaStorage {
  return {
    async get(key) {
      const broker = resolveBroker(brokerScope);
      const id = await currentUserId();
      if (!id) return localGet(broker, key);
      try {
        const { data, error } = await getSupabaseClient().from('workspace_layouts')
          .select('snapshot').eq('user_id', id).eq('broker', broker).maybeSingle();
        if (error || !data?.snapshot) return localGet(broker, key);
        return JSON.stringify(data.snapshot);
      } catch { return localGet(broker, key); }
    },
    async set(key, value) {
      const broker = resolveBroker(brokerScope);
      localSet(broker, key, value);
      const id = await currentUserId();
      if (!id) return;
      try {
        const snapshot = JSON.parse(value) as Record<string, unknown>;
        await getSupabaseClient().from('workspace_layouts').upsert({
          user_id: id, broker,
          layout: typeof snapshot.layout === 'string' ? snapshot.layout : null,
          snapshot,
          updated_at: new Date().toISOString(),
        });
      } catch {}
    },
    async remove(key) {
      const broker = resolveBroker(brokerScope);
      const id = await currentUserId();
      try {
        localStorage.removeItem(localKey(broker, key));
        localStorage.removeItem(LOCAL_PREFIX + key);
      } catch {}
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
  if (!id) return journalLocalGet();
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error || !data?.settings || typeof data.settings !== 'object') return journalLocalGet();
    const value = (data.settings as Record<string, unknown>).journal;
    return typeof value === 'string' ? value : journalLocalGet();
  } catch { return journalLocalGet(); }
}

export async function saveTcoVelaJournal(note: string): Promise<void> {
  journalLocalSet(note);
  const id = await currentUserId();
  if (!id) return;
  try {
    const client = getSupabaseClient();
    const existing = await client.from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    const base = existing.data?.settings && typeof existing.data.settings === 'object' ? existing.data.settings as Record<string, unknown> : {};
    await client.from('user_settings').upsert({ user_id: id, settings: { ...base, journal: note }, updated_at: new Date().toISOString() });
  } catch {}
}
