import { createElement } from 'react';
import { TerminalJournalPanel } from '../../../components/workspace/TerminalJournalPanel';
import { CoreSpiritChartAssistant } from '../../../components/workspace/CoreSpiritChartAssistant';
import { createRoot } from 'react-dom/client';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from '../../coreSpirit/luxAlgoSmcCoreSource';
import type { CoreSpiritExecutableArtifact } from '../../coreSpirit/artifact';
import { coreSpiritChartRegistry } from '../../coreSpirit/chartRegistry';
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
import { fetchTradingCoreNewsBundle, type TradingCoreNewsItem } from '../../news/newsService';
// Advanced watchlist metrics extend buildWatchlistTechnicalSummary (RSI, EMA20/50 and MACD) with ATR, ADX, VWAP and relative volume.
import { buildWatchlistAdvancedTechnicalSummary, type WatchlistAdvancedTechnicalSummary } from '../../marketData/watchlistAdvancedTechnicals';
import { loadDefaultTerminalWatchlist, saveDefaultTerminalWatchlist } from '../../terminal/terminalDataService';
import { searchFyersInstruments, type SearchInstrument } from '../../marketData/instrumentSearch';
import { hasValidFyersSession } from '../../marketData/yahooFallback';
import { loadTcoCanonicalHistoryBars } from '../../../TcoVelaDataProvider';
import { historyStore } from '../../marketData/HistoryStore';
import type { TimelineMark } from './velaNativeChartKernel';
import { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';
import {
  deleteTcoVelaSavedWorkspace,
  flushTcoVelaAppearance,
  getLocalTcoVelaSavedWorkspace,
  loadTcoVelaActiveWorkspaceId,
  loadTcoVelaAppearance,
  loadTcoVelaJournal,
  loadTcoVelaSavedWorkspaces,
  saveTcoVelaActiveWorkspaceId,
  saveTcoVelaAppearance,
  saveTcoVelaJournal,
  saveTcoVelaSavedWorkspace,
  type TcoSavedWorkspace,
} from './tcoVelaSupabaseStorage';
import { getAutomations } from '../../workspace/workspaceState';
import { registerIcon, svg16 } from './velaNativeChartKernel';
import { versionedStorageKey } from '../../coreSpirit/storageSchema';
import type { VelaTheme } from './velaNativeChartKernel';
import { themeTokens } from './velaNativeChartKernel';

// TCO-only topbar / panel actions need real registered SVGs. Unknown Vela ids otherwise
// render blank spans inside clickable icon-only controls.
const TCO_CHROME_ICONS: Record<string, string> = {
  activity: svg16('<path d="M1.5 8h3l2-5 3 10 2-5h3"/>'),
  corespirit: svg16('<path d="M8 1.2c.9 2.1 3.6 3.4 3.6 6.1a3.6 3.6 0 1 1-7.2 0c0-1.4.8-2.5 1.6-3.6.4 1 1 1.7 1.7 2.3.8-1.2 1-2.9.3-4.8Z"/><circle cx="8" cy="8.5" r="2.4"/><path d="M8 5.2v.9M8 10.9v.9M4.7 8.5h.9M10.4 8.5h.9"/>'),
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
  save: svg16('<path d="M2 1.5h9l3 3v10H2z"/><path d="M4.5 1.5v4h6v-4M4.5 14.5v-5h7v5"/>'),
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
let watchlistCloudSaveTimer: number | null = null;
let watchlistMutationRevision = 0;
let watchlistCloudReady = false;

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
  watchlistMutationRevision += 1;
  persistWatchlistLocal();
  ctx?.stateChanged?.();
  watchlistRefreshers.forEach((refresh) => refresh());
  if (watchlistCloudReady && typeof window !== 'undefined') {
    if (watchlistCloudSaveTimer !== null) window.clearTimeout(watchlistCloudSaveTimer);
    watchlistCloudSaveTimer = window.setTimeout(() => {
      watchlistCloudSaveTimer = null;
      void saveDefaultTerminalWatchlist(watchlist).catch(() => undefined);
    }, 450);
  }
}

loadWatchlistLocal();

const watchlistStatePersistence: StatePersistenceHandler = {
  key: WATCHLIST_STATE_KEY,
  scope: 'global',
  serialize() {
    return { version: 2, items: watchlist };
  },
  restore(payload) {
    if (watchlistCloudReady || watchlistMutationRevision > 0) return;
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
  root.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg, #151619);color:var(--vela-fg, #d1d4dc);font-family:Inter,ui-sans-serif,system-ui,sans-serif;';
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
// A WeakMap avoids retaining a destroyed chart workspace after the live route unmounts.
const appliedTcoVelaThemeSignatures = new WeakMap<object, string>();
let pendingTcoChartThemeTimer: number | null = null;
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
function normalizeTcoFramePreferences(value: unknown): TcoFramePreferences {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<TcoFramePreferences> & { accent?: string }
    : {};
  const legacyAccent: Record<string, string> = { violet: '#8b7cff', teal: '#14b8a6', blue: '#60a5fa', amber: '#f59e0b' };
  const themePreset = TCO_FRAME_THEME_PRESETS.some((preset) => preset.id === raw.themePreset) ? String(raw.themePreset) : 'custom';
  const topbarRaw = raw.topbar && typeof raw.topbar === 'object' ? raw.topbar : {};
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
    topbar: Object.fromEntries(Object.keys(DEFAULT_FRAME_PREFERENCES.topbar).map((key) => [key, (topbarRaw as Record<string, unknown>)[key] !== false])) as Record<string, boolean>,
  };
}

function readTcoFramePreferences(): TcoFramePreferences {
  try {
    return normalizeTcoFramePreferences(JSON.parse(localStorage.getItem(TCO_FRAME_STORAGE_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_FRAME_PREFERENCES, topbar: { ...DEFAULT_FRAME_PREFERENCES.topbar } };
  }
}

function applyTcoFramePreferences(host: HTMLElement, preferences: TcoFramePreferences, forceChartTheme = false, persistAppearance = true): void {
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
    .tco-frame-save-status { display:block;padding:7px 9px;border:1px solid var(--vela-border);border-radius:7px;background:var(--vela-surface-sunken);font-variant-numeric:tabular-nums; }
    .tco-frame-save-status[data-state="saving"] { color:#fbbf24; }
    .tco-frame-save-status[data-state="saved"] { color:#34d399; }
    .tco-frame-save-status[data-state="local"] { color:#fbbf24; }
    .tco-frame-save-status[data-state="error"] { color:#fb7185; }
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
    .tco-watch-suggestions { position:relative;z-index:12;display:flex;flex-direction:column;gap:2px;max-height:240px;overflow:auto;border:1px solid var(--vela-border);border-radius:8px;background:var(--vela-surface);box-shadow:0 12px 28px rgba(0,0,0,.34); }
    .tco-watch-suggestion { display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 9px;border:0;border-bottom:1px solid var(--vela-border-soft);background:transparent;color:var(--vela-fg);text-align:left;cursor:pointer;font:11px Inter,ui-sans-serif,system-ui,sans-serif; }
    .tco-watch-suggestion:hover,.tco-watch-suggestion[aria-selected="true"] { background:var(--tco-frame-accent-soft,rgba(139,124,255,.14)); }
    .tco-watch-resize { flex:0 0 8px;height:8px;display:flex;align-items:center;justify-content:center;margin:2px 0;cursor:row-resize;touch-action:none;user-select:none; }
    .tco-watch-resize::after { content:"";width:38px;height:3px;border-radius:3px;background:var(--vela-border); }
    .tco-watch-detail { flex:0 0 320px;min-height:150px;max-height:72%;overflow:auto;padding:10px;border:1px solid var(--vela-border);border-radius:9px;background:var(--vela-surface); }
    .tco-watch-metric { min-width:0;padding:8px 9px;border:1px solid var(--vela-border-soft);border-radius:7px;background:var(--vela-surface-sunken); }
    .tco-watch-metric-label { color:var(--vela-fg-muted);font-size:9px;margin-bottom:4px; }
    .tco-watch-metric-value { color:var(--vela-fg-bright);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }

    /* Vela-native right rail: consistent hit targets, calm separators and a clear active-panel marker. */
    .vela-sidebar {
      width:46px!important;flex:0 0 46px!important;padding:8px 0!important;gap:12px!important;
      background:linear-gradient(180deg,#17191d 0%,#141518 100%)!important;
      border-inline-start:1px solid #292c33!important;color:#9298a4!important;
    }
    .vela-sidebar-section { gap:8px!important; }
    .vela-sidebar-group { gap:3px!important; }
    .vela-sidebar-sep { width:18px!important;margin:3px 0!important;background:#33363e!important; }
    .vela-sidebar-btn {
      width:34px!important;height:34px!important;border-radius:9px!important;font-size:17px!important;
      color:#9298a4!important;transition:background 120ms ease,color 120ms ease,box-shadow 120ms ease!important;
    }
    .vela-sidebar-btn:hover { background:rgba(255,255,255,.065)!important;color:#eef1f6!important; }
    .vela-sidebar-btn[data-active='1'] {
      background:#242831!important;color:#f1f4f9!important;
      box-shadow:inset 0 0 0 1px rgba(160,177,205,.14)!important;
    }
    .vela-sidebar-btn[data-active='1']::before {
      content:"";position:absolute;inset-inline-end:-7px;top:50%;width:2px;height:17px;
      border-radius:2px;background:#6296ee;transform:translateY(-50%);
    }
    .vela-sidebar-btn:focus-visible { outline:2px solid rgba(98,150,238,.72)!important;outline-offset:1px!important; }

    .vela-panel { background:var(--vela-surface,#151619)!important;color:var(--vela-fg,#d1d4dc)!important; }
    .vela-panel-header {
      min-height:42px!important;padding:0 10px 0 14px!important;gap:8px!important;
      background:#151619!important;border-bottom-color:#2a2d34!important;
    }
    .vela-panel-title { font-size:12px!important;font-weight:650!important;letter-spacing:.01em!important; }
    .vela-panel-body { background:var(--vela-bg,#151619)!important; }

    /* Watchlist layout: compact quote rows above a dedicated, independently resizable inspector. */
    .tco-watchlist-panel {
      min-height:0!important;padding:10px 11px 11px!important;gap:7px!important;
      overflow:hidden!important;background:#141518!important;
    }
    .tco-watchlist-meta {
      display:flex;align-items:center;min-height:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      padding:0 2px;color:#858c98;font:700 9px/1.25 Inter,ui-sans-serif,system-ui,sans-serif;
      letter-spacing:.09em;text-transform:uppercase;
    }
    .tco-watchlist-actions { display:flex!important;align-items:center!important;gap:8px!important;padding:0!important; }
    .tco-watchlist-add {
      min-height:30px!important;padding:0 10px!important;border-radius:7px!important;
      border-color:#35558b!important;background:rgba(54,112,204,.12)!important;
      color:#dce8ff!important;font:650 10px Inter,ui-sans-serif,system-ui,sans-serif!important;
    }
    .tco-watchlist-add:hover { background:rgba(54,112,204,.2)!important;border-color:#4c79bc!important; }
    .tco-watchlist-search {
      height:33px!important;padding:0 11px!important;border-radius:7px!important;
      border-color:#2c3038!important;background:#101216!important;color:#e3e7ed!important;
      font:11px Inter,ui-sans-serif,system-ui,sans-serif!important;
    }
    .tco-watchlist-search::placeholder { color:#777f8c!important; }
    .tco-watchlist-search:focus { border-color:#527fbd!important;box-shadow:0 0 0 2px rgba(82,127,189,.14)!important; }
    .tco-watchlist-filters {
      display:flex!important;align-items:center!important;gap:4px!important;flex-wrap:nowrap!important;min-width:0;
    }
    .tco-watchlist-filters .tco-watch-filter {
      padding:5px 8px!important;border-radius:6px!important;border-color:#2d3139!important;
      background:#1a1d22!important;color:#a5abb5!important;font:600 9px Inter,ui-sans-serif,system-ui,sans-serif!important;
    }
    .tco-watchlist-filters .tco-watch-filter[aria-pressed="true"] {
      border-color:#4a6e9e!important;background:#202b3a!important;color:#e3edff!important;
    }
    .tco-watchlist-sort {
      width:110px!important;max-width:110px!important;min-width:0!important;height:27px!important;
      margin-inline-start:auto!important;padding:0 6px!important;border-radius:6px!important;
      border-color:#2d3139!important;background:#171a1f!important;color:#b9bec8!important;font-size:9px!important;
    }
    .tco-watchlist-list {
      flex:1 1 auto!important;min-height:90px!important;overflow:auto!important;gap:3px!important;
      padding:1px 2px 6px 0!important;scrollbar-width:thin;scrollbar-color:#3a3e47 transparent;
    }
    .tco-watchlist-row {
      position:relative;display:flex!important;align-items:center!important;gap:3px!important;
      width:100%!important;min-height:48px!important;padding:1px 3px!important;box-sizing:border-box!important;
      border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;
      transition:background 110ms ease,border-color 110ms ease!important;
    }
    .tco-watchlist-row:hover { background:#1c2026!important;border-color:#2d333d!important; }
    .tco-watchlist-row[data-selected="1"] {
      background:#1b222d!important;border-color:#34465f!important;
      box-shadow:inset 2px 0 0 #6598e8!important;
    }
    .tco-watchlist-select {
      display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;
      flex:1 1 auto!important;min-width:0!important;min-height:45px!important;padding:6px 8px!important;
      border:0!important;border-radius:6px!important;background:transparent!important;color:#e4e8ee!important;
      font:inherit!important;text-align:left!important;cursor:pointer!important;
    }
    .tco-watchlist-select:hover { background:transparent!important; }
    .tco-watchlist-instrument { min-width:0;display:flex;flex-direction:column;gap:3px; }
    .tco-watchlist-ticker {
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#edf0f5;
      font:700 11px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;
    }
    .tco-watchlist-instrument-name {
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#858d99;
      font:400 9px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;
    }
    .tco-watchlist-price-block { position:relative;display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-end;gap:3px;padding-inline-end:9px; }
    .tco-watchlist-last {
      color:#e9edf3;font:700 11px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;
      font-variant-numeric:tabular-nums;
    }
    .tco-watchlist-change {
      color:#959daa;font:550 9px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;
      font-variant-numeric:tabular-nums;white-space:nowrap;
    }
    .tco-watchlist-price-block::after {
      content:"";position:absolute;inset-inline-end:0;top:4px;width:5px;height:5px;border-radius:50%;background:#68717e;
    }
    .tco-watchlist-row[data-quote-state="live"] .tco-watchlist-price-block::after { background:#16a887; }
    .tco-watchlist-row[data-quote-state="delayed"] .tco-watchlist-price-block::after { background:#3aa9d1; }
    .tco-watchlist-row[data-quote-state="stale"] .tco-watchlist-price-block::after { background:#d8a546; }
    .tco-watchlist-remove {
      flex:0 0 22px!important;width:22px!important;height:22px!important;padding:0!important;opacity:0;
      border:0!important;border-radius:6px!important;background:transparent!important;color:#747d8b!important;
      font:16px/1 sans-serif!important;cursor:pointer!important;transition:opacity 100ms ease,background 100ms ease,color 100ms ease!important;
    }
    .tco-watchlist-row:hover .tco-watchlist-remove,.tco-watchlist-row:focus-within .tco-watchlist-remove { opacity:1; }
    @media (hover:none) { .tco-watchlist-remove { opacity:1; } }
    .tco-watchlist-remove:hover { background:rgba(239,68,68,.1)!important;color:#ff7a86!important; }
    .tco-watchlist-resize { flex:0 0 8px!important;height:8px!important;margin:0!important; }
    .tco-watchlist-resize::after { width:34px!important;height:2px!important;background:#414650!important; }
    .tco-watchlist-inspector {
      flex:0 0 220px!important;min-height:170px!important;max-height:46%!important;overflow:auto!important;
      padding:10px!important;border:1px solid #30353e!important;border-radius:10px!important;
      background:linear-gradient(155deg,#1a1e25 0%,#15181e 100%)!important;
      box-shadow:0 8px 20px rgba(0,0,0,.12);
    }
    .tco-watchlist-detail-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px!important; }
    .tco-watchlist-detail-title { color:#f0f3f8;font-size:13px!important;font-weight:750!important;line-height:1.25; }
    .tco-watchlist-detail-subtitle { margin-top:3px!important;color:#8e97a5!important;font-size:9px!important;line-height:1.35; }
    .tco-watchlist-live-badge {
      flex:none;padding:3px 7px!important;border:1px solid #3b424d!important;border-radius:999px!important;
      background:#20252d;color:#a9b2c0;font-size:8px!important;font-weight:800!important;letter-spacing:.07em;
    }
    .tco-watchlist-live-badge[data-quote-state="live"] { border-color:#1f6559!important;background:rgba(8,153,129,.12)!important;color:#5bd3b4!important; }
    .tco-watchlist-live-badge[data-quote-state="delayed"] { border-color:#285c70!important;background:rgba(58,169,209,.11)!important;color:#75cde9!important; }
    .tco-watchlist-live-badge[data-quote-state="stale"] { border-color:#6b552b!important;background:rgba(216,165,70,.1)!important;color:#e7bf6e!important; }
    .tco-watchlist-metrics { display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important; }
    .tco-watchlist-metric {
      min-width:0;padding:7px 8px!important;border:1px solid #303640!important;border-radius:7px!important;
      background:rgba(10,13,18,.42)!important;
    }
    .tco-watchlist-metric-label { margin-bottom:3px!important;color:#818b99!important;font-size:8px!important;letter-spacing:.02em; }
    .tco-watchlist-metric-value { color:#e7ebf2!important;font-size:11px!important;font-weight:750!important; }
    .tco-watchlist-detail-hint { margin-top:7px!important;color:#8490a0!important;font-size:9px!important;line-height:1.4; }
    .tco-watchlist-section {
      margin-top:8px!important;padding:8px!important;border:1px solid #2e343e!important;border-radius:8px!important;
      background:rgba(10,13,18,.28)!important;
    }
    .tco-watchlist-section-label {
      color:#8993a1!important;font-size:8px!important;font-weight:800!important;letter-spacing:.09em;
    }
    .tco-watchlist-technical-summary { margin-top:5px!important;font-size:10px!important;font-weight:750!important; }
    .tco-watchlist-technical-values { margin-top:4px!important;font-size:9px!important;line-height:1.45!important;color:#9aa3b0!important; }
    .tco-watchlist-news-heading { display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:8px!important;font-weight:800;letter-spacing:.09em;color:#8993a1!important; }
    .tco-watchlist-news-meta { font-size:8px!important;font-weight:500;letter-spacing:0; }
    .tco-watchlist-news-list { display:flex;flex-direction:column;gap:6px;margin-top:6px; }
    .tco-watchlist-news-list a { color:#dfe6f1!important;font-size:9px!important;line-height:1.35; }
    .tco-watchlist-news-list a:hover { color:#8db7fa!important; }
    .tco-watch-suggestion { min-height:36px;padding:8px 10px!important; }
    .tco-watchlist-panel .tco-frame-help { font-size:9px!important;line-height:1.45!important; }

    .tco-panel-hub { gap:10px!important; }
    .tco-panel-hub-group { display:flex;flex-direction:column;gap:5px; }
    .tco-panel-hub-heading { padding:2px 2px 4px;color:#8993a1;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase; }
    .tco-panel-hub-item {
      display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
      padding:10px 11px;border:1px solid #303640;border-radius:8px;background:#191d23;color:#e0e5ed;
      font:600 11px Inter,ui-sans-serif,system-ui,sans-serif;text-align:left;cursor:pointer;
      transition:background 120ms ease,border-color 120ms ease;
    }
    .tco-panel-hub-item:hover { background:#212833;border-color:#43536a; }
    .tco-panel-hub-item span:last-child { color:#768293;font-size:9px;font-weight:500; }

    .tco-core-studio { min-height:0; }
    .tco-core-editor-frame { min-height:280px!important;flex:1 1 auto;border-color:var(--vela-border)!important;border-radius:9px!important;background:var(--vela-surface-sunken)!important; }
    .tco-core-editor-frame textarea { background:var(--vela-surface-sunken)!important; }
    .tco-core-status { border-radius:7px!important;border-color:var(--vela-border)!important;background:var(--vela-surface)!important; }
    .vela-widget-topbar [data-action-id="tco.save-workspace"] { position:relative; }
    .vela-widget-topbar [data-action-id="tco.save-workspace"][data-tco-save-state]::after { content:"";position:absolute;right:3px;bottom:3px;width:5px;height:5px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 1px var(--vela-surface);pointer-events:none; }
    .vela-widget-topbar [data-action-id="tco.save-workspace"][data-tco-save-state="saving"]::after { background:#f59e0b;animation:tco-save-pulse 1s ease-in-out infinite alternate; }
    .vela-widget-topbar [data-action-id="tco.save-workspace"][data-tco-save-state="local"]::after { background:#f59e0b; }
    .vela-widget-topbar [data-action-id="tco.save-workspace"][data-tco-save-state="error"]::after { background:#ef4444; }
    @keyframes tco-save-pulse { from { opacity:.35; } to { opacity:1; } }

    /* Final Vela chrome pass: quieter utility rail and a cleaner, denser watchlist. */
    .vela-sidebar {
      width:42px!important;flex:0 0 42px!important;padding:9px 0!important;gap:10px!important;
      background:#141518!important;border-inline-start:1px solid #272a30!important;
    }
    .vela-sidebar-section { gap:6px!important; }
    .vela-sidebar-group { gap:3px!important; }
    .vela-sidebar-sep { width:17px!important;margin:2px 0!important;background:#30333a!important; }
    .vela-sidebar-btn {
      width:30px!important;height:30px!important;border-radius:8px!important;font-size:16px!important;
      color:#8d939e!important;
    }
    .vela-sidebar-btn:hover { background:#202329!important;color:#e7eaf0!important; }
    .vela-sidebar-btn[data-active='1'] {
      background:#202630!important;color:#dce8ff!important;
      box-shadow:inset 0 0 0 1px rgba(120,157,213,.18)!important;
    }
    .vela-sidebar-btn[data-active='1']::before {
      inset-inline-end:-6px!important;width:2px!important;height:16px!important;background:#6b9ce8!important;
    }
    .vela-panel { background:#111317!important; }
    .vela-panel-header {
      min-height:40px!important;padding:0 10px 0 13px!important;
      background:#151619!important;border-bottom:1px solid #282b31!important;
    }
    .vela-panel-body { background:#111317!important; }
    .tco-watchlist-panel {
      padding:10px 11px 9px!important;gap:8px!important;background:#111317!important;
    }
    .tco-watchlist-meta {
      min-height:12px!important;padding:0 1px!important;color:#7f8793!important;
      font-size:8px!important;letter-spacing:.075em!important;
    }
    .tco-watchlist-add {
      min-height:27px!important;padding:0 9px!important;border-radius:6px!important;
      font-size:9px!important;background:#1b2737!important;border-color:#385b89!important;
    }
    .tco-watchlist-search {
      height:33px!important;padding:0 10px!important;border-radius:7px!important;
      background:#0e1014!important;border-color:#292d35!important;font-size:10px!important;
    }
    .tco-watchlist-filters { gap:5px!important; }
    .tco-watchlist-filters .tco-watch-filter {
      padding:5px 8px!important;border-radius:5px!important;background:#171a1f!important;
      border-color:#292d35!important;font-size:9px!important;
    }
    .tco-watchlist-filters .tco-watch-filter[aria-pressed="true"] {
      background:#202a38!important;border-color:#46658e!important;color:#e0eaff!important;
    }
    .tco-watchlist-sort {
      height:26px!important;width:104px!important;max-width:104px!important;
      background:#15181d!important;border-color:#292d35!important;font-size:8px!important;
    }
    .tco-watchlist-list {
      gap:1px!important;padding:0 1px 5px 0!important;
      scrollbar-color:#343942 transparent!important;
    }
    .tco-watchlist-row {
      min-height:45px!important;padding:1px 2px!important;border-radius:6px!important;
      border-bottom:1px solid rgba(255,255,255,.045)!important;
    }
    .tco-watchlist-row:hover { background:#191d23!important;border-color:#2a3039!important; }
    .tco-watchlist-row[data-selected="1"] {
      background:#1b222b!important;border-color:#33465e!important;
      box-shadow:inset 2px 0 0 #6b9ce8!important;
    }
    .tco-watchlist-select { min-height:41px!important;padding:5px 7px!important; }
    .tco-watchlist-instrument { gap:2px!important; }
    .tco-watchlist-ticker { font-size:10px!important;font-weight:700!important; }
    .tco-watchlist-instrument-name { font-size:8px!important;color:#7f8793!important; }
    .tco-watchlist-price-block { gap:2px!important;padding-inline-end:8px!important; }
    .tco-watchlist-last { font-size:10px!important; }
    .tco-watchlist-change { font-size:8px!important; }
    .tco-watchlist-remove { flex-basis:20px!important;width:20px!important;height:20px!important; }
    .tco-watchlist-resize { flex-basis:6px!important;height:6px!important;margin:0!important; }
    .tco-watchlist-inspector {
      flex:0 0 228px!important;min-height:185px!important;max-height:52%!important;
      padding:9px!important;border-radius:8px!important;border-color:#292e36!important;
      background:#171a20!important;box-shadow:none!important;
    }
    .tco-watchlist-detail-head { margin-bottom:7px!important; }
    .tco-watchlist-detail-title { font-size:12px!important; }
    .tco-watchlist-detail-subtitle { font-size:8px!important; }
    .tco-watchlist-metrics { gap:4px!important; }
    .tco-watchlist-metric { padding:6px 7px!important;border-radius:6px!important;background:#111419!important; }
    .tco-watchlist-metric-label { font-size:8px!important;margin-bottom:2px!important; }
    .tco-watchlist-metric-value { font-size:10px!important; }
    .tco-watchlist-detail-hint { display:none!important; }
    .tco-watchlist-section { margin-top:6px!important;padding:7px!important;border-radius:6px!important;background:#13161b!important; }
    .tco-watchlist-section-label,.tco-watchlist-news-heading { font-size:8px!important; }
    .tco-watchlist-technical-summary { margin-top:3px!important;font-size:9px!important; }
    .tco-watchlist-technical-values { margin-top:3px!important;font-size:8px!important; }
    .tco-watchlist-news-list { gap:5px!important;margin-top:5px!important; }
    .tco-watchlist-news-list a { font-size:8px!important;line-height:1.35!important; }
    .tco-watch-suggestion { min-height:33px!important;padding:7px 9px!important; }
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
  const applyChartTheme = () => {
    try {
      const liveWorkspace=(window as Window & { __TCO_VELA__?: { workspace?: { setTheme?: (theme: VelaTheme) => void } } }).__TCO_VELA__?.workspace;
      const signature=JSON.stringify(chartTheme);
      const previousSignature=liveWorkspace ? appliedTcoVelaThemeSignatures.get(liveWorkspace) : undefined;
      if(liveWorkspace && typeof liveWorkspace.setTheme==='function'
        && (forceChartTheme || signature!==previousSignature)) {
        liveWorkspace.setTheme(chartTheme);
        appliedTcoVelaThemeSignatures.set(liveWorkspace,signature);
      }
    } catch {}
  };
  if(forceChartTheme) {
    if(pendingTcoChartThemeTimer!==null) window.clearTimeout(pendingTcoChartThemeTimer);
    pendingTcoChartThemeTimer=null;
    applyChartTheme();
  } else {
    // Native color inputs can emit dozens of input events while a user drags a picker.
    // Debounce chart-wide redraws while DOM preview and preference save stay immediate.
    if(pendingTcoChartThemeTimer!==null) window.clearTimeout(pendingTcoChartThemeTimer);
    pendingTcoChartThemeTimer=window.setTimeout(()=>{
      pendingTcoChartThemeTimer=null;
      applyChartTheme();
    },80);
  }

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
  const serializedAppearance=JSON.stringify(preferences);
  let previousAppearance:string|null=null;
  try {
    previousAppearance=localStorage.getItem(TCO_FRAME_STORAGE_KEY);
    localStorage.setItem(TCO_FRAME_STORAGE_KEY,serializedAppearance);
  } catch {}
  if (persistAppearance) {
    saveTcoVelaAppearance(preferences);
    // Keep the active NAMED snapshot in sync when only UI colors/tools/sidebar settings
    // change and the chart renderer itself has no changed state to emit.
    if (previousAppearance !== serializedAppearance && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tco:workspace-appearance-changed'));
    }
  }
}

export async function persistCurrentTcoVelaAppearance(): Promise<boolean> {
  saveTcoVelaAppearance(readTcoFramePreferences());
  return flushTcoVelaAppearance();
}

function stateForNamedWorkspaceSnapshot(state: unknown): unknown {
  if(!state || typeof state!=='object' || Array.isArray(state)) return state;
  const record=state as Record<string,unknown>;
  const panels=record.panels && typeof record.panels==='object' && !Array.isArray(record.panels)
    ? record.panels as Record<string,unknown> : null;
  // The snapshot is captured from inside the Workspace manager itself. Do not save that
  // management panel as the panel users should see when they restore the trading setup.
  if(!panels || panels.open!=='tco.workspace-frame') return state;
  return { ...record, panels:{...panels,open:undefined} };
}

export async function persistActiveTcoVelaSavedWorkspace(): Promise<{ name:string; synced:boolean } | null> {
  if(typeof window==='undefined') return null;
  const broker=String(tradingCoreRuntime.getPrimaryBrokerId()??'fyers').trim().toLowerCase()||'fyers';
  let activeId='';
  try { activeId=localStorage.getItem('tradingcore:vela:active-saved-workspace:v1:'+broker)??''; } catch {}
  // The local selection is available synchronously for page-hide checkpoints. Only fetch
  // the cloud selection when this device has not selected a named setup yet.
  if(!activeId) activeId=await loadTcoVelaActiveWorkspaceId(broker)??'';
  if(!activeId) return null;
  const api=(window as Window & { __TCO_VELA__?: { workspace?: { getState?:()=>unknown } } }).__TCO_VELA__?.workspace;
  if(!api?.getState) return null;

  try {
    // Capture the complete state once so the default Vela document and this named snapshot
    // represent the same checkpoint rather than two different in-flight UI revisions.
    const workspaceState=stateForNamedWorkspaceSnapshot(api.getState());
    const appearance=readTcoFramePreferences();
    saveTcoVelaAppearance(appearance);

    // Named setup metadata normally exists in localStorage already. Resolve it synchronously
    // first so the local named snapshot is written immediately, even during pagehide/offline.
    let active=getLocalTcoVelaSavedWorkspace(activeId,broker);
    if(!active) {
      const entries=await loadTcoVelaSavedWorkspaces(broker);
      active=entries.find((entry)=>entry.id===activeId)??null;
    }
    if(!active) return null;

    const snapshotWrite=saveTcoVelaSavedWorkspace({
      id:active.id,name:active.name,updatedAt:new Date().toISOString(),
      snapshot:{schemaVersion:1,workspace:workspaceState,appearance:{...appearance,topbar:{...appearance.topbar}}},
    },broker);
    // Both writers persist locally before awaiting their cloud operation.
    const [synced,appearanceSynced]=await Promise.all([snapshotWrite,flushTcoVelaAppearance()]);
    return {name:active.name,synced:synced&&appearanceSynced};
  } catch { return null; }
}

export function applySavedTcoVelaAppearance(host: HTMLElement): void {
  applyTcoFramePreferences(host, readTcoFramePreferences(), true, false);
  const localSignature = (() => { try { return localStorage.getItem(TCO_FRAME_STORAGE_KEY); } catch { return null; } })();
  void loadTcoVelaAppearance().then((cloud) => {
    if (!cloud || !host.isConnected) return;
    // Do not overwrite a local edit made while the account preference request was in flight.
    let currentSignature: string | null = null;
    try { currentSignature = localStorage.getItem(TCO_FRAME_STORAGE_KEY); } catch {}
    if (currentSignature !== localSignature) return;
    const preferences = normalizeTcoFramePreferences(cloud);
    applyTcoFramePreferences(host, preferences, true, false);
  }).catch(() => undefined);
}

function createFrameSelect(options:Array<[string,string]>,value:string):HTMLSelectElement {
  const select=document.createElement('select');select.className='tco-frame-select';
  for(const [key,label] of options){const option=document.createElement('option');option.value=key;option.textContent=label;option.selected=key===value;select.appendChild(option);}
  return select;
}

const CORESPIRIT_LIVE_EDITOR_KEY = 'tradingcore:corespirit:chart-source';

const coreSpiritLiveEditorState: StatePersistenceHandler = {
  key: 'tco.corespirit.live-editor',
  scope: 'global',
  serialize() {
    try {
      const source = localStorage.getItem(CORESPIRIT_LIVE_EDITOR_KEY);
      return source == null ? undefined : { version: 1, source };
    } catch { return undefined; }
  },
  restore(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const source = (payload as Record<string, unknown>).source;
    if (typeof source !== 'string' || source.length > 1_000_000) return;
    try { localStorage.setItem(CORESPIRIT_LIVE_EDITOR_KEY, source); } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tco:corespirit-live-source-restored', { detail: { source } }));
    }
  },
};
registerStatePersistence(coreSpiritLiveEditorState);

const CORESPIRIT_STARTER = CORESPIRIT_LUXALGO_SMC_SOURCE;

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
      applyTcoFramePreferences(ctx.host,prefs,true);setPresetSelection();syncColorControls();
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
      applyTcoFramePreferences(ctx.host,prefs,true);setPresetSelection();syncColorControls();
      ctx.toast('Workspace appearance reset','success');
    });
    const savedCard=document.createElement('div');savedCard.className='tco-frame-card';savedCard.style.cssText='display:flex;flex-direction:column;gap:8px;';
    const savedTitle=document.createElement('div');savedTitle.className='tco-frame-label';savedTitle.textContent='Saved workspaces';
    const savedHelp=document.createElement('div');savedHelp.className='tco-frame-help';savedHelp.textContent='Tickers, intervals, chart type, pan/zoom, indicators and their settings, drawings (including Long/Short Position and risk/reward tools), panel/layout choices and UI/chart colors are saved. Live broker positions and orders refresh from your broker after reload and are never replayed from an old snapshot.';
    const savedName=document.createElement('input');savedName.type='text';savedName.className='tco-frame-select';savedName.style.cssText='width:100%;max-width:none;';savedName.maxLength=80;savedName.placeholder='e.g. NIFTY opening-range setup';savedName.setAttribute('aria-label','Saved workspace name');
    const savedActions=document.createElement('div');savedActions.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
    const saveCurrent=document.createElement('button');saveCurrent.type='button';saveCurrent.className='tco-frame-button tco-frame-button-primary';saveCurrent.textContent='Save current';
    const saveAsNew=document.createElement('button');saveAsNew.type='button';saveAsNew.className='tco-frame-button';saveAsNew.textContent='Save as new';
    savedActions.append(saveCurrent,saveAsNew);
    const savedStatus=document.createElement('div');savedStatus.className='tco-frame-help tco-frame-save-status';savedStatus.dataset.state='idle';savedStatus.setAttribute('role','status');savedStatus.setAttribute('aria-live','polite');savedStatus.textContent='Autosave is on · changes save as you edit; full checkpoint every 30 minutes.';
    const onWorkspaceAutosaveStatus=(event:Event)=>{
      const detail=(event as CustomEvent<{state?:string;message?:string}>).detail;
      if(!detail?.message)return;
      savedStatus.textContent=detail.message;
      savedStatus.dataset.state=['saving','saved','local','error'].includes(String(detail.state))?String(detail.state):'idle';
    };
    window.addEventListener('tco:workspace-autosave-status',onWorkspaceAutosaveStatus);
    const savedList=document.createElement('div');savedList.style.cssText='display:flex;flex-direction:column;gap:6px;';
    savedCard.append(savedTitle,savedHelp,savedName,savedActions,savedStatus,savedList);
    root.appendChild(savedCard);

    const brokerScope=()=>tradingCoreRuntime.getPrimaryBrokerId()??'fyers';
    const activeKey=()=> 'tradingcore:vela:active-saved-workspace:v1:'+brokerScope();
    let activeId='';
    try { activeId=localStorage.getItem(activeKey())??''; } catch {}
    let namedWorkspaces:TcoSavedWorkspace[]=[];
    const setActive=(id:string)=>{
      activeId=id;
      void saveTcoVelaActiveWorkspaceId(id||null,brokerScope()).catch(()=>false);
    };
    const liveWorkspaceApi=()=>((window as Window & { __TCO_VELA__?: { workspace?: {
      getState?:()=>unknown; applyState?:(state:unknown)=>void; saveNow?:()=>void|Promise<void>;
    } } }).__TCO_VELA__?.workspace);
    const newWorkspaceId=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
      ? crypto.randomUUID() : 'workspace-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
    const refreshSavedRows=()=>{
      savedList.replaceChildren();
      if(!namedWorkspaces.length){
        const empty=document.createElement('div');empty.className='tco-frame-help';empty.textContent='No named workspaces yet. Save your current chart setup above.';savedList.appendChild(empty);return;
      }
      for(const entry of namedWorkspaces){
        const row=document.createElement('div');row.className='tco-frame-card';row.style.cssText='padding:8px;display:flex;flex-direction:column;gap:6px;';
        const head=document.createElement('div');head.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:8px;';
        const labelBox=document.createElement('div');labelBox.style.cssText='min-width:0;display:flex;flex-direction:column;gap:3px;';
        const label=document.createElement('div');label.className='tco-frame-label';label.style.overflowWrap='anywhere';label.textContent=entry.name;
        const date=document.createElement('div');date.className='tco-frame-help';date.textContent=new Date(entry.updatedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
        const state=document.createElement('span');state.className='tco-frame-eyebrow';state.textContent=entry.id===activeId?'CURRENT':'SAVED';
        labelBox.append(label,date);head.append(labelBox,state);
        const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:5px;flex-wrap:wrap;';
        const restore=document.createElement('button');restore.type='button';restore.className='tco-frame-button tco-frame-button-primary';restore.textContent='Restore';
        restore.addEventListener('click',()=>{void restoreNamed(entry);});
        const update=document.createElement('button');update.type='button';update.className='tco-frame-button';update.textContent='Update';
        update.addEventListener('click',()=>{setActive(entry.id);savedName.value=entry.name;void saveNamed(false,entry.id);});
        const remove=document.createElement('button');remove.type='button';remove.className='tco-frame-button';remove.textContent='Delete';
        remove.addEventListener('click',()=>{void deleteNamed(entry);});
        buttons.append(restore,update,remove);row.append(head,buttons);savedList.appendChild(row);
      }
    };
    const refreshSaved=async()=>{
      savedStatus.textContent='Loading saved workspaces…';savedStatus.dataset.state='saving';
      try {
        namedWorkspaces=await loadTcoVelaSavedWorkspaces(brokerScope());
        const cloudActiveId=await loadTcoVelaActiveWorkspaceId(brokerScope());
        if(cloudActiveId && namedWorkspaces.some((entry)=>entry.id===cloudActiveId)) {
          activeId=cloudActiveId;
          try { localStorage.setItem(activeKey(),cloudActiveId); } catch {}
        } else if(activeId&&!namedWorkspaces.some((entry)=>entry.id===activeId)) {
          setActive('');
        }
        refreshSavedRows();
        savedStatus.textContent='Autosave is on · changes save as you edit; full checkpoint every 30 minutes · '+namedWorkspaces.length+' saved setup'+(namedWorkspaces.length===1?'':'s')+'.';savedStatus.dataset.state='idle';
      } catch {
        refreshSavedRows();savedStatus.textContent='Named workspace sync is unavailable. Local autosave remains enabled.';savedStatus.dataset.state='local';
      }
    };
    const saveNamed=async(asNew:boolean,overrideId?:string)=>{
      const api=liveWorkspaceApi();
      if(!api?.getState){savedStatus.textContent='The chart is still loading. Try again in a moment.';return;}
      const previous=namedWorkspaces.find((entry)=>entry.id===(overrideId||activeId));
      const name=(savedName.value.trim()||(!asNew?previous?.name:'')||(String(ctx.symbol||'Chart')+' '+String(ctx.timeframe||'')+' workspace')).trim().slice(0,80);
      const id=asNew||!(overrideId||activeId)?newWorkspaceId():(overrideId||activeId);
      saveCurrent.disabled=true;saveAsNew.disabled=true;savedStatus.textContent='Saving workspace snapshot…';savedStatus.dataset.state='saving';
      try {
        const stateSnapshot=stateForNamedWorkspaceSnapshot(api.getState());
        // Local Vela persistence happens before the cloud request. A temporary failure
        // of the default-workspace cloud write must not block saving this named snapshot.
        try { await Promise.resolve(api.saveNow?.()); } catch {}
        saveTcoVelaAppearance(prefs);
        await flushTcoVelaAppearance();
        const result=await saveTcoVelaSavedWorkspace({id,name,updatedAt:new Date().toISOString(),snapshot:{
          schemaVersion:1,workspace:stateSnapshot,appearance:{...prefs,topbar:{...prefs.topbar}},
        }},brokerScope());
        setActive(id);savedName.value=name;await refreshSaved();
        savedStatus.textContent=result?'Saved “'+name+'” to your account. Autosave continues in the background.':'Saved “'+name+'” in this browser. Sign in to sync across devices.';savedStatus.dataset.state=result?'saved':'local';
        ctx.toast(result?'Workspace saved to your account':'Workspace saved locally','success');
      } catch(error) {
        savedStatus.textContent='Cloud sync failed; your regular autosave and local fallback are still available.';savedStatus.dataset.state='error';
        ctx.toast(error instanceof Error?error.message:'Workspace save failed','error');
      } finally { saveCurrent.disabled=false;saveAsNew.disabled=false; }
    };
    const restoreNamed=async(entry:TcoSavedWorkspace)=>{
      const api=liveWorkspaceApi();
      if(!api?.applyState){savedStatus.textContent='The chart is still loading. Try again in a moment.';return;}
      try {
        const snapshot=entry.snapshot&&typeof entry.snapshot==='object'&&!Array.isArray(entry.snapshot)
          ? entry.snapshot as Record<string,unknown> : {};
        api.applyState(snapshot.workspace??snapshot.state??entry.snapshot);
        if(snapshot.appearance&&typeof snapshot.appearance==='object'){
          prefs=normalizeTcoFramePreferences(snapshot.appearance);
          applyTcoFramePreferences(ctx.host,prefs,true);
          sidebar.value=prefs.sidebar;density.value=prefs.density;
          for(const [key,input] of toolInputs)input.checked=prefs.topbar[key]!==false;
          setPresetSelection();syncColorControls();
        }
        setActive(entry.id);savedName.value=entry.name;
        // Restoring the chart is independent of account availability: state applies in memory,
        // local storage is written before cloud sync, and an offline cloud save must not make
        // a successful restore look like a failed one.
        try { await Promise.resolve(api.saveNow?.()); } catch {}
        await flushTcoVelaAppearance();
        savedStatus.textContent='Restored “'+entry.name+'”. Autosave is active.';savedStatus.dataset.state='saved';
        ctx.toast('Restored workspace: '+entry.name,'success');
      } catch(error) {
        savedStatus.textContent='Could not restore this snapshot. Your latest autosaved workspace was not deleted.';savedStatus.dataset.state='error';
        ctx.toast(error instanceof Error?error.message:'Workspace restore failed','error');
      }
    };
    const deleteNamed=async(entry:TcoSavedWorkspace)=>{
      const cloud=await deleteTcoVelaSavedWorkspace(entry.id,brokerScope());
      namedWorkspaces=namedWorkspaces.filter((candidate)=>candidate.id!==entry.id);
      if(activeId===entry.id)setActive('');
      refreshSavedRows();
      savedStatus.textContent=cloud?'Saved workspace deleted from your account.':'Removed from this browser; account sync was unavailable.';savedStatus.dataset.state=cloud?'saved':'local';
    };
    saveCurrent.addEventListener('click',()=>{void saveNamed(false);});
    saveAsNew.addEventListener('click',()=>{void saveNamed(true);});
    void refreshSaved();

    root.appendChild(reset);
    applyTcoFramePreferences(ctx.host,prefs);setPresetSelection();syncColorControls();
    return {onOpen:()=>{
      // Reload the persisted palette on every open so a slow account-theme restore cannot
      // leave the panel controls behind the palette already applied to the live chart.
      prefs=readTcoFramePreferences();
      sidebar.value=prefs.sidebar;density.value=prefs.density;
      for(const [key,input] of toolInputs) input.checked=prefs.topbar[key]!==false;
      setPresetSelection();syncColorControls();
      applyTcoFramePreferences(ctx.host,prefs,true);
      void refreshSaved();
    },destroy(){window.removeEventListener('tco:workspace-autosave-status',onWorkspaceAutosaveStatus);}};
  },
};

const coreSpiritCodePanel: SidePanelDescriptor = {
  id: 'tco.corespirit-code',
  title: 'CoreSpirit Studio',
  icon: 'corespirit',
  order: 5,
  width: 520,
  resizable: true,
  minWidth: 380,
  maxWidth: 760,
  mount(ctx, body, header) {
    // CoreSpirit lives in Vela's actual side-panel column. The chart grid therefore
    // resizes around the editor instead of drawing a popup over live candles.
    header.setTitle('');
    body.style.padding = '0';
    body.style.overflow = 'hidden';
    const panel = body.closest('.vela-panel') as HTMLElement | null;
    const shellHeader = panel?.querySelector('.vela-panel-header') as HTMLElement | null;
    if (shellHeader) shellHeader.style.display = 'none';
    const root = createRoot(body);
    let cancelled = false;
    body.textContent = 'Loading CoreSpirit Studio…';
    // The chart chrome stays small. Only opening Code loads the studio model,
    // Monaco adapter and dock component; the compiler client is deferred until
    // the user invokes Compile & Run inside that dock.
    void Promise.all([
      import('../../../components/corespirit/CoreSpiritDock'),
      import('../../coreSpirit/editorModel'),
      import('../../coreSpirit/monacoAdapter'),
    ]).then(([dockModule, editorModelModule, monacoModule]) => {
      if (cancelled) return;
      root.render(createElement(dockModule.CoreSpiritDock, {
        embedded: true,
        editorModelClass: editorModelModule.CoreSpiritEditorModel,
        mountMonaco: monacoModule.mountCoreSpiritMonaco,
        compileCoreSpiritSourceOffThread: async (
          source: string,
          sourceVersion: number,
          contextId: string,
          options: { layer?: string; signal?: AbortSignal } = {},
        ) => {
          const compiler = await import('../../coreSpirit/coreSpiritCompilerClient');
          return compiler.compileCoreSpiritSourceOffThread(source, sourceVersion, contextId, options);
        },
        onClose: () => {
          panel?.removeAttribute('data-maximized');
          ctx.togglePanel('tco.corespirit-code', false);
        },
        onFullscreenChange: (fullscreen: boolean) => {
          panel?.toggleAttribute('data-maximized', fullscreen);
        },
        onAddToChart: async (scriptName: string, scriptSource: string, artifact: CoreSpiritExecutableArtifact, scriptId?: string | null) => {
          // Use the chart controller already registered by the active workspace.
          // This keeps Compile & Run on the same worker/transactional Vela output
          // path as chart-managed CoreSpirit indicators; no window-global bridge
          // or second indicator execution route is needed.
          const target = coreSpiritChartRegistry.getActive();
          if (!target) {
            throw new Error('No active chart is registered for CoreSpirit. Wait for the chart to finish loading and retry.');
          }
          const instanceId = 'tco-corespirit-live-' + (scriptId?.trim() || 'studio');
          const result = target.updateCode
            ? await target.updateCode(scriptSource, artifact, instanceId)
            : await target.run(scriptSource, instanceId);
          const fatalDiagnostic = result.diagnosticDetails?.find(diagnostic => diagnostic.severity === 'error');
          if (fatalDiagnostic) {
            throw new Error('CoreSpirit "' + scriptName + '" failed [' + fatalDiagnostic.code + ']: ' + fatalDiagnostic.message);
          }
          if (result.barsProcessed <= 0) {
            throw new Error(result.diagnostics.join('; ') || 'CoreSpirit "' + scriptName + '" did not commit a chart result.');
          }
        },
      }));
    }).catch(error => {
      if (!cancelled) body.textContent = 'CoreSpirit Studio could not load: ' + (error instanceof Error ? error.message : String(error));
    });
    return {
      destroy() {
        cancelled = true;
        root.unmount();
        panel?.removeAttribute('data-maximized');
        if (shellHeader) shellHeader.style.display = '';
        body.style.padding = '';
        body.style.overflow = '';
      },
    };
  },
};

const workspaceFrameAction:WidgetActionDescriptor={
  id:'tco.workspace-frame',target:'topbar',label:'Workspace',icon:'sliders',iconOnly:true,align:'right',order:19,mobile:'menu',
  run(ctx){ctx.togglePanel('tco.workspace-frame');},
};

type TcoWorkspaceSaveState = 'saving' | 'saved' | 'local' | 'error';
function updateTcoWorkspaceSaveIndicator(state:TcoWorkspaceSaveState,message?:string):void {
  if(typeof document==='undefined') return;
  const labels:Record<TcoWorkspaceSaveState,string> = {
    saving:'Saving workspace…',
    saved:'Workspace saved and synced',
    local:'Workspace saved locally; cloud sync pending',
    error:'Workspace save needs attention',
  };
  const label=labels[state]??'Save workspace';
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-action-id="tco.save-workspace"]')) {
    button.dataset.tcoSaveState=state;
    button.title=message ? label+' — '+message : label;
    button.setAttribute('aria-label',label);
  }
}
if(typeof window!=='undefined') {
  window.addEventListener('tco:workspace-autosave-status',(event:Event)=>{
    const detail=(event as CustomEvent<{state?:string;message?:string}>).detail;
    if(detail?.state==='saving'||detail?.state==='saved'||detail?.state==='local'||detail?.state==='error')
      updateTcoWorkspaceSaveIndicator(detail.state,detail.message);
  });
}

const saveWorkspaceAction: WidgetActionDescriptor = {
  id:'tco.save-workspace', target:'topbar', label:'Save', icon:'save', iconOnly:true, align:'right', order:18.5, mobile:'menu',
  run(ctx) {
    const api=(window as Window & { __TCO_VELA__?: { workspace?: { saveNow?:()=>void|Promise<void> } } }).__TCO_VELA__;
    if(!api?.workspace?.saveNow) { updateTcoWorkspaceSaveIndicator('error','The live workspace is not ready yet');ctx.toast('The live workspace is not ready to save yet','error');return; }
    updateTcoWorkspaceSaveIndicator('saving','Manual save requested');
    void (async()=>{
      let defaultWorkspaceSynced=true;
      try { await Promise.resolve(api.workspace!.saveNow!()); } catch { defaultWorkspaceSynced=false; }
      const named=await persistActiveTcoVelaSavedWorkspace();
      if(named) {
        const synced=defaultWorkspaceSynced&&named.synced;
        updateTcoWorkspaceSaveIndicator(synced?'saved':'local',synced?'Saved “'+named.name+'”':'Saved “'+named.name+'”; cloud sync will retry');
        ctx.toast(synced
          ? 'Saved “'+named.name+'” to your account'
          : 'Saved “'+named.name+'” locally; cloud sync will retry when available','success');
        return;
      }
      const appearanceSynced=await persistCurrentTcoVelaAppearance();
      const synced=defaultWorkspaceSynced&&appearanceSynced;
      updateTcoWorkspaceSaveIndicator(synced?'saved':'local',synced?'Workspace synced':'Workspace saved locally; account sync will retry');
      ctx.toast(synced
        ? 'Workspace saved to your account'
        : 'Workspace saved on this device; account sync resumes when available','success');
    })().catch((error:unknown)=>{
      updateTcoWorkspaceSaveIndicator('error',error instanceof Error?error.message:'Cloud sync failed');
      ctx.toast('Workspace saved locally; cloud sync failed'+(error instanceof Error?': '+error.message:''),'error');
    });
  },
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

const quantPanel: SidePanelDescriptor = {
  id: 'tco.quant',
  title: 'Quant',
  icon: 'activity',
  order: 17,
  width: 390,
  resizable: true,
  minWidth: 320,
  maxWidth: 560,
  mount(ctx, body, header) {
    header.setTitle('CoreSpirit Quant');
    const root = panelRoot(body);
    root.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;padding:0;gap:0;box-sizing:border-box;background:#0b1018;color:#e5edf7;';
    const reactRoot = createRoot(root);
    const render = () => reactRoot.render(createElement(CoreSpiritChartAssistant, {
      context: { symbol: ctx.symbol, timeframe: ctx.timeframe },
      embedded: true,
    }));
    render();
    return { onOpen: render, onChart: render, destroy: () => reactRoot.unmount() };
  },
};

const bookmarksPanel: SidePanelDescriptor = {
  id: 'tco.bookmarks', title: 'Watchlist', icon: 'star', order: 10, width: 360, resizable: true, minWidth: 310, maxWidth: 480,
  mount(ctx, body, header) {
    header.setTitle('Watchlist');
    const root = panelRoot(body);
    root.classList.add('tco-frame-panel', 'tco-watchlist-panel');
    root.style.fontFamily = 'Inter, ui-sans-serif, system-ui, sans-serif';
    const meta = document.createElement('div');
    meta.className = 'tco-watchlist-meta';
    root.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'tco-watchlist-actions';
    const addCurrent = document.createElement('button');
    addCurrent.type = 'button';
    addCurrent.textContent = '+ Add current';
    addCurrent.title = 'Add the active symbol to the watchlist';
    addCurrent.className = 'tco-frame-button tco-frame-button-primary tco-watchlist-add';
    addCurrent.style.cssText = 'border:1px solid var(--tco-frame-accent,#8b7cff);border-radius:7px;padding:7px 10px;background:var(--tco-frame-accent-soft,rgba(124,92,255,.10));color:var(--vela-fg-bright);font:650 11px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;';
    controls.append(addCurrent);
    root.appendChild(controls);

    const filterInput = document.createElement('input');
    filterInput.className = 'tco-watch-search tco-watchlist-search';
    filterInput.type = 'search';
    filterInput.placeholder = 'Search symbols, indices, strikes, options…';
    filterInput.setAttribute('aria-label', 'Search instruments and filter watchlist');
    root.appendChild(filterInput);
    const suggestionList = document.createElement('div');
    suggestionList.className = 'tco-watch-suggestions';
    suggestionList.hidden = true;
    suggestionList.setAttribute('role', 'listbox');
    root.appendChild(suggestionList);
    let suggestionItems: Array<{ item: WatchlistItem; caption: string; rank: number }> = [];
    let activeSuggestionIndex = -1;
    let suggestionRequest = 0;
    let suggestionTimer: number | undefined;

    let filterMode: 'all' | 'gainers' | 'losers' = 'all';
    let sortMode: 'default' | 'symbol' | 'change' | 'price' = 'default';
    const filters = document.createElement('div');
    filters.className = 'tco-watchlist-filters';
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
    sort.className = 'tco-frame-select tco-watchlist-sort';
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
    rows.className = 'tco-watchlist-list';
    rows.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';
    rows.style.flex = '1 1 auto';
    rows.style.minHeight = '72px';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'tco-watch-resize';
    resizeHandle.setAttribute('role', 'separator');
    resizeHandle.setAttribute('aria-orientation', 'horizontal');
    resizeHandle.setAttribute('aria-label', 'Resize watchlist details');
    resizeHandle.tabIndex = 0;

    const detailCard = document.createElement('section');
    detailCard.className = 'tco-watch-detail tco-watchlist-inspector';
    const detailHead = document.createElement('div');
    detailHead.className = 'tco-watchlist-detail-head';
    const detailTitleWrap = document.createElement('div');
    const detailTitle = document.createElement('div');
    detailTitle.className = 'tco-watchlist-detail-title';
    const detailSubtitle = document.createElement('div');
    detailSubtitle.className = 'tco-watchlist-detail-subtitle';
    detailTitleWrap.append(detailTitle, detailSubtitle);
    const liveBadge = document.createElement('span');
    liveBadge.className = 'tco-watchlist-live-badge';
    liveBadge.textContent = 'MARKET';
    detailHead.append(detailTitleWrap, liveBadge);
    const metrics = document.createElement('div');
    metrics.className = 'tco-watchlist-metrics';
    const metricRefs = new Map<string, HTMLSpanElement>();
    for (const [key, label] of [['ltp', 'Last price'], ['changeValue', 'Change'], ['changePercent', 'Change %'], ['high', 'Day high'], ['low', 'Day low']] as const) {
      const cell = document.createElement('div');
      cell.className = 'tco-watch-metric tco-watchlist-metric';
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
    detailHint.className = 'tco-frame-help tco-watchlist-detail-hint';
    detailHint.textContent = 'Select a row to switch the chart to that instrument.';
    const technicalSection = document.createElement('section');
    technicalSection.className = 'tco-watchlist-section';
    const technicalTitle = document.createElement('div');
    technicalTitle.textContent = 'TECHNICALS';
    technicalTitle.className = 'tco-watchlist-section-label';
    const technicalSummary = document.createElement('div');
    technicalSummary.className = 'tco-watchlist-technical-summary';
    const technicalValues = document.createElement('div');
    technicalValues.className = 'tco-watchlist-technical-values';
    technicalSection.append(technicalTitle, technicalSummary, technicalValues);

    const newsSection = document.createElement('section');
    newsSection.className = 'tco-watchlist-section';
    const newsHeading = document.createElement('div');
    newsHeading.className = 'tco-watchlist-news-heading';
    const newsHeadingLabel = document.createElement('span');
    newsHeadingLabel.textContent = 'LATEST NEWS';
    const newsMeta = document.createElement('span');
    newsMeta.className = 'tco-watchlist-news-meta';
    newsHeading.append(newsHeadingLabel, newsMeta);
    const newsList = document.createElement('div');
    newsList.className = 'tco-watchlist-news-list';
    newsSection.append(newsHeading, newsList);

    detailCard.append(detailHead, metrics, detailHint, technicalSection, newsSection);
    root.append(rows, resizeHandle, detailCard);
    const DETAIL_HEIGHT_KEY = 'tradingcore:vela:watchlist-detail-height:v2';
    const clampDetailHeight = (height: number) => Math.max(185, Math.min(Math.round(body.clientHeight * 0.52), height));
    let detailHeight = 228;
    try { detailHeight = clampDetailHeight(Number(localStorage.getItem(DETAIL_HEIGHT_KEY)) || 228); } catch {}
    const applyDetailHeight = () => {
      detailCard.style.flex = `0 0 ${detailHeight}px`;
      detailCard.style.maxHeight = '52%';
      resizeHandle.setAttribute('aria-valuenow', String(detailHeight));
    };
    applyDetailHeight();
    let resizePointer: number | null = null;
    resizeHandle.addEventListener('pointerdown', (event) => {
      resizePointer = event.pointerId;
      resizeHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    resizeHandle.addEventListener('pointermove', (event) => {
      if (resizePointer !== event.pointerId) return;
      detailHeight = clampDetailHeight(body.getBoundingClientRect().bottom - event.clientY);
      applyDetailHeight();
    });
    const finishResize = (event: PointerEvent) => {
      if (resizePointer !== event.pointerId) return;
      resizePointer = null;
      try { localStorage.setItem(DETAIL_HEIGHT_KEY, String(detailHeight)); } catch {}
    };
    resizeHandle.addEventListener('pointerup', finishResize);
    resizeHandle.addEventListener('pointercancel', finishResize);
    resizeHandle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      detailHeight = clampDetailHeight(detailHeight + (event.key === 'ArrowUp' ? 24 : -24));
      applyDetailHeight();
      try { localStorage.setItem(DETAIL_HEIGHT_KEY, String(detailHeight)); } catch {}
    });

    const STALE_AFTER_MS = 15_000;
    type Quote = {
      ltp: number;
      change?: number;
      changePercent?: number;
      previousClose?: number;
      high?: number;
      low?: number;
      receivedAt: number;
      source: 'fyers' | 'yahoo';
    };
    type MarketQuoteView = { ltp?: number; change?: number; changePercent?: number; high?: number; low?: number; receivedAt?: number; stale: boolean; source?: 'fyers' | 'yahoo' };
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
      const source: 'fyers' | 'yahoo' | undefined = cachedIsNewest ? cached?.source : parsedSnapshotTime !== undefined ? 'fyers' : cached?.source;
      return {
        ltp,
        change,
        changePercent: percent,
        ...(source ? { source } : {}),
        high: asFinite(cachedIsNewest ? cached?.high : snapshot.dayHigh, snapshot.high, daily?.high, cached?.high),
        low: asFinite(cachedIsNewest ? cached?.low : snapshot.dayLow, snapshot.low, daily?.low, cached?.low),
        ...(hasFreshTimestamp ? { receivedAt } : {}),
        stale: !hasFreshTimestamp || Date.now() - receivedAt! > STALE_AFTER_MS,
      };
    };

    let quoteSourceMode: 'fyers' | 'none' | null = null;
    let quoteSymbolsSignature = '';
    const quoteSubscribe = (): void => {
      const symbols = watchlist.map((item) => item.symbol);
      if (!symbols.length) return;
      const nextMode = hasValidFyersSession(tradingCoreRuntime.getAllConnections()) ? 'fyers' : 'none';
      const symbolsSignature = symbols.join(',');
      if (quoteSourceMode === nextMode && quoteSymbolsSignature === symbolsSignature && (nextMode === 'none' || quoteStop)) return;
      const sourceChanged = quoteSourceMode !== null && quoteSourceMode !== nextMode;
      quoteStop?.();
      quoteStop = undefined;
      if (sourceChanged) quotes.clear();
      quoteSourceMode = nextMode;
      quoteSymbolsSignature = symbolsSignature;
      if (nextMode === 'none') {
        quotes.clear();
        buildRows();
        updateDetails();
        return;
      }
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
          source: 'fyers',
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
      technicals: HTMLSpanElement;
      news: HTMLSpanElement;
    };
    const rowRefs = new Map<string, RowRef>();
    const newsBySymbol = new Map<string, { bundle: { provider: string; items: TradingCoreNewsItem[] }; expiresAt: number }>();
    const technicalBySymbol = new Map<string, { summary: WatchlistAdvancedTechnicalSummary | null; expiresAt: number }>();
    const enrichmentInFlight = new Map<string, Promise<void>>();
    let lastRenderedNewsSignature = '';

    const updateDetails = (): void => {
      const current = String(ctx.symbol || '').trim();
      const quote = quoteView(current);
      const ticker = current.includes(':') ? current.split(':', 2)[1] || current : current;
      const { ltp, change, changePercent, high, low } = quote;
      detailTitle.textContent = ticker || 'Active instrument';
      detailSubtitle.textContent = `${current} · ${ctx.timeframe} · ${(tradingCoreRuntime.getMarketSnapshot(current) as any)?.exchange || (tradingCoreRuntime.getMarketSnapshot(current) as any)?.venue || 'Active chart'}`;
      liveBadge.textContent = ltp === undefined ? 'WAITING' : quote.source === 'yahoo' ? 'YAHOO DELAYED' : quote.stale ? 'STALE' : 'LIVE';
      liveBadge.dataset.quoteState = ltp === undefined ? 'waiting' : quote.source === 'yahoo' ? 'delayed' : quote.stale ? 'stale' : 'live';
      liveBadge.setAttribute('aria-label', ltp === undefined ? 'Waiting for quote' : quote.source === 'yahoo' ? 'Yahoo Finance delayed quote' : quote.stale ? 'Stale quote' : 'Live quote');
      liveBadge.style.color = ltp === undefined ? 'var(--vela-fg-muted)' : quote.source === 'yahoo' ? '#38bdf8' : quote.stale ? '#fbbf24' : '#34d399';
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
          ? quote.source === 'yahoo'
            ? 'YAHOO DELAYED · Prices are delayed and only refreshed by periodic Yahoo Finance checks. Do not treat them as live execution data.'
            : 'STALE QUOTE · The last received price is older than 15 seconds. Recheck the live feed before acting.'
          : quote.source === 'yahoo'
            ? 'YAHOO DELAYED · Day range and change are sourced from Yahoo Finance; execution still requires a valid broker session.'
            : high !== undefined && low !== undefined
              ? 'Live broker quote · day range and absolute/percentage change use available market snapshot fields.'
              : 'Live broker quote · waiting for complete day-range fields from the market feed.'
        : 'Waiting for a market quote for this instrument. No sample price is shown.';

      const technical = technicalBySymbol.get(current.toUpperCase())?.summary;
      technicalSummary.textContent = technical
        ? `${technical.trend.toUpperCase()} · RSI(14) ${technical.rsi14.toFixed(1)}`
        : technicalBySymbol.has(current.toUpperCase()) ? 'Technicals unavailable for this history window' : 'Calculating technicals…';
      technicalSummary.style.color = technical?.trend === 'Bullish' ? '#22c55e' : technical?.trend === 'Bearish' ? '#f23645' : 'var(--vela-fg-bright)';
      technicalValues.textContent = technical
        ? `EMA20 ${technical.ema20.toLocaleString('en-IN',{maximumFractionDigits:2})} · EMA50 ${technical.ema50.toLocaleString('en-IN',{maximumFractionDigits:2})} · MACD H ${technical.macdHistogram.toFixed(2)} · ATR14 ${technical.atr14 == null ? '—' : technical.atr14.toFixed(2)} · ADX14 ${technical.adx14 == null ? '—' : technical.adx14.toFixed(1)} · VWAP ${technical.sessionVwap == null ? '—' : technical.sessionVwap.toLocaleString('en-IN',{maximumFractionDigits:2})} · RVOL ${technical.relativeVolume20 == null ? '—' : technical.relativeVolume20.toFixed(2)}× · ${technical.candleCount} bars`
        : 'RSI · EMA20 · EMA50 · MACD · ATR · ADX · VWAP';

      const newsRecord = newsBySymbol.get(current.toUpperCase());
      const newsItems = newsRecord?.bundle.items || [];
      newsMeta.textContent = newsRecord ? newsRecord.bundle.provider : 'Loading…';
      const signature = `${newsRecord?.expiresAt ?? 'pending'}:${newsItems.map(item => item.id || item.url || item.title).join('|')}`;
      if (signature !== lastRenderedNewsSignature) {
        lastRenderedNewsSignature = signature;
        newsList.textContent = '';
        if (!newsItems.length) {
          const empty = document.createElement('div');
          empty.textContent = newsRecord ? 'No recent news for this instrument.' : 'Fetching symbol headlines…';
          empty.style.cssText = 'font-size:10px;color:var(--vela-fg-muted);';
          newsList.appendChild(empty);
        } else {
          for (const item of newsItems.slice(0, 3)) {
            const link = document.createElement('a');
            const safeUrl = /^https?:\/\//i.test(String(item.url || '')) ? String(item.url) : '';
            link.href = safeUrl || '#';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = item.title;
            link.style.cssText = 'font-size:10px;line-height:1.4;color:var(--vela-fg-bright);text-decoration:none;overflow-wrap:anywhere;';
            if (!safeUrl) link.removeAttribute('href');
            const source = document.createElement('div');
            source.textContent = `${item.source || 'News'} · ${item.publishedAt ? new Date(item.publishedAt).toLocaleString([], {month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'recent'}`;
            source.style.cssText = 'margin-top:2px;font-size:9px;color:var(--vela-fg-muted);';
            const entry = document.createElement('div');
            entry.append(link, source);
            newsList.appendChild(entry);
          }
        }
      }
    };

    const updateEnrichmentRow = (item: WatchlistItem, ref: RowRef): void => {
      const technical = technicalBySymbol.get(item.symbol)?.summary;
      ref.technicals.textContent = technical
        ? `${technical.trend.toUpperCase()} · RSI ${technical.rsi14.toFixed(0)} · ADX ${technical.adx14 == null ? '—' : technical.adx14.toFixed(0)} · EMA20 ${technical.ema20.toLocaleString('en-IN',{maximumFractionDigits:1})}`
        : technicalBySymbol.has(item.symbol) ? 'TECHNICALS UNAVAILABLE' : 'TECHNICALS · calculating…';
      ref.technicals.style.color = technical?.trend === 'Bullish' ? '#22c55e' : technical?.trend === 'Bearish' ? '#f23645' : 'var(--vela-fg-muted)';
      const newsRecord = newsBySymbol.get(item.symbol);
      const headline = newsRecord?.bundle.items[0];
      ref.news.textContent = headline?.title || (newsRecord ? 'No recent news' : 'NEWS · loading…');
      ref.news.title = headline?.title || 'Latest ticker headline';
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
        ref.row.dataset.selected = isSelected ? '1' : '';
        ref.row.style.background = isSelected ? 'var(--tco-frame-accent-soft,rgba(124,92,255,.10))' : 'transparent';
        ref.row.style.borderColor = isSelected ? 'var(--tco-frame-accent,#8b7cff)' : 'transparent';
        const absolute = quote.change;
        ref.value.textContent = quote.ltp === undefined ? '—' : quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const changeParts: string[] = [];
        if (absolute !== undefined) changeParts.push(`${absolute >= 0 ? '+' : ''}${absolute.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
        if (pct !== undefined) changeParts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
        ref.row.dataset.quoteState = quote.ltp === undefined ? 'waiting' : quote.source === 'yahoo' ? 'delayed' : quote.stale ? 'stale' : 'live';
        ref.row.dataset.quoteUpdatedAt = quote.receivedAt === undefined ? '' : String(quote.receivedAt);
        ref.row.title = quote.ltp === undefined ? 'No quote received yet' : quote.source === 'yahoo' ? 'Yahoo Finance delayed quote — checked every 4 seconds; not real-time' : quote.stale ? 'Stale quote — last update over 15 seconds ago' : 'Live quote';
        ref.button.setAttribute('aria-label', `${item.short}, ${quote.ltp === undefined ? 'quote unavailable' : `last price ${quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, ${quote.source === 'yahoo' ? 'Yahoo Finance delayed quote' : quote.stale ? 'stale quote' : 'live quote'}`}`);
        ref.value.style.color = quote.source === 'yahoo' ? '#38bdf8' : quote.stale ? '#fbbf24' : 'var(--vela-fg-bright)';
        ref.change.textContent = quote.ltp === undefined
          ? 'WAITING FOR QUOTE'
          : `${quote.source === 'yahoo' ? 'YAHOO DELAYED · ' : quote.stale ? 'STALE · ' : ''}${changeParts.length ? changeParts.join(' · ') : 'NO CHANGE DATA'}`;
        const changeTone = absolute !== undefined ? absolute : pct;
        ref.change.style.color = quote.stale ? '#fbbf24' : changeTone === undefined ? 'var(--vela-fg-muted)' : changeTone >= 0 ? '#22c55e' : '#f23645';
        updateEnrichmentRow(item, ref);
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
        ref.row.dataset.selected = isSelected ? '1' : '';
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
        ref.row.dataset.quoteState = quote.ltp === undefined ? 'waiting' : quote.source === 'yahoo' ? 'delayed' : quote.stale ? 'stale' : 'live';
        ref.row.dataset.quoteUpdatedAt = quote.receivedAt === undefined ? '' : String(quote.receivedAt);
        ref.row.title = quote.ltp === undefined ? 'No quote received yet' : quote.source === 'yahoo' ? 'Yahoo Finance delayed quote — checked every 4 seconds; not real-time' : quote.stale ? 'Stale quote — last update over 15 seconds ago' : 'Live quote';
        ref.button.setAttribute('aria-label', `${item.short}, ${quote.ltp === undefined ? 'quote unavailable' : `last price ${quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, ${quote.source === 'yahoo' ? 'Yahoo Finance delayed quote' : quote.stale ? 'stale quote' : 'live quote'}`}`);
        ref.value.style.color = quote.source === 'yahoo' ? '#38bdf8' : quote.stale ? '#fbbf24' : 'var(--vela-fg-bright)';
        ref.change.textContent = quote.ltp === undefined
          ? 'WAITING FOR QUOTE'
          : `${quote.source === 'yahoo' ? 'YAHOO DELAYED · ' : quote.stale ? 'STALE · ' : ''}${changeParts.length ? changeParts.join(' · ') : 'NO CHANGE DATA'}`;
        const changeTone = absolute !== undefined ? absolute : pct;
        ref.change.style.color = quote.stale ? '#fbbf24' : changeTone === undefined ? 'var(--vela-fg-muted)' : changeTone >= 0 ? '#22c55e' : '#f23645';
        updateEnrichmentRow(item, ref);
      }
      updateDetails();
    };

    const INDEX_SEARCH_UNIVERSE: readonly WatchlistItem[] = [
      { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
      { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
      { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
      { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
      { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
    ];
    const optionExpiryTime = (value?: string) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
      const digits = value.match(/(\d{1,2})[- /]?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[- /]?(\d{2,4})/i);
      if (!digits) return Number.MAX_SAFE_INTEGER;
      const months: Record<string, number> = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
      const year = Number(digits[3]) + (Number(digits[3]) < 100 ? 2000 : 0);
      return new Date(year, months[digits[2]!.toUpperCase()]!, Number(digits[1])).getTime();
    };
    const hideSuggestions = () => {
      suggestionList.hidden = true;
      suggestionList.textContent = '';
      suggestionItems = [];
      activeSuggestionIndex = -1;
    };
    const showSuggestionStatus = (message: string) => {
      suggestionItems = [];
      activeSuggestionIndex = -1;
      suggestionList.textContent = '';
      const status = document.createElement('div');
      status.textContent = message;
      status.style.cssText = 'padding:9px 10px;color:var(--vela-fg-muted);font:10px Inter,ui-sans-serif,system-ui,sans-serif;';
      suggestionList.appendChild(status);
      suggestionList.hidden = false;
    };
    const chooseSuggestion = (entry: { item: WatchlistItem; caption: string; rank: number }) => {
      const item = entry.item;
      const alreadyPresent = watchlist.some(candidate => candidate.symbol === item.symbol);
      if (!alreadyPresent) applyWatchlist([...watchlist, item], ctx);
      quoteSubscribe();
      ctx.setSymbol(item.symbol);
      filterInput.value = '';
      hideSuggestions();
      updateRows();
      if (!alreadyPresent) ctx.toast(`${item.short} added to watchlist`, 'success');
    };
    const renderSuggestions = (entries: Array<{ item: WatchlistItem; caption: string; rank: number }>) => {
      suggestionItems = entries.slice(0, 12);
      activeSuggestionIndex = suggestionItems.length ? 0 : -1;
      suggestionList.textContent = '';
      suggestionList.hidden = suggestionItems.length === 0;
      for (const [index, entry] of suggestionItems.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tco-watch-suggestion';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === activeSuggestionIndex ? 'true' : 'false');
        const title = document.createElement('span');
        title.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:3px;';
        const name = document.createElement('strong');
        name.textContent = entry.item.short;
        const description = document.createElement('span');
        description.style.cssText = 'font-size:9px;color:var(--vela-fg-muted);overflow-wrap:anywhere;';
        description.textContent = entry.caption;
        title.append(name, description);
        const add = document.createElement('span');
        add.textContent = watchlist.some(candidate => candidate.symbol === entry.item.symbol) ? 'OPEN' : '+ ADD';
        add.style.cssText = 'flex:none;font-size:9px;font-weight:750;color:var(--tco-frame-accent,#a99cff);';
        button.append(title, add);
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.addEventListener('click', () => chooseSuggestion(entry));
        suggestionList.appendChild(button);
      }
    };
    const searchSuggestions = async (rawQuery: string) => {
      const query = rawQuery.trim();
      const requestId = ++suggestionRequest;
      if (query.length < 2) { hideSuggestions(); return; }
      const upper = query.toUpperCase();
      const strikeMatch = query.match(/\b(\d{4,6})\b/);
      const requestedStrike = strikeMatch ? Number(strikeMatch[1]) : undefined;
      const underlyingQuery = upper.replace(/\d{4,6}/g, '').replace(/\b(CE|PE|CALL|PUT)\b/g, '').trim();
      const indexMatches = INDEX_SEARCH_UNIVERSE
        .map(item => {
          const quote = quoteView(item.symbol);
          const textual = !underlyingQuery || item.short.includes(underlyingQuery.replace(/[^A-Z]/g, '')) || item.label.includes(underlyingQuery);
          const distance = requestedStrike && quote.ltp !== undefined ? Math.abs(quote.ltp - requestedStrike) / Math.max(1, requestedStrike) : 0;
          return { item, quote, textual, distance };
        })
        .filter(entry => requestedStrike
          ? !underlyingQuery && entry.quote.ltp !== undefined && entry.distance <= 0.09
          : entry.textual && (itemMatchesQuery(entry.item, upper)));
      const indexSuggestions = indexMatches
        .sort((a,b) => requestedStrike ? a.distance - b.distance : a.item.short.localeCompare(b.item.short))
        .slice(0, 5)
        .map(entry => ({ item: entry.item, caption: `INDEX · ${entry.quote.ltp === undefined ? 'quote pending' : entry.quote.ltp.toLocaleString('en-IN',{maximumFractionDigits:2})}`, rank: entry.distance }));
      const shouldSearchOptions = Boolean(requestedStrike || /\b(CE|PE|CALL|PUT|NIFTY|BANKNIFTY|FINNIFTY|SENSEX)\b/i.test(query));
      // Search the full instrument master for every query, not just option contracts.
      // The dedicated options pass preserves exact-strike/nearest-expiry behavior.
      if (indexSuggestions.length) renderSuggestions(indexSuggestions);
      else showSuggestionStatus(hasValidFyersSession(tradingCoreRuntime.getAllConnections())
        ? 'Searching instruments…'
        : 'Connect FYERS to search the instrument master.');
      let instruments: SearchInstrument[] = [];
      if (hasValidFyersSession(tradingCoreRuntime.getAllConnections())) {
        try {
          // One full-master query is enough: the server applies exact strike/CE/PE
          // intent, and this panel orders returned option contracts by expiry locally.
          instruments = await searchFyersInstruments(query, 'all', 100);
        } catch { /* immediate index matches remain useful while broker search recovers */ }
      }
      if (requestId !== suggestionRequest) return;
      const unique = new Map<string, SearchInstrument>();
      for (const instrument of instruments) {
        const key = String(instrument.key || instrument.symbol).toUpperCase();
        if (!key || unique.has(key)) continue;
        const text = `${instrument.symbol} ${instrument.label} ${instrument.description || ''}`.toUpperCase();
        if (underlyingQuery && !text.includes(underlyingQuery.replace(/\s+/g, ' ')) && !text.replace(/[^A-Z0-9]/g, '').includes(underlyingQuery.replace(/[^A-Z0-9]/g, ''))) continue;
        unique.set(key, instrument);
      }
      const isOption = (instrument: SearchInstrument) =>
        /option/i.test(String(instrument.type || '')) || Boolean(instrument.optionType)
        || (instrument.strike !== undefined && Boolean(instrument.expiry));
      const optionEntries = [...unique.values()]
        .filter(isOption)
        .sort((a,b) => {
          const expiryDiff = optionExpiryTime(a.expiry) - optionExpiryTime(b.expiry);
          if (expiryDiff) return expiryDiff;
          const strikeDiff = requestedStrike ? Math.abs(Number(a.strike || 0) - requestedStrike) - Math.abs(Number(b.strike || 0) - requestedStrike) : 0;
          if (strikeDiff) return strikeDiff;
          const typeRank = (value?: string) => /^(CE|CALL)$/i.test(String(value || '')) ? 0 : /^(PE|PUT)$/i.test(String(value || '')) ? 1 : 2;
          return typeRank(a.optionType) - typeRank(b.optionType);
        })
        .slice(0, 10)
        .map(instrument => {
          const ticker = String(instrument.label || instrument.symbol).trim();
          const symbol = String(instrument.symbol || instrument.key).trim().toUpperCase();
          const contractShort = instrument.optionType
            ? `${ticker.split(/\s+/)[0] || 'OPTION'} ${instrument.strike ?? ''} ${instrument.optionType}`.trim()
            : ticker.split(/\s+/)[0] || symbol;
          const item = { symbol, label: ticker, short: contractShort };
          const expiry = instrument.expiry ? new Date(optionExpiryTime(instrument.expiry)).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : 'expiry unavailable';
          return { item, caption: `OPTION · ${instrument.strike ?? '—'} ${instrument.optionType || ''} · ${expiry}`, rank: requestedStrike ? Math.abs(Number(instrument.strike || 0) - requestedStrike) : 0 };
        });
      const indexSuggestionSymbols = new Set(indexSuggestions.map(entry => entry.item.symbol.toUpperCase()));
      const instrumentEntries = [...unique.values()]
        .filter(instrument => !isOption(instrument) && !indexSuggestionSymbols.has(String(instrument.symbol || instrument.key).toUpperCase()))
        .slice(0, 10)
        .map(instrument => {
          const ticker = String(instrument.symbol || instrument.key).split(':').pop() || String(instrument.symbol || instrument.key);
          const symbol = String(instrument.symbol || instrument.key).trim().toUpperCase();
          const item = { symbol, label: String(instrument.label || instrument.description || ticker), short: ticker };
          return { item, caption: `${instrument.type || 'INSTRUMENT'} · ${instrument.exchange || 'FYERS'}`, rank: 0 };
        });
      const combined = requestedStrike && underlyingQuery
        ? [...optionEntries, ...instrumentEntries]
        : requestedStrike
          ? [...indexSuggestions, ...optionEntries, ...instrumentEntries]
          : [...indexSuggestions, ...optionEntries, ...instrumentEntries];
      if (combined.length) renderSuggestions(combined);
      else if (shouldSearchOptions && !hasValidFyersSession(tradingCoreRuntime.getAllConnections())) {
        showSuggestionStatus('Connect FYERS to discover option contracts.');
      } else {
        showSuggestionStatus('No matching instruments found.');
      }
    };
    const itemMatchesQuery = (item: WatchlistItem, query: string) =>
      `${item.symbol} ${item.short} ${item.label}`.toUpperCase().includes(query);
    filterInput.addEventListener('input', () => {
      updateRows();
      if (suggestionTimer !== undefined) window.clearTimeout(suggestionTimer);
      suggestionTimer = window.setTimeout(() => void searchSuggestions(filterInput.value), 180);
    });
    filterInput.addEventListener('keydown', event => {
      if (suggestionList.hidden || !suggestionItems.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestionItems.length) % suggestionItems.length;
        [...suggestionList.children].forEach((node, index) => (node as HTMLButtonElement).setAttribute('aria-selected', index === activeSuggestionIndex ? 'true' : 'false'));
      } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
        event.preventDefault();
        chooseSuggestion(suggestionItems[activeSuggestionIndex]!);
      } else if (event.key === 'Escape') hideSuggestions();
    });
    filterInput.addEventListener('blur', () => window.setTimeout(hideSuggestions, 140));

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
          row.className = 'tco-watchlist-row';

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'tco-watchlist-select';

          const left = document.createElement('span');
          left.className = 'tco-watchlist-instrument';
          const label = document.createElement('span');
          label.className = 'tco-watchlist-ticker';
          label.textContent = item.short;
          const detail = document.createElement('span');
          detail.className = 'tco-watchlist-instrument-name';
          detail.textContent = item.label;
          left.append(label, detail);

          const right = document.createElement('span');
          right.className = 'tco-watchlist-price-block';
          const value = document.createElement('span');
          value.className = 'tco-watchlist-last';
          const change = document.createElement('span');
          change.className = 'tco-watchlist-change';
          right.append(value, change);
          button.append(left, right);
          button.addEventListener('click', () => ctx.setSymbol(item.symbol));

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'tco-watchlist-remove';
          remove.textContent = '×';
          remove.title = `Remove ${item.short}`;
          remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyWatchlist(watchlist.filter((candidate) => candidate.symbol !== item.symbol), ctx);
            quoteSubscribe();
          });

          row.append(button, remove);
          rows.appendChild(row);
          ref = { row, button, value, change, technicals: document.createElement('span'), news: document.createElement('span') };
          rowRefs.set(item.symbol, ref);
        }
        rows.appendChild(ref.row);
        ref.button.dataset.selected = item.symbol === current ? '1' : '';
        ref.row.dataset.selected = item.symbol === current ? '1' : '';
      }

      updateRows();
    };

    const loadSymbolEnrichment = (item: WatchlistItem): Promise<void> => {
      const existing = enrichmentInFlight.get(item.symbol);
      if (existing) return existing;
      const promise = (async () => {
        const now = Date.now();
        const cachedNews = newsBySymbol.get(item.symbol);
        const cachedTechnical = technicalBySymbol.get(item.symbol);
        const newsTask = !cachedNews || cachedNews.expiresAt <= now
          ? (async () => {
              try {
                const bundle = await fetchTradingCoreNewsBundle(item.short || item.label || item.symbol, AbortSignal.timeout(8_000));
                newsBySymbol.set(item.symbol, { bundle, expiresAt: Date.now() + 90_000 });
              } catch {
                newsBySymbol.set(item.symbol, { bundle: { provider: 'Unavailable', items: [] }, expiresAt: Date.now() + 25_000 });
              }
            })()
          : Promise.resolve();
        const technicalTask = !cachedTechnical || cachedTechnical.expiresAt <= now
          ? (async () => {
              try {
                if (!hasValidFyersSession(tradingCoreRuntime.getAllConnections())) {
                  const canonicalBars = await loadTcoCanonicalHistoryBars(item.symbol, '5m', 5_000, AbortSignal.timeout(12_000));
                  const canonicalCandles = canonicalBars.map(bar => ({
                    timestamp: new Date(bar.time).toISOString(), open: Number(bar.open), high: Number(bar.high),
                    low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) || 0,
                  }));
                  technicalBySymbol.set(item.symbol, {
                    summary: buildWatchlistAdvancedTechnicalSummary(canonicalCandles),
                    expiresAt: Date.now() + (canonicalCandles.length >= 50 ? 120_000 : 30_000),
                  });
                  return;
                }
                const brokerId = String(tradingCoreRuntime.getPrimaryBrokerId() || 'fyers').toLowerCase();
                await historyStore.hydrate(brokerId, item.symbol, '5minute');
                let candles = historyStore.get(brokerId, item.symbol, '5minute');
                if (!candles || candles.length < 50) {
                  candles = await tradingCoreRuntime.getHistoricalData(item.symbol, '5minute', AbortSignal.timeout(12_000), 2_000);
                }
                technicalBySymbol.set(item.symbol, {
                  summary: buildWatchlistAdvancedTechnicalSummary(candles || []),
                  expiresAt: Date.now() + ((candles?.length || 0) >= 50 ? 120_000 : 30_000),
                });
              } catch {
                technicalBySymbol.set(item.symbol, { summary: null, expiresAt: Date.now() + 30_000 });
              }
            })()
          : Promise.resolve();
        await Promise.all([newsTask, technicalTask]);
        updateRows(item.symbol);
      })().finally(() => enrichmentInFlight.delete(item.symbol));
      enrichmentInFlight.set(item.symbol, promise);
      return promise;
    };

    let enrichmentWarmPromise: Promise<void> | undefined;
    const warmWatchlistEnrichment = (): Promise<void> => {
      if (enrichmentWarmPromise) return enrichmentWarmPromise;
      const candidates = [...watchlist];
      const activeSymbol = String(ctx.symbol || '').trim().toUpperCase();
      if (activeSymbol && !candidates.some(item => item.symbol === activeSymbol)) {
        const ticker = activeSymbol.includes(':') ? activeSymbol.split(':', 2)[1] || activeSymbol : activeSymbol;
        candidates.push({ symbol: activeSymbol, label: ticker, short: ticker });
      }
      let cursor = 0;
      const worker = async () => {
        while (cursor < candidates.length) {
          const item = candidates[cursor++]!;
          await loadSymbolEnrichment(item);
        }
      };
      const pending = Promise.all(Array.from({ length: Math.min(2, candidates.length) }, () => worker()))
        .then(() => undefined)
        .finally(() => { enrichmentWarmPromise = undefined; });
      enrichmentWarmPromise = pending;
      return pending;
    };

    const refresh = (): void => {
      buildRows();
      if (watchlist.length) quoteSubscribe();
      void warmWatchlistEnrichment();
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
    const freshnessTimer = window.setInterval(() => {
      const expectedMode = hasValidFyersSession(tradingCoreRuntime.getAllConnections()) ? 'fyers' : 'none';
      if (expectedMode !== quoteSourceMode) {
        quoteSubscribe();
        // Recompute technicals after an expiry or reauthorization changes the history source.
        technicalBySymbol.clear();
        void warmWatchlistEnrichment();
      }
      updateRows();
    }, 5000);
    const enrichmentTimer = window.setInterval(() => void warmWatchlistEnrichment(), 30_000);
    const cloudRevisionAtLoad = watchlistMutationRevision;
    void loadDefaultTerminalWatchlist().then((cloudItems) => {
      watchlistCloudReady = true;
      if (!document.contains(root)) return;
      if (watchlistMutationRevision !== cloudRevisionAtLoad) {
        void saveDefaultTerminalWatchlist(watchlist).catch(() => undefined);
        return;
      }
      if (cloudItems && cloudItems.length) {
        watchlist = normalizeWatchlist(cloudItems);
        persistWatchlistLocal();
        watchlistRefreshers.forEach((refreshWatchlist) => refreshWatchlist());
      } else {
        void saveDefaultTerminalWatchlist(watchlist).catch(() => undefined);
      }
    }).catch(() => { watchlistCloudReady = true; });

    return {
      onOpen: refresh,
      onChart: refresh,
      destroy() {
        window.clearInterval(freshnessTimer);
        window.clearInterval(enrichmentTimer);
        watchlistRefreshers.delete(refresh);
        if (suggestionTimer !== undefined) window.clearTimeout(suggestionTimer);
        suggestionRequest += 1;
        resizeHandle.removeAttribute('aria-valuenow');
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
      const tick = tradingCoreRuntime.getMarketSnapshot(ctx.symbol) as unknown as Record<string,unknown> | undefined;
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

function replaceVelaMarksForGroup(chart: { marks: { all: () => TimelineMark[]; set: (marks: readonly TimelineMark[]) => unknown } }, group: string, next: readonly TimelineMark[]): void {
  const retained = chart.marks.all().filter(mark => mark.group !== group);
  chart.marks.set([...retained, ...next]);
}

function clearVelaMarksForGroup(chart: { marks: { all: () => TimelineMark[]; set: (marks: readonly TimelineMark[]) => unknown } }, group: string): void {
  replaceVelaMarksForGroup(chart, group, []);
}

function parseNewsTimestamp(value: unknown): number {
  const raw = String(value ?? '').trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
  if (compact) {
    const [, year, month, day, hour, minute, second] = compact;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function stableNewsMarkId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

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
        if (lastChart) clearVelaMarksForGroup(lastChart, 'trades');
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

        replaceVelaMarksForGroup(chart, 'trades', marks);
      } catch {
        if (currentGeneration === generation) clearVelaMarksForGroup(chart, 'trades');
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);

    return () => {
      window.clearInterval(timer);
      lastMarketListener?.();
      lastMarketListener = undefined;
      if (lastChart) clearVelaMarksForGroup(lastChart, 'trades');
      lastChart = null;
    };
  },
};

const newsMarksAttachment: WidgetAttachment = {
  id: 'tco.news-marks',
  mount(ctx) {
    let lastChart: typeof ctx.chart | null = null;
    let stopMarketListener: (() => void) | undefined;
    let generation = 0;

    const refresh = async (): Promise<void> => {
      const chart = ctx.chart;
      const currentGeneration = ++generation;
      if (chart !== lastChart) {
        stopMarketListener?.();
        stopMarketListener = undefined;
        if (lastChart) clearVelaMarksForGroup(lastChart, 'news');
        lastChart = chart;
        chart.marks.defineGroup({ id: 'news', label: 'News', visible: true });
        stopMarketListener = chart.on('market:changed', () => void refresh());
      }

      const symbol = String(ctx.symbol || '').trim().toUpperCase();
      if (!symbol) return;
      try {
        const bundle = await fetchTradingCoreNewsBundle(symbol, AbortSignal.timeout(8_000));
        if (currentGeneration !== generation) return;
        const now = Date.now();
        const marks: TimelineMark[] = bundle.items
          .map((item): TimelineMark | null => {
            const publishedAt = parseNewsTimestamp(item.publishedAt);
            const url = String(item.url || '');
            if (!Number.isFinite(publishedAt) || publishedAt <= 0
              || publishedAt < now - 60 * 86_400_000 || publishedAt > now + 7 * 86_400_000
              || !/^https?:\/\//i.test(url) || !String(item.title || '').trim()) return null;
            const id = stableNewsMarkId(`${symbol}| ${publishedAt}|${url}`);
            return {
              id: `tco.news.${id}`,
              time: publishedAt,
              title: String(item.title).slice(0, 180),
              glyph: { shape: 'pin' as const, color: '#60a5fa', letter: 'N' },
              tooltip: `${item.source || 'Market news'} · ${String(item.title).slice(0, 140)}`,
              group: 'news',
              content: {
                panel: {
                  items: [
                    { type: 'text' as const, text: String(item.title) },
                    { type: 'field' as const, label: 'Source', value: String(item.source || 'Market news') },
                    { type: 'field' as const, label: 'Published', value: new Date(publishedAt).toLocaleString() },
                    { type: 'button' as const, label: 'Open article', primary: true, run: () => { window.open(url, '_blank', 'noopener,noreferrer'); } },
                  ],
                },
              },
            } satisfies TimelineMark;
          })
          .filter((mark): mark is TimelineMark => mark !== null)
          .slice(0, 40);
        replaceVelaMarksForGroup(chart, 'news', marks);
      } catch {
        // Keep the last valid markers during a temporary news-provider outage.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 180_000);
    return () => {
      window.clearInterval(timer);
      stopMarketListener?.();
      stopMarketListener = undefined;
      if (lastChart) clearVelaMarksForGroup(lastChart, 'news');
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
    let pointerPane: { paneId: string | null; paneKind: string | null } = { paneId: null, paneKind: null };
    let offPaneCrosshair: (() => void) | null = null;
    const attachPaneContext = (): void => {
      offPaneCrosshair?.();
      pointerPane = { paneId: null, paneKind: null };
      offPaneCrosshair = ctx.chart.renderer.onCrosshairMove((event) => {
        pointerPane = { paneId: event.paneId ?? null, paneKind: event.paneKind ?? null };
        render();
      });
    };

    const field = (label: string, value: string, tone = '#cbd5e1') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:10px;padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:6px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
      const key = document.createElement('span'); key.textContent = label; key.style.color = '#64748b';
      const val = document.createElement('span'); val.textContent = value; val.style.color = tone; val.style.fontVariantNumeric = 'tabular-nums';
      row.append(key, val); rows.appendChild(row);
    };

    const render = () => {
      rows.textContent = '';
      const paneLabel = pointerPane.paneId
        ? `${pointerPane.paneKind === 'price' ? 'Price pane' : pointerPane.paneKind === 'study' ? 'Study pane' : 'Pane'} · ${pointerPane.paneId}`
        : 'Move crosshair over a pane';
      context.textContent = `${ctx.symbol} · ${ctx.timeframe} · ${paneLabel}`;
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
      const selectedPane = pointerPane.paneId;
      const paneGroups = selectedPane
        ? readout.groups.filter((group) => group.paneId === selectedPane)
        : readout.groups;
      // A study's horizontal coordinate is its own indicator value, not the market price.
      // Only show OHLCV while inspecting the price pane or when no pane is selected.
      if (!selectedPane || pointerPane.paneKind === 'price') {
        field('Open', readout.ohlc.o, readout.ohlc.up ? '#4ade80' : '#fb7185');
        field('High', readout.ohlc.h);
        field('Low', readout.ohlc.l);
        field('Close', readout.ohlc.c, readout.ohlc.up ? '#4ade80' : '#fb7185');
        if (readout.ohlc.vol) field('Volume', readout.ohlc.vol);
      } else if (paneGroups.length === 0) {
        field('Pane value', 'No indicator values at this bar', '#64748b');
      }

      for (const group of paneGroups) {
        const title = document.createElement('div');
        title.textContent = group.name;
        title.style.cssText = 'margin-top:7px;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.10em;';
        rows.appendChild(title);
        for (const item of group.rows) field(item.label, item.value, item.color);
      }
    };

    attachPaneContext();
    render();
    const timer = window.setInterval(render, 250);
    return {
      onOpen: () => { attachPaneContext(); render(); },
      onChart: () => { attachPaneContext(); render(); },
      destroy: () => {
        window.clearInterval(timer);
        offPaneCrosshair?.();
        offPaneCrosshair = null;
      },
    };
  },
};

const journalPanel: SidePanelDescriptor = {
  id: 'tco.journal',
  title: 'Journal',
  icon: 'calendar',
  order: 20,
  width: 380,
  resizable: true,
  minWidth: 320,
  maxWidth: 560,
  mount(ctx, body, header) {
    header.setTitle('Trading Journal');
    const root = panelRoot(body);
    root.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;padding:0;gap:0;box-sizing:border-box;background:#0b1018;color:#e5edf7;';
    const reactRoot = createRoot(root);
    const render = () => reactRoot.render(createElement(TerminalJournalPanel, {
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
    }));
    render();
    return {
      onOpen: render,
      onChart: render,
      destroy: () => reactRoot.unmount(),
    };
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

// Override Vela's built-in Indicators slot so users get one consistent entry point.
const indicatorLibraryAction: WidgetActionDescriptor = {
  id: 'indicators',
  target: 'topbar',
  label: 'Indicator Library',
  icon: 'indicators',
  iconOnly: true,
  align: 'left',
  mobile: 'bar',
  run() { window.dispatchEvent(new CustomEvent('tco:open-indicator-library')); },
};

// Quant is a right-sidebar action, not another topbar command.
const quantAction: WidgetActionDescriptor = {
  id: 'tco.quant',
  target: 'sidebar',
  label: 'Quant',
  icon: 'activity',
  order: 8,
  run(ctx) { ctx.togglePanel('tco.quant'); },
};

const journalAction: WidgetActionDescriptor = {
  id: 'tco.journal', target: 'topbar', label: 'Journal', icon: 'calendar', iconOnly: false, align: 'right', order: 1, mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.journal'); },
};

const panelsHubPanel: SidePanelDescriptor = {
  id: 'tco.panels',
  title: 'More panels',
  icon: 'list',
  order: 90,
  width: 320,
  resizable: true,
  minWidth: 280,
  maxWidth: 420,
  mount(ctx, body, header) {
    header.setTitle('More panels');
    const root = panelRoot(body);
    root.classList.add('tco-frame-panel', 'tco-panel-hub');
    const groups = [
      {
        title: 'MARKET',
        items: [
          { id: 'tco.market-health', label: 'Market Health', detail: 'Provider status and data freshness' },
          { id: 'tco.orderbook', label: 'Order Book', detail: 'Bid, ask and market depth' },
          { id: 'tco.options', label: 'Options Chain', detail: 'Expiry, strikes and option metrics' },
        ],
      },
      {
        title: 'TRADE MANAGEMENT',
        items: [
          { id: 'tco.automation', label: 'Automation', detail: 'Rules and scheduled actions' },
          { id: 'tco.risk', label: 'Risk', detail: 'Exposure and risk controls' },
          { id: 'tco.journal', label: 'Journal', detail: 'Trades, notes and review' },
          { id: 'tco.positions', label: 'Positions', detail: 'Open positions and P&L' },
        ],
      },
      {
        title: 'ANALYSIS & WORKSPACE',
        items: [
          { id: 'tco.replay', label: 'Replay', detail: 'Historical chart replay' },
          { id: 'tco.quant', label: 'Quant', detail: 'CoreSpirit research and analysis' },
          { id: 'tco.corespirit-code', label: 'CoreSpirit Editor', detail: 'Create and run chart scripts' },
          { id: 'tco.workspace-frame', label: 'Workspace', detail: 'Layouts, appearance and saved setups' },
        ],
      },
    ];
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'tco-panel-hub-group';
      const heading = document.createElement('div');
      heading.className = 'tco-panel-hub-heading';
      heading.textContent = group.title;
      section.appendChild(heading);
      for (const item of group.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tco-panel-hub-item';
        const label = document.createElement('span');
        label.textContent = item.label;
        const detail = document.createElement('span');
        detail.textContent = item.detail;
        button.append(label, detail);
        button.addEventListener('click', () => ctx.togglePanel(item.id, true));
        section.appendChild(button);
      }
      root.appendChild(section);
    }
    return {};
  },
};

registerSidePanel(workspaceFramePanel);
registerSidePanel(coreSpiritCodePanel);
registerSidePanel(quantPanel);
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
registerSidePanel(panelsHubPanel);
registerWidgetAttachment(tradeMarksAttachment);
registerWidgetAttachment(newsMarksAttachment);
registerWidgetAction(researchAction);
registerWidgetAction(automationAction);
registerWidgetAction(tradingAction);
registerWidgetAction(positionsAction);
registerWidgetAction(workspaceFrameAction);
registerWidgetAction(saveWorkspaceAction);
registerWidgetAction(coreSpiritCodeAction);
registerWidgetAction(watchlistAction);
registerWidgetAction(chartSettingsAction);
registerWidgetAction(journalAction);
registerWidgetAction(indicatorLibraryAction);
registerWidgetAction(quantAction);
