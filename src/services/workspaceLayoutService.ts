import { getSupabaseClient, isSupabaseConfigured } from './auth/supabaseClient';

export type WorkspaceSnapshot = {
  version: 1;
  savedAt: string;
  name?: string;
  broker: string;
  layout: string;
  watch: unknown[];
  selected: string;
  focused: number;
  slotKeys: string[];
  chartStates: Record<string, unknown>;
  settings?: Record<string, unknown>;
  panel?: string | null;
  order?: unknown;
};

export type SavedWorkspaceLayout = WorkspaceSnapshot & { id: string; name: string };

const WORKSPACE_KEY = (broker: string) => `tradingcore:workspace:v1:${broker}`;
const SAVED_KEY = 'tradingcore:workspace:saved:v1';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort */ }
}

export function loadWorkspace<T extends Partial<WorkspaceSnapshot>>(broker: string, fallback: T): T {
  return { ...fallback, ...read<Partial<WorkspaceSnapshot>>(WORKSPACE_KEY(broker), {}) } as T;
}

export function saveWorkspace(broker: string, snapshot: WorkspaceSnapshot) {
  write(WORKSPACE_KEY(broker), snapshot);
  window.dispatchEvent(new CustomEvent('tradingcore:workspace-saved', { detail: snapshot }));
}

export function listSavedWorkspaceLayouts(): SavedWorkspaceLayout[] {
  return read<SavedWorkspaceLayout[]>(SAVED_KEY, []);
}

export function saveNamedWorkspaceLayout(name: string, snapshot: WorkspaceSnapshot): SavedWorkspaceLayout {
  const clean = name.trim().slice(0, 48) || 'TradingCoreOS Layout';
  const item: SavedWorkspaceLayout = { ...snapshot, id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: clean };
  const all = [item, ...listSavedWorkspaceLayouts().filter(x => x.name.toLowerCase() !== clean.toLowerCase())].slice(0, 20);
  write(SAVED_KEY, all);
  window.dispatchEvent(new CustomEvent('tradingcore:workspace-library-changed', { detail: all }));
  return item;
}

export function deleteNamedWorkspaceLayout(id: string) {
  const next = listSavedWorkspaceLayouts().filter(x => x.id !== id);
  write(SAVED_KEY, next);
  window.dispatchEvent(new CustomEvent('tradingcore:workspace-library-changed', { detail: next }));
}

export async function persistWorkspaceToCloud(userId: string, snapshot: WorkspaceSnapshot): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseClient();
    const { error } = await sb.from('workspace_layouts').upsert({
      user_id: userId,
      broker: snapshot.broker,
      layout: snapshot.layout,
      snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,broker' });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Workspace cloud save failed:', error);
    return false;
  }
}

export async function loadWorkspaceFromCloud(userId: string, broker: string): Promise<WorkspaceSnapshot | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from('workspace_layouts').select('snapshot').eq('user_id', userId).eq('broker', broker).maybeSingle();
    if (error) throw error;
    return (data?.snapshot as WorkspaceSnapshot | null) || null;
  } catch (error) {
    console.warn('Workspace cloud load failed:', error);
    return null;
  }
}
