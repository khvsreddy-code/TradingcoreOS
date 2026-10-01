/**
 * Universal indicator presets and profile-scoped presets.
 *
 * Presets are serializable data. They are validated against the indicator's
 * current schema and never contain executable code.
 */
import {
  getIndicatorSettingsSchema,
  readIndicatorSettingValue,
  validateIndicatorSettingValue,
  writeIndicatorSettingValue,
  type IndicatorSettingValue,
  type IndicatorSettingsSchema,
} from './indicatorSettingsSchema';

export const INDICATOR_PRESET_SCHEMA_VERSION = 1 as const;
export const INDICATOR_PRESET_STORAGE_VERSION = 'indicator-presets-v1';
export const INDICATOR_ACTIVE_PROFILE_ID = 'active';

export type IndicatorPresetScope = 'factory' | 'script' | 'personal' | 'workspace' | 'community';
export type IndicatorPresetTemplate = 'Default' | 'Scalping' | 'Intraday' | 'Swing';
export type IndicatorPresetTemplateDefinition = Readonly<{
  id: string;
  name: string;
  description?: string;
  overrides: Readonly<Record<string, IndicatorSettingValue>>;
}>;
export type IndicatorPresetLayer = 'factory' | 'script' | 'workspace' | 'personal';

export type IndicatorPresetResolution = Readonly<{
  values: Readonly<Record<string, IndicatorSettingValue>>;
  appliedPresetIds: readonly string[];
  layers: Readonly<Record<IndicatorPresetLayer, string | null>>;
}>;

export type IndicatorPresetContext = Readonly<{
  userId?: string | null;
  workspaceId?: string | null;
  publicationId?: string | null;
}>;

export type IndicatorPreset = Readonly<{
  version: typeof INDICATOR_PRESET_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  indicatorKind: string;
  schemaId: string;
  schemaVersion: number;
  scope: IndicatorPresetScope;
  owner?: IndicatorPresetContext;
  source: 'factory' | 'script-embedded' | 'user' | 'workspace' | 'community';
  values: Readonly<Record<string, IndicatorSettingValue>>;
  createdAt: string;
  updatedAt: string;
  author?: Readonly<{ id?: string; name?: string }>;
}>;

export type IndicatorPresetBundle = Readonly<{
  version: 1;
  indicatorKind: string;
  schemaId: string;
  presets: readonly IndicatorPreset[];
}>;

export type IndicatorPresetProfile = Readonly<{
  version: 1;
  id: string;
  name: string;
  userId?: string | null;
  workspaceId?: string | null;
  presets: readonly IndicatorPreset[];
  activePresetByIndicator?: Readonly<Record<string, string>>;
  updatedAt: string;
}>;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'preset';
}

function now(): string { return new Date().toISOString(); }
function profileKey(context: IndicatorPresetContext): string {
  const user = context.userId ? String(context.userId).replace(/[^A-Za-z0-9._-]/g, '_') : 'local';
  const workspace = context.workspaceId ? String(context.workspaceId).replace(/[^A-Za-z0-9._-]/g, '_') : 'default';
  return `${user}:${workspace}`;
}

function storageKey(context: IndicatorPresetContext): string {
  return `tradingcore:${INDICATOR_PRESET_STORAGE_VERSION}:${profileKey(context)}`;
}

function readStoredPresetRecords(context: IndicatorPresetContext): IndicatorPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(context));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((preset): preset is IndicatorPreset => Boolean(preset) && typeof preset === 'object')
      .filter(preset => preset.version === INDICATOR_PRESET_SCHEMA_VERSION && typeof preset.id === 'string' && typeof preset.indicatorKind === 'string' && preset.values && typeof preset.values === 'object')
      .map(preset => Object.freeze({ ...preset, values: Object.freeze({ ...(preset.values as Record<string, IndicatorSettingValue>) }) }));
  } catch {
    return [];
  }
}

function valuesFromSchema(schema: IndicatorSettingsSchema, item: Record<string, unknown>): Record<string, IndicatorSettingValue> {
  const values: Record<string, IndicatorSettingValue> = {};
  for (const field of schema.parameters) {
    const value = readIndicatorSettingValue(item, field.path);
    values[field.path] = (value === undefined ? field.defaultValue : value) as IndicatorSettingValue;
  }
  return values;
}

function validatePresetValues(schema: IndicatorSettingsSchema, values: Record<string, IndicatorSettingValue>): string[] {
  const errors: string[] = [];
  const known = new Set(schema.parameters.map(parameter => parameter.path));
  for (const path of Object.keys(values)) {
    if (!known.has(path)) errors.push(`unknown preset parameter '${path}'`);
  }
  for (const parameter of schema.parameters) {
    if (!(parameter.path in values)) continue;
    const error = validateIndicatorSettingValue(parameter, values[parameter.path]);
    if (error) errors.push(error);
  }
  return errors;
}

export function createIndicatorPreset(
  item: Record<string, unknown>,
  name: string,
  scope: IndicatorPresetScope,
  context: IndicatorPresetContext = {},
  overrides: Record<string, IndicatorSettingValue> = {},
): IndicatorPreset {
  const kind = String(item.kind ?? 'Custom');
  const schema = getIndicatorSettingsSchema(kind, item);
  const base = valuesFromSchema(schema, item);
  const values = { ...base, ...overrides };
  const errors = validatePresetValues(schema, values);
  if (errors.length) throw new Error(`Cannot create indicator preset '${name}': ${errors.slice(0, 3).join(' · ')}`);
  const timestamp = now();
  const scopeSource: IndicatorPreset['source'] = scope === 'factory' ? 'factory' : scope === 'script' ? 'script-embedded' : scope === 'personal' ? 'user' : scope;
  return Object.freeze({
    version: INDICATOR_PRESET_SCHEMA_VERSION,
    id: `${slug(kind)}:${slug(name)}:${scope}:${Date.now().toString(36)}`,
    name: name.trim().slice(0, 80) || 'Preset',
    indicatorKind: kind,
    schemaId: schema.id,
    schemaVersion: schema.version,
    scope,
    owner: Object.freeze({ ...context }),
    source: scopeSource,
    values: Object.freeze(values),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createFactoryDefaultPreset(item: Record<string, unknown>): IndicatorPreset {
  const preset = createIndicatorPreset(item, 'Factory Default', 'factory');
  return Object.freeze({ ...preset, id: `factory:${preset.schemaId}` });
}

export function createScriptEmbeddedDefaultPreset(item: Record<string, unknown>): IndicatorPreset {
  const raw = item.scriptDefaults;
  const overrides: Record<string, IndicatorSettingValue> = {};
  if (raw && typeof raw === 'object') {
    const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
    for (const field of schema.parameters) {
      const value = readIndicatorSettingValue(raw as Record<string, unknown>, field.path);
      if (value !== undefined) overrides[field.path] = value as IndicatorSettingValue;
    }
  }
  const preset = createIndicatorPreset(item, 'Script Defaults', 'script', {}, overrides);
  return Object.freeze({ ...preset, id: `script:${preset.schemaId}` });
}

function templateOverrides(schema: IndicatorSettingsSchema, template: IndicatorPresetTemplate): Record<string, IndicatorSettingValue> {
  const out: Record<string, IndicatorSettingValue> = {};
  for (const field of schema.parameters) {
    const path = field.path.toLowerCase();
    if (field.kind === 'integer' || field.kind === 'number' || field.kind === 'decimal' || field.kind === 'duration' || field.kind === 'price') {
      if (path === 'period' || path.endsWith('.period') || field.label.toLowerCase().includes('lookback')) {
        const target = template === 'Scalping' ? 9 : template === 'Intraday' ? 20 : template === 'Swing' ? 50 : Number(field.defaultValue);
        if (Number.isFinite(target)) out[field.path] = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, target));
      }
      if (path === 'multiplier' || path.endsWith('.multiplier') || field.label.toLowerCase().includes('multiplier')) {
        const target = template === 'Scalping' ? 1.5 : template === 'Intraday' ? 2 : template === 'Swing' ? 2.5 : Number(field.defaultValue);
        if (Number.isFinite(target)) out[field.path] = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, target));
      }
    }
  }
  return out;
}

export function createIndicatorTemplatePreset(item: Record<string, unknown>, template: IndicatorPresetTemplate): IndicatorPreset {
  if (template === 'Default') return createFactoryDefaultPreset(item);
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  const preset = createIndicatorPreset(item, template, 'factory', {}, templateOverrides(schema, template));
  return Object.freeze({ ...preset, id: `template:${schema.id}:${template.toLowerCase()}` });
}


function presetFromRawValue(schema: IndicatorSettingsSchema, raw: unknown): IndicatorPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    const parsed = raw as IndicatorPreset;
    if (parsed.version !== INDICATOR_PRESET_SCHEMA_VERSION || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null;
    if (parsed.indicatorKind !== schema.identity.kind || parsed.schemaVersion > schema.version) return null;
    const values = { ...(parsed.values as Record<string, IndicatorSettingValue>) };
    if (validatePresetValues(schema, values).length) return null;
    return Object.freeze({ ...parsed, values: Object.freeze(values) });
  } catch { return null; }
}

function communityPresetsFromItem(item: Record<string, unknown>): readonly IndicatorPreset[] {
  const raw = item.communityPresets;
  if (!Array.isArray(raw)) return [];
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  return Object.freeze(raw.map(value => presetFromRawValue(schema, value)).filter((value): value is IndicatorPreset => Boolean(value && value.scope === 'community')));
}

export function resolveIndicatorPresetLayers(item: Record<string, unknown>, context: IndicatorPresetContext = {}): IndicatorPresetResolution {
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  const activeProfile = loadActiveIndicatorPresetProfile(context);
  const storedCandidates = [...loadStoredIndicatorPresets(item, context), ...(activeProfile?.presets ?? [])].filter(preset => preset.indicatorKind === String(item.kind ?? 'Custom'));
  const stored = [...new Map(storedCandidates.map(preset => [preset.id, preset])).values()];
  const latest = (presets: readonly IndicatorPreset[]) => [...presets].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)).at(-1) ?? null;
  const activePreset = (scope: 'workspace' | 'personal') => {
    const selectedId = activeProfile?.activePresetByIndicator?.[String(item.id ?? item.kind ?? '')];
    return selectedId ? stored.find(preset => preset.id === selectedId && preset.scope === scope) ?? latest(stored.filter(preset => preset.scope === scope)) : latest(stored.filter(preset => preset.scope === scope));
  };
  const layers: Record<IndicatorPresetLayer, IndicatorPreset | null> = {
    factory: createFactoryDefaultPreset(item),
    script: item.scriptDefaults ? createScriptEmbeddedDefaultPreset(item) : null,
    workspace: activePreset('workspace'),
    personal: activePreset('personal'),
  };
  const values = valuesFromSchema(schema, item);
  const appliedPresetIds: string[] = [];
  for (const layer of ['factory', 'script', 'workspace', 'personal'] as const) {
    const preset = layers[layer];
    if (!preset) continue;
    for (const field of schema.parameters) {
      const value = preset.values[field.path];
      if (value !== undefined) values[field.path] = value;
    }
    appliedPresetIds.push(preset.id);
  }
  return Object.freeze({
    values: Object.freeze(values),
    appliedPresetIds: Object.freeze(appliedPresetIds),
    layers: Object.freeze({
      factory: layers.factory?.id ?? null,
      script: layers.script?.id ?? null,
      workspace: layers.workspace?.id ?? null,
      personal: layers.personal?.id ?? null,
    }),
  });
}


export function createDeclarativeIndicatorPresetTemplate(item: Record<string, unknown>, definition: IndicatorPresetTemplateDefinition): IndicatorPreset {
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  const preset = createIndicatorPreset(item, definition.name, 'factory', {}, { ...definition.overrides });
  return Object.freeze({
    ...preset,
    id: `template:${schema.id}:${slug(definition.id)}`,
    ...(definition.description ? { description: definition.description } : {}),
  });
}

export function loadStoredIndicatorPresets(item: Record<string, unknown>, context: IndicatorPresetContext = {}): IndicatorPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(context));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const kind = String(item.kind ?? 'Custom');
    const schema = getIndicatorSettingsSchema(kind, item);
    return parsed
      .filter((preset): preset is IndicatorPreset => Boolean(preset) && typeof preset === 'object')
      .filter(preset => preset.version === INDICATOR_PRESET_SCHEMA_VERSION && preset.indicatorKind === kind && preset.schemaVersion <= schema.version)
      .filter(preset => validatePresetValues(schema, { ...(preset.values as Record<string, IndicatorSettingValue>) }).length === 0)
      .map(preset => Object.freeze({ ...preset, values: Object.freeze({ ...(preset.values as Record<string, IndicatorSettingValue>) }) }));
  } catch {
    return [];
  }
}

export function saveIndicatorPreset(preset: IndicatorPreset, context: IndicatorPresetContext = {}): void {
  if (typeof localStorage === 'undefined') return;
  if (preset.scope !== 'personal' && preset.scope !== 'workspace') throw new Error('Only personal and workspace presets are writable from the local preset store.');
  const existing = readStoredPresetRecords(context).filter(candidate => candidate.id !== preset.id);
  const next = [...existing, preset].slice(-64);
  localStorage.setItem(storageKey(context), JSON.stringify(next));
  const profile = loadActiveIndicatorPresetProfile(context);
  const profilePresets = (profile?.presets ?? []).filter(candidate => candidate.id !== preset.id && (candidate.scope === 'personal' || candidate.scope === 'workspace'));
  saveActiveIndicatorPresetProfile(createIndicatorPresetProfile(profile?.name ?? 'Active Indicator Profile', [...profilePresets, preset].slice(-128), context, INDICATOR_ACTIVE_PROFILE_ID), context);
}

export function deleteIndicatorPreset(presetId: string, context: IndicatorPresetContext = {}): void {
  if (typeof localStorage === 'undefined') return;
  const existing = readStoredPresetRecords(context);
  localStorage.setItem(storageKey(context), JSON.stringify(existing.filter(preset => preset.id !== presetId)));
  const profile = loadActiveIndicatorPresetProfile(context);
  if (profile) {
    saveActiveIndicatorPresetProfile(createIndicatorPresetProfile(profile.name, profile.presets.filter(preset => preset.id !== presetId), context, INDICATOR_ACTIVE_PROFILE_ID), context);
  }
}

export function listIndicatorPresets(item: Record<string, unknown>, context: IndicatorPresetContext = {}): readonly IndicatorPreset[] {
  const factory = createFactoryDefaultPreset(item);
  const script = item.scriptDefaults ? createScriptEmbeddedDefaultPreset(item) : null;
  const builtInTemplates = (['Scalping', 'Intraday', 'Swing'] as IndicatorPresetTemplate[]).map(template => createIndicatorTemplatePreset(item, template));
  const declarativeTemplates = Array.isArray(item.presetTemplates)
    ? item.presetTemplates.map(value => value && typeof value === 'object' ? value as IndicatorPresetTemplateDefinition : null).filter((value): value is IndicatorPresetTemplateDefinition => Boolean(value && value.id && value.name && value.overrides && typeof value.overrides === 'object')).map(definition => { try { return createDeclarativeIndicatorPresetTemplate(item, definition); } catch { return null; } }).filter((value): value is IndicatorPreset => Boolean(value))
    : [];
  const templates = [...builtInTemplates, ...declarativeTemplates];
  const stored = loadStoredIndicatorPresets(item, context);
  const community = [...communityPresetsFromItem(item), ...stored.filter(preset => preset.scope === 'community')];
  const personal = stored.filter(preset => preset.scope === 'personal');
  const workspace = stored.filter(preset => preset.scope === 'workspace');
  return Object.freeze([factory, ...(script ? [script] : []), ...templates, ...personal, ...workspace, ...community]);
}

export function applyIndicatorPreset(item: Record<string, unknown>, preset: IndicatorPreset): Record<string, unknown> {
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  if (preset.indicatorKind !== schema.identity.kind) throw new Error(`Preset '${preset.name}' belongs to '${preset.indicatorKind}', not '${schema.identity.kind}'.`);
  if (preset.schemaVersion > schema.version) throw new Error(`Preset '${preset.name}' targets schema v${preset.schemaVersion}; current indicator schema is v${schema.version}.`);
  const errors = validatePresetValues(schema, { ...preset.values });
  if (errors.length) throw new Error(`Preset '${preset.name}' is invalid: ${errors.slice(0, 3).join(' · ')}`);
  let next: Record<string, unknown> = { ...item };
  for (const field of schema.parameters) {
    const value = preset.values[field.path];
    if (value !== undefined) next = { ...next, ...writeIndicatorSettingValue(next, field.path, value) };
  }
  return next;
}


export function resolveIndicatorPresetStack(item: Record<string, unknown>, context: IndicatorPresetContext = {}): Record<string, IndicatorSettingValue> {
  return resolveIndicatorPresetLayers(item, context).values as Record<string, IndicatorSettingValue>;
}

export function saveIndicatorPresetProfile(profile: IndicatorPresetProfile, context: IndicatorPresetContext = {}): void {
  if (typeof localStorage === 'undefined') return;
  if (profile.userId && context.userId && profile.userId !== context.userId) throw new Error('Indicator preset profile user scope does not match the active user.');
  if (profile.workspaceId && context.workspaceId && profile.workspaceId !== context.workspaceId) throw new Error('Indicator preset profile workspace scope does not match the active workspace.');
  if (profile.presets.length > 128) throw new Error('Indicator preset profile exceeds the 128-preset limit.');
  const key = `tradingcore:${INDICATOR_PRESET_STORAGE_VERSION}:profile:${profile.id}:${profileKey(context)}`;
  localStorage.setItem(key, serializeIndicatorPresetProfile(profile));
}

export function loadIndicatorPresetProfile(id: string, context: IndicatorPresetContext = {}): IndicatorPresetProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tradingcore:${INDICATOR_PRESET_STORAGE_VERSION}:profile:${id}:${profileKey(context)}`);
    return raw ? deserializeIndicatorPresetProfile(raw) : null;
  } catch { return null; }
}

export function saveActiveIndicatorPresetProfile(profile: IndicatorPresetProfile, context: IndicatorPresetContext = {}): void {
  saveIndicatorPresetProfile(Object.freeze({ ...profile, id: INDICATOR_ACTIVE_PROFILE_ID, userId: context.userId ?? null, workspaceId: context.workspaceId ?? null, updatedAt: now(), presets: Object.freeze([...profile.presets]) }), context);
}

export function loadActiveIndicatorPresetProfile(context: IndicatorPresetContext = {}): IndicatorPresetProfile | null {
  return loadIndicatorPresetProfile(INDICATOR_ACTIVE_PROFILE_ID, context);
}

export function setActiveIndicatorPreset(item: Record<string, unknown>, presetId: string, context: IndicatorPresetContext = {}): IndicatorPresetProfile {
  const profile = loadActiveIndicatorPresetProfile(context) ?? createIndicatorPresetProfile('Active Indicator Profile', [], context, INDICATOR_ACTIVE_PROFILE_ID);
  const indicatorKey = String(item.id ?? item.kind ?? '');
  const candidate = profile.presets.find(preset => preset.id === presetId);
  if (!candidate || candidate.indicatorKind !== String(item.kind ?? 'Custom') || (candidate.scope !== 'workspace' && candidate.scope !== 'personal')) throw new Error(`Preset '${presetId}' is not an activatable personal/workspace preset for this indicator.`);
  const next = createIndicatorPresetProfile(profile.name, profile.presets, context, INDICATOR_ACTIVE_PROFILE_ID, { ...(profile.activePresetByIndicator ?? {}), [indicatorKey]: presetId });
  saveActiveIndicatorPresetProfile(next, context);
  return next;
}

export function indicatorPresetProfileFingerprint(profile: IndicatorPresetProfile): string {
  const canonical = {
    version: profile.version,
    id: profile.id,
    userId: profile.userId ?? null,
    workspaceId: profile.workspaceId ?? null,
    presets: [...profile.presets].map(preset => ({ id: preset.id, schemaId: preset.schemaId, schemaVersion: preset.schemaVersion, scope: preset.scope, values: Object.fromEntries(Object.entries(preset.values).sort(([a], [b]) => a.localeCompare(b))) })).sort((a, b) => a.id.localeCompare(b.id)),
    activePresetByIndicator: Object.fromEntries(Object.entries(profile.activePresetByIndicator ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  };
  return JSON.stringify(canonical);
}

export function createIndicatorPresetBundle(item: Record<string, unknown>, presets: readonly IndicatorPreset[]): IndicatorPresetBundle {
  const schema = getIndicatorSettingsSchema(String(item.kind ?? 'Custom'), item);
  const safe = presets.filter(preset => preset.indicatorKind === schema.identity.kind && preset.schemaId === schema.id);
  if (safe.some(preset => validatePresetValues(schema, { ...preset.values }).length)) throw new Error('Preset bundle contains values invalid for the indicator schema.');
  return Object.freeze({ version: 1, indicatorKind: schema.identity.kind, schemaId: schema.id, presets: Object.freeze([...safe]) });
}

export function serializeIndicatorPresetBundle(bundle: IndicatorPresetBundle): string {
  return JSON.stringify({ ...bundle, presets: [...bundle.presets] }, null, 2);
}

export function deserializeIndicatorPresetBundle(serialized: string): IndicatorPresetBundle {
  const parsed = JSON.parse(serialized) as IndicatorPresetBundle;
  if (!parsed || parsed.version !== 1 || !parsed.indicatorKind || !parsed.schemaId || !Array.isArray(parsed.presets)) throw new Error('Invalid indicator preset bundle payload.');
  const presets = parsed.presets.map(preset => deserializeIndicatorPreset(JSON.stringify(preset)));
  if (presets.some(preset => preset.indicatorKind !== parsed.indicatorKind || preset.schemaId !== parsed.schemaId)) throw new Error('Preset bundle identity mismatch.');
  return Object.freeze({ version: 1, indicatorKind: parsed.indicatorKind, schemaId: parsed.schemaId, presets: Object.freeze(presets) });
}

export function serializeIndicatorPreset(preset: IndicatorPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function deserializeIndicatorPreset(serialized: string): IndicatorPreset {
  const parsed = JSON.parse(serialized) as IndicatorPreset;
  if (!parsed || parsed.version !== INDICATOR_PRESET_SCHEMA_VERSION || !parsed.id || !parsed.indicatorKind || !parsed.schemaId || !parsed.values || !['factory','script','personal','workspace','community'].includes(parsed.scope)) {
    throw new Error('Invalid indicator preset payload.');
  }
  return Object.freeze({ ...parsed, values: Object.freeze({ ...parsed.values }) });
}

export function createIndicatorPresetProfile(
  name: string,
  presets: readonly IndicatorPreset[],
  context: IndicatorPresetContext = {},
  id = `${slug(name)}:${profileKey(context)}`,
  activePresetByIndicator: Readonly<Record<string, string>> = {},
): IndicatorPresetProfile {
  if (presets.length > 128) throw new Error('Indicator preset profile exceeds the 128-preset limit.');
  const safePresets = presets.filter(preset => preset.scope === 'personal' || preset.scope === 'workspace' || preset.scope === 'community');
  const allowedIds = new Set(safePresets.map(preset => preset.id));
  const active = Object.fromEntries(Object.entries(activePresetByIndicator).filter(([kind, presetId]) => kind && allowedIds.has(presetId)));
  return Object.freeze({ version: 1, id, name: name.trim().slice(0, 80) || 'Indicator Profile', userId: context.userId ?? null, workspaceId: context.workspaceId ?? null, presets: Object.freeze(safePresets), activePresetByIndicator: Object.freeze(active), updatedAt: now() });
}

export function serializeIndicatorPresetProfile(profile: IndicatorPresetProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function deserializeIndicatorPresetProfile(serialized: string): IndicatorPresetProfile {
  const parsed = JSON.parse(serialized) as IndicatorPresetProfile;
  if (!parsed || parsed.version !== 1 || !parsed.id || !Array.isArray(parsed.presets)) throw new Error('Invalid indicator preset profile payload.');
  const presets = parsed.presets.map(preset => deserializeIndicatorPreset(JSON.stringify(preset))).filter(preset => preset.scope === 'personal' || preset.scope === 'workspace' || preset.scope === 'community');
  if (presets.length > 128) throw new Error('Indicator preset profile exceeds the 128-preset limit.');
  const allowedIds = new Set(presets.map(preset => preset.id));
  const active = Object.fromEntries(Object.entries(parsed.activePresetByIndicator ?? {}).filter(([kind, presetId]) => kind && typeof presetId === 'string' && allowedIds.has(presetId)));
  return Object.freeze({ ...parsed, presets: Object.freeze(presets), activePresetByIndicator: Object.freeze(active) });
}
