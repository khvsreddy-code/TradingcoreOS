export type ChartBackgroundMode = 'solid' | 'gradient';

export interface WorkspaceAppearance {
  accentColor: string;
  workspaceSurfaceColor: string;
  pageColor: string;
  topbarColor: string;
  sidebarColor: string;
  chartBackgroundMode: ChartBackgroundMode;
  chartBackgroundStart: string;
  chartBackgroundEnd: string;
  chartGradientAngle: number;
  syncWorkspaceColors: boolean;
}

export const WORKSPACE_APPEARANCE_STORAGE_KEY = 'tradingcore:workspace-appearance:v1';
export const WORKSPACE_APPEARANCE_EVENT = 'tradingcore:workspace-appearance-change';

export const WORKSPACE_COLOR_PRESETS = Object.freeze([
  '#3b82f6', '#2563eb', '#06b6d4', '#14b8a6', '#10b981',
  '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316',
  '#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#a855f7',
  '#8b5cf6', '#6366f1', '#a3a3a3', '#94a3b8', '#d3ebf4',
  '#ffffff', '#111827', '#0f172a', '#172554', '#052e2b',
  '#431407', '#3f1d2e', '#27272a', '#1e293b', '#020617',
]);

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = Object.freeze({
  accentColor: '#d3ebf4',
  workspaceSurfaceColor: '#0c0e15',
  pageColor: '#070a10',
  topbarColor: '#0c0e15',
  sidebarColor: '#0c0e15',
  chartBackgroundMode: 'solid',
  chartBackgroundStart: '#07080c',
  chartBackgroundEnd: '#111827',
  chartGradientAngle: 135,
  syncWorkspaceColors: true,
});

function safeColor(value: unknown, fallback: string): string {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalize(value: unknown): WorkspaceAppearance {
  const raw = value && typeof value === 'object' ? value as Partial<WorkspaceAppearance> : {};
  return {
    accentColor: safeColor(raw.accentColor, DEFAULT_WORKSPACE_APPEARANCE.accentColor),
    workspaceSurfaceColor: safeColor(raw.workspaceSurfaceColor, DEFAULT_WORKSPACE_APPEARANCE.workspaceSurfaceColor),
    pageColor: safeColor(raw.pageColor, DEFAULT_WORKSPACE_APPEARANCE.pageColor),
    topbarColor: safeColor(raw.topbarColor, DEFAULT_WORKSPACE_APPEARANCE.topbarColor),
    sidebarColor: safeColor(raw.sidebarColor, DEFAULT_WORKSPACE_APPEARANCE.sidebarColor),
    chartBackgroundMode: raw.chartBackgroundMode === 'gradient' ? 'gradient' : 'solid',
    chartBackgroundStart: safeColor(raw.chartBackgroundStart, DEFAULT_WORKSPACE_APPEARANCE.chartBackgroundStart),
    chartBackgroundEnd: safeColor(raw.chartBackgroundEnd, DEFAULT_WORKSPACE_APPEARANCE.chartBackgroundEnd),
    chartGradientAngle: Math.max(0, Math.min(360, Math.round(Number.isFinite(Number(raw.chartGradientAngle)) ? Number(raw.chartGradientAngle) : 135))),
    syncWorkspaceColors: raw.syncWorkspaceColors !== false,
  };
}

export function getWorkspaceAppearance(): WorkspaceAppearance {
  try {
    const raw = localStorage.getItem(WORKSPACE_APPEARANCE_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_WORKSPACE_APPEARANCE };
  } catch {
    return { ...DEFAULT_WORKSPACE_APPEARANCE };
  }
}

export function chartBackgroundCss(value: WorkspaceAppearance): string {
  return value.chartBackgroundMode === 'gradient'
    ? `linear-gradient(${value.chartGradientAngle}deg, ${value.chartBackgroundStart}, ${value.chartBackgroundEnd})`
    : value.chartBackgroundStart;
}

export function applyWorkspaceAppearance(value: WorkspaceAppearance): WorkspaceAppearance {
  const settings = normalize(value);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--tco-user-workspace-accent', settings.accentColor);
    root.style.setProperty('--tco-user-workspace-accent-soft', `color-mix(in srgb, ${settings.accentColor} 58%, white)`);
    root.style.setProperty('--tco-user-workspace-accent-bright', `color-mix(in srgb, ${settings.accentColor} 35%, white)`);
    const rgb = settings.accentColor.slice(1).match(/.{2}/g)?.map(part => String(parseInt(part, 16))).join(' ') || '211 235 244';
    root.style.setProperty('--tco-user-workspace-accent-rgb', rgb);
    // Some terminal modules scope their default accent on .tco-live-surface; update those
    // scopes too so the user-selected accent is not shadowed by a nested default.
    root.style.setProperty('--tco-workspace-page', settings.syncWorkspaceColors ? settings.workspaceSurfaceColor : settings.pageColor);
    root.style.setProperty('--tco-workspace-topbar', settings.syncWorkspaceColors ? settings.workspaceSurfaceColor : settings.topbarColor);
    root.style.setProperty('--tco-workspace-sidebar', settings.syncWorkspaceColors ? settings.workspaceSurfaceColor : settings.sidebarColor);
    root.style.setProperty('--tco-workspace-chart', chartBackgroundCss(settings));
    root.dataset.tcoWorkspaceAppearance = 'custom';
    root.querySelectorAll<HTMLElement>('.tco-workspace-root .tco-live-surface').forEach(surface => {
      surface.style.setProperty('--tco-accent', settings.accentColor);
      surface.style.setProperty('--tco-accent-soft', `color-mix(in srgb, ${settings.accentColor} 58%, white)`);
      surface.style.setProperty('--tco-accent-bright', `color-mix(in srgb, ${settings.accentColor} 35%, white)`);
      surface.style.setProperty('--tco-accent-rgb', rgb);
    });
  }
  try { localStorage.setItem(WORKSPACE_APPEARANCE_STORAGE_KEY, JSON.stringify(settings)); } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<WorkspaceAppearance>(WORKSPACE_APPEARANCE_EVENT, { detail: settings }));
  }
  return settings;
}

export function resetWorkspaceAppearance(): WorkspaceAppearance {
  return applyWorkspaceAppearance({ ...DEFAULT_WORKSPACE_APPEARANCE });
}

export function subscribeWorkspaceAppearance(listener: (value: WorkspaceAppearance) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceAppearance>).detail;
    if (detail) listener(normalize(detail));
  };
  window.addEventListener(WORKSPACE_APPEARANCE_EVENT, handler);
  return () => window.removeEventListener(WORKSPACE_APPEARANCE_EVENT, handler);
}

/** Apply saved workspace colors once on application boot without replacing the light/dark palette. */
export function bootstrapWorkspaceAppearance(): WorkspaceAppearance {
  // Restore workspace-only customization only when a trader saved it; first-run defaults
  // must not modify the accent color of the landing page or other app sections.
  try {
    const raw = localStorage.getItem(WORKSPACE_APPEARANCE_STORAGE_KEY);
    return raw ? applyWorkspaceAppearance(JSON.parse(raw)) : { ...DEFAULT_WORKSPACE_APPEARANCE };
  } catch {
    return { ...DEFAULT_WORKSPACE_APPEARANCE };
  }
}
