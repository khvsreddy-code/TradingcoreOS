import { getSupabaseClient, isSupabaseConfigured } from '../auth/supabaseClient';
import type { CoreSpiritCompileResult } from './compiler';
import { compileCoreSpirit } from './coreSpiritPipeline';
import { CORE_SPIRIT_VERSION } from './VERSION';
import type { UserProfile } from '../../auth/types';
import type { IndicatorConfig } from '../marketData/indicatorEngine';
import { buildIndicatorSettingsSnapshot } from './indicatorSettingsSchema';

export type IndicatorPublicationStatus = 'draft' | 'published' | 'archived';
export type IndicatorPublicationVisibility = 'public' | 'unlisted';

export type UserIndicatorScript = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source: string;
  language_version: string;
  status: string;
  is_published: boolean;
  active_version_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type IndicatorPublication = {
  id: string;
  script_id: string;
  version_id: string;
  user_id?: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  cover_image_path: string | null;
  cover_image_url: string | null;
  author_name: string;
  author_avatar_url: string | null;
  source_snapshot: string;
  language_version: string;
  source_hash: string | null;
  license: string;
  open_source: boolean;
  visibility: IndicatorPublicationVisibility;
  status: IndicatorPublicationStatus;
  views_count: number;
  installs_count: number;
  created_at: string;
  published_at: string | null;
  updated_at: string;
  indicator_settings?: Record<string, unknown>;
};

export type SaveIndicatorDraftInput = {
  scriptId?: string | null;
  title: string;
  description?: string;
  source: string;
  metadata?: Record<string, unknown>;
  compile?: CoreSpiritCompileResult | null;
};

export type PublishIndicatorInput = SaveIndicatorDraftInput & {
  category: string;
  tags: string[];
  coverImage?: File | null;
  license?: string;
  openSource?: boolean;
  visibility?: IndicatorPublicationVisibility;
  profile: Pick<UserProfile, 'name' | 'avatar'>;
  settings?: IndicatorConfig;
};

function indicatorSettingsSnapshot(item?: IndicatorConfig) {
  if (!item) return {};
  const raw = item as IndicatorConfig & { anchor?: string };
  const schemaSnapshot = buildIndicatorSettingsSnapshot(raw as Record<string, unknown>);
  return {
    kind: raw.kind,
    period: raw.period,
    fast: raw.fast,
    slow: raw.slow,
    signal: raw.signal,
    multiplier: raw.multiplier,
    smooth: raw.smooth,
    displacement: raw.displacement,
    lookback: raw.lookback,
    mtf: raw.mtf,
    source: raw.source,
    color: raw.color,
    signalColor: raw.signalColor,
    upperColor: raw.upperColor,
    lowerColor: raw.lowerColor,
    lineWidth: raw.lineWidth,
    lineStyle: raw.lineStyle,
    display: raw.display,
    anchor: raw.anchor,
    customName: raw.customName,
    ...schemaSnapshot,
    settingsSchema: schemaSnapshot.schema,
  };
}

function slugify(value: string) {
  return String(value || 'indicator')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'indicator';
}

async function sha256(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getUserId() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in to save CoreSpirit indicators.');
  return data.user.id;
}

function compileIndicatorSource(source: string, sourceId: string): CoreSpiritCompileResult {
  const result = compileCoreSpirit(source, sourceId);
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length) throw new Error(errors.slice(0, 4).map((diagnostic) => diagnostic.message).join(' · '));
  return result;
}

async function uploadCover(userId: string, scriptId: string, file: File) {
  const accepted = ['image/png', 'image/jpeg', 'image/webp'];
  if (!accepted.includes(file.type)) throw new Error('Cover image must be PNG, JPEG, or WebP.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Cover image must be 6 MB or smaller.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${scriptId}/cover.${extension}`;
  const { error } = await getSupabaseClient().storage.from('indicator-covers').upload(path, file, { upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return { path, url: getSupabaseClient().storage.from('indicator-covers').getPublicUrl(path).data.publicUrl };
}

export async function saveUserIndicatorDraft(input: SaveIndicatorDraftInput) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const userId = await getUserId();
  const client = getSupabaseClient();
  const draftSettings = input.metadata?.settings && typeof input.metadata.settings === 'object'
    ? buildIndicatorSettingsSnapshot(input.metadata.settings as Record<string, unknown>)
    : null;
  const draftMetadata = {
    indicator: true,
    ...input.metadata,
    settings: input.metadata?.settings || undefined,
    settingsSchema: draftSettings?.schema || undefined,
  };
  let script: UserIndicatorScript | null = null;
  if (input.scriptId) {
    const result = await client.from('corespirit_scripts').select('*').eq('id', input.scriptId).eq('user_id', userId).maybeSingle();
    if (result.error) throw result.error;
    script = (result.data as UserIndicatorScript | null) ?? null;
  }

  if (!script) {
    const inserted = await client.from('corespirit_scripts').insert({
      user_id: userId,
      name: input.title.trim() || 'Untitled Indicator',
      description: input.description?.trim() || '',
      source: input.source,
      language_version: CORE_SPIRIT_VERSION,
      status: input.compile ? 'ready' : 'draft',
      metadata: draftMetadata,
    }).select('*').single();
    if (inserted.error) throw inserted.error;
    script = inserted.data as UserIndicatorScript;
  }

  const hash = await sha256(input.source);
  const latest = await client.from('corespirit_script_versions').select('version').eq('script_id', script.id).order('version', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw latest.error;
  const versionNumber = (latest.data?.version ?? 0) + 1;
  const compile = input.compile ?? null;
  const compileErrors = (compile?.diagnostics || []).filter((d) => d.severity === 'error');
  const insertedVersion = await client.from('corespirit_script_versions').insert({
    script_id: script.id,
    user_id: userId,
    version: versionNumber,
    source: input.source,
    compiled_ir: compile && !compileErrors.length ? compile.ir ?? null : null,
    compiler_version: compile ? `indicator-studio-${CORE_SPIRIT_VERSION}` : null,
    compile_status: compile ? (compileErrors.length ? 'error' : 'success') : 'pending',
    compile_errors: compileErrors,
    source_hash: hash,
    ir_version: 1,
    artifact_schema_version: 2,
  }).select('*').single();
  if (insertedVersion.error) throw insertedVersion.error;

  const updated = await client.from('corespirit_scripts').update({
    name: input.title.trim() || 'Untitled Indicator',
    description: input.description?.trim() || '',
    source: input.source,
    status: compile ? (compileErrors.length ? 'error' : 'ready') : 'draft',
    metadata: draftMetadata,
    active_version_id: compile && !compileErrors.length ? insertedVersion.data.id : script.active_version_id,
    updated_at: new Date().toISOString(),
  }).eq('id', script.id).eq('user_id', userId).select('*').single();
  if (updated.error) throw updated.error;
  return { script: updated.data as UserIndicatorScript, version: insertedVersion.data, compile };
}

export async function publishUserIndicator(input: PublishIndicatorInput) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const compile = input.compile && !(input.compile.diagnostics || []).some((d) => d.severity === 'error')
    ? input.compile
    : compileIndicatorSource(input.source, `indicator-publication:${slugify(input.title)}`);
  if (!compile.ir) throw new Error('The indicator compiled without an executable IR artifact.');

  const saved = await saveUserIndicatorDraft({ ...input, compile });
  const userId = saved.script.user_id;
  const client = getSupabaseClient();
  const sourceHash = await sha256(input.source);
  const slug = `${slugify(input.title)}-${saved.script.id.slice(0, 8)}`;
  const existingPublication = await client.from('indicator_publications').select('cover_image_path,cover_image_url').eq('script_id', saved.script.id).maybeSingle();
  if (existingPublication.error) throw existingPublication.error;
  const cover = input.coverImage ? await uploadCover(userId, saved.script.id, input.coverImage) : existingPublication.data ? { path: existingPublication.data.cover_image_path, url: existingPublication.data.cover_image_url } : null;
  const settingsSnapshot = indicatorSettingsSnapshot(input.settings);

  const publication = await client.from('indicator_publications').upsert({
    script_id: saved.script.id,
    version_id: saved.version.id,
    user_id: userId,
    slug,
    title: input.title.trim() || 'Untitled Indicator',
    description: input.description?.trim() || '',
    category: input.category.trim() || 'Custom',
    tags: Array.from(new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 12),
    cover_image_path: cover?.path ?? null,
    cover_image_url: cover?.url ?? null,
    author_name: input.profile.name || 'Trader',
    author_avatar_url: input.profile.avatar || null,
    source_snapshot: input.source,
    language_version: CORE_SPIRIT_VERSION,
    source_hash: sourceHash,
    license: input.license || 'MIT',
    open_source: input.openSource ?? true,
    visibility: input.visibility || 'public',
    indicator_settings: settingsSnapshot,
    status: 'published',
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'script_id' }).select('*').single();
  if (publication.error) throw publication.error;

  const scriptUpdate = await client.from('corespirit_scripts').update({ is_published: true, status: 'ready', active_version_id: saved.version.id, updated_at: new Date().toISOString() }).eq('id', saved.script.id).eq('user_id', userId);
  if (scriptUpdate.error) throw scriptUpdate.error;
  return { publication: publication.data as IndicatorPublication, script: saved.script, version: saved.version };
}

export async function listPublicIndicatorPublications(options?: { query?: string; category?: string; openSourceOnly?: boolean; sort?: 'popular' | 'newest' | 'used' }) {
  let request = getSupabaseClient().from('indicator_publications').select('id,script_id,version_id,slug,title,description,category,tags,cover_image_path,cover_image_url,author_name,author_avatar_url,source_snapshot,language_version,source_hash,license,open_source,visibility,status,views_count,installs_count,indicator_settings,created_at,published_at,updated_at').eq('status', 'published').eq('visibility', 'public');
  if (options?.category && options.category !== 'All') request = request.eq('category', options.category);
  if (options?.openSourceOnly) request = request.eq('open_source', true);
  if (options?.sort === 'used') request = request.order('installs_count', { ascending: false }).order('published_at', { ascending: false });
  else if (options?.sort === 'popular') request = request.order('views_count', { ascending: false }).order('published_at', { ascending: false });
  else request = request.order('published_at', { ascending: false });
  const { data, error } = await request.limit(80);
  if (error) throw error;
  const q = options?.query?.trim().toLowerCase();
  return ((data || []) as IndicatorPublication[]).filter((item) => !q || `${item.title} ${item.description} ${item.author_name} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q));
}


export async function getPublicIndicatorPublicationBySlug(slug: string) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await getSupabaseClient()
    .from('indicator_publications')
    .select('id,script_id,version_id,slug,title,description,category,tags,cover_image_path,cover_image_url,author_name,author_avatar_url,source_snapshot,language_version,source_hash,license,open_source,visibility,status,views_count,installs_count,indicator_settings,created_at,published_at,updated_at')
    .eq('slug', normalized)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();
  if (error) throw error;
  return (data as IndicatorPublication | null) ?? null;
}

export async function listMyIndicatorPublications() {
  const userId = await getUserId();
  const { data, error } = await getSupabaseClient().from('indicator_publications').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as IndicatorPublication[];
}

export async function unpublishIndicator(publicationId: string) {
  const userId = await getUserId();
  const { error } = await getSupabaseClient().from('indicator_publications').update({ status: 'archived', published_at: null, updated_at: new Date().toISOString() }).eq('id', publicationId).eq('user_id', userId);
  if (error) throw error;
}

export async function incrementIndicatorView(publicationId: string) {
  const { error } = await getSupabaseClient().from('indicator_publication_events').insert({ publication_id: publicationId, event_type: 'view' });
  if (error) throw error;
}

export async function incrementIndicatorInstall(publicationId: string) {
  const { error } = await getSupabaseClient().from('indicator_publication_events').insert({ publication_id: publicationId, event_type: 'install' });
  if (error) throw error;
}

export function saveIndicatorSourceLocally(source: string) {
  localStorage.setItem('tradingcore:corespirit:editor', source);
  localStorage.setItem('tradingcore:indicator:source', source);
}
