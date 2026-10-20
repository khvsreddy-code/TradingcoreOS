import type { VelaStorage } from './velaChartFacade';
import { getSupabaseClient } from '../../auth/supabaseClient';

const LOCAL_PREFIX = 'tradingcore:vela:fallback:';
const LOCAL_APPEARANCE_KEY = 'tradingcore:vela:appearance:v1';
const LOCAL_SAVED_WORKSPACES_PREFIX = 'tradingcore:vela:saved-workspaces:v1:';
const APPEARANCE_SETTINGS_KEY = 'tradingcoreVelaAppearance';
const SAVED_WORKSPACES_SETTINGS_KEY = 'tradingcoreVelaSavedWorkspaces';
const ACTIVE_WORKSPACE_SETTINGS_KEY = 'tradingcoreVelaActiveWorkspace';
const WORKSPACE_SNAPSHOT_LIMIT = 20;

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

type UserSettings = Record<string, unknown>;
let settingsMutationQueue: Promise<unknown> = Promise.resolve();

/** Serialize read/modify/write operations against user_settings so journal edits, theme
 * preferences and saved layouts cannot silently overwrite one another. */
async function mutateUserSettings(mutator: (settings: UserSettings) => UserSettings): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const id = await currentUserId();
    if (!id) return false;
    const client = getSupabaseClient();
    const existing = await client.from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (existing.error) throw existing.error;
    const base = existing.data?.settings && typeof existing.data.settings === 'object' && !Array.isArray(existing.data.settings)
      ? existing.data.settings as UserSettings : {};
    const settings = mutator(base);
    const result = await client.from('user_settings').upsert({
      user_id: id,
      settings,
      updated_at: new Date().toISOString(),
    });
    if (result.error) throw result.error;
    return true;
  };
  const queued = settingsMutationQueue.then(run, run);
  settingsMutationQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export interface TcoSavedWorkspace {
  id: string;
  name: string;
  updatedAt: string;
  snapshot: unknown;
}

function normalizeSavedWorkspaces(value: unknown): TcoSavedWorkspace[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, TcoSavedWorkspace>();
  for (const candidate of value) {
    const raw = objectRecord(candidate);
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) continue;
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.snapshot == null || typeof raw.snapshot !== 'object') continue;
    const updatedAt = typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt))
      ? raw.updatedAt : new Date(0).toISOString();
    byId.set(raw.id, {
      id: raw.id,
      name: raw.name.trim().slice(0, 80),
      updatedAt,
      snapshot: raw.snapshot,
    });
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, WORKSPACE_SNAPSHOT_LIMIT);
}

function localSavedWorkspacesKey(broker: string): string {
  return LOCAL_SAVED_WORKSPACES_PREFIX + broker;
}

function readLocalSavedWorkspaces(broker: string): TcoSavedWorkspace[] {
  try { return normalizeSavedWorkspaces(JSON.parse(localStorage.getItem(localSavedWorkspacesKey(broker)) || '[]')); } catch { return []; }
}

function writeLocalSavedWorkspaces(broker: string, workspaces: TcoSavedWorkspace[]): void {
  try { localStorage.setItem(localSavedWorkspacesKey(broker), JSON.stringify(normalizeSavedWorkspaces(workspaces))); } catch {}
}

function mergeSavedWorkspaces(...groups: TcoSavedWorkspace[][]): TcoSavedWorkspace[] {
  const byId = new Map<string, TcoSavedWorkspace>();
  for (const group of groups) for (const item of group) {
    const existing = byId.get(item.id);
    if (!existing || Date.parse(item.updatedAt) >= Date.parse(existing.updatedAt)) byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, WORKSPACE_SNAPSHOT_LIMIT);
}

function localActiveWorkspaceKey(broker: string): string {
  return 'tradingcore:vela:active-saved-workspace:v1:' + broker;
}

export async function loadTcoVelaActiveWorkspaceId(brokerScope: BrokerScope = 'fyers'): Promise<string | null> {
  const broker = resolveBroker(brokerScope);
  let local: string | null = null;
  try { local = localStorage.getItem(localActiveWorkspaceKey(broker)); } catch {}
  const id = await currentUserId();
  if (!id) return local;
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error) return local;
    const settings = objectRecord(data?.settings);
    const active = objectRecord(settings?.[ACTIVE_WORKSPACE_SETTINGS_KEY]);
    const cloud = typeof active?.[broker] === 'string' && active[broker] ? String(active[broker]) : null;
    if (cloud) {
      try { localStorage.setItem(localActiveWorkspaceKey(broker), cloud); } catch {}
      return cloud;
    }
    return local;
  } catch { return local; }
}

export async function saveTcoVelaActiveWorkspaceId(idToSet: string | null, brokerScope: BrokerScope = 'fyers'): Promise<boolean> {
  const broker = resolveBroker(brokerScope);
  const normalizedId = typeof idToSet === 'string' ? idToSet.trim().slice(0, 160) : '';
  try {
    if (normalizedId) localStorage.setItem(localActiveWorkspaceKey(broker), normalizedId);
    else localStorage.removeItem(localActiveWorkspaceKey(broker));
  } catch {}
  try {
    return await mutateUserSettings((settings) => {
      const active = { ...(objectRecord(settings[ACTIVE_WORKSPACE_SETTINGS_KEY]) ?? {}) };
      if (normalizedId) active[broker] = normalizedId;
      else delete active[broker];
      const next = { ...settings };
      if (Object.keys(active).length) next[ACTIVE_WORKSPACE_SETTINGS_KEY] = active;
      else delete next[ACTIVE_WORKSPACE_SETTINGS_KEY];
      return next;
    });
  } catch { return false; }
}

export async function loadTcoVelaSavedWorkspaces(brokerScope: BrokerScope = 'fyers'): Promise<TcoSavedWorkspace[]> {
  const broker = resolveBroker(brokerScope);
  const local = readLocalSavedWorkspaces(broker);
  const id = await currentUserId();
  if (!id) return local;
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error) return local;
    const settings = objectRecord(data?.settings);
    const byBroker = objectRecord(settings?.[SAVED_WORKSPACES_SETTINGS_KEY]);
    const cloud = normalizeSavedWorkspaces(byBroker?.[broker]);
    const merged = mergeSavedWorkspaces(cloud, local);
    writeLocalSavedWorkspaces(broker, merged);
    return merged;
  } catch { return local; }
}

export async function saveTcoVelaSavedWorkspace(
  entry: TcoSavedWorkspace,
  brokerScope: BrokerScope = 'fyers',
): Promise<boolean> {
  const broker = resolveBroker(brokerScope);
  const local = mergeSavedWorkspaces([entry], readLocalSavedWorkspaces(broker).filter((item) => item.id !== entry.id));
  writeLocalSavedWorkspaces(broker, local);
  try {
    return await mutateUserSettings((settings) => {
      const root = objectRecord(settings[SAVED_WORKSPACES_SETTINGS_KEY]) ?? {};
      const cloud = normalizeSavedWorkspaces(root[broker]);
      const next = mergeSavedWorkspaces([entry], cloud.filter((item) => item.id !== entry.id), local);
      root[broker] = next;
      writeLocalSavedWorkspaces(broker, next);
      return { ...settings, [SAVED_WORKSPACES_SETTINGS_KEY]: root };
    });
  } catch { return false; }
}

export async function deleteTcoVelaSavedWorkspace(idToRemove: string, brokerScope: BrokerScope = 'fyers'): Promise<boolean> {
  const broker = resolveBroker(brokerScope);
  const local = readLocalSavedWorkspaces(broker).filter((item) => item.id !== idToRemove);
  writeLocalSavedWorkspaces(broker, local);
  try {
    return await mutateUserSettings((settings) => {
      const root = objectRecord(settings[SAVED_WORKSPACES_SETTINGS_KEY]) ?? {};
      const cloud = normalizeSavedWorkspaces(root[broker]).filter((item) => item.id !== idToRemove);
      root[broker] = cloud;
      writeLocalSavedWorkspaces(broker, cloud);
      return { ...settings, [SAVED_WORKSPACES_SETTINGS_KEY]: root };
    });
  } catch { return false; }
}

let pendingAppearance: unknown = undefined;
let appearanceSyncTimer: ReturnType<typeof setTimeout> | null = null;

function localAppearanceGet(): unknown | null {
  try {
    const raw = localStorage.getItem(LOCAL_APPEARANCE_KEY);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch { return null; }
}

export async function loadTcoVelaAppearance(): Promise<unknown | null> {
  const local = localAppearanceGet();
  const id = await currentUserId();
  if (!id) return local;
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error) return local;
    const settings = objectRecord(data?.settings);
    const cloud = objectRecord(settings?.[APPEARANCE_SETTINGS_KEY]);
    if (!cloud) return local;
    try { localStorage.setItem(LOCAL_APPEARANCE_KEY, JSON.stringify(cloud)); } catch {}
    return cloud;
  } catch { return local; }
}

/** Persist locally immediately; coalesce rapid native color-picker input events into one cloud write. */
export function saveTcoVelaAppearance(appearance: unknown): void {
  pendingAppearance = appearance;
  try { localStorage.setItem(LOCAL_APPEARANCE_KEY, JSON.stringify(appearance)); } catch {}
  if (appearanceSyncTimer !== null) clearTimeout(appearanceSyncTimer);
  appearanceSyncTimer = setTimeout(() => { void flushTcoVelaAppearance(); }, 700);
}

export async function flushTcoVelaAppearance(): Promise<boolean> {
  if (appearanceSyncTimer !== null) clearTimeout(appearanceSyncTimer);
  appearanceSyncTimer = null;
  const appearance = pendingAppearance !== undefined ? pendingAppearance : localAppearanceGet();
  pendingAppearance = undefined;
  if (appearance == null) return false;
  try {
    return await mutateUserSettings((settings) => ({ ...settings, [APPEARANCE_SETTINGS_KEY]: appearance }));
  } catch { return false; }
}

type WorkspaceWrite = { sequence: number; broker: string; id: string; snapshot: string };
const workspaceWriteSequence = new Map<string, number>();
const pendingWorkspaceWrites = new Map<string, WorkspaceWrite>();
const activeWorkspaceWrites = new Map<string, Promise<void>>();

async function writeWorkspaceSnapshotCloud(item: WorkspaceWrite, queueKey: string): Promise<void> {
  pendingWorkspaceWrites.set(queueKey, item);
  const active = activeWorkspaceWrites.get(queueKey);
  if (active) return active.then(() => pendingWorkspaceWrites.has(queueKey) ? drainWorkspaceSnapshotWrites(queueKey) : undefined);
  return drainWorkspaceSnapshotWrites(queueKey);
}

function drainWorkspaceSnapshotWrites(queueKey: string): Promise<void> {
  const active = activeWorkspaceWrites.get(queueKey);
  if (active) return active.then(() => pendingWorkspaceWrites.has(queueKey) ? drainWorkspaceSnapshotWrites(queueKey) : undefined);
  const run = (async () => {
    while (pendingWorkspaceWrites.has(queueKey)) {
      const item = pendingWorkspaceWrites.get(queueKey)!;
      pendingWorkspaceWrites.delete(queueKey);
      const client = getSupabaseClient();
      const snapshot = JSON.parse(item.snapshot) as Record<string, unknown>;
      const result = await client.from('workspace_layouts').upsert({
        user_id: item.id,
        broker: item.broker,
        layout: typeof snapshot.layout === 'string' ? snapshot.layout : null,
        snapshot,
        updated_at: new Date().toISOString(),
      });
      if (result.error) throw result.error;
    }
  })();
  activeWorkspaceWrites.set(queueKey, run);
  return run.then(
    async () => {
      if (activeWorkspaceWrites.get(queueKey) === run) activeWorkspaceWrites.delete(queueKey);
      if (pendingWorkspaceWrites.has(queueKey)) await drainWorkspaceSnapshotWrites(queueKey);
    },
    (error) => {
      if (activeWorkspaceWrites.get(queueKey) === run) activeWorkspaceWrites.delete(queueKey);
      pendingWorkspaceWrites.delete(queueKey);
      throw error;
    },
  );
}

export function createTcoVelaSupabaseStorage(brokerScope: BrokerScope = 'fyers'): VelaStorage {
  const requestSequenceKey = () => `${resolveBroker(brokerScope)}:tradingcore-live-vela-v5`;
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
      const requestKey = requestSequenceKey();
      const sequence = (workspaceWriteSequence.get(requestKey) ?? 0) + 1;
      workspaceWriteSequence.set(requestKey, sequence);
      const id = await currentUserId();
      if (!id || workspaceWriteSequence.get(requestKey) !== sequence) return;
      const queueKey = `${id}:${requestKey}`;
      await writeWorkspaceSnapshotCloud({ sequence, broker, id, snapshot: value }, queueKey);
    },
    async remove(key) {
      const broker = resolveBroker(brokerScope);
      try {
        localStorage.removeItem(localKey(broker, key));
        localStorage.removeItem(LOCAL_PREFIX + key);
      } catch {}
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
  if (!id) return journalLocalGet();
  try {
    const { data, error } = await getSupabaseClient().from('user_settings').select('settings').eq('user_id', id).maybeSingle();
    if (error || !data?.settings || typeof data.settings !== 'object') return journalLocalGet();
    const value = (data.settings as Record<string, unknown>).journal;
    return typeof value === 'string' ? value : journalLocalGet();
  } catch { return journalLocalGet(); }
}

export async function saveTcoVelaJournal(note: string): Promise<boolean> {
  // Local write is immediate and remains the fallback if account/cloud storage is unavailable.
  journalLocalSet(note);
  try { return await mutateUserSettings((settings) => ({ ...settings, journal: note })); } catch { return false; }
}
