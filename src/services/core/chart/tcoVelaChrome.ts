import {
  registerLegendAction,
  registerLegendCallout,
  registerSidePanel,
  registerStatePersistence,
  registerSymbolRanking,
  registerDefaultEngine,
  registerWidgetAction,
  registerWidgetAttachment,
  type LegendCalloutSpec,
  type SidePanelDescriptor,
  type WidgetActionDescriptor,
  type WidgetAttachment,
  type StatePersistenceHandler,
  type SymbolRankingHook,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';
import { loadTcoVelaJournal, saveTcoVelaJournal } from './tcoVelaSupabaseStorage';
import { getAutomations } from '../../workspace/workspaceState';
import { registerIcon, svg16 } from '../../../../vendor/vela/src/ui/icons';
import type { CoreSpiritEditorModel as CoreSpiritEditorModelType } from '../../coreSpirit/editorModel';
import type { CoreSpiritMonacoAdapter } from '../../coreSpirit/monacoAdapter';
import { versionedStorageKey } from '../../coreSpirit/storageSchema';
import type { VelaTheme } from '../../../../vendor/vela/src/core/options';
import { themeTokens } from '../../../../vendor/vela/src/core/tokens';

// TCO-only topbar / panel actions need real registered SVGs. Unknown Vela ids otherwise
// render blank spans inside clickable icon-only controls.
const TCO_CHROME_ICONS: Record<string, string> = {
  activity: svg16('<path d="M1.5 8h3l2-5 3 10 2-5h3"/>'),
  briefcase: svg16('<rect x="2" y="5" width="12" height="9" rx="1.5"/><path d="M5 5V3h6v2M2 8h12"/>'),
  shield: svg16('<path d="M8 1.5 13.5 3.5v4c0 3.4-2.4 5.8-5.5 7-3.1-1.2-5.5-3.6-5.5-7v-4z"/><path d="m5.5 7.8 1.7 1.8 3.4-3.4"/>'),
  list: svg16('<path d="M5 3h9M5 8h9M5 13h9"/><path d="M2 3h.1M2 8h.1M2 13h.1"/>'),
  layers: svg16('<path d="m8 1.5 6 3.2-6 3.2-6-3.2z"/><path d="m2 8 6 3.2L14 8M2 11l6 3.2 6-3.2"/>'),
  table: svg16('<rect x="1.5" y="2" width="13" height="12" rx="1"/><path d="M1.5 6h13M6 2v12M10 6v8"/>'),
  user: svg16('<circle cx="8" cy="4.5" r="2.5"/><path d="M2 14c.3-3 2.3-4.5 6-4.5s5.7 1.5 6 4.5"/>'),
  layout: svg16('<rect x="1.5" y="2" width="13" height="12" rx="1"/><path d="M7 2v12M7 7h7"/>'),
  sliders: svg16('<path d="M2 4h4m4 0h4M2 8h8m4 0h0M2 12h2m4 0h6"/><circle cx="7" cy="4" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/>'),
  play: svg16('<path d="M4 2.5 13.5 8 4 13.5z"/>'),
  search: svg16('<circle cx="6.8" cy="6.8" r="4.4"/><path d="m10 10 4 4"/>'),
  replay: svg16('<path d="M3 5V1.8L1 4M3 5h5a5 5 0 1 1-4.6 7"/>'),
  datawindow: svg16('<rect x="1.5" y="2" width="13" height="12" rx="1"/><path d="M4 5h8M4 8h5M4 11h6"/>'),
  star: svg16('<path d="m8 1.5 2 4.2 4.6.6-3.3 3.2.8 4.5L8 11.8l-4.1 2.2.8-4.5L1.4 6.3 6 5.7z"/>'),
  calendar: svg16('<rect x="1.5" y="3" width="13" height="11" rx="1"/><path d="M4.5 1.5v3M11.5 1.5v3M1.5 6h13M5 8.5h2M9 8.5h2"/>'),
  gear: svg16('<circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>'),
  objects: svg16('<rect x="1.5" y="1.5" width="5" height="5" rx=".5"/><rect x="9.5" y="1.5" width="5" height="5" rx=".5"/><rect x="1.5" y="9.5" width="5" height="5" rx=".5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/>'),
  indicators: svg16('<path d="M1.5 12.5 5 8.5l2.5 2 5-7 2 2"/>'),
};
for (const [id, markup] of Object.entries(TCO_CHROME_ICONS)) registerIcon(id, markup);

type WatchlistItem = { symbol: string; label: string; short: string };

const DEFAULT_WATCHLIST: readonly WatchlistItem[] = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
];
const WATCHLIST_STATE_KEY = 'tco.watchlist.v2';
const WATCHLIST_LOCAL_KEY = 'tradingcore:vela:watchlist:v2';
let watchlist: WatchlistItem[] = [...DEFAULT_WATCHLIST];
const watchlistRefreshers = new Set<() => void>();

function normalizeWatchlist(value: unknown): WatchlistItem[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).items)
      ? (value as Record<string, unknown>).items as unknown[]
      : [];
  const result: WatchlistItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const symbol = String(source.symbol ?? '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    const ticker = symbol.includes(':') ? symbol.split(':', 2)[1] ?? symbol : symbol;
    const short = String(source.short ?? ticker).trim() || symbol;
    const label = String(source.label ?? ticker ?? symbol).trim() || symbol;
    result.push({ symbol, label, short });
    seen.add(symbol);
    if (result.length >= 50) break;
  }
  return result.length ? result : [...DEFAULT_WATCHLIST];
}

function persistWatchlistLocal(): void {
  try { localStorage.setItem(WATCHLIST_LOCAL_KEY, JSON.stringify({ version: 2, items: watchlist })); } catch {}
}

function loadWatchlistLocal(): void {
  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    if (raw) watchlist = normalizeWatchlist(JSON.parse(raw));
  } catch {}
}

function symbolDescriptor(item: WatchlistItem) {
  const [prefix, ticker] = item.symbol.includes(':') ? item.symbol.split(':', 2) : ['NSE', item.symbol];
  return {
    ticker: ticker || item.symbol,
    prefix: prefix || 'NSE',
    description: item.label,
    type: 'index',
    provider: 'tco',
  };
}

function applyWatchlist(next: WatchlistItem[], ctx?: { stateChanged?: () => void }): void {
  watchlist = normalizeWatchlist(next);
  persistWatchlistLocal();
  ctx?.stateChanged?.();
  watchlistRefreshers.forEach((refresh) => refresh());
}

loadWatchlistLocal();

const watchlistStatePersistence: StatePersistenceHandler = {
  key: WATCHLIST_STATE_KEY,
  scope: 'global',
  serialize() {
    return { version: 2, items: watchlist };
  },
  restore(payload) {
    watchlist = normalizeWatchlist(payload);
    persistWatchlistLocal();
    watchlistRefreshers.forEach((refresh) => refresh());
  },
};

const watchlistSymbolRanking: SymbolRankingHook = (pool) => {
  const existing = new Map(pool.map((descriptor) => [
    `${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`,
    descriptor,
  ]));
  const preferred = watchlist.map((item) => {
    const descriptor = symbolDescriptor(item);
    const key = `${descriptor.prefix.toUpperCase()}:${descriptor.ticker.toUpperCase()}`;
    return existing.get(key) ?? descriptor;
  });
  const preferredKeys = new Set(preferred.map((descriptor) => `${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`));
  return [...preferred, ...pool.filter((descriptor) => !preferredKeys.has(`${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`))];
};

registerStatePersistence(watchlistStatePersistence);
registerSymbolRanking(watchlistSymbolRanking);

// Make CoreSpirit Vela's default scripting language for TCO-owned Vela charts. Workspace-level
// engines may still override this factory, so the contribution remains composable.
registerDefaultEngine('corespirit', () => new LazyCoreSpiritVelaEngine());


const JOURNAL_KEY = 'tradingcore:vela:journal:v1';

function panelRoot(body: HTMLElement): HTMLDivElement {
  body.textContent = '';
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg, #080b12);color:var(--vela-fg, #e5e7eb);font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
  body.appendChild(root);
  return root;
}

type TcoFrameColors = {
  uiBackground: string;
  topbarBackground: string;
  panelBackground: string;
  chartBackground: string;
  chartTextColor: string;
  gridColor: string;
  accent: string;
  upColor: string;
  downColor: string;
};
type TcoFramePreferences = TcoFrameColors & {
  sidebar: 'left' | 'right';
  density: 'comfortable' | 'compact';
  themePreset: string;
  chartBackgroundMode: 'solid' | 'gradient';
  chartBackgroundEnd: string;
  chartGradientAngle: number;
  topbar: Record<string, boolean>;
};
type TcoFrameColorKey = keyof TcoFrameColors | 'chartBackgroundEnd';
type TcoFrameThemePreset = { id: string; label: string; colors: TcoFrameColors };

const TCO_FRAME_STORAGE_KEY = 'tradingcore:vela:frame-preferences:v1';
// Re-applying panel/layout preferences should not reset/repaint all chart cells unless the
// chart palette actually changed or a different Vela workspace has just been mounted.
let lastAppliedTcoVelaThemeWorkspace: object | null = null;
let lastAppliedTcoVelaThemeSignature = '';
const TCO_FRAME_THEME_PRESETS: readonly TcoFrameThemePreset[] = [
  { id: 'graphite', label: 'Graphite', colors: {
    uiBackground: '#0d0f13', topbarBackground: '#141518', panelBackground: '#111317', chartBackground: '#141518',
    chartTextColor: '#9ca3af', gridColor: '#26282e', accent: '#8b7cff', upColor: '#089981', downColor: '#f23645',
  } },
  { id: 'tradingview-dark', label: 'TradingView Dark', colors: {
    uiBackground: '#131722', topbarBackground: '#131722', panelBackground: '#171b26', chartBackground: '#131722',
    chartTextColor: '#9ca3af', gridColor: '#1e222d', accent: '#2962ff', upColor: '#089981', downColor: '#f23645',
  } },
  { id: 'midnight', label: 'Midnight', colors: {
    uiBackground: '#070b13', topbarBackground: '#0a1020', panelBackground: '#0b1220', chartBackground: '#080d18',
    chartTextColor: '#94a3b8', gridColor: '#1d293b', accent: '#60a5fa', upColor: '#10b981', downColor: '#f43f5e',
  } },
  { id: 'slate', label: 'Slate', colors: {
    uiBackground: '#0f172a', topbarBackground: '#172033', panelBackground: '#111c32', chartBackground: '#0f172a',
    chartTextColor: '#aab8cb', gridColor: '#334155', accent: '#38bdf8', upColor: '#22c55e', downColor: '#fb7185',
  } },
  { id: 'ocean', label: 'Ocean', colors: {
    uiBackground: '#061a23', topbarBackground: '#08232f', panelBackground: '#09232e', chartBackground: '#071b25',
    chartTextColor: '#9cc8d6', gridColor: '#124253', accent: '#22d3ee', upColor: '#34d399', downColor: '#fb7185',
  } },
  { id: 'forest', label: 'Forest', colors: {
    uiBackground: '#071a13', topbarBackground: '#0b2319', panelBackground: '#0d241a', chartBackground: '#081a13',
    chartTextColor: '#a7c7b6', gridColor: '#224b37', accent: '#34d399', upColor: '#4ade80', downColor: '#f87171',
  } },
  { id: 'plum', label: 'Plum', colors: {
    uiBackground: '#1b1026', topbarBackground: '#21152f', panelBackground: '#241735', chartBackground: '#180f23',
    chartTextColor: '#c6b7d8', gridColor: '#433152', accent: '#c084fc', upColor: '#4ade80', downColor: '#fb7185',
  } },
  { id: 'light', label: 'Light', colors: {
    uiBackground: '#f1f5f9', topbarBackground: '#ffffff', panelBackground: '#f8fafc', chartBackground: '#ffffff',
    chartTextColor: '#475569', gridColor: '#e2e8f0', accent: '#2563eb', upColor: '#089981', downColor: '#ef4444',
  } },
] as const;

const DEFAULT_FRAME_PREFERENCES: TcoFramePreferences = {
  sidebar: 'right',
  density: 'comfortable',
  themePreset: 'graphite',
  uiBackground: '#0d0f13',
  topbarBackground: '#141518',
  panelBackground: '#111317',
  chartBackground: '#141518',
  chartTextColor: '#9ca3af',
  gridColor: '#26282e',
  accent: '#8b7cff',
  upColor: '#089981',
  downColor: '#f23645',
  chartBackgroundMode: 'solid',
  chartBackgroundEnd: '#1c2029',
  chartGradientAngle: 135,
  topbar: { watchlist:true, research:true, automation:true, trading:true, journal:true, positions:true, code:true },
};

function safeFrameColor(value: unknown, fallback: string): string {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}
function frameContrastColor(hex: string): string {
  const rgb = hex.replace('#', '').match(/.{2}/g)?.map((part) => parseInt(part, 16) / 255) ?? [0, 0, 0];
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  return luminance > 0.42 ? '#111827' : '#f1f5f9';
}
function frameRgba(hex: string, alpha: number): string {
  const rgb = hex.replace('#', '').match(/.{2}/g)?.map((part) => parseInt(part, 16)) ?? [139, 124, 255];
  return `rgba(${rgb[0] ?? 139}, ${rgb[1] ?? 124}, ${rgb[2] ?? 255}, ${alpha})`;
}
function readTcoFramePreferences(): TcoFramePreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(TCO_FRAME_STORAGE_KEY) || '{}') as Partial<TcoFramePreferences> & { accent?: string };
    const legacyAccent: Record<string, string> = { violet: '#8b7cff', teal: '#14b8a6', blue: '#60a5fa', amber: '#f59e0b' };
    const themePreset = TCO_FRAME_THEME_PRESETS.some((preset) => preset.id === raw.themePreset) ? String(raw.themePreset) : 'custom';
    return {
      ...DEFAULT_FRAME_PREFERENCES,
      sidebar: raw.sidebar === 'left' ? 'left' : 'right',
      density: raw.density === 'compact' ? 'compact' : 'comfortable',
      themePreset,
      uiBackground: safeFrameColor(raw.uiBackground, DEFAULT_FRAME_PREFERENCES.uiBackground),
      topbarBackground: safeFrameColor(raw.topbarBackground, DEFAULT_FRAME_PREFERENCES.topbarBackground),
      panelBackground: safeFrameColor(raw.panelBackground, DEFAULT_FRAME_PREFERENCES.panelBackground),
      chartBackground: safeFrameColor(raw.chartBackground, DEFAULT_FRAME_PREFERENCES.chartBackground),
      chartTextColor: safeFrameColor(raw.chartTextColor, DEFAULT_FRAME_PREFERENCES.chartTextColor),
      gridColor: safeFrameColor(raw.gridColor, DEFAULT_FRAME_PREFERENCES.gridColor),
      accent: safeFrameColor(raw.accent && raw.accent in legacyAccent ? legacyAccent[raw.accent] : raw.accent, DEFAULT_FRAME_PREFERENCES.accent),
      upColor: safeFrameColor(raw.upColor, DEFAULT_FRAME_PREFERENCES.upColor),
      downColor: safeFrameColor(raw.downColor, DEFAULT_FRAME_PREFERENCES.downColor),
      chartBackgroundMode: raw.chartBackgroundMode === 'gradient' ? 'gradient' : 'solid',
      chartBackgroundEnd: safeFrameColor(raw.chartBackgroundEnd, DEFAULT_FRAME_PREFERENCES.chartBackgroundEnd),
      chartGradientAngle: Math.max(0, Math.min(360, Math.round(Number.isFinite(Number(raw.chartGradientAngle)) ? Number(raw.chartGradientAngle) : 135))),
      topbar: { ...DEFAULT_FRAME_PREFERENCES.topbar, ...(raw.topbar || {}) },
    };
  } catch {
    return { ...DEFAULT_FRAME_PREFERENCES, topbar: { ...DEFAULT_FRAME_PREFERENCES.topbar } };
  }
}

function applyTcoFramePreferences(host: HTMLElement, preferences: TcoFramePreferences): void {
  const doc=host.ownerDocument;
  const workspace=(host.closest('.vela-workspace') as HTMLElement|null)??(doc.querySelector('.vela-workspace') as HTMLElement|null)??host;
  let style=doc.getElementById('tco-workspace-frame-style') as HTMLStyleElement|null;
  if(!style){style=doc.createElement('style');style.id='tco-workspace-frame-style';doc.head.appendChild(style);}
  if(style.dataset.tcoInstalled!=='1') {
    style.textContent=`
    .vela-workspace[data-tco-sidebar="left"] .vela-ws-main > .vela-ws-toolbar { order:0; }
    .vela-workspace[data-tco-sidebar="left"] .vela-ws-main > .vela-panel:not([hidden]):not([data-overlay="1"]) { order:1;border-left:0;border-right:1px solid var(--vela-border); }
    .vela-workspace[data-tco-sidebar="left"] .vela-ws-main > .vela-ws-grid { order:2; }
    .vela-workspace[data-tco-sidebar="right"] .vela-ws-main > .vela-ws-toolbar { order:0; }
    .vela-workspace[data-tco-sidebar="right"] .vela-ws-main > .vela-ws-grid { order:1; }
    .vela-workspace[data-tco-sidebar="right"] .vela-ws-main > .vela-panel:not([hidden]):not([data-overlay="1"]) { order:2;border-left:1px solid var(--vela-border);border-right:0; }
    .vela-workspace[data-tco-density="compact"] .vela-widget-topbar { gap:2px;padding:2px 5px;min-height:32px; }
    .vela-workspace[data-tco-density="compact"] .vela-widget-symbol,
    .vela-workspace[data-tco-density="compact"] .vela-widget-tf,
    .vela-workspace[data-tco-density="compact"] .vela-widget-style,
    .vela-workspace[data-tco-density="compact"] .vela-widget-indicators,
    .vela-workspace[data-tco-density="compact"] .vela-widget-action,
    .vela-workspace[data-tco-density="compact"] .vela-widget-action-left,
    .vela-workspace[data-tco-density="compact"] .vela-widget-tool { height:27px;padding-top:0;padding-bottom:0; }
    .vela-workspace[data-tco-hide-watchlist="1"] [data-action-id="tco.watchlist"],
    .vela-workspace[data-tco-hide-research="1"] [data-action-id="tco.research"],
    .vela-workspace[data-tco-hide-automation="1"] [data-action-id="tco.automation"],
    .vela-workspace[data-tco-hide-trading="1"] [data-action-id="tco.trading"],
    .vela-workspace[data-tco-hide-journal="1"] [data-action-id="tco.journal"],
    .vela-workspace[data-tco-hide-positions="1"] [data-action-id="tco.positions"],
    .vela-workspace[data-tco-hide-code="1"] [data-action-id="tco.corespirit-code"] { display:none!important; }
    .vela-workspace { background:var(--tco-user-vela-ui,var(--vela-bg))!important; }
    .vela-workspace .vela-widget-topbar { --vela-fg:var(--tco-user-vela-topbar-text,#d1d4dc);--vela-fg-muted:color-mix(in srgb,var(--tco-user-vela-topbar-text,#d1d4dc) 68%,transparent);--vela-fg-bright:var(--tco-user-vela-topbar-text,#f0f3fa);background:var(--tco-user-vela-topbar,var(--vela-surface))!important;border-bottom-color:var(--tco-user-vela-grid,var(--vela-border))!important; }
    .vela-workspace .vela-ws-toolbar,
    .vela-workspace .vela-ws-strips,
    .vela-workspace .vela-panel { --vela-fg:var(--tco-user-vela-panel-text,#d1d4dc);--vela-fg-muted:color-mix(in srgb,var(--tco-user-vela-panel-text,#d1d4dc) 68%,transparent);--vela-fg-bright:var(--tco-user-vela-panel-text,#f0f3fa);background:var(--tco-user-vela-panel,var(--vela-surface))!important; }
    .vela-workspace .vela-lp { --vela-fg:var(--tco-user-vela-panel-text,#d1d4dc);--vela-fg-muted:color-mix(in srgb,var(--tco-user-vela-panel-text,var(--vela-fg)) 68%,transparent);--vela-fg-bright:var(--tco-user-vela-panel-text,#f0f3fa); }
    .vela-workspace .vela-ws-grid { background:var(--tco-user-vela-grid,var(--vela-border-soft))!important; }
    .vela-workspace .vela-cell { background:var(--tco-user-vela-chart,var(--vela-bg))!important; }
    .vela-workspace .vela-panel { border-color:var(--tco-user-vela-grid,var(--vela-border))!important; }
    .vela-workspace .vela-lp { background:var(--tco-user-vela-panel,var(--vela-surface))!important; }
    .tco-frame-panel { gap:12px;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important; }
    .tco-frame-eyebrow { color:var(--vela-fg-muted);font-size:10px;font-weight:750;letter-spacing:.13em;text-transform:uppercase; }
    .tco-frame-card { padding:11px 12px;border:1px solid var(--vela-border);border-radius:9px;background:color-mix(in srgb,var(--vela-surface-sunken) 40%,transparent); }
    .tco-frame-row { display:flex;align-items:center;justify-content:space-between;gap:12px; }
    .tco-frame-label { color:var(--vela-fg);font-size:12px;font-weight:600; }
    .tco-frame-help { color:var(--vela-fg-muted);font-size:10px;line-height:1.55; }
    .tco-frame-select { width:142px;max-width:48%;padding:7px 8px;border:1px solid var(--vela-border);border-radius:6px;background:var(--vela-surface-sunken);color:var(--vela-fg);font:11px Inter,ui-sans-serif,system-ui,sans-serif; }
    .tco-frame-toggle { display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--vela-border-soft);color:var(--vela-fg);font-size:11px; }
    .tco-frame-toggle:last-child { border-bottom:0; }
    .tco-frame-toggle input { accent-color:var(--tco-frame-accent,#8b7cff); }
    .tco-frame-button { border:1px solid var(--vela-border);border-radius:6px;padding:7px 10px;background:var(--vela-surface-sunken);color:var(--vela-fg);font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer; }
    .tco-frame-button-primary { border-color:var(--tco-frame-accent,#8b7cff);background:var(--tco-frame-accent-soft,rgba(139,124,255,.18)); }
    .tco-frame-theme-choice { display:flex;flex-direction:column;gap:6px;min-width:0;text-align:left;padding:8px;border:1px solid var(--vela-border);border-radius:8px;background:var(--vela-surface-sunken);color:var(--vela-fg);cursor:pointer;transition:border-color 120ms ease,box-shadow 120ms ease,transform 120ms ease; }
    .tco-frame-theme-choice:hover { border-color:var(--tco-frame-accent,#8b7cff);transform:translateY(-1px); }
    .tco-frame-theme-choice[aria-pressed="true"] { border-color:var(--tco-frame-accent,#8b7cff);box-shadow:0 0 0 1px var(--tco-frame-accent,#8b7cff); }
    .tco-frame-theme-swatches { display:flex;height:18px;overflow:hidden;border:1px solid var(--vela-border-soft);border-radius:4px; }
    .tco-frame-theme-swatches span { display:block;flex:1 1 0;min-width:0; }
    .tco-frame-theme-label { font-size:10px;font-weight:700;line-height:1.25; }
    .tco-frame-color-grid { display:grid;grid-template-columns:1fr;gap:6px; }
    .tco-frame-color-control { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border:1px solid var(--vela-border);border-radius:7px;background:var(--vela-surface-sunken);color:var(--vela-fg);cursor:pointer; }
    .tco-frame-color-name { font-size:10px;font-weight:600; }
    .tco-frame-color-value { font-size:9px;color:var(--vela-fg-muted);font-family:ui-monospace,monospace; }
    .tco-frame-color-picker { width:34px;height:26px;padding:0;border:1px solid var(--vela-border);border-radius:5px;background:transparent;cursor:pointer; }
    .tco-frame-mode { flex:1;border:1px solid var(--vela-border);border-radius:6px;padding:7px;background:transparent;color:var(--vela-fg-muted);font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer; }
    .tco-frame-mode[aria-pressed="true"] { border-color:var(--tco-frame-accent,#8b7cff);background:var(--tco-frame-accent-soft,rgba(139,124,255,.18));color:var(--vela-fg-bright); }
    .tco-frame-gradient-preview { height:36px;border:1px solid var(--vela-border);border-radius:7px; }
    .tco-watch-search { width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--vela-border);border-radius:7px;outline:none;background:var(--vela-surface-sunken);color:var(--vela-fg);font:11px Inter,ui-sans-serif,system-ui,sans-serif; }
    .tco-watch-search:focus { border-color:var(--tco-frame-accent,#8b7cff); }
    .tco-watch-filter { border:1px solid var(--vela-border);border-radius:6px;background:transparent;color:var(--vela-fg-muted);padding:5px 9px;font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer; }
    .tco-watch-filter[aria-pressed="true"] { color:var(--vela-fg-bright);border-color:var(--tco-frame-accent,#8b7cff);background:var(--tco-frame-accent-soft,rgba(139,124,255,.18)); }
    .tco-watch-detail { flex:0 0 auto;margin-top:auto;padding:12px;border:1px solid var(--vela-border);border-radius:9px;background:var(--vela-surface); }
    .tco-watch-metric { min-width:0;padding:8px 9px;border:1px solid var(--vela-border-soft);border-radius:7px;background:var(--vela-surface-sunken); }
    .tco-watch-metric-label { color:var(--vela-fg-muted);font-size:9px;margin-bottom:4px; }
    .tco-watch-metric-value { color:var(--vela-fg-bright);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }
    .tco-core-studio { min-height:0; }
    .tco-core-editor-frame { min-height:280px!important;flex:1 1 auto;border-color:var(--vela-border)!important;border-radius:9px!important;background:var(--vela-surface-sunken)!important; }
    .tco-core-editor-frame textarea { background:var(--vela-surface-sunken)!important; }
    .tco-core-status { border-radius:7px!important;border-color:var(--vela-border)!important;background:var(--vela-surface)!important; }
    `;
    style.dataset.tcoInstalled='1';
  }
  workspace.dataset.tcoSidebar=preferences.sidebar;
  workspace.dataset.tcoDensity=preferences.density;
  workspace.dataset.tcoColorPreset=preferences.themePreset;
  for(const key of Object.keys(DEFAULT_FRAME_PREFERENCES.topbar))
    workspace.dataset[`tcoHide${key[0]!.toUpperCase()}${key.slice(1)}`]=preferences.topbar[key]?'0':'1';

  const chartTheme: VelaTheme = {
    background: preferences.chartBackground,
    ...(preferences.chartBackgroundMode === 'gradient'
      ? { backgroundGradient: { from: preferences.chartBackground, to: preferences.chartBackgroundEnd, angle: preferences.chartGradientAngle } }
      : {}),
    textColor: preferences.chartTextColor,
    gridColor: preferences.gridColor,
    borderColor: preferences.gridColor,
    upColor: preferences.upColor,
    downColor: preferences.downColor,
    fontFamily: 'Inter, system-ui, sans-serif',
  };
  try {
    const liveWorkspace=(window as Window & { __TCO_VELA__?: { workspace?: { setTheme?: (theme: VelaTheme) => void } } }).__TCO_VELA__?.workspace;
    const signature=JSON.stringify(chartTheme);
    if(liveWorkspace && typeof liveWorkspace.setTheme==='function'
      && (liveWorkspace!==lastAppliedTcoVelaThemeWorkspace || signature!==lastAppliedTcoVelaThemeSignature)) {
      liveWorkspace.setTheme(chartTheme);
      lastAppliedTcoVelaThemeWorkspace=liveWorkspace;
      lastAppliedTcoVelaThemeSignature=signature;
    }
  } catch {}

  // The UI palette is intentionally distinct from the plot palette, just like a trading
  // terminal: chart candles/canvas can change without forcing the surrounding workspace.
  const uiTheme: VelaTheme = {
    background: preferences.uiBackground,
    textColor: frameContrastColor(preferences.uiBackground),
    gridColor: preferences.gridColor,
    borderColor: preferences.gridColor,
    upColor: preferences.upColor,
    downColor: preferences.downColor,
    fontFamily: 'Inter, system-ui, sans-serif',
  };
  for (const [key, value] of Object.entries(themeTokens(uiTheme))) workspace.style.setProperty(key, value);
  workspace.style.setProperty('--tco-user-vela-ui', preferences.uiBackground);
  workspace.style.setProperty('--tco-user-vela-topbar', preferences.topbarBackground);
  workspace.style.setProperty('--tco-user-vela-topbar-text', frameContrastColor(preferences.topbarBackground));
  workspace.style.setProperty('--tco-user-vela-panel', preferences.panelBackground);
  workspace.style.setProperty('--tco-user-vela-panel-text', frameContrastColor(preferences.panelBackground));
  workspace.style.setProperty('--tco-user-vela-chart', preferences.chartBackground);
  workspace.style.setProperty('--tco-user-vela-grid', preferences.gridColor);
  workspace.style.setProperty('--vela-bg', preferences.uiBackground);
  workspace.style.setProperty('--vela-surface', preferences.panelBackground);
  workspace.style.setProperty('--vela-surface-elev', preferences.panelBackground);
  workspace.style.setProperty('--vela-surface-overlay', preferences.panelBackground);
  workspace.style.setProperty('--vela-surface-sunken', preferences.uiBackground);
  workspace.style.setProperty('--vela-border', preferences.gridColor);
  workspace.style.setProperty('--vela-border-soft', preferences.gridColor);
  workspace.style.setProperty('--vela-selected-bg', preferences.accent);
  workspace.style.setProperty('--vela-selected-fg', frameContrastColor(preferences.accent));
  workspace.style.setProperty('--vela-accent', preferences.accent);
  workspace.style.setProperty('--vela-accent-bright', preferences.accent);
  workspace.style.setProperty('--vela-active', frameRgba(preferences.accent, .16));
  workspace.style.setProperty('--vela-hover-strong', frameRgba(preferences.accent, .22));
  workspace.style.setProperty('--tco-frame-accent', preferences.accent);
  workspace.style.setProperty('--tco-frame-accent-soft', frameRgba(preferences.accent, .18));
  try { localStorage.setItem(TCO_FRAME_STORAGE_KEY,JSON.stringify(preferences)); } catch {}
}

export function applySavedTcoVelaAppearance(host: HTMLElement): void {
  applyTcoFramePreferences(host, readTcoFramePreferences());
}

function createFrameSelect(options:Array<[string,string]>,value:string):HTMLSelectElement {
  const select=document.createElement('select');select.className='tco-frame-select';
  for(const [key,label] of options){const option=document.createElement('option');option.value=key;option.textContent=label;option.selected=key===value;select.appendChild(option);}
  return select;
}

const CORESPIRIT_LIVE_EDITOR_KEY = 'tradingcore:corespirit:chart-source';
const CORESPIRIT_STARTER = `indicator("CoreSpirit Trend") {
    overlay: true
    input length = int(20, min: 1)
}

fast = ema(close, length)
slow = ema(close, length * 2)

plot fast
plot slow

if fast crossesAbove slow {
    signal "BUY"
}

if fast crossesBelow slow {
    signal "SELL"
}`;

const workspaceFramePanel: SidePanelDescriptor = {
  id:'tco.workspace-frame', title:'Workspace', icon:'layout', order:1, width:360, resizable:true, minWidth:320, maxWidth:480,
  mount(ctx,body,header){
    header.setTitle('Workspace appearance');
    const root=panelRoot(body);root.classList.add('tco-frame-panel');
    const intro=document.createElement('div');intro.className='tco-frame-card';
    const eyebrow=document.createElement('div');eyebrow.className='tco-frame-eyebrow';eyebrow.textContent='TradingCoreOS theme';
    const copy=document.createElement('div');copy.className='tco-frame-help';copy.style.marginTop='7px';
    copy.textContent='Choose a full terminal color scheme or tune the UI, chart canvas, grid, accent and candle colors. Changes preview immediately and persist in this browser.';
    intro.append(eyebrow,copy);root.appendChild(intro);
    let prefs=readTcoFramePreferences();

    const addSetting=(label:string,description:string,control:HTMLElement)=>{
      const card=document.createElement('div');card.className='tco-frame-card';
      const row=document.createElement('div');row.className='tco-frame-row';
      const text=document.createElement('div');const title=document.createElement('div');title.className='tco-frame-label';title.textContent=label;
      const help=document.createElement('div');help.className='tco-frame-help';help.style.marginTop='4px';help.textContent=description;
      text.append(title,help);row.append(text,control);card.appendChild(row);root.appendChild(card);
    };

    const themeCard=document.createElement('div');themeCard.className='tco-frame-card';themeCard.style.cssText='display:flex;flex-direction:column;gap:8px;';
    const themeTitle=document.createElement('div');themeTitle.className='tco-frame-label';themeTitle.textContent='Color scheme';
    const themeHelp=document.createElement('div');themeHelp.className='tco-frame-help';themeHelp.textContent='TradingView-style presets, with instant active-state previews.';
    const themeGrid=document.createElement('div');themeGrid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;';
    const presetButtons=new Map<string,HTMLButtonElement>();
    const colorControls=new Map<TcoFrameColorKey,{input:HTMLInputElement;hex:HTMLElement}>();
    const modeButtons:HTMLButtonElement[]=[];
    let gradientEndInput: HTMLInputElement | null = null;
    let gradientEndHex: HTMLElement | null = null;
    let gradientPreview: HTMLDivElement | null = null;
    let gradientAngleInput: HTMLInputElement | null = null;
    let gradientAngleValue: HTMLElement | null = null;
    let gradientEndRow: HTMLLabelElement | null = null;
    let gradientAngleRow: HTMLLabelElement | null = null;

    const setPresetSelection=()=>{
      for(const [id,button] of presetButtons) button.setAttribute('aria-pressed',String(prefs.themePreset===id));
    };
    const syncColorControls=()=>{
      for(const [key,control] of colorControls){
        const value=prefs[key];control.input.value=value;control.hex.textContent=value.toUpperCase();
      }
      if(gradientEndInput) gradientEndInput.value=prefs.chartBackgroundEnd;
      if(gradientEndHex) gradientEndHex.textContent=prefs.chartBackgroundEnd.toUpperCase();
      if(gradientEndRow) gradientEndRow.hidden=prefs.chartBackgroundMode!=='gradient';
      if(gradientAngleRow) gradientAngleRow.hidden=prefs.chartBackgroundMode!=='gradient';
      for(const button of modeButtons) button.setAttribute('aria-pressed',String(button.dataset.mode===prefs.chartBackgroundMode));
      if(gradientPreview){
        gradientPreview.style.background=prefs.chartBackgroundMode==='gradient'
          ? `linear-gradient(${prefs.chartGradientAngle}deg, ${prefs.chartBackground}, ${prefs.chartBackgroundEnd})`
          : prefs.chartBackground;
        gradientPreview.setAttribute('aria-label',prefs.chartBackgroundMode==='gradient'?'Chart background gradient preview':'Chart background preview');
      }
      if(gradientAngleValue) gradientAngleValue.textContent=prefs.chartGradientAngle+'°';
      if(gradientAngleInput) gradientAngleInput.value=String(prefs.chartGradientAngle);
    };
    const updatePrefs=(patch:Partial<TcoFramePreferences>)=>{
      prefs={...prefs,...patch,themePreset:'custom'};
      applyTcoFramePreferences(ctx.host,prefs);setPresetSelection();syncColorControls();
    };
    const applyPreset=(preset:TcoFrameThemePreset)=>{
      prefs={...prefs,...preset.colors,themePreset:preset.id,chartBackgroundMode:'solid'};
      applyTcoFramePreferences(ctx.host,prefs);setPresetSelection();syncColorControls();
      ctx.toast('Color scheme applied','success');
    };

    for(const preset of TCO_FRAME_THEME_PRESETS){
      const button=document.createElement('button');button.type='button';button.className='tco-frame-theme-choice';
      button.setAttribute('aria-label',`Use ${preset.label} color scheme`);button.setAttribute('aria-pressed','false');
      const swatches=document.createElement('span');swatches.className='tco-frame-theme-swatches';
      for(const color of [preset.colors.uiBackground,preset.colors.topbarBackground,preset.colors.chartBackground,preset.colors.accent,preset.colors.upColor,preset.colors.downColor]){
        const swatch=document.createElement('span');swatch.style.background=color;swatches.appendChild(swatch);
      }
      const label=document.createElement('span');label.className='tco-frame-theme-label';label.textContent=preset.label;
      button.append(swatches,label);button.addEventListener('click',()=>applyPreset(preset));themeGrid.appendChild(button);presetButtons.set(preset.id,button);
    }
    themeCard.append(themeTitle,themeHelp,themeGrid);root.appendChild(themeCard);

    const appearanceDetails=document.createElement('details');appearanceDetails.open=true;appearanceDetails.className='tco-frame-card';
    const customizeSummary=document.createElement('summary');customizeSummary.className='tco-frame-label';customizeSummary.textContent='Customize colors';customizeSummary.style.cssText='cursor:pointer;list-style-position:inside;';
    const colorIntro=document.createElement('div');colorIntro.className='tco-frame-help';colorIntro.style.margin='8px 0';colorIntro.textContent='Pick any color. UI surfaces, chart cosmetics and candlestick colors can be tuned independently.';
    const colorGrid=document.createElement('div');colorGrid.className='tco-frame-color-grid';
    const colorFields:Array<[TcoFrameColorKey,string]>=[
      ['uiBackground','Workspace background'],
      ['topbarBackground','Top bar'],
      ['panelBackground','Panels and tools'],
      ['chartBackground','Chart canvas'],
            ['chartTextColor','Chart text'],
      ['gridColor','Grid and borders'],
      ['accent','Accent and selection'],
      ['upColor','Bull candle'],
      ['downColor','Bear candle'],
    ];
    for(const [key,label] of colorFields){
      const row=document.createElement('label');row.className='tco-frame-color-control';
      const left=document.createElement('span');left.style.cssText='display:flex;flex-direction:column;gap:3px;min-width:0;';
      const name=document.createElement('span');name.className='tco-frame-color-name';name.textContent=label;
      const hex=document.createElement('span');hex.className='tco-frame-color-value';hex.textContent=prefs[key].toUpperCase();
      left.append(name,hex);
      const input=document.createElement('input');input.type='color';input.className='tco-frame-color-picker';input.value=prefs[key];input.setAttribute('aria-label',label);
      input.addEventListener('input',()=>updatePrefs({[key]:input.value} as Partial<TcoFramePreferences>));
      row.append(left,input);colorGrid.appendChild(row);colorControls.set(key,{input,hex});
    }

    const modeLabel=document.createElement('div');modeLabel.className='tco-frame-label';modeLabel.style.marginTop='10px';modeLabel.textContent='Chart background fill';
    const modeControls=document.createElement('div');modeControls.style.cssText='display:flex;gap:6px;margin-top:7px;';
    for(const [mode,label] of [['solid','Solid'],['gradient','Gradient']] as const){
      const button=document.createElement('button');button.type='button';button.className='tco-frame-mode';button.textContent=label;button.dataset.mode=mode;button.setAttribute('aria-pressed',String(prefs.chartBackgroundMode===mode));
      button.addEventListener('click',()=>updatePrefs({chartBackgroundMode:mode}));modeButtons.push(button);modeControls.appendChild(button);
    }

    gradientEndRow=document.createElement('label');gradientEndRow.className='tco-frame-color-control';gradientEndRow.style.marginTop='7px';
    const gradientEndLabel=document.createElement('span');gradientEndLabel.className='tco-frame-color-name';gradientEndLabel.textContent='Gradient end color';
    gradientEndInput=document.createElement('input');gradientEndInput.type='color';gradientEndInput.className='tco-frame-color-picker';gradientEndInput.value=prefs.chartBackgroundEnd;gradientEndInput.setAttribute('aria-label','Gradient end color');
    gradientEndHex=document.createElement('span');gradientEndHex.className='tco-frame-color-value';gradientEndHex.textContent=prefs.chartBackgroundEnd.toUpperCase();
    const gradientEndCopy=document.createElement('span');gradientEndCopy.style.cssText='display:flex;flex-direction:column;gap:3px;';gradientEndCopy.append(gradientEndLabel,gradientEndHex);gradientEndRow.append(gradientEndCopy,gradientEndInput);
    gradientEndInput.addEventListener('input',()=>updatePrefs({chartBackgroundEnd:gradientEndInput!.value}));

    gradientAngleRow=document.createElement('label');gradientAngleRow.style.cssText='display:block;margin-top:9px;';
    const gradientAngleHead=document.createElement('span');gradientAngleHead.style.cssText='display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--vela-fg);';
    const gradientAngleLabel=document.createElement('span');gradientAngleLabel.textContent='Gradient angle';
    gradientAngleValue=document.createElement('span');gradientAngleValue.textContent=prefs.chartGradientAngle+'°';gradientAngleHead.append(gradientAngleLabel,gradientAngleValue);
    gradientAngleInput=document.createElement('input');gradientAngleInput.type='range';gradientAngleInput.min='0';gradientAngleInput.max='360';gradientAngleInput.step='5';gradientAngleInput.value=String(prefs.chartGradientAngle);gradientAngleInput.setAttribute('aria-label','Gradient angle');gradientAngleInput.style.cssText='width:100%;margin-top:8px;accent-color:var(--tco-frame-accent);';
    gradientAngleInput.addEventListener('input',()=>updatePrefs({chartGradientAngle:Number(gradientAngleInput!.value)}));
    gradientAngleRow.append(gradientAngleHead,gradientAngleInput);

    gradientPreview=document.createElement('div');gradientPreview.className='tco-frame-gradient-preview';gradientPreview.setAttribute('role','img');
    appearanceDetails.append(customizeSummary,colorIntro,colorGrid,modeLabel,modeControls,gradientEndRow,gradientAngleRow,gradientPreview);root.appendChild(appearanceDetails);

    const sidebar=createFrameSelect([['right','Right sidebar'],['left','Left sidebar']],prefs.sidebar);sidebar.setAttribute('aria-label','Sidebar position');
    sidebar.addEventListener('change',()=>{prefs={...prefs,sidebar:sidebar.value as TcoFramePreferences['sidebar']};applyTcoFramePreferences(ctx.host,prefs);});
    addSetting('Sidebar position','Dock panels on either side of the chart.',sidebar);
    const density=createFrameSelect([['comfortable','Comfortable'],['compact','Compact']],prefs.density);density.setAttribute('aria-label','Top bar density');
    density.addEventListener('change',()=>{prefs={...prefs,density:density.value as TcoFramePreferences['density']};applyTcoFramePreferences(ctx.host,prefs);});
    addSetting('Top bar density','Choose a roomier bar or a compact trading-terminal strip.',density);

    const tools=document.createElement('div');tools.className='tco-frame-card';
    const title=document.createElement('div');title.className='tco-frame-label';title.textContent='Top bar tools';
    const help=document.createElement('div');help.className='tco-frame-help';help.style.cssText='margin:4px 0 8px;';
    help.textContent='Hide actions you do not use. Symbol, timeframe, chart style, Indicators, drawings and settings remain available.';
    tools.append(title,help);
    const toolInputs = new Map<keyof TcoFramePreferences['topbar'], HTMLInputElement>();
    const toolOptions:Array<[keyof TcoFramePreferences['topbar'],string]>=[
      ['watchlist','Watchlist'],['research','Research'],['automation','Automation'],['trading','Trading'],['journal','Journal'],['positions','Positions'],['code','CoreSpirit Studio'],
    ];
    for(const [key,label] of toolOptions){
      const row=document.createElement('label');row.className='tco-frame-toggle';
      const input=document.createElement('input');input.type='checkbox';input.checked=prefs.topbar[key]!==false;
      const text=document.createElement('span');text.textContent=label;row.append(input,text);tools.appendChild(row);
      toolInputs.set(key,input);
      input.addEventListener('change',()=>{prefs={...prefs,topbar:{...prefs.topbar,[key]:input.checked}};applyTcoFramePreferences(ctx.host,prefs);});
    }
    root.appendChild(tools);
    const reset=document.createElement('button');reset.type='button';reset.className='tco-frame-button tco-frame-button-primary';reset.textContent='Reset workspace appearance';
    reset.addEventListener('click',()=>{
      prefs={...DEFAULT_FRAME_PREFERENCES,topbar:{...DEFAULT_FRAME_PREFERENCES.topbar}};
      sidebar.value=prefs.sidebar;density.value=prefs.density;
      for(const [key,input] of toolInputs) input.checked=prefs.topbar[key]!==false;
      applyTcoFramePreferences(ctx.host,prefs);setPresetSelection();syncColorControls();
      ctx.toast('Workspace appearance reset','success');
    });
    root.appendChild(reset);
    applyTcoFramePreferences(ctx.host,prefs);setPresetSelection();syncColorControls();
    return {onOpen:()=>{applyTcoFramePreferences(ctx.host,prefs);}};
  },
};

const coreSpiritCodePanel: SidePanelDescriptor = {
  id: 'tco.corespirit-code',
  title: 'CoreSpirit',
  icon: 'indicators',
  order: 5,
  width: 520,
  resizable: true,
  minWidth: 380,
  maxWidth: 760,
  maximizable: true,
  mount(ctx, body, header) {
    header.setTitle('CoreSpirit Studio');
    const root = panelRoot(body);
    root.classList.add('tco-core-studio');
    root.style.fontFamily = 'Inter, ui-sans-serif, system-ui, sans-serif';
    root.style.gap = '12px';
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const language = document.createElement('span');
    language.textContent = 'CORESCRIPT';
    language.style.cssText = 'font:750 10px ui-monospace,monospace;letter-spacing:.14em;color:var(--tco-frame-accent,#a5b4fc);border:1px solid var(--vela-border);background:var(--tco-frame-accent-soft,rgba(129,140,248,.12));border-radius:6px;padding:6px 8px;';
    const target = document.createElement('span');
    target.textContent = `${ctx.symbol} · ${ctx.timeframe} · worker compiler`;
    target.style.cssText = 'margin-left:auto;max-width:66%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--vela-fg-muted);font-variant-numeric:tabular-nums;';
    top.append(language, target);
    const examples = document.createElement('select');
    examples.setAttribute('aria-label', 'CoreSpirit starter examples');
    examples.style.cssText = 'width:100%;padding:8px 9px;border:1px solid var(--vela-border);border-radius:7px;background:var(--vela-surface-sunken);color:var(--vela-fg);font:11px Inter,ui-sans-serif,system-ui,sans-serif;';
    for (const [value, label] of [['starter','Trend crossover'],['rsi','RSI recovery'],['levels','Range levels']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; examples.appendChild(option);
    }
    const editorFrame = document.createElement('div');
    editorFrame.className = 'tco-core-editor-frame';
    editorFrame.style.cssText = 'display:flex;min-height:280px;flex:1;overflow:hidden;border:1px solid var(--vela-border);border-radius:9px;background:var(--vela-surface-sunken);';
    const editorHost = document.createElement('div');
    editorHost.setAttribute('aria-label', 'CoreSpirit code editor');
    editorHost.style.cssText = 'display:none;flex:1;min-width:0;min-height:320px;width:100%;';
    const fallbackEditor = document.createElement('textarea');
    fallbackEditor.spellcheck = false;
    fallbackEditor.setAttribute('aria-label', 'CoreSpirit code editor fallback');
    fallbackEditor.setAttribute('autocapitalize', 'off');
    fallbackEditor.setAttribute('autocomplete', 'off');
    fallbackEditor.setAttribute('autocorrect', 'off');
    fallbackEditor.wrap = 'off';
    fallbackEditor.style.cssText = 'display:block;flex:1;min-width:0;min-height:280px;resize:vertical;border:0;outline:0;padding:14px;background:var(--vela-surface-sunken);color:var(--vela-fg-bright);caret-color:var(--tco-frame-accent,#14b8a6);font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:4;white-space:pre;overflow:auto;';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.className = 'tco-core-status';
    status.style.cssText = 'min-height:34px;white-space:pre-wrap;border:1px solid var(--vela-border);border-radius:7px;padding:9px 10px;color:var(--vela-fg-muted);background:var(--vela-surface);font:10px/1.55 ui-monospace,monospace;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:7px;align-items:center;';
    const compile = document.createElement('button');
    compile.type = 'button'; compile.textContent = 'Validate';
    compile.className = 'tco-frame-button';
    compile.style.cssText = 'border:1px solid var(--vela-border);border-radius:7px;padding:8px 12px;background:var(--vela-surface-sunken);color:var(--vela-fg);font-size:11px;font-weight:650;cursor:pointer;';
    const run = document.createElement('button');
    run.type = 'button'; run.textContent = 'Compile & Run';
    run.className = 'tco-frame-button tco-frame-button-primary';
    run.style.cssText = 'border:1px solid var(--tco-frame-accent,#8b7cff);border-radius:7px;padding:8px 12px;background:var(--tco-frame-accent-soft,rgba(99,102,241,.15));color:var(--vela-fg-bright);font-size:11px;font-weight:750;cursor:pointer;';
    const retryLoad = document.createElement('button');
    retryLoad.type = 'button';
    retryLoad.textContent = 'Retry loading';
    retryLoad.className = 'tco-frame-button';
    retryLoad.style.cssText = 'display:none;border:1px solid rgba(248,113,113,.4);border-radius:7px;padding:8px 10px;background:rgba(127,29,29,.10);color:#fca5a5;font-size:10px;cursor:pointer;';
    retryLoad.setAttribute('aria-label', 'Retry loading CoreSpirit Studio capabilities');
    const openFull = document.createElement('button');
    openFull.type = 'button'; openFull.textContent = 'Full IDE ↗';
    openFull.className = 'tco-frame-button';
    openFull.style.cssText = 'margin-left:auto;border:1px solid var(--vela-border);border-radius:7px;padding:8px 10px;background:transparent;color:var(--vela-fg-muted);font-size:10px;cursor:pointer;';
    compile.disabled = true;
    run.disabled = true;
    compile.setAttribute('aria-label', 'Validate current CoreScript');
    run.setAttribute('aria-label', 'Compile and run CoreScript on the active Vela chart');
    retryLoad.setAttribute('hidden', '');
    actions.append(compile, run, retryLoad, openFull);
    editorFrame.append(editorHost, fallbackEditor);
    root.append(top, examples, editorFrame, status, actions);

    const sourceFor = (key: string): string => {
      if (key === 'rsi') return 'indicator("RSI Recovery")\n\nr = rsi(close, 14)\nplot(r, name = "RSI")\n\nif crossover(r, 30) {\n    signal("RSI RECOVERY")\n}';
      if (key === 'levels') return 'indicator("Range Levels")\n\nhi = highest(high, 20)\nlo = lowest(low, 20)\nplot(hi, name = "20-bar High")\nplot(lo, name = "20-bar Low")';
      return CORESPIRIT_STARTER;
    };
    let source = CORESPIRIT_STARTER;
    try { source = localStorage.getItem(CORESPIRIT_LIVE_EDITOR_KEY) || CORESPIRIT_STARTER; } catch {}
    fallbackEditor.value = source;
    let editorModel: CoreSpiritEditorModelType | undefined;
    let monacoAdapter: CoreSpiritMonacoAdapter | undefined;
    let disposed = false;
    const syncEditor = () => {
      target.textContent = `${ctx.symbol} · ${ctx.timeframe} · worker compiler · ${source.split('\n').length} lines`;
      fallbackEditor.value = source;
      try { localStorage.setItem(CORESPIRIT_LIVE_EDITOR_KEY, source); } catch {}
    };
    fallbackEditor.addEventListener('input', () => {
      source = fallbackEditor.value;
      compileGeneration += 1;
      editorModel?.updateSource(source, '', { deferSemanticAnalysis: true });
      syncEditor();
    });
    examples.addEventListener('change', () => {
      source = sourceFor(examples.value);
      compileGeneration += 1;
      editorModel?.updateSource(source, '', { deferSemanticAnalysis: true });
      monacoAdapter?.setSource(source);
      syncEditor();
    });
    syncEditor();
    let compileGeneration = 0;
    // A Run action should update the Studio's active script in place, not stack duplicates.
    type LiveStudioHandle = ReturnType<typeof ctx.chart.indicators>[number];
    let liveStudioHandle: LiveStudioHandle | undefined;
    let liveStudioBoundHandleId: string | undefined;
    let liveStudioHasRun = false;
    let liveStudioUpdateToken = 0;
    const bindLiveStudioHandle = (handle: LiveStudioHandle, alreadyRunning: boolean): void => {
      if (liveStudioBoundHandleId === handle.id) return;
      liveStudioBoundHandleId = handle.id;
      liveStudioHandle = handle;
      liveStudioHasRun = alreadyRunning;
      handle.on('ready', () => {
        if (disposed || liveStudioHandle?.id !== handle.id) return;
        liveStudioHasRun = true;
        status.textContent = 'Running · CoreSpirit indicator is attached to the active chart.';
        status.style.color = '#86efac';
        ctx.toast('CoreSpirit indicator is running on the active chart', 'success');
      });
      handle.on('error', ({ error }) => {
        if (disposed || liveStudioHandle?.id !== handle.id) return;
        liveStudioUpdateToken += 1; // cancel any status poll for a superseded update
        const hadWorkingVersion = liveStudioHasRun;
        if (!hadWorkingVersion) {
          try { handle.remove(); } catch {}
          if (liveStudioHandle?.id === handle.id) liveStudioHandle = undefined;
          liveStudioBoundHandleId = undefined;
        }
        status.textContent = `Vela could not compile or execute this CoreScript: ${error instanceof Error ? error.message : String(error)}`;
        status.style.color = '#fca5a5';
        ctx.toast(hadWorkingVersion ? 'CoreSpirit update failed' : 'CoreSpirit indicator failed and was removed', 'error');
      });
    };
    status.textContent = 'CoreSpirit Studio is optional. Loading editor capabilities…';
    status.style.color = '#94a3b8';
    editorFrame.setAttribute('aria-busy', 'true');

    const loadEditorCapabilities = async (): Promise<void> => {
      if (disposed) return;
      retryLoad.hidden = true;
      retryLoad.removeAttribute('hidden');
      retryLoad.style.display = 'none';
      compile.disabled = true;
      run.disabled = true;
      status.textContent = 'Loading CoreScript editor and worker-backed compiler…';
      status.style.color = '#94a3b8';
      try {
        // These modules are intentionally not part of the live terminal's initial
        // dependency graph. Import them only after the user opens CoreSpirit Studio.
        const [modelModule, monacoModule] = await Promise.all([
          import('../../coreSpirit/editorModel'),
          import('../../coreSpirit/monacoAdapter'),
        ]);
        if (disposed) return;
        editorModel = new modelModule.CoreSpiritEditorModel(source);
        // Existing textarea/example listeners now have the live editor model to update.
        try {
          const adapter = await monacoModule.mountCoreSpiritMonaco(editorHost, editorModel, (nextSource) => {
            source = nextSource;
            compileGeneration += 1;
            editorModel?.updateSource(source, '', { deferSemanticAnalysis: true });
            fallbackEditor.value = source;
            syncEditor();
          });
          if (disposed) { adapter.dispose(); return; }
          monacoAdapter = adapter;
          adapter.setSource(source);
          editorHost.style.display = 'block';
          fallbackEditor.style.display = 'none';
          status.textContent = 'CoreScript editor ready · worker compilation on demand';
          status.style.color = '#94a3b8';
        } catch (error) {
          if (disposed) return;
          editorHost.style.display = 'none';
          fallbackEditor.style.display = 'block';
          status.textContent = `Monaco unavailable; accessible editor fallback active. ${error instanceof Error ? error.message : String(error)}`;
          status.style.color = '#fbbf24';
        }
        compile.disabled = false;
        run.disabled = false;
        editorFrame.setAttribute('aria-busy', 'false');
        syncEditor();
      } catch (error) {
        if (disposed) return;
        editorHost.style.display = 'none';
        fallbackEditor.style.display = 'block';
        editorFrame.setAttribute('aria-busy', 'false');
        status.textContent = `CoreSpirit editor capabilities failed to load. ${error instanceof Error ? error.message : String(error)}`;
        status.style.color = '#fca5a5';
        retryLoad.style.display = 'inline-flex';
        retryLoad.hidden = false;
      }
    };

    retryLoad.addEventListener('click', () => { void loadEditorCapabilities(); });
    void loadEditorCapabilities();

    const compileSource = async (shouldRun: boolean) => {
      const currentSource = source.trim();
      const activeEditorModel = editorModel;
      if (!activeEditorModel) { status.textContent = 'CoreSpirit editor is still loading. Retry if this message persists.'; status.style.color = '#fca5a5'; return; }
      if (!currentSource) { status.textContent = 'Enter a CoreScript indicator first.'; status.style.color = '#fca5a5'; return; }
      const generation = ++compileGeneration;
      compile.disabled = run.disabled = true;
      compile.textContent = 'Compiling…';
      run.textContent = 'Compiling…';
      status.textContent = 'Parsing and type-checking in the CoreSpirit compiler worker…';
      status.style.color = '#94a3b8';
      try {
        const { compileCoreSpiritSourceOffThread } = await import('../../coreSpirit/coreSpiritCompilerClient');
        if (disposed || generation !== compileGeneration) return;
        const result = await compileCoreSpiritSourceOffThread(currentSource, generation, 'tco-live-studio', { layer: 'chart' });
        if (generation !== compileGeneration) return;
        activeEditorModel.applyWorkerCompileResult(result, currentSource);
        monacoAdapter?.setDiagnostics(result.diagnostics, currentSource);
        monacoAdapter?.setSymbolInfo(result.symbols);
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        if (errors.length || !result.artifact) {
          status.textContent = errors.slice(0, 5).map(d => d.message).join('\n') || 'No executable artifact was produced.';
          status.style.color = '#fca5a5';
          return;
        }
        status.textContent = `Valid · ${result.artifactHash?.slice(0, 12) || 'artifact ready'} · ${result.diagnostics.length} diagnostics`;
        status.style.color = '#86efac';
        if (shouldRun) {
          try {
            const currentHandles = ctx.chart.indicators();
            // Reuse this panel's active script (or one retained after the panel was
            // closed/reopened) so Run behaves like a code editor, not "add duplicate".
            let handle = liveStudioHandle && currentHandles.some((candidate) => candidate.id === liveStudioHandle?.id)
              ? liveStudioHandle
              : currentHandles.find((candidate) => candidate.id.startsWith('tco-corespirit-live-'));
            if (handle) {
              const activeHandle = handle;
              bindLiveStudioHandle(activeHandle, true);
              if (activeHandle.source === currentSource) {
                status.textContent = 'Running · CoreSpirit Studio already matches the active chart script.';
                status.style.color = '#86efac';
              } else {
                const updateToken = ++liveStudioUpdateToken;
                status.textContent = 'Updating the active CoreSpirit indicator…';
                status.style.color = '#fbbf24';
                // Vela's updateCode() is intentionally fire-and-observe (void). The
                // handle.source changes only after Vela has prepared the replacement.
                activeHandle.updateCode(currentSource);
                const updateStartedAt = Date.now();
                const observeUpdate = (): void => {
                  if (disposed || generation !== compileGeneration || updateToken !== liveStudioUpdateToken || liveStudioHandle?.id !== activeHandle.id) return;
                  if (activeHandle.source === currentSource) {
                    status.textContent = 'Updated · Vela accepted the new CoreScript and is refreshing its output.';
                    status.style.color = '#86efac';
                    ctx.toast('CoreSpirit indicator updated in place', 'success');
                    return;
                  }
                  if (Date.now() - updateStartedAt >= 10000) {
                    status.textContent = 'Vela is still preparing this update. The source has not yet been accepted.';
                    status.style.color = '#fbbf24';
                    return;
                  }
                  window.setTimeout(observeUpdate, 80);
                };
                window.setTimeout(observeUpdate, 40);
              }
            } else {
              const indicatorId = `tco-corespirit-live-${generation}-${Date.now().toString(36)}`;
              ctx.addIndicator({ id: indicatorId, name: 'CoreSpirit · Live Studio', script: currentSource, language: 'corespirit' });
              handle = ctx.chart.indicators().find((candidate) => candidate.id === indicatorId);
              if (!handle) throw new Error('Vela refused to create an indicator instance. Check the chart engine and compiler diagnostics.');
              bindLiveStudioHandle(handle, false);
              status.textContent = 'Indicator queued · waiting for Vela’s first execution…';
              status.style.color = '#fbbf24';
              window.setTimeout(() => {
                if (disposed || liveStudioHasRun || liveStudioHandle?.id !== indicatorId) return;
                status.textContent = 'Indicator is still compiling or waiting for chart data. Check the browser error panel if it does not appear.';
                status.style.color = '#fbbf24';
              }, 10000);
            }
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
            status.style.color = '#fca5a5';
            ctx.toast('CoreSpirit could not add or update the indicator', 'error');
          }
        }
      } catch (error) {
        if (generation !== compileGeneration) return;
        status.textContent = error instanceof Error ? error.message : String(error);
        status.style.color = '#fca5a5';
      } finally {
        if (generation === compileGeneration) {
          compile.disabled = run.disabled = false;
          compile.textContent = 'Validate';
          run.textContent = 'Compile & Run';
        }
      }
    };
    compile.addEventListener('click', () => { void compileSource(false); });
    run.addEventListener('click', () => { void compileSource(true); });
    openFull.addEventListener('click', () => {
      try { localStorage.setItem(versionedStorageKey('editor'), source); localStorage.setItem('tradingcore:corespirit:editor', source); } catch {}
      window.history.pushState({}, '', '/corespirit');
      window.dispatchEvent(new PopStateEvent('popstate'));
      ctx.toast('Opened the full CoreSpirit IDE', 'success');
    });
    return { onOpen() { (monacoAdapter?.editor ?? fallbackEditor).focus({ preventScroll: true }); }, onChart() { target.textContent = `${ctx.symbol} · ${ctx.timeframe} · worker compiler · ${source.split('\n').length} lines`; }, destroy() { disposed = true; compileGeneration += 1; monacoAdapter?.dispose(); monacoAdapter = undefined; } };
  },
};

const workspaceFrameAction:WidgetActionDescriptor={
  id:'tco.workspace-frame',target:'topbar',label:'Workspace',icon:'sliders',iconOnly:true,align:'right',order:19,mobile:'menu',
  run(ctx){ctx.togglePanel('tco.workspace-frame');},
};

const coreSpiritCodeAction: WidgetActionDescriptor = {
  id: 'tco.corespirit-code',
  target: 'topbar',
  label: 'Code',
  icon: 'indicators',
  iconOnly: true,
  align: 'right',
  order: 3.5,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.corespirit-code'); },
};

const bookmarksPanel: SidePanelDescriptor = {
  id: 'tco.bookmarks', title: 'Watchlist', icon: 'star', order: 10, width: 320, resizable: true, minWidth: 260, maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Watchlist');
    const root = panelRoot(body);
    root.classList.add('tco-frame-panel');
    root.style.fontFamily = 'Inter, ui-sans-serif, system-ui, sans-serif';
    const meta = document.createElement('div');
    meta.style.cssText = 'font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;color:var(--vela-fg-muted);text-transform:uppercase;letter-spacing:.08em;';
    root.appendChild(meta);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:2px 0 6px;';
    const addCurrent = document.createElement('button');
    addCurrent.type = 'button';
    addCurrent.textContent = '+ Add current';
    addCurrent.title = 'Add the active symbol to the watchlist';
    addCurrent.className = 'tco-frame-button tco-frame-button-primary';
    addCurrent.style.cssText = 'border:1px solid var(--tco-frame-accent,#8b7cff);border-radius:7px;padding:7px 10px;background:var(--tco-frame-accent-soft,rgba(124,92,255,.10));color:var(--vela-fg-bright);font:650 11px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;';
    controls.append(addCurrent);
    root.appendChild(controls);

    const filterInput = document.createElement('input');
    filterInput.className = 'tco-watch-search';
    filterInput.type = 'search';
    filterInput.placeholder = 'Search this watchlist…';
    filterInput.setAttribute('aria-label', 'Filter watchlist by symbol');
    root.appendChild(filterInput);

    let filterMode: 'all' | 'gainers' | 'losers' = 'all';
    let sortMode: 'default' | 'symbol' | 'change' | 'price' = 'default';
    const filters = document.createElement('div');
    filters.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
    const filterButtons = new Map<string, HTMLButtonElement>();
    for (const [mode, label] of [['all', 'All'], ['gainers', 'Gainers'], ['losers', 'Losers']] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tco-watch-filter';
      button.textContent = label;
      button.setAttribute('aria-pressed', mode === filterMode ? 'true' : 'false');
      button.addEventListener('click', () => {
        filterMode = mode;
        for (const [key, element] of filterButtons) element.setAttribute('aria-pressed', key === filterMode ? 'true' : 'false');
        updateRows();
      });
      filterButtons.set(mode, button);
      filters.appendChild(button);
    }
    const sort = document.createElement('select');
    sort.className = 'tco-frame-select';
    sort.style.cssText = 'margin-left:auto;width:112px;max-width:112px;padding:5px 6px;font-size:10px;';
    sort.setAttribute('aria-label', 'Sort watchlist');
    for (const [value, label] of [['default', 'Custom order'], ['symbol', 'Symbol A–Z'], ['change', 'Day change'], ['price', 'Last price']] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sort.appendChild(option);
    }
    sort.addEventListener('change', () => { sortMode = sort.value as typeof sortMode; buildRows(); });
    filters.appendChild(sort);
    root.appendChild(filters);

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';
    rows.style.flex = '1 1 auto';

    const detailCard = document.createElement('section');
    detailCard.className = 'tco-watch-detail';
    const detailHead = document.createElement('div');
    detailHead.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;';
    const detailTitleWrap = document.createElement('div');
    const detailTitle = document.createElement('div');
    detailTitle.style.cssText = 'font-size:12px;font-weight:750;color:var(--vela-fg-bright);overflow-wrap:anywhere;';
    const detailSubtitle = document.createElement('div');
    detailSubtitle.style.cssText = 'margin-top:4px;font-size:10px;color:var(--vela-fg-muted);';
    detailTitleWrap.append(detailTitle, detailSubtitle);
    const liveBadge = document.createElement('span');
    liveBadge.style.cssText = 'flex:none;padding:3px 6px;border:1px solid var(--vela-border);border-radius:5px;color:var(--vela-fg-muted);font-size:9px;font-weight:700;';
    liveBadge.textContent = 'MARKET';
    detailHead.append(detailTitleWrap, liveBadge);
    const metrics = document.createElement('div');
    metrics.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;';
    const metricRefs = new Map<string, HTMLSpanElement>();
    for (const [key, label] of [['ltp', 'Last price'], ['changeValue', 'Change'], ['changePercent', 'Change %'], ['high', 'Day high'], ['low', 'Day low']] as const) {
      const cell = document.createElement('div');
      cell.className = 'tco-watch-metric';
      const caption = document.createElement('div');
      caption.className = 'tco-watch-metric-label';
      caption.textContent = label;
      const value = document.createElement('div');
      value.className = 'tco-watch-metric-value';
      value.textContent = '—';
      cell.append(caption, value);
      metrics.appendChild(cell);
      metricRefs.set(key, value);
    }
    const detailHint = document.createElement('div');
    detailHint.className = 'tco-frame-help';
    detailHint.style.marginTop = '9px';
    detailHint.textContent = 'Select a row to switch the chart to that instrument.';
    detailCard.append(detailHead, metrics, detailHint);
    root.appendChild(rows);
    root.appendChild(detailCard);

    const STALE_AFTER_MS = 15_000;
    type Quote = {
      ltp: number;
      change?: number;
      changePercent?: number;
      previousClose?: number;
      high?: number;
      low?: number;
      receivedAt: number;
    };
    type MarketQuoteView = { ltp?: number; change?: number; changePercent?: number; high?: number; low?: number; receivedAt?: number; stale: boolean };
    const quotes = new Map<string, Quote>();
    let quoteStop: (() => void) | undefined;

    const asFinite = (...values: unknown[]): number | undefined => {
      for (const value of values) {
        if (value == null || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
      return undefined;
    };
    const dayCandle = (snapshot: Record<string, unknown>): Record<string, unknown> | undefined => {
      const rows = Array.isArray(snapshot.ohlc) ? snapshot.ohlc as Array<Record<string, unknown>> : [];
      return rows.find((row) => /^(?:D|1D|1day|day|daily)$/i.test(String(row.interval || '').trim()))
        ?? rows.find((row) => /day|daily|1d/i.test(String(row.interval || '')));
    };
    const quoteView = (symbol: string): MarketQuoteView => {
      const snapshot = (tradingCoreRuntime.getMarketSnapshot(symbol) || {}) as unknown as Record<string, unknown>;
      const cached = quotes.get(symbol.toUpperCase());
      const daily = dayCandle(snapshot);
      const rawSnapshotTime = asFinite(snapshot.receivedAtEpoch, snapshot.lastReceivedAt);
      // Runtime/broker adapters may expose Unix seconds or milliseconds. Normalize to
      // epoch milliseconds before comparing quote age, so a fresh seconds-based snapshot
      // cannot be mislabeled stale or incorrectly lose to an older cached quote.
      const parsedSnapshotTime = rawSnapshotTime !== undefined
        ? (rawSnapshotTime > 1e12 ? rawSnapshotTime : rawSnapshotTime * 1000)
        : (() => {
            const parsed = Date.parse(String(snapshot.receivedAt ?? ''));
            return Number.isFinite(parsed) ? parsed : undefined;
          })();
      // A cached row quote carries an explicit local receive time. Prefer it whenever
      // the broker snapshot has no timestamp; never make an old retained LTP look live.
      const cachedIsNewest = !!cached && (parsedSnapshotTime === undefined || cached.receivedAt >= parsedSnapshotTime);
      const receivedAt = cachedIsNewest ? cached?.receivedAt : parsedSnapshotTime ?? cached?.receivedAt;
      const ltp = asFinite(cachedIsNewest ? cached?.ltp : snapshot.ltp, cached?.ltp, snapshot.ltp);
      const previousClose = asFinite(cachedIsNewest ? cached?.previousClose : snapshot.previousClose, snapshot.previousClose, snapshot.prevClose, snapshot.close, snapshot.prev_close, snapshot.previous_close, cached?.previousClose);
      let change = asFinite(cachedIsNewest ? cached?.change : snapshot.change, snapshot.changeValue, snapshot.netChange, cached?.change);
      let percent = asFinite(cachedIsNewest ? cached?.changePercent : snapshot.changePercent, cached?.changePercent, snapshot.changePercent);
      if (change === undefined && ltp !== undefined && previousClose !== undefined) change = ltp - previousClose;
      if (change === undefined && ltp !== undefined && percent !== undefined && percent > -100) {
        // Broker feeds that expose only rounded percent change still provide a useful
        // value-change estimate; prefer the broker's absolute change whenever present.
        change = ltp - ltp / (1 + percent / 100);
      }
      if (percent === undefined && ltp !== undefined && previousClose !== undefined && previousClose !== 0) {
        percent = ((ltp - previousClose) / previousClose) * 100;
      }
      if (percent === undefined && ltp !== undefined && change !== undefined && ltp - change > 0) {
        percent = (change / (ltp - change)) * 100;
      }
      const hasFreshTimestamp = receivedAt !== undefined && Number.isFinite(receivedAt);
      return {
        ltp,
        change,
        changePercent: percent,
        high: asFinite(cachedIsNewest ? cached?.high : snapshot.dayHigh, snapshot.high, daily?.high, cached?.high),
        low: asFinite(cachedIsNewest ? cached?.low : snapshot.dayLow, snapshot.low, daily?.low, cached?.low),
        ...(hasFreshTimestamp ? { receivedAt } : {}),
        stale: !hasFreshTimestamp || Date.now() - receivedAt! > STALE_AFTER_MS,
      };
    };

    const quoteSubscribe = (): void => {
      quoteStop?.();
      quoteStop = undefined;
      const symbols = watchlist.map((item) => item.symbol);
      if (!symbols.length) return;
      quoteStop = tradingCoreRuntime.subscribeMarketData(symbols, (event) => {
        if (event.type !== 'tick' || !event.tick) return;
        const tick = event.tick as unknown as Record<string, unknown>;
        const symbol = String(tick.instrumentKey || '').trim().toUpperCase();
        const ltp = asFinite(tick.ltp);
        if (!symbol || ltp === undefined) return;
        const daily = dayCandle(tick);
        let percent = asFinite(tick.changePercent);
        const previousClose = asFinite(tick.previousClose, tick.prevClose, tick.close, tick.prev_close, tick.previous_close);
        let change = asFinite(tick.change, tick.changeValue, tick.netChange);
        if (change === undefined && previousClose !== undefined) change = ltp - previousClose;
        if (change === undefined && percent !== undefined && percent > -100) change = ltp - ltp / (1 + percent / 100);
        if (percent === undefined && previousClose !== undefined && previousClose !== 0) percent = ((ltp - previousClose) / previousClose) * 100;
        if (percent === undefined && change !== undefined && ltp - change > 0) percent = (change / (ltp - change)) * 100;
        quotes.set(symbol, {
          ltp,
          change,
          changePercent: percent,
          previousClose,
          high: asFinite(tick.dayHigh, tick.high, daily?.high),
          low: asFinite(tick.dayLow, tick.low, daily?.low),
          receivedAt: Date.now(),
        });
        // Keep live price/change sorts stable while the feed updates, without rebuilding
        // every DOM row on the default custom-order path.
        if (sortMode === 'price' || sortMode === 'change') buildRows();
        else updateRows(symbol);
      });
    };

    type RowRef = {
      row: HTMLDivElement;
      button: HTMLButtonElement;
      value: HTMLSpanElement;
      change: HTMLSpanElement;
    };
    const rowRefs = new Map<string, RowRef>();

    const updateDetails = (): void => {
      const current = String(ctx.symbol || '').trim();
      const quote = quoteView(current);
      const ticker = current.includes(':') ? current.split(':', 2)[1] || current : current;
      const { ltp, change, changePercent, high, low } = quote;
      detailTitle.textContent = ticker || 'Active instrument';
      detailSubtitle.textContent = `${current} · ${ctx.timeframe} · ${(tradingCoreRuntime.getMarketSnapshot(current) as any)?.exchange || (tradingCoreRuntime.getMarketSnapshot(current) as any)?.venue || 'Active chart'}`;
      liveBadge.textContent = ltp === undefined ? 'WAITING' : quote.stale ? 'STALE' : 'LIVE';
      liveBadge.setAttribute('aria-label', ltp === undefined ? 'Waiting for quote' : quote.stale ? 'Stale quote' : 'Live quote');
      liveBadge.style.color = ltp === undefined ? 'var(--vela-fg-muted)' : quote.stale ? '#fbbf24' : '#34d399';
      const setMetric = (key: string, value: string, tone?: string) => {
        const element = metricRefs.get(key);
        if (!element) return;
        element.textContent = value;
        element.style.color = tone || 'var(--vela-fg-bright)';
      };
      const fmt = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      const tone = (value: number | undefined) => value === undefined ? undefined : value >= 0 ? '#22c55e' : '#f23645';
      setMetric('ltp', fmt(ltp));
      setMetric('changeValue', change === undefined ? '—' : `${change >= 0 ? '+' : ''}${fmt(change)}`, tone(change));
      setMetric('changePercent', changePercent === undefined ? '—' : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`, tone(changePercent));
      setMetric('high', fmt(high));
      setMetric('low', fmt(low));
      detailHint.textContent = ltp !== undefined
        ? quote.stale
          ? 'STALE QUOTE · The last received price is older than 15 seconds. Recheck the live feed before acting.'
          : high !== undefined && low !== undefined
            ? 'Live broker quote · day range and absolute/percentage change use available market snapshot fields.'
            : 'Live broker quote · waiting for complete day-range fields from the market feed.'
        : 'Waiting for a market quote for this instrument. No sample price is shown.';
    };

    const updateRows = (changedSymbol?: string): void => {
      const current = String(ctx.symbol || '').toUpperCase();
      meta.textContent = `${current} · ${ctx.timeframe} · ${watchlist.length} symbols`;

      // Tick-hot path: most packets affect one instrument. Keep existing row DOM and
      // focus stable rather than walking every row; full passes remain for filters,
      // sort changes, list edits and quote-freshness sweeps.
      if (changedSymbol) {
        const normalized = changedSymbol.toUpperCase();
        const item = watchlist.find((candidate) => candidate.symbol === normalized);
        const ref = item ? rowRefs.get(item.symbol) : undefined;
        if (!item || !ref) {
          if (normalized === current) updateDetails();
          return;
        }
        const query = filterInput.value.trim().toUpperCase();
        const searchable = `${item.symbol} ${item.short} ${item.label}`.toUpperCase();
        const quote = quoteView(item.symbol);
        const pct = quote.changePercent;
        const matchesText = !query || searchable.includes(query);
        const matchesFilter = filterMode === 'all'
          || (filterMode === 'gainers' && Number.isFinite(pct) && Number(pct) > 0)
          || (filterMode === 'losers' && Number.isFinite(pct) && Number(pct) < 0);
        ref.row.hidden = !(matchesText && matchesFilter);
        const isSelected = item.symbol === current;
        ref.row.style.background = isSelected ? 'var(--tco-frame-accent-soft,rgba(124,92,255,.10))' : 'transparent';
        ref.row.style.borderColor = isSelected ? 'var(--tco-frame-accent,#8b7cff)' : 'transparent';
        const absolute = quote.change;
        ref.value.textContent = quote.ltp === undefined ? '—' : quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const changeParts: string[] = [];
        if (absolute !== undefined) changeParts.push(`${absolute >= 0 ? '+' : ''}${absolute.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
        if (pct !== undefined) changeParts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
        ref.row.dataset.quoteState = quote.ltp === undefined ? 'waiting' : quote.stale ? 'stale' : 'live';
        ref.row.dataset.quoteUpdatedAt = quote.receivedAt === undefined ? '' : String(quote.receivedAt);
        ref.row.title = quote.ltp === undefined ? 'No quote received yet' : quote.stale ? 'Stale quote — last update over 15 seconds ago' : 'Live quote';
        ref.button.setAttribute('aria-label', `${item.short}, ${quote.ltp === undefined ? 'quote unavailable' : `last price ${quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, ${quote.stale ? 'stale quote' : 'live quote'}`}`);
        ref.value.style.color = quote.stale ? '#fbbf24' : 'var(--vela-fg-bright)';
        ref.change.textContent = quote.ltp === undefined
          ? 'WAITING FOR QUOTE'
          : `${quote.stale ? 'STALE · ' : ''}${changeParts.length ? changeParts.join(' · ') : 'NO CHANGE DATA'}`;
        const changeTone = absolute !== undefined ? absolute : pct;
        ref.change.style.color = quote.stale ? '#fbbf24' : changeTone === undefined ? 'var(--vela-fg-muted)' : changeTone >= 0 ? '#22c55e' : '#f23645';
        if (isSelected) updateDetails();
        return;
      }

      const query = filterInput.value.trim().toUpperCase();
      const filtered = watchlist.filter((item) => {
        const text = `${item.symbol} ${item.short} ${item.label}`.toUpperCase();
        if (query && !text.includes(query)) return false;
        const pct = quoteView(item.symbol).changePercent;
        if (filterMode === 'gainers' && !(Number.isFinite(pct) && Number(pct) > 0)) return false;
        if (filterMode === 'losers' && !(Number.isFinite(pct) && Number(pct) < 0)) return false;
        return true;
      });
      const visible = new Set(filtered.map((item) => item.symbol));
      for (const item of watchlist) {
        const ref = rowRefs.get(item.symbol);
        if (!ref) continue;
        ref.row.hidden = !visible.has(item.symbol);
        const isSelected = item.symbol === current;
        ref.row.style.background = isSelected ? 'var(--tco-frame-accent-soft,rgba(124,92,255,.10))' : 'transparent';
        ref.row.style.borderColor = isSelected ? 'var(--tco-frame-accent,#8b7cff)' : 'transparent';
        const quote = quoteView(item.symbol);
        const pct = quote.changePercent;
        const absolute = quote.change;
        ref.value.textContent = quote.ltp === undefined
          ? '—'
          : quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const changeParts: string[] = [];
        if (absolute !== undefined) changeParts.push(`${absolute >= 0 ? '+' : ''}${absolute.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
        if (pct !== undefined) changeParts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
        ref.row.dataset.quoteState = quote.ltp === undefined ? 'waiting' : quote.stale ? 'stale' : 'live';
        ref.row.dataset.quoteUpdatedAt = quote.receivedAt === undefined ? '' : String(quote.receivedAt);
        ref.row.title = quote.ltp === undefined ? 'No quote received yet' : quote.stale ? 'Stale quote — last update over 15 seconds ago' : 'Live quote';
        ref.button.setAttribute('aria-label', `${item.short}, ${quote.ltp === undefined ? 'quote unavailable' : `last price ${quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, ${quote.stale ? 'stale quote' : 'live quote'}`}`);
        ref.value.style.color = quote.stale ? '#fbbf24' : 'var(--vela-fg-bright)';
        ref.change.textContent = quote.ltp === undefined
          ? 'WAITING FOR QUOTE'
          : `${quote.stale ? 'STALE · ' : ''}${changeParts.length ? changeParts.join(' · ') : 'NO CHANGE DATA'}`;
        const changeTone = absolute !== undefined ? absolute : pct;
        ref.change.style.color = quote.stale ? '#fbbf24' : changeTone === undefined ? 'var(--vela-fg-muted)' : changeTone >= 0 ? '#22c55e' : '#f23645';
      }
      updateDetails();
    };

    filterInput.addEventListener('input', updateRows);

    const buildRows = (): void => {
      const current = String(ctx.symbol || '').toUpperCase();
      const activeSymbols = new Set(watchlist.map(item => item.symbol));
      for (const [symbol, ref] of rowRefs) {
        if (!activeSymbols.has(symbol)) {
          ref.row.remove();
          rowRefs.delete(symbol);
        }
      }

      const ordered = [...watchlist];
      if (sortMode === 'symbol') ordered.sort((a, b) => a.short.localeCompare(b.short));
      if (sortMode === 'price') ordered.sort((a, b) => (quotes.get(b.symbol)?.ltp ?? -Infinity) - (quotes.get(a.symbol)?.ltp ?? -Infinity));
      if (sortMode === 'change') ordered.sort((a, b) => (quotes.get(b.symbol)?.changePercent ?? -Infinity) - (quotes.get(a.symbol)?.changePercent ?? -Infinity));
      for (const item of ordered) {
        let ref = rowRefs.get(item.symbol);
        if (!ref) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%;border:1px solid transparent;border-radius:7px;padding:4px 5px;background:transparent;box-sizing:border-box;';

          const button = document.createElement('button');
          button.type = 'button';
          button.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;min-width:0;border:0;border-radius:6px;padding:8px 7px;background:transparent;color:var(--vela-fg);font:inherit;text-align:left;cursor:pointer;';

          const left = document.createElement('span');
          left.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px;';
          const label = document.createElement('span');
          label.textContent = item.short;
          label.style.cssText = 'font:700 12px Inter,ui-sans-serif,system-ui,sans-serif;color:var(--vela-fg-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          const detail = document.createElement('span');
          detail.textContent = item.label;
          detail.style.cssText = 'font:400 10px Inter,ui-sans-serif,system-ui,sans-serif;color:var(--vela-fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          left.append(label, detail);

          const right = document.createElement('span');
          right.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:0 0 auto;';
          const value = document.createElement('span');
          value.style.cssText = 'font:650 12px Inter,ui-sans-serif,system-ui,sans-serif;color:var(--vela-fg-bright);font-variant-numeric:tabular-nums;';
          const change = document.createElement('span');
          change.style.cssText = 'font:500 10px Inter,ui-sans-serif,system-ui,sans-serif;color:var(--vela-fg-muted);font-variant-numeric:tabular-nums;';
          right.append(value, change);
          button.append(left, right);

          button.addEventListener('mouseenter', () => {
            if (button.dataset.selected !== '1') button.style.background = 'rgba(255,255,255,.04)';
          });
          button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
          button.addEventListener('click', () => ctx.setSymbol(item.symbol));

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = `Remove ${item.short}`;
          remove.style.cssText = 'width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:#475569;font:14px/1 sans-serif;cursor:pointer;';
          remove.addEventListener('mouseenter', () => { remove.style.background = 'rgba(239,68,68,.08)'; remove.style.color = '#fb7185'; });
          remove.addEventListener('mouseleave', () => { remove.style.background = 'transparent'; remove.style.color = '#475569'; });
          remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyWatchlist(watchlist.filter((candidate) => candidate.symbol !== item.symbol), ctx);
            quoteSubscribe();
          });

          row.append(button, remove);
          rows.appendChild(row);
          ref = { row, button, value, change };
          rowRefs.set(item.symbol, ref);
        }
        rows.appendChild(ref.row);
        ref.button.dataset.selected = item.symbol === current ? '1' : '';
      }

      updateRows();
    };

    const refresh = (): void => {
      buildRows();
      if (watchlist.length) quoteSubscribe();
    };

    addCurrent.addEventListener('click', () => {
      const symbol = String(ctx.symbol || '').trim().toUpperCase();
      if (!symbol) return;
      if (watchlist.some((item) => item.symbol === symbol)) {
        ctx.toast(`${symbol} is already in the watchlist`, 'info');
        return;
      }
      const [prefix, ticker] = symbol.includes(':') ? symbol.split(':', 2) : ['NSE', symbol];
      applyWatchlist([...watchlist, {
        symbol,
        label: ticker || symbol,
        short: ticker || symbol,
      }], ctx);
      quoteSubscribe();
      ctx.toast(`${symbol} added to watchlist`, 'success');
    });

    watchlistRefreshers.add(refresh);
    refresh();
    // Refresh the stale marker while the market is quiet or closed; otherwise an old
    // quote can remain visually LIVE simply because no later tick arrived to repaint it.
    const freshnessTimer = window.setInterval(updateRows, 5000);

    return {
      onOpen: refresh,
      onChart: refresh,
      destroy() {
        window.clearInterval(freshnessTimer);
        watchlistRefreshers.delete(refresh);
        quoteStop?.();
        quoteStop = undefined;
      },
    };
  },
};


const healthPanel: SidePanelDescriptor = {
  id: 'tco.market-health',
  title: 'Market Health',
  icon: 'activity',
  order: 30,
  width: 340,
  resizable: true,
  minWidth: 280,
  maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Market Health');
    const root = panelRoot(body);
    const status = document.createElement('div');
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    root.append(status, rows);

    let latestLtp: number | null = null;
    let latestTickAt = 0;
    let quoteStop: (() => void) | undefined;

    const subscribe = () => {
      quoteStop?.();
      quoteStop = tradingCoreRuntime.subscribeMarketData([ctx.symbol], (event) => {
        if (event.type !== 'tick' || !event.tick) return;
        const symbol = String(event.tick.instrumentKey || '').trim();
        if (symbol !== String(ctx.symbol || '').trim()) return;
        const ltp = Number(event.tick.ltp ?? event.tick.close);
        if (!Number.isFinite(ltp)) return;
        latestLtp = ltp;
        latestTickAt = Date.now();
      });
    };

    const setValue = (label: string, value: string, tone = '#cbd5e1') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:14px;border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);';
      const key = document.createElement('span');
      key.textContent = label;
      key.style.cssText = 'font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;';
      const valueEl = document.createElement('span');
      valueEl.textContent = value;
      valueEl.style.cssText = `font-size:10px;color:${tone};font-variant-numeric:tabular-nums;text-align:right;`;
      row.append(key, valueEl);
      rows.appendChild(row);
    };

    const render = () => {
      rows.textContent = '';
      const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
      const now = Date.now();
      const age = latestTickAt ? Math.max(0, now - latestTickAt) : Number.POSITIVE_INFINITY;
      const ageText = Number.isFinite(age) ? `${Math.round(age)} ms` : 'no tick';
      const ageTone = age < 1200 ? '#4ade80' : age < 4000 ? '#facc15' : '#fb7185';
      status.textContent = `${ctx.symbol} · ${ctx.timeframe}`;
      status.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin-bottom:2px;';
      setValue('Broker', broker?.brokerId || 'none', broker?.status === 'Connected' ? '#4ade80' : '#facc15');
      setValue('Connection', broker?.status || 'Unavailable', broker?.status === 'Connected' ? '#4ade80' : '#facc15');
      setValue('LTP', latestLtp != null ? latestLtp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
      setValue('Tick age', ageText, ageTone);
      setValue('Transport', 'Vela → TCO canonical feed', '#c4b5fd');

      const perf = (window as Window & { __TCO_PERF__?: { cells?: Array<{ cellId?: string; fps?: number; p95FrameMs?: number; backend?: string }> } }).__TCO_PERF__;
      const cell = perf?.cells?.find(item => item.cellId && String(item.cellId).length > 0);
      if (cell) {
        setValue('Renderer', cell.backend || 'auto', '#c4b5fd');
        setValue('FPS', Number.isFinite(Number(cell.fps)) ? Number(cell.fps).toFixed(1) : '—');
        setValue('P95 frame', Number.isFinite(Number(cell.p95FrameMs)) ? `${Number(cell.p95FrameMs).toFixed(2)} ms` : '—');
      }
      const isolated = typeof window !== 'undefined' && Boolean(window.crossOriginIsolated) && typeof SharedArrayBuffer !== 'undefined';
      setValue('Shared memory', isolated ? 'available' : 'unavailable', isolated ? '#4ade80' : '#facc15');
    };

    subscribe();
    render();
    const timer = window.setInterval(render, 1000);
    return {
      onOpen: () => { subscribe(); render(); },
      onChart: () => { subscribe(); render(); },
      destroy: () => { window.clearInterval(timer); quoteStop?.(); quoteStop = undefined; },
    };
  },
};


function panelSectionTitle(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin:4px 0 2px;';
  return el;
}

function panelValueRow(parent: HTMLElement, label: string, value: string, tone = '#cbd5e1'): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);';
  const left = document.createElement('span');
  left.textContent = label;
  left.style.cssText = 'font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const right = document.createElement('span');
  right.textContent = value;
  right.style.cssText = `font-size:10px;color:${tone};font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;`;
  row.append(left, right);
  parent.appendChild(row);
}

const replayPanel: SidePanelDescriptor = {
  id: 'tco.replay',
  title: 'Replay',
  icon: 'play',
  order: 15,
  width: 320,
  resizable: true,
  minWidth: 280,
  maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Vela Replay');
    const replay: {
      state: { active: boolean; playing: boolean; cursorTime: number | null };
      start(opts: { from: number; cell?: string }): Promise<void>;
      step(): boolean;
      play(intervalMs?: number): unknown;
      pause(): unknown;
      stop(): unknown;
      on?: (event: string, handler: () => void) => () => void;
    } = ctx.chart.replay as any;
    const replayOn = (event: string, handler: () => void): (() => void) =>
      typeof replay.on === 'function' ? replay.on(event, handler) : () => undefined;
    const root = panelRoot(body);
    const status = document.createElement('div');
    status.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(status);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';
    root.appendChild(controls);

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.title = 'Replay start';
    input.style.cssText = 'grid-column:1/-1;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 8px;background:#0c111a;color:#cbd5e1;font:10px ui-monospace;box-sizing:border-box;';
    root.insertBefore(input, controls);

    const makeButton = (label: string, handler: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 6px;background:#0c111a;color:#cbd5e1;font:10px ui-monospace;cursor:pointer;';
      button.addEventListener('click', handler);
      controls.appendChild(button);
      return button;
    };

    makeButton('Start', () => {
      const raw = input.value ? new Date(input.value).getTime() : Date.now() - 60 * 60 * 1000;
      void replay.start({ from: Number.isFinite(raw) ? raw : Date.now() - 60 * 60 * 1000 }).catch(error => {
        ctx.toast(error instanceof Error ? error.message : String(error), 'error');
      });
    });
    makeButton('Step', () => { if (!replay.step()) ctx.toast('Replay has reached the end.', 'info'); });
    makeButton('Play', () => { replay.play(250); });
    makeButton('Pause', () => { replay.pause(); });
    makeButton('Stop', () => { replay.stop(); });

    const refresh = () => {
      const state = replay.state;
      status.textContent = state.active
        ? `ACTIVE · ${state.playing ? 'PLAYING' : 'PAUSED'} · ${state.cursorTime ? new Date(state.cursorTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}`
        : 'READY · multi-chart replay follows one Vela clock';
    };
    refresh();
    const timer = window.setInterval(refresh, 250);
    const offStart = replayOn('replay:start', refresh);
    const offStep = replayOn('replay:step', refresh);
    const offPlay = replayOn('replay:play', refresh);
    const offPause = replayOn('replay:pause', refresh);
    const offEnd = replayOn('replay:end', refresh);
    return {
      onOpen: refresh,
      onChart: refresh,
      destroy() {
        window.clearInterval(timer);
        offStart(); offStep(); offPlay(); offPause(); offEnd();
      },
    };
  },
};

const positionsPanel: SidePanelDescriptor = {
  id: 'tco.positions',
  title: 'Positions',
  icon: 'briefcase',
  order: 40,
  width: 360,
  resizable: true,
  minWidth: 300,
  maxWidth: 560,
  mount(ctx, body, header) {
    header.setTitle('Positions');
    const root = panelRoot(body);
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:6px;';
    root.appendChild(summary);
    const rows = document.createElement('div');
    rows.style.cssText = 'min-height:0;overflow:auto;';
    root.appendChild(rows);

    const render = async () => {
      rows.textContent = '';
      try {
        const positions = await tradingCoreRuntime.getPositions();
        summary.textContent = `${positions.length} open positions · ${ctx.symbol}`;
        if (!positions.length) {
          rows.appendChild(panelSectionTitle('No open positions'));
          return;
        }
        for (const position of positions) {
          const card = document.createElement('div');
          card.style.cssText = 'padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);';
          panelValueRow(card, position.symbol, String(position.quantity), position.quantity >= 0 ? '#cbd5e1' : '#fda4af');
          panelValueRow(card, 'Avg', Number(position.avgPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
          panelValueRow(card, 'LTP', Number(position.ltp).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
          panelValueRow(card, 'P&L', Number(position.pnl).toLocaleString('en-IN', { maximumFractionDigits: 2 }), Number(position.pnl) >= 0 ? '#4ade80' : '#fb7185');
          rows.appendChild(card);
        }
      } catch (error) {
        summary.textContent = 'Position service unavailable';
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        rows.appendChild(msg);
      }
    };

    void render();
    const timer = window.setInterval(() => void render(), 3000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};

const riskPanel: SidePanelDescriptor = {
  id: 'tco.risk',
  title: 'Risk',
  icon: 'shield',
  order: 45,
  width: 340,
  resizable: true,
  minWidth: 280,
  maxWidth: 500,
  mount(_ctx, body, header) {
    header.setTitle('Risk');
    const root = panelRoot(body);
    const rows = document.createElement('div');
    root.appendChild(rows);

    const render = async () => {
      rows.textContent = '';
      try {
        const [funds, positions] = await Promise.all([
          tradingCoreRuntime.getFunds(),
          tradingCoreRuntime.getPositions(),
        ]);
        panelValueRow(rows, 'Available margin', funds ? Number(funds.availableMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Used margin', funds ? Number(funds.usedMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Collateral', funds ? Number(funds.collateralMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Open positions', String(positions.length));
        const gross = positions.reduce((sum, p) => sum + Math.abs(Number(p.quantity) * Number(p.ltp)), 0);
        const pnl = positions.reduce((sum, p) => sum + Number(p.pnl || 0), 0);
        panelValueRow(rows, 'Gross exposure', gross.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
        panelValueRow(rows, 'Open P&L', pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 }), pnl >= 0 ? '#4ade80' : '#fb7185');
      } catch (error) {
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        rows.appendChild(msg);
      }
    };
    void render();
    const timer = window.setInterval(() => void render(), 3000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};

const orderBookPanel: SidePanelDescriptor = {
  id: 'tco.orderbook',
  title: 'Order Book',
  icon: 'list',
  order: 50,
  width: 320,
  resizable: true,
  minWidth: 260,
  maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Order Book');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:7px;';
    root.appendChild(meta);
    const ladder = document.createElement('div');
    ladder.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    root.appendChild(ladder);

    const render = () => {
      ladder.textContent = '';
      const tick = tradingCoreRuntime.getMarketSnapshot(ctx.symbol) as Record<string,unknown> | undefined;
      const ltp=Number(tick?.ltp??tick?.lastPrice??tick?.close);
      const rawReceived=Number(tick?.receivedAtEpoch??tick?.lastReceivedAt);
      let receivedAt=Number.isFinite(rawReceived)&&rawReceived>0
        ? (rawReceived>1e12?rawReceived:rawReceived*1000)
        : Date.parse(String(tick?.receivedAt??''));
      if(!Number.isFinite(receivedAt))receivedAt=0;
      const quoteState=!Number.isFinite(ltp)?'WAITING':!receivedAt||Date.now()-receivedAt>15_000?'STALE':'LIVE';
      meta.textContent=`${ctx.symbol} · ${ctx.timeframe} · LTP ${Number.isFinite(ltp)?ltp.toLocaleString('en-IN',{maximumFractionDigits:2}):'—'} · ${quoteState}`;
      meta.style.color=quoteState==='LIVE'?'#4ade80':quoteState==='STALE'?'#fbbf24':'#94a3b8';
      const asks = Array.isArray((tick as any)?.ask) ? (tick as any).ask : [];
      const bids = Array.isArray((tick as any)?.bid) ? (tick as any).bid : [];
      const row = (side: 'ASK'|'BID', level: any, index: number) => {
        const price = Number(level?.price);
        if (!Number.isFinite(price)) return;
        const el = document.createElement('div');
        el.style.cssText = 'display:grid;grid-template-columns:42px 1fr 1fr;gap:8px;padding:5px 6px;border-radius:5px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
        const s = document.createElement('span'); s.textContent = `${side} ${index + 1}`; s.style.color = side === 'BID' ? '#4ade80' : '#fb7185';
        const p = document.createElement('span'); p.textContent = price.toLocaleString('en-IN', { maximumFractionDigits: 2 }); p.style.color = '#e2e8f0';
        const q = document.createElement('span'); q.textContent = String(Number(level?.quantity || 0)); q.style.color = '#94a3b8';
        el.append(s,p,q); ladder.appendChild(el);
      };
      asks.slice().reverse().forEach((level: any, index: number) => row('ASK', level, index));
      const mid = document.createElement('div');
      mid.style.cssText = 'height:1px;background:rgba(255,255,255,.10);margin:4px 0;';
      ladder.appendChild(mid);
      bids.forEach((level: any, index: number) => row('BID', level, index));
      if (!asks.length && !bids.length) {
        const empty = document.createElement('div');
        empty.textContent = 'Depth data unavailable for this symbol.';
        empty.style.cssText = 'font-size:10px;color:#64748b;padding:12px 0;';
        ladder.appendChild(empty);
      }
    };
    render();
    const timer = window.setInterval(render, 500);
    return { onOpen: render, onChart: render, destroy: () => window.clearInterval(timer) };
  },
};

const optionsPanel: SidePanelDescriptor = {
  id: 'tco.options',
  title: 'Options',
  icon: 'layers',
  order: 55,
  width: 440,
  resizable: true,
  minWidth: 340,
  maxWidth: 620,
  mount(ctx, body, header) {
    header.setTitle('Options Chain');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:7px;';
    root.appendChild(meta);
    const table = document.createElement('div');
    table.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';
    root.appendChild(table);

    let requestKey = '';
    const render = async () => {
      const symbol = String(ctx.symbol || '').trim();
      if (!symbol) return;
      if (requestKey === symbol) return;
      requestKey = symbol;
      try {
        const chain = await tradingCoreRuntime.getOptionChain(symbol);
        table.textContent = '';
        meta.textContent = `${symbol} · ${chain.expiry} · Spot ${Number(chain.spot || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        const head = document.createElement('div');
        head.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:4px 6px;color:#64748b;font:9px ui-monospace;text-transform:uppercase;';
        head.innerHTML = '<span>Call</span><span>Strike</span><span>Put</span>';
        table.appendChild(head);
        const contracts = Array.isArray(chain.contracts) ? chain.contracts : [];
        for (const contract of contracts.slice(0, 40)) {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:5px 6px;border-radius:5px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
          const call = document.createElement('span'); call.textContent = contract.call?.ltp != null ? Number(contract.call.ltp).toFixed(2) : '—'; call.style.color = '#4ade80';
          const strike = document.createElement('span'); strike.textContent = Number(contract.strike).toLocaleString('en-IN', { maximumFractionDigits: 2 }); strike.style.color = '#e2e8f0'; strike.style.textAlign = 'center';
          const put = document.createElement('span'); put.textContent = contract.put?.ltp != null ? Number(contract.put.ltp).toFixed(2) : '—'; put.style.color = '#fb7185'; put.style.textAlign = 'right';
          row.append(call,strike,put); table.appendChild(row);
        }
      } catch (error) {
        table.textContent = '';
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        table.appendChild(msg);
      } finally {
        requestKey = '';
      }
    };
    void render();
    const timer = window.setInterval(() => void render(), 5000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};


function navigateTcoTerminalRoute(route:string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === route) {
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  window.history.pushState({}, '', route);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function terminalRouteButton(parent:HTMLElement, label:string, route:string, icon:string):void {
  const button=document.createElement('button');
  button.type='button';
  button.textContent=`${icon}  ${label}`;
  button.title=`Open ${label}`;
  button.style.cssText='width:100%;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:8px 10px;background:rgba(255,255,255,.025);color:#cbd5e1;font:10px ui-monospace;cursor:pointer;';
  button.addEventListener('mouseenter',()=>{button.style.background='rgba(124,92,255,.10)';button.style.borderColor='rgba(155,138,255,.20)';});
  button.addEventListener('mouseleave',()=>{button.style.background='rgba(255,255,255,.025)';button.style.borderColor='rgba(255,255,255,.07)';});
  button.addEventListener('click',()=>navigateTcoTerminalRoute(route));
  parent.appendChild(button);
}

const researchPanel:SidePanelDescriptor={
  id:'tco.research',
  title:'Research',
  icon:'search',
  order:12,
  width:320,
  resizable:true,
  minWidth:280,
  maxWidth:480,
  mount(ctx,body,header){
    header.setTitle('Research');
    const root=panelRoot(body);
    const summary=document.createElement('div');
    summary.style.cssText='font-size:10px;color:#64748b;line-height:1.5;margin-bottom:8px;';
    summary.textContent=`Vela terminal · ${ctx.symbol} · ${ctx.timeframe}`;
    root.appendChild(summary);

    const section=panelSectionTitle('Research surfaces');
    root.appendChild(section);
    const actions=document.createElement('div');
    actions.style.cssText='display:flex;flex-direction:column;gap:5px;';
    terminalRouteButton(actions,'CoreSpirit editor','/corespirit','⌘');
    terminalRouteButton(actions,'Indicators','/indicators','◈');
    terminalRouteButton(actions,'Models','/models','∿');
    terminalRouteButton(actions,'Predictions','/predictions','↗');
    terminalRouteButton(actions,'CoreSpirit documentation','/corespirit/docs','▤');
    root.appendChild(actions);

    const chartSection=panelSectionTitle('Active chart');
    root.appendChild(chartSection);
    const chartInfo=document.createElement('div');
    chartInfo.style.cssText='display:flex;flex-direction:column;gap:2px;font:9px ui-monospace;color:#94a3b8;';
    chartInfo.innerHTML=`<span>Engine: <b style="color:#c4b5fd">CoreSpirit → Vela</b></span><span>Viewport: Vela-managed</span><span>Data: canonical columnar</span>`;
    root.appendChild(chartInfo);

    const contextCard=document.createElement('div');
    contextCard.className='tco-frame-card';
    contextCard.setAttribute('role','group');
    contextCard.setAttribute('aria-label','Active chart quote and renderer performance');
    contextCard.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:8px;padding:10px;border:1px solid var(--vela-border);border-radius:8px;background:var(--vela-surface-sunken);font:10px ui-monospace;';
    const quoteLine=document.createElement('div');
    const rendererLine=document.createElement('div');
    const performanceLine=document.createElement('div');
    quoteLine.style.cssText=rendererLine.style.cssText=performanceLine.style.cssText='overflow-wrap:anywhere;color:var(--vela-fg-muted);';
    contextCard.append(quoteLine,rendererLine,performanceLine);
    root.appendChild(contextCard);

    const refreshContext=():void=>{
      const symbol=String(ctx.symbol||'').trim();
      const snapshot=(tradingCoreRuntime.getMarketSnapshot(symbol)||{}) as Record<string,unknown>;
      const ltp=Number(snapshot.ltp??snapshot.lastPrice??snapshot.close);
      const rawReceived=Number(snapshot.receivedAtEpoch??snapshot.lastReceivedAt);
      let receivedAt=Number.isFinite(rawReceived)&&rawReceived>0
        ? (rawReceived>1e12?rawReceived:rawReceived*1000)
        : Date.parse(String(snapshot.receivedAt??''));
      if(!Number.isFinite(receivedAt))receivedAt=0;
      const quoteState=!Number.isFinite(ltp)?'WAITING':!receivedAt||Date.now()-receivedAt>15_000?'STALE':'LIVE';
      quoteLine.textContent=`Active LTP  ${Number.isFinite(ltp)?ltp.toLocaleString('en-IN',{maximumFractionDigits:2}):'—'}  ·  ${quoteState}`;
      quoteLine.style.color=quoteState==='LIVE'?'#4ade80':quoteState==='STALE'?'#fbbf24':'var(--vela-fg-muted)';

      const perf=(window as Window & {__TCO_PERF__?:{cells?:Array<{symbol?:string;timeframe?:string;backend?:string;fps?:number;p95FrameMs?:number}>}}).__TCO_PERF__;
      const cell=perf?.cells?.find(item=>String(item.symbol||'').toUpperCase()===symbol.toUpperCase()&&String(item.timeframe||'')===String(ctx.timeframe||''));
      rendererLine.textContent=`Renderer  ${cell?.backend||'Vela'}`;
      performanceLine.textContent=cell
        ? `FPS  ${Number.isFinite(Number(cell.fps))?Number(cell.fps).toFixed(1):'—'}  ·  P95 frame  ${Number.isFinite(Number(cell.p95FrameMs))?Number(cell.p95FrameMs).toFixed(1)+' ms':'—'}`
        : 'Renderer metrics are warming up…';
      summary.textContent=`Vela terminal · ${symbol} · ${ctx.timeframe}`;
    };

    const tools= document.createElement('div');
    tools.style.cssText='display:flex;flex-direction:column;gap:5px;margin-top:8px;';
    const replayButton=document.createElement('button');
    replayButton.type='button'; replayButton.textContent='Open chart replay controls';
    replayButton.className='tco-frame-button';
    replayButton.setAttribute('aria-label','Open Vela chart replay controls');
    replayButton.addEventListener('click',()=>ctx.togglePanel('tco.replay'));
    const healthButton=document.createElement('button');
    healthButton.type='button'; healthButton.textContent='Open market health & performance';
    healthButton.className='tco-frame-button';
    healthButton.setAttribute('aria-label','Open market health and renderer performance');
    healthButton.addEventListener('click',()=>ctx.togglePanel('tco.market-health'));
    tools.append(replayButton,healthButton);
    root.appendChild(tools);

    refreshContext();
    const contextTimer=window.setInterval(refreshContext,1000);
    return {
      onOpen:refreshContext,
      onChart:refreshContext,
      destroy:()=>window.clearInterval(contextTimer),
    };
  },
};

const automationPanel:SidePanelDescriptor={
  id:'tco.automation',
  title:'Automation',
  icon:'replay',
  order:13,
  width:340,
  resizable:true,
  minWidth:300,
  maxWidth:520,
  mount(_ctx,body,header){
    header.setTitle('Automation');
    const root=panelRoot(body);
    const status=document.createElement('div');
    status.style.cssText='font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(status);
    const rows=document.createElement('div');
    rows.style.cssText='display:flex;flex-direction:column;gap:4px;min-height:0;overflow:auto;';
    root.appendChild(rows);

    const render=()=>{
      rows.textContent='';
      const automations=getAutomations();
      const enabled=automations.filter(item=>item.enabled);
      status.textContent=`${enabled.length} enabled · ${automations.length} configured`;
      if(!automations.length){
        rows.appendChild(panelSectionTitle('No automations configured'));
      }else{
        for(const item of automations.slice(0,50)){
          const row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);';
          const left=document.createElement('span');
          left.style.cssText='min-width:0;display:flex;flex-direction:column;gap:2px;';
          const name=document.createElement('span'); name.textContent=item.name; name.style.cssText='font-size:10px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          const detail=document.createElement('span'); detail.textContent=`${item.kind} · ${item.mode}`; detail.style.cssText='font-size:9px;color:#64748b;';
          left.append(name,detail);
          const badge=document.createElement('span'); badge.textContent=item.enabled?'ON':'OFF'; badge.style.cssText=`font:700 8px ui-monospace;padding:3px 5px;border-radius:4px;color:${item.enabled?'#4ade80':'#64748b'};background:${item.enabled?'rgba(34,197,94,.08)':'rgba(100,116,139,.08)'};`;
          row.append(left,badge); rows.appendChild(row);
        }
      }
      const manage=document.createElement('button');
      manage.type='button'; manage.textContent='Manage automations';
      manage.style.cssText='margin-top:7px;border:1px solid rgba(155,138,255,.20);border-radius:7px;padding:8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 10px ui-monospace;cursor:pointer;';
      manage.addEventListener('click',()=>navigateTcoTerminalRoute('/automations'));
      rows.appendChild(manage);
    };
    render();
    const refresh=()=>render();
    window.addEventListener('tradingcore:automations',refresh as EventListener);
    return { onOpen:render, onChart:render, destroy:()=>window.removeEventListener('tradingcore:automations',refresh as EventListener) };
  },
};

const tradingPanel:SidePanelDescriptor={
  id:'tco.trading',
  title:'Trading',
  icon:'datawindow',
  order:14,
  width:350,
  resizable:true,
  minWidth:300,
  maxWidth:520,
  mount(ctx,body,header){
    header.setTitle('Trading');
    const root=panelRoot(body);
    const summary=document.createElement('div');
    summary.style.cssText='font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(summary);
    const rows=document.createElement('div');
    rows.style.cssText='display:flex;flex-direction:column;gap:4px;';
    root.appendChild(rows);

    const render=async()=>{
      rows.textContent='';
      try{
        const [funds,positions]=await Promise.all([tradingCoreRuntime.getFunds(),tradingCoreRuntime.getPositions()]);
        const quoteSnapshot=(tradingCoreRuntime.getMarketSnapshot(ctx.symbol)||{}) as Record<string,unknown>;
        const rawReceived=Number(quoteSnapshot.receivedAtEpoch??quoteSnapshot.lastReceivedAt);
        const parsedReceived=Number.isFinite(rawReceived)&&rawReceived>0
          ? (rawReceived>1e12?rawReceived:rawReceived*1000)
          : Date.parse(String(quoteSnapshot.receivedAt??''));
        const receivedAt=Number.isFinite(parsedReceived)?parsedReceived:undefined;
        const ltpValue=Number(quoteSnapshot.ltp??quoteSnapshot.lastPrice??quoteSnapshot.close);
        const hasLtp=Number.isFinite(ltpValue);
        const quoteStale=!receivedAt||Date.now()-receivedAt>15_000;
        summary.textContent=`${ctx.symbol} · ${ctx.timeframe} · ${positions.length} open positions`;
        panelValueRow(rows,'Active chart LTP',hasLtp?ltpValue.toLocaleString('en-IN',{maximumFractionDigits:2}):'Waiting for quote',!hasLtp?'#94a3b8':quoteStale?'#fbbf24':'#4ade80');
        panelValueRow(rows,'Quote freshness',!hasLtp?'WAITING':quoteStale?'STALE':'LIVE',!hasLtp?'#94a3b8':quoteStale?'#fbbf24':'#4ade80');
        panelValueRow(rows,'Available margin',funds?Number(funds.availableMargin).toLocaleString('en-IN',{maximumFractionDigits:2}):'—');
        panelValueRow(rows,'Used margin',funds?Number(funds.usedMargin).toLocaleString('en-IN',{maximumFractionDigits:2}):'—');
        panelValueRow(rows,'Open P&L',positions.reduce((sum,p)=>sum+Number(p.pnl||0),0).toLocaleString('en-IN',{maximumFractionDigits:2}));
        const actions=panelSectionTitle('Trading tools');
        rows.appendChild(actions);
        for(const [label,id] of [['Positions','tco.positions'],['Risk','tco.risk'],['Order Book','tco.orderbook'],['Options Chain','tco.options'],['Market Health','tco.market-health']] as const){
          const button=document.createElement('button');
          button.type='button'; button.textContent=label;
          button.style.cssText='border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);color:#cbd5e1;font:10px ui-monospace;text-align:left;cursor:pointer;';
          button.addEventListener('click',()=>ctx.togglePanel(id));
          rows.appendChild(button);
        }
      }catch(error){
        summary.textContent='Trading services unavailable';
        const msg=document.createElement('div'); msg.textContent=error instanceof Error?error.message:String(error); msg.style.cssText='font-size:10px;color:#fb7185;padding:8px 0;'; rows.appendChild(msg);
      }
    };
    void render();
    const timer=window.setInterval(()=>void render(),3000);
    return { onOpen:()=>void render(), onChart:()=>void render(), destroy:()=>window.clearInterval(timer) };
  },
};

const tradeMarksAttachment: WidgetAttachment = {
  id: 'tco.trade-marks',
  mount(ctx) {
    let lastChart: typeof ctx.chart | null = null;
    let lastMarketListener: (() => void) | undefined;
    let generation = 0;

    const refresh = async (): Promise<void> => {
      const chart = ctx.chart;
      const currentGeneration = ++generation;
      if (chart !== lastChart) {
        lastMarketListener?.();
        lastMarketListener = undefined;
        lastChart?.marks.clear();
        lastChart = chart;
        chart.marks.defineGroup({ id: 'trades', label: 'Trades', visible: true });
        lastMarketListener = chart.on('market:changed', () => void refresh());
      }

      try {
        const symbol = String(ctx.symbol || '').trim().toUpperCase();
        const trades = await tradingCoreRuntime.getTradeHistory();
        if (currentGeneration !== generation) return;
        const marks = trades
          .filter((trade) => String(trade.symbol || '').trim().toUpperCase() === symbol)
          .slice(-250)
          .map((trade) => {
            const timeValue = Number(trade.timestamp);
            const parsed = Number.isFinite(timeValue)
              ? (timeValue > 1e12 ? timeValue : timeValue * 1000)
              : Date.parse(String(trade.timestamp || ''));
            if (!Number.isFinite(parsed)) return null;
            const buy = trade.side === 'Buy';
            const pnl = Number(trade.pnl);
            return {
              id: `tco.trade.${trade.tradeId}`,
              time: parsed,
              title: `${buy ? 'BUY' : 'SELL'} ${trade.symbol}`,
              glyph: {
                shape: 'circle' as const,
                color: buy ? '#22c55e' : '#ef4444',
                letter: buy ? 'B' : 'S',
              },
              tooltip: `${buy ? 'BUY' : 'SELL'} · ${Number(trade.quantity).toLocaleString('en-IN')} @ ${Number(trade.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
              group: 'trades',
              content: {
                panel: {
                  items: [
                    { type: 'field' as const, label: 'Side', value: trade.side },
                    { type: 'field' as const, label: 'Quantity', value: String(trade.quantity) },
                    { type: 'field' as const, label: 'Price', value: Number(trade.price).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
                    { type: 'field' as const, label: 'Order', value: trade.orderId },
                    { type: 'field' as const, label: 'Product', value: trade.product },
                    ...(Number.isFinite(pnl) ? [{ type: 'field' as const, label: 'P&L', value: pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }] : []),
                  ],
                },
              },
            };
          })
          .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark));

        chart.marks.set(marks);
      } catch {
        if (currentGeneration === generation) chart.marks.clear();
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);

    return () => {
      window.clearInterval(timer);
      lastMarketListener?.();
      lastMarketListener = undefined;
      lastChart?.marks.clear();
      lastChart = null;
    };
  },
};

const dataWindowPanel: SidePanelDescriptor = {
  id: 'tco.data-window',
  title: 'Data Window',
  icon: 'datawindow',
  order: 35,
  width: 360,
  resizable: true,
  minWidth: 300,
  maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Vela Data Window');
    const root = panelRoot(body);
    const context = document.createElement('div');
    context.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(context);
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:4px;overflow:auto;min-height:0;';
    root.appendChild(rows);

    const field = (label: string, value: string, tone = '#cbd5e1') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:10px;padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:6px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
      const key = document.createElement('span'); key.textContent = label; key.style.color = '#64748b';
      const val = document.createElement('span'); val.textContent = value; val.style.color = tone; val.style.fontVariantNumeric = 'tabular-nums';
      row.append(key, val); rows.appendChild(row);
    };

    const render = () => {
      rows.textContent = '';
      context.textContent = `${ctx.symbol} · ${ctx.timeframe}`;
      const readout = ctx.chart.renderer.dataWindowReadout?.();
      if (!readout) {
        field('Status', 'Unavailable on current renderer', '#facc15');
        return;
      }
      if (!readout.ohlc) {
        field('Status', 'Waiting for bars', '#64748b');
        return;
      }
      field('Date', readout.date);
      field('Time', readout.time);
      field('Open', readout.ohlc.o, readout.ohlc.up ? '#4ade80' : '#fb7185');
      field('High', readout.ohlc.h);
      field('Low', readout.ohlc.l);
      field('Close', readout.ohlc.c, readout.ohlc.up ? '#4ade80' : '#fb7185');
      if (readout.ohlc.vol) field('Volume', readout.ohlc.vol);

      for (const group of readout.groups) {
        const title = document.createElement('div');
        title.textContent = group.name;
        title.style.cssText = 'margin-top:7px;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.10em;';
        rows.appendChild(title);
        for (const item of group.rows) field(item.label, item.value, item.color);
      }
    };

    render();
    const timer = window.setInterval(render, 250);
    return {
      onOpen: render,
      onChart: render,
      destroy: () => window.clearInterval(timer),
    };
  },
};

const journalPanel: SidePanelDescriptor = {
  id: 'tco.journal', title: 'Journal', icon: 'calendar', order: 20, width: 340, resizable: true, minWidth: 280, maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Journal');
    const root = panelRoot(body);
    const context = document.createElement('div');
    context.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(context);
    const textarea = document.createElement('textarea');
    textarea.value = localStorage.getItem(JOURNAL_KEY) ?? '';
    void loadTcoVelaJournal().then((cloud) => { if (cloud != null && document.contains(textarea)) textarea.value = cloud; });
    textarea.placeholder = 'Trade notes, observations, setups, execution review...';
    textarea.style.cssText = 'flex:1;min-height:180px;resize:none;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:#090d15;color:#e2e8f0;outline:none;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box;';
    root.appendChild(textarea);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;';
    root.appendChild(actions);
    const save = document.createElement('button');
    save.type = 'button'; save.textContent = 'Save note';
    save.style.cssText = 'flex:1;border:1px solid rgba(155,138,255,.28);border-radius:7px;padding:8px;background:rgba(124,92,255,.12);color:#ddd6fe;font:11px ui-monospace;cursor:pointer;';
    save.addEventListener('click', () => { localStorage.setItem(JOURNAL_KEY, textarea.value); void saveTcoVelaJournal(textarea.value); });
    const stamp = document.createElement('button');
    stamp.type = 'button'; stamp.textContent = 'Stamp context';
    stamp.style.cssText = 'border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px 10px;background:#0c111a;color:#cbd5e1;font:11px ui-monospace;cursor:pointer;';
    stamp.addEventListener('click', () => {
      const line = `[${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${ctx.symbol} · ${ctx.timeframe}
`;
      textarea.value = textarea.value ? `${textarea.value.replace(/\s*$/, '')}\n${line}` : line;
      textarea.focus();
    });
    actions.append(save, stamp);
    const refresh = (): void => { context.textContent = `${ctx.symbol} · ${ctx.timeframe}`; };
    refresh();
    return { onOpen: refresh, onChart: refresh };
  },
};

const accountPanel: SidePanelDescriptor = {
  id: 'tco.account', title: 'Account', icon: 'user', order: 5, width: 300, resizable: false, minWidth: 280, maxWidth: 360,
  mount(_ctx, body, header) {
    header.setTitle('TradingCoreOS Account');
    const root = panelRoot(body);
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(145deg,#11131a,#090b10);';
    const avatar = document.createElement('img');
    avatar.alt = 'Profile picture'; avatar.width = 64; avatar.height = 64;
    avatar.style.cssText = 'width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid rgba(124,92,255,.45);box-shadow:0 0 30px rgba(124,92,255,.16);';
    avatar.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#12141a"/><circle cx="32" cy="25" r="12" fill="#7c5cff"/><path d="M12 58c3-15 12-21 20-21s17 6 20 21" fill="#7c5cff"/></svg>');
    const name = document.createElement('div'); name.style.cssText='font-size:13px;font-weight:700;color:#f8fafc;';
    const email = document.createElement('div'); email.style.cssText='font-size:10px;color:#7f899e;';
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:6px;width:100%;margin-top:8px;';
    const profile = document.createElement('button'); profile.type='button'; profile.textContent='Profile'; profile.style.cssText='flex:1;border:1px solid rgba(124,92,255,.3);border-radius:8px;padding:8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 10px ui-monospace;cursor:pointer;';
    profile.onclick=()=>{ window.history.pushState({},'', '/profile'); window.dispatchEvent(new PopStateEvent('popstate')); };
    const settings = document.createElement('button'); settings.type='button'; settings.textContent='Settings'; settings.style.cssText='flex:1;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:#0d1017;color:#cbd5e1;font:600 10px ui-monospace;cursor:pointer;';
    settings.onclick=()=>{ window.dispatchEvent(new Event('tco:open-settings')); };
    actions.append(profile,settings); card.append(avatar,name,email,actions); root.append(card);
    void (async()=>{ try { const client=(await import('../../auth/supabaseClient')).getSupabaseClient(); const u=(await client.auth.getUser()).data.user; if(!u)return; name.textContent=u.user_metadata?.full_name||u.email||'Trader'; email.textContent=u.email||''; if (u.user_metadata?.avatar_url) avatar.src=String(u.user_metadata.avatar_url); const {data}=await client.from('profiles').select('name,email,avatar').eq('id',u.id).maybeSingle(); if(data){name.textContent=data.name||name.textContent;email.textContent=data.email||email.textContent;if(data.avatar)avatar.src=String(data.avatar);} } catch {} })();
    return {};
  },
};

const coreSpiritOpenAction: Parameters<typeof registerLegendAction>[0] = {
  id: 'tco.corespirit.open',
  icon: 'indicators',
  tooltip: 'Open CoreSpirit source',
  order: 10,
  when: (indicator) => Boolean(indicator.source),
  run(ctx, indicator) {
    if (indicator.source) {
      try { localStorage.setItem('tradingcore:corespirit:selected-source', indicator.source); } catch {}
    }
    ctx.toast('CoreSpirit source selected', 'info');
    window.dispatchEvent(new Event('tco:corespirit-source-selected'));
  },
};

const coreSpiritStatusCallout: Parameters<typeof registerLegendCallout>[0] = {
  id: 'tco.corespirit.status',
  order: 10,
  callout(indicator) {
    if (!indicator.source) return null;
    const spec: LegendCalloutSpec = {
      icon: 'indicators',
      background: 'rgba(124,92,255,.14)',
      color: '#c4b5fd',
      tooltip: 'CoreSpirit indicator',
      content: {
        title: indicator.title,
        items: [
          { type: 'text', text: 'CoreSpirit executable · Vela renderer' },
        ],
      },
    };
    return spec;
  },
};

registerLegendAction(coreSpiritOpenAction);
registerLegendCallout(coreSpiritStatusCallout);
registerSidePanel(accountPanel);

const researchAction:WidgetActionDescriptor={
  id:'tco.research', target:'topbar', label:'Research', icon:'search', iconOnly:false, align:'right', order:1.5, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.research');},
};

const automationAction:WidgetActionDescriptor={
  id:'tco.automation', target:'topbar', label:'Automation', icon:'replay', iconOnly:false, align:'right', order:1.6, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.automation');},
};

const tradingAction:WidgetActionDescriptor={
  id:'tco.trading', target:'topbar', label:'Trading', icon:'datawindow', iconOnly:false, align:'right', order:1.7, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.trading');},
};

const positionsAction: WidgetActionDescriptor = {
  id: 'tco.positions',
  target: 'topbar',
  label: 'Positions',
  icon: 'briefcase',
  iconOnly: true,
  align: 'right',
  order: 4,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.positions'); },
};

const chartSettingsAction: WidgetActionDescriptor = {
  id: 'tco.chart-settings',
  target: 'topbar',
  label: 'Chart settings',
  icon: 'gear',
  iconOnly: true,
  align: 'right',
  order: 20,
  mobile: 'menu',
  run(ctx) {
    const renderer = ctx.chart.renderer;
    if (typeof renderer.openSettings === 'function') {
      renderer.openSettings();
    } else {
      ctx.toast('Chart settings are unavailable for this renderer', 'error');
    }
  },
};

const watchlistAction: WidgetActionDescriptor = {
  id: 'tco.watchlist', target: 'topbar', label: 'Watchlist', icon: 'star', iconOnly: false, align: 'right', order: 0, mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.bookmarks'); },
};

const journalAction: WidgetActionDescriptor = {
  id: 'tco.journal', target: 'topbar', label: 'Journal', icon: 'calendar', iconOnly: false, align: 'right', order: 1, mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.journal'); },
};

registerSidePanel(workspaceFramePanel);
registerSidePanel(coreSpiritCodePanel);
registerSidePanel(bookmarksPanel);
registerSidePanel(researchPanel);
registerSidePanel(automationPanel);
registerSidePanel(tradingPanel);
registerSidePanel(journalPanel);
registerSidePanel(dataWindowPanel);
registerSidePanel(healthPanel);
registerSidePanel(replayPanel);
registerSidePanel(positionsPanel);
registerSidePanel(riskPanel);
registerSidePanel(orderBookPanel);
registerSidePanel(optionsPanel);
registerWidgetAttachment(tradeMarksAttachment);
registerWidgetAction(researchAction);
registerWidgetAction(automationAction);
registerWidgetAction(tradingAction);
registerWidgetAction(positionsAction);
registerWidgetAction(workspaceFrameAction);
registerWidgetAction(coreSpiritCodeAction);
registerWidgetAction(watchlistAction);
registerWidgetAction(chartSettingsAction);
registerWidgetAction(journalAction);
