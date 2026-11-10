import { Profiler, useEffect, useRef, useState } from 'react';
import { X, UserRound, Plus } from 'lucide-react';
import { loadVelaWorkspace, registerVelaWorkspaceLayouts } from './services/core/chart/velaWorkspaceLoader';
import { createTcoVelaDataProvider, prewarmTcoVelaHistory, subscribeTcoVelaChartStatus, tcoVelaPerformanceKey, type TcoVelaChartStatusSnapshot } from './TcoVelaDataProvider';
import { LazyCoreSpiritVelaEngine } from './services/coreSpirit/coreSpiritVelaEngineLoader';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { TerminalIndicatorLibraryHost } from './components/workspace/TerminalIndicatorLibraryModal';
import { FyersConnectionPrompt } from './components/brokers/FyersConnectionPrompt';
import { hasValidFyersSession } from './services/marketData/yahooFallback';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import { applySavedTcoVelaAppearance, persistActiveTcoVelaSavedWorkspace, persistCurrentTcoVelaAppearance } from './services/core/chart/tcoVelaChrome';
import './services/core/chart/tcoVelaNativeExtensions';
import { createTcoVelaSupabaseStorage, loadTcoVelaActiveWorkspaceId, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';
import { createTcoVelaTerminalOptions, TCO_VELA_LAYOUT_PRESETS } from './services/core/chart/tcoVelaTerminal';
import type { CoreSpiritExecutableArtifact } from './services/coreSpirit/artifact';
import type { IndicatorHandle } from './services/core/chart/velaNativeChartKernel';
import type { NormalizedMarketTick } from './types/market';
import { stageCoreSpiritPrecompiledArtifact } from './services/coreSpirit/precompiledArtifactHandoff';
import {
  coreSpiritLifecycleDiagnostic, coreSpiritLifecycleStageForError, publishCoreSpiritLifecycle,
  type CoreSpiritChartManagedField, type CoreSpiritChartManagerBridge, type CoreSpiritChartManagedValue,
} from './services/coreSpirit/coreSpiritExecutionLifecycle';

type WorkspaceLoadState = { phase: 'loading' | 'ready' } | { phase: 'error'; message: string };
type ChartStatusPhase = 'auth' | 'loading-history' | 'failed' | 'empty' | 'reconciling' | 'connecting' | 'live' | 'stale' | 'waiting-tick' | 'reconnecting' | 'history-ready';
type ChartStatusTone = 'good' | 'warn' | 'error' | 'neutral';
type ChartStatusView = Readonly<{
  phase: ChartStatusPhase;
  tone: ChartStatusTone;
  title: string;
  detail: string;
  symbol: string;
  timeframe: string;
}>;

const CHART_QUOTE_STALE_MS = 15_000;

const WORKSPACE_AUTOSAVE_STATUS_EVENT = 'tco:workspace-autosave-status';
type WorkspaceAutosaveStatusState = 'saving' | 'saved' | 'local' | 'error';
function publishWorkspaceAutosaveStatus(state: WorkspaceAutosaveStatusState, message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_AUTOSAVE_STATUS_EVENT, {
    detail: { state, message, savedAt: state === 'saved' || state === 'local' ? Date.now() : null },
  }));
}

function chartStatusView(snapshot: TcoVelaChartStatusSnapshot, now = Date.now()): ChartStatusView {
  const instrument = snapshot.symbol || 'Active instrument';
  const timeframe = snapshot.timeframe || '—';
  const context = `${instrument} · ${timeframe}`;
  if (!hasValidFyersSession(tradingCoreRuntime.getAllConnections())) {
    return {
      phase: snapshot.error ? 'failed' : snapshot.historyReady && snapshot.historyBars > 0 ? 'history-ready' : 'loading-history',
      tone: snapshot.error ? 'warn' : 'neutral',
      title: snapshot.error ? 'Canonical history unavailable' : snapshot.historyReady && snapshot.historyBars > 0 ? 'Historical data only · no live feed' : 'Loading configured historical data',
      detail: `${context} · history uses Investiny for older historical candles and FYERS for the most recent seven calendar days and live updates. No delayed Yahoo prices are injected; connect FYERS for live quotes and options.${snapshot.error ? ` · ${snapshot.error}` : ''}`,
      symbol: instrument, timeframe,
    };
  }
  if (snapshot.error) {
    const noHistory = /no historical candles|no historical data|returned no history/i.test(snapshot.error);
    return {
      phase: noHistory ? 'empty' : 'failed',
      tone: noHistory ? 'warn' : 'error',
      title: noHistory ? 'No historical data available' : 'Historical data request failed',
      detail: `${context} · ${snapshot.error}`,
      symbol: instrument,
      timeframe,
    };
  }
  if (snapshot.feedStatus === 'authentication_failed') {
    return { phase: 'auth', tone: 'error', title: 'Broker authentication failed', detail: 'Reconnect your broker session before resuming live data.', symbol: instrument, timeframe };
  }
  if (!snapshot.historyReady && snapshot.historyLoading) {
    return { phase: 'loading-history', tone: 'neutral', title: 'Loading historical data', detail: `${context} · requesting real candles from the broker.`, symbol: instrument, timeframe };
  }
  if (!snapshot.historyReady) {
    return { phase: 'loading-history', tone: 'neutral', title: 'Waiting for history reconciliation', detail: `${context} · history has not been confirmed yet.`, symbol: instrument, timeframe };
  }
  if (snapshot.historyBars === 0) {
    return { phase: 'empty', tone: 'warn', title: 'No candles available', detail: `${context} · this instrument/timeframe returned no historical bars.`, symbol: instrument, timeframe };
  }
  if (snapshot.recovering || snapshot.historyLoading) {
    return { phase: 'reconciling', tone: 'warn', title: 'Reconciling market history', detail: `${context} · preserving the last valid chart while history is reconciled.`, symbol: instrument, timeframe };
  }
  if (snapshot.feedStatus === 'connected') {
    const tickAge = snapshot.lastTickAt ? Math.max(0, now - snapshot.lastTickAt) : Number.POSITIVE_INFINITY;
    if (tickAge <= CHART_QUOTE_STALE_MS) {
      return { phase: 'live', tone: 'good', title: 'Receiving live market data', detail: `${context} · history ready · live feed connected.`, symbol: instrument, timeframe };
    }
    if (Number.isFinite(tickAge)) {
      const seconds = Math.max(1, Math.floor(tickAge / 1000));
      return { phase: 'stale', tone: 'warn', title: 'Quote is stale', detail: `${context} · last tick received ${seconds}s ago; avoid treating it as live.`, symbol: instrument, timeframe };
    }
    return { phase: 'waiting-tick', tone: 'neutral', title: 'Live feed connected · waiting for tick', detail: `${context} · historical candles are available; no live tick has been observed yet.`, symbol: instrument, timeframe };
  }
  if (snapshot.feedStatus === 'connecting') {
    return { phase: 'connecting', tone: 'neutral', title: 'Connecting to live data', detail: `${context} · historical candles are ready while the broker feed connects.`, symbol: instrument, timeframe };
  }
  if (snapshot.feedStatus === 'reconnecting' || snapshot.feedStatus === 'disconnected') {
    return { phase: 'reconnecting', tone: 'warn', title: 'Live feed disconnected · reconnecting', detail: `${context} · historical candles remain available; the live quote may be stale.`, symbol: instrument, timeframe };
  }
  return { phase: 'history-ready', tone: 'neutral', title: 'Historical data ready · waiting for live feed', detail: `${context} · chart has real candles but no confirmed live-feed status yet.`, symbol: instrument, timeframe };
}

function sameChartStatus(left: ChartStatusView, right: ChartStatusView): boolean {
  return left.phase === right.phase && left.tone === right.tone && left.title === right.title && left.detail === right.detail
    && left.symbol === right.symbol && left.timeframe === right.timeframe;
}


const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela-v5';

type VelaWorkspaceInstance = InstanceType<Awaited<ReturnType<typeof loadVelaWorkspace>>>;
type VelaAppTab = Readonly<{ id: string; symbol: string; timeframe: string }>;

async function readCoreSpiritManifest(): Promise<Array<{ name: string; script: string; language: string; enabled: boolean; category: string }>> {
  try {
    const source = localStorage.getItem(CORESPIRIT_LIVE_SOURCE_KEY)?.trim();
    if (!source) return [];
    return [{
      name: 'CoreSpirit Live Script',
      script: source,
      language: 'corespirit',
      enabled: true,
      category: 'CoreSpirit',
    }];
  } catch {
    return [];
  }
}

export function LiveTradingWorkspace() {
const browserRuntimeMetrics = useRef({
      longTaskCount: 0,
      totalLongTaskMs: 0,
      worstLongTaskMs: 0,
      lastLongTaskAt: 0,
      longTaskDurations: [] as number[],
      webglContextLossCount: 0,
      webglContextRestoreCount: 0,
      heapSamples: [] as Array<{ capturedAt: number; usedBytes: number }>,
    }).current;

  const host = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<VelaWorkspaceInstance | null>(null);
  const [brokerStatusOpen, setBrokerStatusOpen] = useState(false);
  const [velaAppTabs, setVelaAppTabs] = useState<VelaAppTab[]>([]);
  const [activeVelaAppTabId, setActiveVelaAppTabId] = useState('');
  const [headerQuote, setHeaderQuote] = useState<NormalizedMarketTick | null>(null);
  const [workspaceLoadState, setWorkspaceLoadState] = useState<WorkspaceLoadState>({ phase: 'loading' });
  const [workspaceMountAttempt, setWorkspaceMountAttempt] = useState(0);
  const [chartStatus, setChartStatus] = useState<ChartStatusView>({
    phase: 'loading-history',
    tone: 'neutral',
    title: 'Preparing chart data',
    detail: 'Waiting for the active chart and its market-data subscription.',
    symbol: 'NSE:NIFTY50-INDEX',
    timeframe: '5',
  });
  const chartStatusSnapshotRef = useRef<TcoVelaChartStatusSnapshot | null>(null);
  const retryChartHistoryRef = useRef<(() => Promise<void>) | null>(null);
  const activeChartStatusKeyRef = useRef('');
  const [dismissedChartStatusKey, setDismissedChartStatusKey] = useState(() => {
    try { return localStorage.getItem('tradingcore:chart-status-dismissed:v1') ?? ''; } catch { return ''; }
  });
  const statusMessage = `${chartStatus.title} ${chartStatus.detail}`;
  const feedWarning = ['stale', 'waiting-tick', 'connecting', 'reconnecting'].includes(chartStatus.phase)
    || /quote (?:is|may be) stale|last tick received\s+\d+s ago|live feed disconnected|waiting for tick/i.test(statusMessage);
  const statusCategory = feedWarning ? 'market-feed-stale' : `${chartStatus.phase}|${chartStatus.title}`;
  const now = new Date();
  const localDayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // The quote-age detail changes every few seconds, so dismissal is keyed by warning
  // category + instrument + interval, not the dynamic detail string or transient phase.
  // Persist it across status refreshes and reloads; a new day/instrument/interval can notify again.
  const chartStatusDismissKey = `${localDayKey}|${chartStatus.symbol.toUpperCase()}|${chartStatus.timeframe}|${statusCategory}`;
  const headerTicker = chartStatus.symbol.includes(':') ? chartStatus.symbol.split(':').pop() || chartStatus.symbol : chartStatus.symbol;
  const headerExchange = chartStatus.symbol.includes(':') ? chartStatus.symbol.split(':')[0] : '';
  const headerPrice = headerQuote?.ltp != null && Number.isFinite(Number(headerQuote.ltp))
    ? Number(headerQuote?.ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const headerChange = headerQuote?.change != null && Number.isFinite(Number(headerQuote.change)) ? Number(headerQuote?.change) : undefined;
  const headerChangePercent = headerQuote?.changePercent != null && Number.isFinite(Number(headerQuote.changePercent)) ? Number(headerQuote?.changePercent) : undefined;
  const headerQuotePositive = (headerChange ?? headerChangePercent ?? 0) >= 0;
  const headerChangeLabel = headerChange === undefined
    ? '—'
    : `${headerChange > 0 ? '+' : ''}${headerChange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const headerChangePercentLabel = headerChangePercent === undefined
    ? '—'
    : `${headerChangePercent > 0 ? '+' : ''}${headerChangePercent.toFixed(2)}%`;
  const headerQuoteTimestamp = headerQuote?.receivedAtEpoch
    ? (headerQuote.receivedAtEpoch > 1e12 ? headerQuote.receivedAtEpoch : headerQuote.receivedAtEpoch * 1000)
    : headerQuote?.receivedAt ? Date.parse(headerQuote.receivedAt) : 0;
  const headerQuoteFresh = Boolean(headerQuoteTimestamp && Date.now() - headerQuoteTimestamp <= 15_000);

  useEffect(() => {
    if (!host.current) return;

    let workspace: VelaWorkspaceInstance | null = null;
    const workspaceListenerDisposers: Array<() => void> = [];
    let namedWorkspaceAutosaveTimer: number | null = null;
    let namedWorkspaceSelectionHydrated = false;
    let namedWorkspaceAutosavePending = false;
    let scheduleNamedWorkspaceAutosave: (() => void) | null = null;
    let stopChartStatus: (() => void) | undefined;
    let chartStatusGeneration = 0;
    let cancelled = false;
    const browserErrors: Array<{ type: 'error' | 'unhandledrejection'; message: string; time: number }> = [];
        let longTaskObserver: PerformanceObserver | undefined;
    const pushBrowserError = (type: 'error' | 'unhandledrejection', message: string) => {
      browserErrors.push({ type, message: String(message).slice(0, 500), time: Date.now() });
      if (browserErrors.length > 50) browserErrors.shift();
      if (typeof window !== 'undefined') {
        (window as Window & { __TCO_VELA_ERRORS__?: unknown }).__TCO_VELA_ERRORS__ = [...browserErrors];
      }
    };
    const onWindowError = (event: ErrorEvent) => {
      pushBrowserError('error', event.error?.message || event.message || 'Window error');
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unhandled rejection');
      pushBrowserError('unhandledrejection', reason);
    };
    const onWebGLContextLost = (event: Event) => {
      browserRuntimeMetrics.webglContextLossCount += 1;
      const target = event.target as HTMLElement | null;
      pushBrowserError('error', `WebGL context lost${target?.tagName ? ` on ${target.tagName}` : ''}`);
    };
    const onWebGLContextRestored = () => { browserRuntimeMetrics.webglContextRestoreCount += 1; };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    document.addEventListener('webglcontextlost', onWebGLContextLost, true);
    document.addEventListener('webglcontextrestored', onWebGLContextRestored, true);
    (window as Window & { __TCO_VELA_ERRORS__?: unknown }).__TCO_VELA_ERRORS__ = [];
    (window as Window & { __TCO_BROWSER_RUNTIME__?: unknown }).__TCO_BROWSER_RUNTIME__ = browserRuntimeMetrics;
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = Math.max(0, Number(entry.duration) || 0);
            browserRuntimeMetrics.longTaskCount += 1;
            browserRuntimeMetrics.totalLongTaskMs += duration;
            browserRuntimeMetrics.worstLongTaskMs = Math.max(browserRuntimeMetrics.worstLongTaskMs, duration);
            browserRuntimeMetrics.lastLongTaskAt = Date.now();
            browserRuntimeMetrics.longTaskDurations.push(duration);
            if (browserRuntimeMetrics.longTaskDurations.length > 120) browserRuntimeMetrics.longTaskDurations.shift();
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      longTaskObserver?.disconnect();
      longTaskObserver = undefined;
    }

    const mount = async () => {
      try {
      // Start session restoration immediately, but don't block Vela's first
      // mount on broker/network retries. The TCO provider's async bars/subscription
      // paths attach to the broker when this shared restore promise resolves.
      const brokerReady = tradingCoreRuntime.hasConnectedBroker()
        ? Promise.resolve()
        : tradingCoreRuntime.restoreBrokerConnections().catch(() => undefined);
      const defaultsPromise = loadTcoVelaDefaults();
      const [defaults, VelaWorkspaceClass] = await Promise.all([defaultsPromise, loadVelaWorkspace()]);
      if (cancelled || !host.current) return;
      // Register custom layouts only after loading Vela's runtime module so the picker
      // and the host write to the same registry instance in production code splitting.
      await registerVelaWorkspaceLayouts(TCO_VELA_LAYOUT_PRESETS);
      if (cancelled || !host.current) return;
      const queryLayout = new URLSearchParams(window.location.search).get('velaLayout') || '';
      const initialLayout = ['1','4','8'].includes(queryLayout) ? queryLayout : (defaults.layout || '1');

      const baseWorkspaceStorage = createTcoVelaSupabaseStorage(() => tradingCoreRuntime.getPrimaryBrokerId() ?? 'fyers');
      let releaseInitialWorkspaceRestore!: () => void;
      const initialWorkspaceRestore = new Promise<void>((resolve) => {
        releaseInitialWorkspaceRestore = resolve;
      });
      const workspaceStorage = {
        ...baseWorkspaceStorage,
        async get(key: string) {
          try {
            return await baseWorkspaceStorage.get(key);
          } finally {
            releaseInitialWorkspaceRestore();
          }
        },
      };

      workspace = new VelaWorkspaceClass(host.current, createTcoVelaTerminalOptions({
        layout: initialLayout,
        symbol: 'NSE:NIFTY50-INDEX',
        timeframe: defaults.timeframe || '5',
        storage: workspaceStorage,
        createDataProvider: createTcoVelaDataProvider,
        createCoreSpiritEngine: () => new LazyCoreSpiritVelaEngine(),
        resolveIndicatorManifest: readCoreSpiritManifest,
      }));
      workspaceRef.current = workspace;

      // The application tab strip is a projection of Vela's actual chart cells,
      // not a parallel tab/session model. Clicking a tab only activates that cell.
      const refreshVelaAppTabs = () => {
        if (cancelled || workspaceRef.current !== workspace) return;
        const context = workspace.context();
        setVelaAppTabs(context.cells.map((cell) => ({
          id: cell.id,
          symbol: cell.symbol,
          timeframe: cell.timeframe,
        })));
        setActiveVelaAppTabId(context.activeCellId);
      };
      refreshVelaAppTabs();
      workspaceListenerDisposers.push(workspace.on('cell:active', refreshVelaAppTabs));
      workspaceListenerDisposers.push(workspace.on('cell:created', refreshVelaAppTabs));
      workspaceListenerDisposers.push(workspace.on('cell:destroyed', refreshVelaAppTabs));
      workspaceListenerDisposers.push(workspace.on('layout:changed', refreshVelaAppTabs));
      workspaceListenerDisposers.push(workspace.on('state:changed', refreshVelaAppTabs));

      // Restore the user's saved Vela panel choice first. For a genuinely new workspace,
      // open Watchlist by default so quotes, technicals and news are visible on entry.
      void initialWorkspaceRestore.then(() => {
        window.setTimeout(() => {
          if (cancelled || workspaceRef.current !== workspace) return;
          if (!workspace.getState().panels?.open) {
            workspace.togglePanel('tco.bookmarks', true);
          }
        }, 0);
      });

      // Hydrate the account's selected named setup once at mount. Capture the local value
      // first so an intentional local selection made while the request is in flight wins.
      const selectionBrokerKey = String(tradingCoreRuntime.getPrimaryBrokerId() ?? 'fyers').trim().toLowerCase();
      const activeWorkspaceStorageKey = `tradingcore:vela:active-saved-workspace:v1:${selectionBrokerKey}`;
      let activeWorkspaceIdAtStart = '';
      try { activeWorkspaceIdAtStart = localStorage.getItem(activeWorkspaceStorageKey) ?? ''; } catch {}
      void loadTcoVelaActiveWorkspaceId(selectionBrokerKey).then((loadedId) => {
        if (cancelled || !loadedId) return;
        let currentLocalId = '';
        try { currentLocalId = localStorage.getItem(activeWorkspaceStorageKey) ?? ''; } catch {}
        if (currentLocalId === activeWorkspaceIdAtStart) {
          try { localStorage.setItem(activeWorkspaceStorageKey, loadedId); } catch {}
        }
      }).catch(() => undefined).finally(() => {
        namedWorkspaceSelectionHydrated = true;
        if (namedWorkspaceAutosavePending) {
          namedWorkspaceAutosavePending = false;
          scheduleNamedWorkspaceAutosave?.();
        }
      });

      // The Vela document adapter already saves the live workspace on every dirty burst.
      // When a named setup is active, also update that named snapshot after the user pauses
      // editing, so "Restore" never trails the live chart until the 30-minute checkpoint.
      scheduleNamedWorkspaceAutosave = () => {
        if (cancelled) return;
        const brokerKey = String(tradingCoreRuntime.getPrimaryBrokerId() ?? 'fyers').trim().toLowerCase();
        let activeNamedId = '';
        try {
          activeNamedId = localStorage.getItem(`tradingcore:vela:active-saved-workspace:v1:${brokerKey}`) ?? '';
        } catch {}
        // If the account selection is still loading, remember that a save-worthy edit
        // happened and resume once hydration finishes. Do not query cloud on every keystroke.
        if (!activeNamedId) {
          if (!namedWorkspaceSelectionHydrated) namedWorkspaceAutosavePending = true;
          return;
        }
        if (namedWorkspaceAutosaveTimer !== null) window.clearTimeout(namedWorkspaceAutosaveTimer);
        publishWorkspaceAutosaveStatus('saving', 'Saving changes to the active workspace…');
        namedWorkspaceAutosaveTimer = window.setTimeout(() => {
          namedWorkspaceAutosaveTimer = null;
          void persistActiveTcoVelaSavedWorkspace().then((result) => {
            if (cancelled) return;
            const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            if (!result) {
              publishWorkspaceAutosaveStatus('local', 'Live chart autosave is active. Named-workspace sync will retry at the next checkpoint.');
              return;
            }
            publishWorkspaceAutosaveStatus(
              result.synced ? 'saved' : 'local',
              result.synced
                ? `Saved “${result.name}” at ${time}. Your charts, drawings and settings are up to date.`
                : `Saved “${result.name}” locally at ${time}; account sync will retry when available.`,
            );
          }).catch(() => {
            if (!cancelled) publishWorkspaceAutosaveStatus('error', 'Local autosave remains available; named-workspace cloud sync failed.');
          });
        }, 1_800);
      };
      workspaceListenerDisposers.push(workspace.on('state:changed', () => scheduleNamedWorkspaceAutosave?.()));
      // Palette, accent, sidebar, density and topbar-tool edits are app appearance state,
      // not Vela chart mutations. Include those changes in the selected named snapshot too.
      const onWorkspaceAppearanceChanged = () => scheduleNamedWorkspaceAutosave?.();
      window.addEventListener('tco:workspace-appearance-changed', onWorkspaceAppearanceChanged);
      workspaceListenerDisposers.push(() => window.removeEventListener('tco:workspace-appearance-changed', onWorkspaceAppearanceChanged));

      // CoreSpirit editor drafts are persisted locally by the dock. Mirror the
      // changed source into Vela's global workspace state and enqueue the same
      // debounced named-workspace save, so a restored workspace has the latest
      // editor content rather than the previous compiled source.
      const queueLiveSourceSave = (source: string) => {
        if (typeof source !== 'string' || source.length > 1_000_000) return;
        try { localStorage.setItem(CORESPIRIT_LIVE_SOURCE_KEY, source); } catch {}
        scheduleNamedWorkspaceAutosave?.();
      };
      const onCoreSpiritSourceChanged = (event: Event) => {
        const detail = (event as CustomEvent<{ source?: unknown }>).detail;
        if (typeof detail?.source === 'string') queueLiveSourceSave(detail.source);
      };
      window.addEventListener('tco:corespirit:source-changed', onCoreSpiritSourceChanged);
      workspaceListenerDisposers.push(() => window.removeEventListener('tco:corespirit:source-changed', onCoreSpiritSourceChanged));

      // Warm common index history in the background once the broker is ready.
      // The workspace itself is already mounted, and its own getBars call is
      // allowed to drive first-candle loading concurrently.
      void brokerReady.then(() => {
        if (cancelled) return;
        // Warm the tickers present in this user's active chart layout first, followed by
        // saved watchlist symbols. The data plane runs this as bounded low-priority work;
        // visible chart history always wins, and each symbol/interval is cooled down after warming.
        const activeSymbols = (workspace?.cells?.() ?? [])
          .map(cell => String(cell.chart?.market?.symbol ?? '').trim())
          .filter(Boolean);
        let watchlistSymbols: string[] = [];
        try {
          const stored = JSON.parse(localStorage.getItem('tradingcore:vela:watchlist:v2') || '{}') as { items?: unknown[] };
          watchlistSymbols = (Array.isArray(stored) ? stored : Array.isArray(stored?.items) ? stored.items : [])
            .map(item => item && typeof item === 'object' ? String((item as Record<string, unknown>).symbol ?? '').trim() : '')
            .filter(Boolean);
        } catch {}
        const activeHistorySymbols = [...new Set([...activeSymbols, ...watchlistSymbols])].slice(0, 12);
        prewarmTcoVelaHistory(
          activeHistorySymbols.length ? activeHistorySymbols : ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'BSE:SENSEX-INDEX'],
          ['1', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
          5000,
        );
      });

      if (typeof window !== 'undefined') {
        (window as Window & { __TCO_VELA__?: unknown }).__TCO_VELA__ = {
          workspace,
          getPerformanceStats: () => workspace?.getPerformanceStats?.() ?? [],
          setLayout: (layout: string) => workspace?.setLayout(layout),
          saveNow: () => workspace?.saveNow(),
          getState: () => workspace?.getState(),
          applyState: (state: unknown) => workspace?.applyState(state),
          getCellHealth: async () => {
            const cells = workspace?.cells?.() ?? [];
            await Promise.all(cells.map(cell => cell.chart.ready().catch(() => undefined)));
            return cells.map(cell => {
              const market = cell.chart.market;
              const scene = cell.chart.inspect();
              return {
                id: cell.id,
                symbol: market.symbol,
                timeframe: market.timeframe,
                totals: scene.totals,
                indicators: scene.indicators.length,
                replay: cell.chart.replay.state,
              };
            });
          },
          getNativeIndicatorCatalog: async () => {
            const cells = workspace?.cells?.() ?? [];
            const active = workspace?.active ?? cells[0];
            if (!active?.chart) return [];
            await active.chart.ready().catch(() => undefined);
            return active.chart.availableNativeIndicators();
          },
          addNativeIndicator: async (type: string) => {
            const cells = workspace?.cells?.() ?? [];
            const active = workspace?.active ?? cells[0];
            if (!active?.chart) throw new Error('The active Vela chart is unavailable.');
            const catalog = await active.chart.availableNativeIndicators();
            const entry = catalog.find(item => item.type === type);
            if (!entry || !entry.supported) throw new Error('This indicator is not supported by the active instrument.');
            if (entry.present && !entry.multiInstance) return { alreadyPresent: true };
            const handle = await active.chart.addNativeIndicatorAsync(type);
            return { id: handle.id, alreadyPresent: false };
          },
        };
        if (host.current) applySavedTcoVelaAppearance(host.current);
      }
      const publishChartStatus = (snapshot: TcoVelaChartStatusSnapshot, generation: number) => {
        if (cancelled || generation !== chartStatusGeneration) return;
        chartStatusSnapshotRef.current = snapshot;
        const next = chartStatusView(snapshot);
        setChartStatus((previous) => sameChartStatus(previous, next) ? previous : next);
      };
      const bindActiveChart = (requestedCellId?: string) => {
        if (cancelled || !workspace) return;
        let cell: ReturnType<VelaWorkspaceInstance['cells']>[number] | undefined;
        try {
          const cells = workspace.cells();
          cell = (requestedCellId ? cells.find((candidate) => candidate.id === requestedCellId) : undefined) ?? workspace.active ?? cells[0];
        } catch {
          cell = workspace.cells()[0];
        }
        if (!cell?.chart?.market) return;
        const symbol = String(cell.chart.market.symbol || 'NSE:NIFTY50-INDEX');
        const timeframe = String(cell.chart.market.timeframe || '5');
        const key = `${symbol.toUpperCase()}|${timeframe}`;
        if (activeChartStatusKeyRef.current === key && chartStatusSnapshotRef.current) {
          const view = chartStatusView(chartStatusSnapshotRef.current);
          setChartStatus((previous) => sameChartStatus(previous, view) ? previous : view);
          return;
        }

        chartStatusGeneration += 1;
        const generation = chartStatusGeneration;
        activeChartStatusKeyRef.current = key;
        stopChartStatus?.();
        stopChartStatus = undefined;
        retryChartHistoryRef.current = null;
        chartStatusSnapshotRef.current = null;
        setChartStatus({
          phase: 'loading-history',
          tone: 'neutral',
          title: 'Preparing chart data',
          detail: `${symbol} · ${timeframe} · attaching to the shared market-data plane.`,
          symbol,
          timeframe,
        });

        const subscription = subscribeTcoVelaChartStatus(symbol, timeframe, (snapshot) => publishChartStatus(snapshot, generation));
        stopChartStatus = subscription.unsubscribe;
        retryChartHistoryRef.current = subscription.retryHistory;
        workspaceListenerDisposers.push(() => subscription.unsubscribe());
      };
      workspaceListenerDisposers.push(
        workspace.on('cell:active', (event) => bindActiveChart(event.id)),
        workspace.on('layout:changed', () => bindActiveChart()),
        workspace.on('cell:created', () => bindActiveChart()),
        workspace.on('cell:destroyed', () => bindActiveChart()),
      );
      bindActiveChart();
      workspaceRef.current = workspace;

      // Bridge the docked React CoreSpirit terminal to the active Vela cell. Keep
      // the callback scoped to this mounted workspace and remove it on teardown.
      const addCoreSpiritToChart = async (
        scriptName: string,
        scriptSource: string,
        artifact: CoreSpiritExecutableArtifact,
        scriptId?: string | null,
      ): Promise<void> => {
        const activeWorkspace = workspaceRef.current;
        if (!activeWorkspace) throw new Error('The Vela chart is not ready yet.');
        const activeCell = activeWorkspace.active;
        if (!activeCell) throw new Error('Select an active Vela chart before adding a CoreSpirit script.');

        // One logical script owns one instance on this cell. Use a saved script id
        // whenever available; local drafts use the name until they are published.
        // The source fingerprint changes on edits so the replacement can start while
        // the previous valid instance stays alive.
        const identitySeed = scriptId?.trim()
          ? 'script:' + scriptId.trim()
          : 'local-name:' + scriptName.trim().toLocaleLowerCase();
        const stableHash = (value: string): string => {
          let hash = 0x811c9dc5;
          for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
          }
          return (hash >>> 0).toString(36);
        };
        const instancePrefix = 'tco-corespirit-' + stableHash(identitySeed) + '-';
        const externalInstanceId = instancePrefix + stableHash(scriptSource);
        const sameLogicalScript = (instance: (typeof activeCell.instances)[number]) =>
          instance.entry.language === 'corespirit' &&
          (instance.id.startsWith(instancePrefix) ||
            instance.entry.name.trim().toLocaleLowerCase() === scriptName.trim().toLocaleLowerCase());
        const sameSourceInstance = activeCell.instances.find(instance =>
          sameLogicalScript(instance) && instance.entry.script === scriptSource,
        );
        if (sameSourceInstance) {
          // A second Compile & Run for byte-identical source is an idempotent
          // no-op: never append another indicator row or another retained scene.
          try { localStorage.setItem(CORESPIRIT_LIVE_SOURCE_KEY, scriptSource); } catch {}
          publishCoreSpiritLifecycle({stage:'rendered',scriptId:scriptId || sameSourceInstance.id,scriptName,sourceHash:artifact.abi?.sourceHash,artifactHash:artifact.abi?.artifactHash,chartId:activeCell.id,symbol:activeCell.symbol,timeframe:activeCell.timeframe,message:'This exact source is already running; no duplicate indicator was added.'});
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
          return;
        }
        const previousInstanceIds = activeCell.instances
          .filter(sameLogicalScript)
          .map(instance => instance.id);

        publishCoreSpiritLifecycle({stage:'applying-chart-output',scriptId:scriptId || externalInstanceId,scriptName,sourceHash:artifact.abi?.sourceHash,artifactHash:artifact.abi?.artifactHash,chartId:activeCell.id,symbol:activeCell.symbol,timeframe:activeCell.timeframe,message:'Submitting the validated artifact to the active Vela chart.'});
        // Vela's external-indicator ledger persists source, not VM payloads. Stage
        // only for this immediate handoff; the receiver rechecks exact source and
        // artifact hashes before using the compiled artifact.
        stageCoreSpiritPrecompiledArtifact(scriptSource, artifact);
        const before = activeCell.indicatorCount;
        activeCell.addExternalIndicator({
          id: externalInstanceId,
          name: scriptName,
          script: scriptSource,
          language: 'corespirit',
        });
        const createdInstance = activeCell.instances.find(instance => instance.id === externalInstanceId);
        if (!createdInstance || activeCell.indicatorCount <= before) {
          throw new Error('Vela did not attach the CoreSpirit script instance. The chart may already contain an instance with this id.');
        }
        const handle = createdInstance.handle;
        if (!handle) throw new Error('Vela attached a row but did not create a runnable CoreSpirit indicator handle.');
        publishCoreSpiritLifecycle({stage:'executing-historical',scriptId:scriptId || externalInstanceId,scriptName,sourceHash:artifact.abi?.sourceHash,artifactHash:artifact.abi?.artifactHash,chartId:activeCell.id,symbol:activeCell.symbol,timeframe:activeCell.timeframe,message:'Running the validated artifact against the current chart history.'});

        // Keep the previous source live until the replacement has emitted ready.
        // A compile/runtime failure removes only the new failed instance and leaves
        // the last known-good chart output visible.
        try {
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            let removeReady: (() => void) | undefined;
            let removeError: (() => void) | undefined;
            let timer: number | undefined;
            const finish = (error?: Error) => {
              if (settled) return;
              settled = true;
              if (timer !== undefined) window.clearTimeout(timer);
              removeReady?.();
              removeError?.();
              if (error) reject(error); else resolve();
            };
            timer = window.setTimeout(() => finish(new Error('CoreSpirit did not finish compiling and drawing within 25 seconds. Check the indicator error details and worker status.')), 25_000);
            removeReady = handle.on('ready', () => finish());
            removeError = handle.on('error', payload => finish(payload.error));
          });
        } catch (error) {
          const stage=coreSpiritLifecycleStageForError(error,'execution-failed');
          const diagnostic=coreSpiritLifecycleDiagnostic(error,stage,{previousOutputPreserved:previousInstanceIds.length>0});
          publishCoreSpiritLifecycle({stage,scriptId:scriptId || externalInstanceId,scriptName,sourceHash:artifact.abi?.sourceHash,artifactHash:artifact.abi?.artifactHash,diagnostics:[diagnostic],previousOutputPreserved:previousInstanceIds.length>0,message:diagnostic.message});
          const failedIndex = activeCell.instances.findIndex(instance => instance.id === externalInstanceId);
          if (failedIndex >= 0) {
            try {
              const nativeCount = activeCell.indicatorCount - activeCell.instances.length;
              activeCell.removeFromChart(nativeCount + failedIndex);
            } catch { /* preserve the original runtime error */ }
          }
          throw error;
        }

        // Promote the new source only after the chart runtime confirms it is ready.
        for (const previousId of previousInstanceIds) {
          const staleIndex = activeCell.instances.findIndex(instance => instance.id === previousId);
          if (staleIndex < 0) continue;
          const nativeCount = activeCell.indicatorCount - activeCell.instances.length;
          activeCell.removeFromChart(nativeCount + staleIndex);
        }
        try { localStorage.setItem(CORESPIRIT_LIVE_SOURCE_KEY, scriptSource); } catch {}
        publishCoreSpiritLifecycle({stage:'rendered',scriptId:scriptId || externalInstanceId,scriptName,sourceHash:artifact.abi?.sourceHash,artifactHash:artifact.abi?.artifactHash,chartId:activeCell.id,symbol:activeCell.symbol,timeframe:activeCell.timeframe,message:'The compiled source is running on the active Vela chart.'});
        window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
        window.dispatchEvent(new CustomEvent('tco:corespirit:source-changed', {
          detail: { name: scriptName, source: scriptSource },
        }));
      };
      const watchManagerRun = (handle: IndicatorHandle, id: string, scriptName: string): (() => void) => {
        let settled = false; let timer: number | undefined;
        let disposeReady: (() => void) | undefined; let disposeError: (() => void) | undefined;
        const finish = (error?: Error) => {
          if (settled) return; settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          disposeReady?.(); disposeError?.();
          if (error) {
            const stage = coreSpiritLifecycleStageForError(error, 'execution-failed');
            const diagnostic = coreSpiritLifecycleDiagnostic(error, stage, { previousOutputPreserved: true });
            publishCoreSpiritLifecycle({ stage, scriptId: id, scriptName, diagnostics: [diagnostic], previousOutputPreserved: true, message: diagnostic.message });
          } else {
            publishCoreSpiritLifecycle({ stage: 'rendered', scriptId: id, scriptName, message: scriptName + ' updated and rendered on the active Vela chart.' });
          }
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
        };
        timer = window.setTimeout(() => finish(new Error('CoreSpirit did not finish applying its updated inputs within 25 seconds. The previous valid output should remain visible.')), 25_000);
        disposeReady = handle.on('ready', () => finish());
        disposeError = handle.on('error', payload => finish(payload.error));
        return () => { if (settled) return; settled = true; if (timer !== undefined) window.clearTimeout(timer); disposeReady?.(); disposeError?.(); };
      };

      const chartManager: CoreSpiritChartManagerBridge = {
        list() {
          const cell = workspaceRef.current?.active;
          if (!cell) return [];
          return cell.instances.filter(instance => instance.entry.language === 'corespirit' && instance.handle).map(instance => {
            const handle = instance.handle!;
            const inputValues = handle.inputValues();
            const propValues = handle.propValues();
            const mapFields = (schemas: typeof handle.inputs, values: Record<string, CoreSpiritChartManagedValue>): CoreSpiritChartManagedField[] => schemas.map(schema => ({
              key: schema.key, title: schema.title, type: schema.type, value: values[schema.key] ?? schema.defval, defval: schema.defval,
              ...(schema.min == null ? {} : { min: schema.min }), ...(schema.max == null ? {} : { max: schema.max }),
              ...(schema.step == null ? {} : { step: schema.step }), ...(schema.options ? { options: [...schema.options] } : {}),
              ...(schema.group ? { group: schema.group } : {}), ...(schema.tooltip ? { tooltip: schema.tooltip } : {}),
            }));
            return { id: instance.id, name: instance.entry.name, source: instance.entry.script, visible: handle.visible,
              inputs: mapFields(handle.inputs, inputValues), props: mapFields(handle.props, propValues) };
          });
        },
        setVisible(id, visible) {
          const cell = workspaceRef.current?.active; const instance = cell?.instances.find(item => item.id === id);
          if (!cell || !instance?.handle || instance.entry.language !== 'corespirit') return false;
          const stopWatching = visible ? watchManagerRun(instance.handle, id, instance.entry.name) : undefined;
          try { instance.handle.setVisible(visible); } catch { stopWatching?.(); return false; }
          if (!visible) publishCoreSpiritLifecycle({ stage: 'hidden', scriptId: id, scriptName: instance.entry.name, message: 'CoreSpirit indicator hidden; computation is suspended.' });
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
          return true;
        },
        setInput(id, key, value) {
          const cell = workspaceRef.current?.active; const instance = cell?.instances.find(item => item.id === id);
          if (!instance?.handle || instance.entry.language !== 'corespirit' || !instance.handle.inputs.some(schema => schema.key === key)) return false;
          const stopWatching = watchManagerRun(instance.handle, id, instance.entry.name);
          try { instance.handle.setInput(key, value as any); } catch { stopWatching(); return false; }
          publishCoreSpiritLifecycle({ stage: 'executing-historical', scriptId: id, scriptName: instance.entry.name, message: 'Input changed; recomputing against current chart history.' });
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
          return true;
        },
        setProp(id, key, value) {
          const cell = workspaceRef.current?.active; const instance = cell?.instances.find(item => item.id === id);
          if (!instance?.handle || instance.entry.language !== 'corespirit' || !instance.handle.props.some(schema => schema.key === key)) return false;
          const stopWatching = watchManagerRun(instance.handle, id, instance.entry.name);
          try { instance.handle.setProp(key, value as any); } catch { stopWatching(); return false; }
          publishCoreSpiritLifecycle({ stage: 'executing-historical', scriptId: id, scriptName: instance.entry.name, message: 'Appearance property changed; recomputing this indicator.' });
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
          return true;
        },
        remove(id) {
          const cell = workspaceRef.current?.active; if (!cell) return false;
          const index = cell.instances.findIndex(instance => instance.id === id && instance.entry.language === 'corespirit');
          if (index < 0) return false;
          const nativeCount = cell.indicatorCount - cell.instances.length;
          cell.removeFromChart(nativeCount + index);
          publishCoreSpiritLifecycle({ stage: 'removed', scriptId: id, message: 'CoreSpirit indicator removed from the active chart.' });
          window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
          return true;
        },
      };
      const tcoWindow = window as Window & {
        __TCO_ADD_CORESPIRIT_TO_CHART__?: (name: string, source: string, artifact: CoreSpiritExecutableArtifact, scriptId?: string | null) => Promise<void>;
        __TCO_CORESPIRIT_CHART_MANAGER__?: CoreSpiritChartManagerBridge;
      };
      tcoWindow.__TCO_ADD_CORESPIRIT_TO_CHART__ = addCoreSpiritToChart;
      tcoWindow.__TCO_CORESPIRIT_CHART_MANAGER__ = chartManager;
      window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
      workspaceListenerDisposers.push(() => {
        if (tcoWindow.__TCO_ADD_CORESPIRIT_TO_CHART__ === addCoreSpiritToChart) {
          delete tcoWindow.__TCO_ADD_CORESPIRIT_TO_CHART__;
        }
        if (tcoWindow.__TCO_CORESPIRIT_CHART_MANAGER__ === chartManager) {
          delete tcoWindow.__TCO_CORESPIRIT_CHART_MANAGER__;
        }
        window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
      });

      if (!cancelled) setWorkspaceLoadState({ phase: 'ready' });
      } catch (error) {
        if (!cancelled) {
          setWorkspaceLoadState({
            phase: 'error',
            message: (error instanceof Error ? error.message : String(error || 'Unknown loading error')).slice(0, 240),
          });
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      if (namedWorkspaceAutosaveTimer !== null) {
        window.clearTimeout(namedWorkspaceAutosaveTimer);
        namedWorkspaceAutosaveTimer = null;
      }
      workspaceRef.current = null;
      for (const dispose of workspaceListenerDisposers) dispose();
      workspaceListenerDisposers.length = 0;
      stopChartStatus?.();
      stopChartStatus = undefined;
      retryChartHistoryRef.current = null;
      chartStatusSnapshotRef.current = null;
      activeChartStatusKeyRef.current = '';
      workspace?.destroy();
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      document.removeEventListener('webglcontextlost', onWebGLContextLost, true);
      document.removeEventListener('webglcontextrestored', onWebGLContextRestored, true);
      longTaskObserver?.disconnect();
      if (typeof window !== 'undefined') {
        const exposed = (window as Window & { __TCO_VELA__?: { workspace?: unknown } }).__TCO_VELA__;
        if (exposed?.workspace === workspace) delete (window as Window & { __TCO_VELA__?: unknown }).__TCO_VELA__;
        delete (window as Window & { __TCO_VELA_ERRORS__?: unknown }).__TCO_VELA_ERRORS__;
        const runtime = (window as Window & { __TCO_BROWSER_RUNTIME__?: unknown }).__TCO_BROWSER_RUNTIME__;
        if (runtime === browserRuntimeMetrics) delete (window as Window & { __TCO_BROWSER_RUNTIME__?: unknown }).__TCO_BROWSER_RUNTIME__;
      }
    };
  }, [workspaceMountAttempt]);


  useEffect(() => {
    // Read the quote already being maintained by the active chart's market-data path.
    // This is a presentation-only projection: it creates no extra broker subscription.
    const refreshHeaderQuote = () => {
      const next = tradingCoreRuntime.getMarketSnapshot(chartStatus.symbol) ?? null;
      setHeaderQuote((previous) => previous === next ? previous : next);
    };
    refreshHeaderQuote();
    const timer = window.setInterval(refreshHeaderQuote, 1000);
    return () => window.clearInterval(timer);
  }, [chartStatus.symbol]);

  useEffect(() => {
    const refreshStatusAge = () => {
      const snapshot = chartStatusSnapshotRef.current;
      if (!snapshot) return;
      const next = chartStatusView(snapshot);
      setChartStatus((previous) => sameChartStatus(previous, next) ? previous : next);
    };
    const statusTimer = window.setInterval(refreshStatusAge, 3000);
    return () => window.clearInterval(statusTimer);
  }, []);

  useEffect(() => {
    const openBroker = () => setBrokerStatusOpen(true);
    const openProfile = () => workspaceRef.current?.togglePanel('tco.account', true);
    const togglePrimary = () => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.togglePanel('tco.bookmarks');
    };
    const toggleJournal = () => { workspaceRef.current?.togglePanel('tco.journal'); };
    window.addEventListener('tco:open-broker', openBroker);
    window.addEventListener('tco:open-profile-panel', openProfile);
    window.addEventListener('tco:toggle-primary-panel', togglePrimary);
    window.addEventListener('tco:toggle-journal-panel', toggleJournal);
    return () => {
      window.removeEventListener('tco:open-broker', openBroker);
      window.removeEventListener('tco:open-profile-panel', openProfile);
      window.removeEventListener('tco:toggle-primary-panel', togglePrimary);
      window.removeEventListener('tco:toggle-journal-panel', toggleJournal);
    };
  }, []);

  useEffect(() => {
    const perfTimer = window.setInterval(() => {
      const stats = workspaceRef.current?.getPerformanceStats?.() ?? [];
      const brokerId = tradingCoreRuntime.getPrimaryBrokerId();
      const activePipelineKeys = new Set<string>();
      if (brokerId) {
        for (const sample of stats) {
          if (!sample.symbol || !sample.timeframe) continue;
          const key = tcoVelaPerformanceKey(brokerId, sample.symbol, sample.timeframe);
          activePipelineKeys.add(key);
          chartPerformanceTelemetry.ingestRendererSnapshot(key, sample);
        }
      }
      if (typeof window !== 'undefined') {
        const memory = (window.performance as Performance & { memory?: {
          usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number;
        } }).memory;
        const usedHeapBytes = Number.isFinite(Number(memory?.usedJSHeapSize)) ? Number(memory?.usedJSHeapSize) : null;
        if (usedHeapBytes !== null) {
          browserRuntimeMetrics.heapSamples.push({ capturedAt: Date.now(), usedBytes: usedHeapBytes });
          if (browserRuntimeMetrics.heapSamples.length > 120) browserRuntimeMetrics.heapSamples.shift();
        }
        const heapFirst = browserRuntimeMetrics.heapSamples[0];
        const heapLast = browserRuntimeMetrics.heapSamples.at(-1);
        const heapWindowDeltaBytes = heapFirst && heapLast ? heapLast.usedBytes - heapFirst.usedBytes : null;
        const recentLongTasks = [...browserRuntimeMetrics.longTaskDurations].sort((a, b) => a - b);
        const longTaskP95Ms = recentLongTasks.length
          ? recentLongTasks[Math.min(recentLongTasks.length - 1, Math.ceil(recentLongTasks.length * 0.95) - 1)]!
          : 0;
        (window as Window & { __TCO_PERF__?: unknown }).__TCO_PERF__ = {
          capturedAt: Date.now(),
          cells: stats,
          // Only expose active Vela chart data planes; omit unrelated profiler and legacy keys.
          pipeline: [...activePipelineKeys].map(key => chartPerformanceTelemetry.snapshot(key)),
          sharedMemory: {
            crossOriginIsolated: Boolean(window.crossOriginIsolated),
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          },
          runtime: {
            longTasks: {
              count: browserRuntimeMetrics.longTaskCount,
              totalMs: browserRuntimeMetrics.totalLongTaskMs,
              worstMs: browserRuntimeMetrics.worstLongTaskMs,
              recentP95Ms: longTaskP95Ms,
              lastAt: browserRuntimeMetrics.lastLongTaskAt || null,
              recentSampleCount: recentLongTasks.length,
            },
            memory: {
              available: usedHeapBytes !== null,
              usedBytes: usedHeapBytes,
              totalBytes: Number.isFinite(Number(memory?.totalJSHeapSize)) ? Number(memory?.totalJSHeapSize) : null,
              limitBytes: Number.isFinite(Number(memory?.jsHeapSizeLimit)) ? Number(memory?.jsHeapSizeLimit) : null,
              sampleCount: browserRuntimeMetrics.heapSamples.length,
              sampleWindowMs: heapFirst && heapLast ? heapLast.capturedAt - heapFirst.capturedAt : 0,
              windowDeltaBytes: heapWindowDeltaBytes,
            },
            webgl: {
              contextLossCount: browserRuntimeMetrics.webglContextLossCount,
              contextRestoreCount: browserRuntimeMetrics.webglContextRestoreCount,
            },
          },
        };
      }
    }, 1000);
    let checkpointInFlight: Promise<void> | null = null;
    const checkpointWorkspace = () => {
      if (checkpointInFlight) return; // pagehide + visibilitychange may fire back-to-back
      publishWorkspaceAutosaveStatus('saving', 'Saving a full workspace checkpoint…');
      checkpointInFlight = (async () => {
        const current = workspaceRef.current;
        let workspaceSynced = !current;
        try {
          if (current) {
            await current.saveNow();
            workspaceSynced = true;
          }
        } catch {
          // The adapter has already written its device-local fallback before cloud sync.
          workspaceSynced = false;
        }
        const named = await persistActiveTcoVelaSavedWorkspace();
        if (named) {
          const cloudSynced = workspaceSynced && named.synced;
          const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          publishWorkspaceAutosaveStatus(
            cloudSynced ? 'saved' : 'local',
            cloudSynced
              ? `Full checkpoint saved at ${time} · charts, tickers, indicators, drawings and workspace settings are synced.`
              : `Full checkpoint saved on this device at ${time}; account sync will retry when available.`,
          );
          return;
        }
        // The main Vela document saves continuously; also checkpoint the separately stored
        // workspace appearance so it survives a browser restart and account sign-in.
        const appearanceSynced = await persistCurrentTcoVelaAppearance();
        const cloudSynced = workspaceSynced && appearanceSynced;
        const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        publishWorkspaceAutosaveStatus(
          cloudSynced ? 'saved' : 'local',
          cloudSynced
            ? `Full checkpoint saved at ${time} · charts, drawings, indicators and appearance are synced. Next checkpoint in 30 minutes.`
            : `Full checkpoint saved on this device at ${time}; account sync will retry when available.`,
        );
      })().catch(() => {
        publishWorkspaceAutosaveStatus('error', 'Autosave could not confirm cloud sync. Your last local workspace snapshot is retained.');
      }).finally(() => {
        checkpointInFlight = null;
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') checkpointWorkspace();
    };
    const checkpointTimer = window.setInterval(checkpointWorkspace, 30 * 60 * 1000);
    window.addEventListener('pagehide', checkpointWorkspace);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(perfTimer);
      window.clearInterval(checkpointTimer);
      window.removeEventListener('pagehide', checkpointWorkspace);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <Profiler id="tco-live-workspace" onRender={() => chartPerformanceTelemetry.recordReactCommit('workspace:live')}>
      <div className="tco-live-surface fixed inset-0 z-[100] overflow-hidden bg-[#050609] text-[#e5e7eb]">
        <header
          aria-label="TradingCoreOS workspace header"
          className="absolute inset-x-0 top-0 z-[130] flex h-9 items-center gap-2 border-b border-[#2a2b30] bg-[#151619] px-2 text-[12px] text-[#d1d4dc] shadow-[0_1px_0_rgba(0,0,0,.28)]"
        >
          <div className="flex h-full shrink-0 items-center gap-2 border-r border-[#2a2b30] pe-3">
            <img
              src="/tradingcoreos-logo.svg"
              alt=""
              aria-hidden="true"
              className="h-[21px] w-[21px] shrink-0 rounded-[5px] object-contain"
            />
            <span className="hidden font-semibold tracking-[-.015em] text-[#eceef3] sm:inline">TradingCoreOS</span>
            <span className="text-[#656a74]">/</span>
            <span className="font-semibold text-[#d6d9e0]">Vela</span>
          </div>

          <div
            className="flex h-full min-w-0 max-w-[min(46vw,560px)] flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Open chart tabs"
          >
            {velaAppTabs.map((tab) => {
              const ticker = tab.symbol.includes(':') ? tab.symbol.split(':').pop() || tab.symbol : tab.symbol;
              const selected = tab.id === activeVelaAppTabId;
              const initials = ticker.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'CH';
              const timeframeLabel = tab.timeframe === 'D' ? '1D' : tab.timeframe === 'W' ? '1W' : `${tab.timeframe}m`;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={`Activate ${tab.symbol} · ${timeframeLabel}`}
                  onClick={() => workspaceRef.current?.setActiveCell(tab.id)}
                  className={`group relative mt-1 flex h-8 max-w-56 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#7aa7ff] ${selected ? 'bg-[#202227] text-[#f0f2f7] shadow-[inset_0_-2px_0_#d5a24b]' : 'text-[#969ba6] hover:bg-white/[0.045] hover:text-[#e5e7eb]'}`}
                >
                  <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[7px] font-bold ${selected ? 'bg-[#343b4b] text-[#d8e1ff]' : 'bg-[#292c33] text-[#a8adba]'}`} aria-hidden="true">
                    {initials}
                  </span>
                  <span className="min-w-0 truncate font-medium">{ticker}</span>
                  <span className={`shrink-0 text-[10px] tabular-nums ${selected ? 'text-[#aeb4bf]' : 'text-[#777d88]'}`}>{timeframeLabel}</span>
                </button>
              );
            })}
            <button
              type="button"
              title="Search for a symbol on the active chart"
              aria-label="Search for a symbol on the active chart"
              onClick={() => workspaceRef.current?.context().openSymbolSearch()}
              className="ms-1 mt-1 grid size-7 shrink-0 place-items-center rounded-md text-[#949aa5] transition-colors hover:bg-white/[0.06] hover:text-[#f0f2f7] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#7aa7ff]"
            >
              <Plus size={14} strokeWidth={1.8}/>
            </button>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden px-2 lg:flex">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.07em] text-[#7d838e]">{headerExchange || 'Market'}</span>
            <span className="max-w-[145px] truncate font-medium text-[#c8cbd3]">{headerTicker}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#eceef3]">{headerPrice}</span>
            <span className={`shrink-0 font-medium tabular-nums ${headerChange === undefined ? 'text-[#858b96]' : headerQuotePositive ? 'text-[#22b896]' : 'text-[#f05b68]'}`}>
              {headerChangeLabel}
            </span>
            <span className={`shrink-0 text-[11px] tabular-nums ${headerChangePercent === undefined ? 'text-[#858b96]' : headerQuotePositive ? 'text-[#22b896]' : 'text-[#f05b68]'}`}>
              {headerChangePercentLabel}
            </span>
            <span className="mx-1 h-4 w-px shrink-0 bg-[#30333a]" aria-hidden="true"/>
            <span className={`shrink-0 rounded-[4px] px-1.5 py-[3px] text-[9px] font-bold tracking-[.06em] ${headerQuoteFresh && chartStatus.phase === 'live' ? 'bg-emerald-950/60 text-emerald-300' : 'bg-[#282a30] text-[#9ca2ad]'}`}>
              {headerQuoteFresh && chartStatus.phase === 'live' ? String(headerQuote?.source || 'LIVE').toUpperCase() : 'QUOTE'}
            </span>
          </div>

          <div className="ms-auto flex h-full shrink-0 items-center gap-2 border-s border-[#2a2b30] ps-2">
            <span
              className={`inline-flex h-[21px] items-center gap-1.5 rounded-[5px] border px-2 text-[9px] font-bold tracking-[.07em] ${chartStatus.phase === 'live' ? 'border-emerald-900/70 bg-emerald-950/45 text-emerald-300' : ['failed','auth','empty'].includes(chartStatus.phase) ? 'border-red-900/70 bg-red-950/35 text-red-300' : ['stale','reconnecting','reconciling','waiting-tick'].includes(chartStatus.phase) ? 'border-amber-900/70 bg-amber-950/30 text-amber-300' : 'border-[#3a3d45] bg-[#202227] text-[#a9afb9]'}`}
              title={chartStatus.detail}
            >
              <span className={`size-1.5 rounded-full ${chartStatus.phase === 'live' ? 'bg-emerald-400' : ['failed','auth','empty'].includes(chartStatus.phase) ? 'bg-red-400' : ['stale','reconnecting','reconciling','waiting-tick'].includes(chartStatus.phase) ? 'bg-amber-400' : 'bg-[#89909b]'}`} aria-hidden="true"/>
              {chartStatus.phase === 'live' ? 'LIVE' : ['failed','auth','empty'].includes(chartStatus.phase) ? 'OFFLINE' : ['stale','reconnecting','reconciling','waiting-tick'].includes(chartStatus.phase) ? 'DELAYED' : 'HISTORY'}
            </span>
            <button
              type="button"
              title="Account and broker settings"
              aria-label="Open account and broker settings"
              onClick={() => workspaceRef.current?.togglePanel('tco.account', true)}
              className="grid size-7 shrink-0 place-items-center rounded-full text-[#aeb3bd] transition-colors hover:bg-white/[.07] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#7aa7ff]"
            >
              <UserRound size={15} strokeWidth={1.7}/>
            </button>
          </div>
        </header>


        <div
          ref={host}
          className="absolute inset-x-0 bottom-[27px] top-9"
          aria-label="TradingCoreOS Vela live trading chart"
        />
        <footer className="absolute inset-x-0 bottom-0 z-[130] flex h-[27px] items-center justify-between border-t border-[#292b31] bg-[#111215] px-3 text-[10px] text-[#8e939d]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden font-semibold tracking-[.08em] text-[#b5bac4] sm:inline">RANGE</span>
            <span className="hidden text-[#555b65] sm:inline">/</span>
            <div className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Chart visible-range presets">
              {(['1D','1W','1M','3M','6M','YTD','1Y','ALL'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={`Frame chart to ${preset}`}
                  onClick={() => {
                    try { workspaceRef.current?.chart.setVisibleRangePreset(preset); } catch { /* chart may still be mounting */ }
                  }}
                  className="rounded px-1.5 py-1 text-[#8e939d] transition-colors hover:bg-[#252830] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#8b7cff]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-2">
            <span className="hidden text-[#686e79] md:inline">CHART RANGE</span>
            <span className="h-1 w-1 rounded-full bg-[#515762]" aria-hidden="true"/>
            <span className="font-medium text-[#aeb4bf]">TRADINGCOREOS</span>
          </div>
        </footer>
        {workspaceLoadState.phase !== 'ready' && (
          <div
            className="absolute inset-0 z-[110] flex items-center justify-center bg-[#050609] px-6"
            role={workspaceLoadState.phase === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="w-full max-w-md rounded-xl border border-[#202633] bg-[#0a0d13] p-6 text-[#e5e7eb] shadow-2xl">
              {workspaceLoadState.phase === 'error' ? (
                <>
                  <div className="text-[10px] font-mono uppercase tracking-[.2em] text-[#f87171]">Chart engine unavailable</div>
                  <h2 className="mt-2 text-base font-semibold">The Vela workspace could not be loaded.</h2>
                  <p className="mt-2 break-words text-xs leading-5 text-[#9ca3af]">{workspaceLoadState.message}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceLoadState({ phase: 'loading' });
                      setWorkspaceMountAttempt((attempt) => attempt + 1);
                    }}
                    className="mt-5 rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563eb]"
                  >
                    Retry chart loading
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b82f6]/30 border-t-[#3b82f6]" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold">Loading chart engine</div>
                      <div className="mt-1 text-[10px] font-mono text-[#9ca3af]">Loading Vela workspace capabilities</div>
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[#9ca3af]">
                    Preparing the chart workspace. Live history requests begin as soon as the chart mounts.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        {workspaceLoadState.phase === 'ready'
          && (chartStatus.tone === 'warn' || chartStatus.tone === 'error')
          && dismissedChartStatusKey !== chartStatusDismissKey
          && (
          <div
            className={`pointer-events-auto absolute left-[56px] top-[58px] z-[105] max-w-[min(430px,calc(100vw-72px))] rounded-lg border px-3 py-2 pr-8 shadow-lg backdrop-blur-md ${
              chartStatus.tone === 'error'
                  ? 'border-red-800/70 bg-[#240b0d]/95 text-red-200'
                  : chartStatus.tone === 'warn'
                    ? 'border-amber-800/70 bg-[#211708]/95 text-amber-100'
                    : 'border-[#2b3443] bg-[#090d14]/90 text-slate-200'
            }`}
            role={chartStatus.tone === 'error' ? 'alert' : 'status'}
            aria-live={chartStatus.tone === 'error' ? 'assertive' : 'polite'}
            aria-label={`Chart data status: ${chartStatus.title}`}
          >
            <button
              type="button"
              title="Dismiss notification"
              aria-label="Dismiss chart status notification"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setDismissedChartStatusKey(chartStatusDismissKey);
                try { localStorage.setItem('tradingcore:chart-status-dismissed:v1', chartStatusDismissKey); } catch {}
              }}
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded text-current/70 transition-colors hover:bg-white/10 hover:text-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
            >
              <X size={12} aria-hidden="true" />
            </button>
            <div className="relative flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                chartStatus.tone === 'error' ? 'bg-red-400'
                    : chartStatus.tone === 'warn' ? 'bg-amber-400'
                      : 'bg-sky-400'
              }`} aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold leading-4">{chartStatus.title}</div>
                <div className="mt-0.5 break-words text-[9px] leading-4 opacity-80">{chartStatus.detail}</div>
              </div>
              {(chartStatus.phase === 'auth') ? (
                <button
                  type="button"
                  onClick={() => setBrokerStatusOpen(true)}
                  className="ml-1 shrink-0 rounded border border-current/30 px-2 py-1 text-[9px] font-semibold hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  Connect
                </button>
              ) : (chartStatus.phase === 'failed' || chartStatus.phase === 'empty') ? (
                <button
                  type="button"
                  onClick={() => {
                    const retry = retryChartHistoryRef.current;
                    if (!retry) return;
                    const next = { ...chartStatus, phase: 'loading-history' as const, tone: 'neutral' as const, title: 'Retrying historical data', detail: `${chartStatus.symbol} · ${chartStatus.timeframe} · requesting history again.` };
                    setChartStatus(next);
                    void retry().catch((error: unknown) => {
                      const message = error instanceof Error ? error.message : String(error || 'Unknown history error');
                      setChartStatus({
                        phase: /no historical candles|no historical data|returned no history/i.test(message) ? 'empty' : 'failed',
                        tone: /no historical candles|no historical data|returned no history/i.test(message) ? 'warn' : 'error',
                        title: /no historical candles|no historical data|returned no history/i.test(message) ? 'No historical data available' : 'Historical data request failed',
                        detail: `${chartStatus.symbol} · ${chartStatus.timeframe} · ${message}`,
                        symbol: chartStatus.symbol,
                        timeframe: chartStatus.timeframe,
                      });
                    });
                  }}
                  className="ml-1 shrink-0 rounded border border-current/30 px-2 py-1 text-[9px] font-semibold hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        )}
        <TerminalIndicatorLibraryHost />
        <FyersConnectionPrompt floating onConnect={() => setBrokerStatusOpen(true)} />
        {brokerStatusOpen && (
          <BrokerSettingsModal
            isOpen={brokerStatusOpen}
            onClose={() => setBrokerStatusOpen(false)}
          />
        )}
      </div>
    </Profiler>
  );
}

export default LiveTradingWorkspace;
