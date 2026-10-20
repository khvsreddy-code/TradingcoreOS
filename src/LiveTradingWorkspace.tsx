import { Profiler, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { loadVelaWorkspace } from './services/core/chart/velaWorkspaceLoader';
import { createTcoVelaDataProvider, prewarmTcoVelaHistory, subscribeTcoVelaChartStatus, tcoVelaPerformanceKey, type TcoVelaChartStatusSnapshot } from './TcoVelaDataProvider';
import { LazyCoreSpiritVelaEngine } from './services/coreSpirit/coreSpiritVelaEngineLoader';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import { applySavedTcoVelaAppearance, persistActiveTcoVelaSavedWorkspace, persistCurrentTcoVelaAppearance } from './services/core/chart/tcoVelaChrome';
import './services/core/chart/tcoVelaNativeExtensions';
import { createTcoVelaSupabaseStorage, loadTcoVelaActiveWorkspaceId, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';
import { createTcoVelaTerminalOptions } from './services/core/chart/tcoVelaTerminal';

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
  if (!snapshot.brokerConnected) {
    return { phase: 'auth', tone: 'warn', title: 'Waiting for broker authentication', detail: 'Connect or restore your FYERS session to request history and live quotes.', symbol: instrument, timeframe };
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

function readCoreSpiritManifest() {
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
  const host = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<VelaWorkspaceInstance | null>(null);
  const [brokerStatusOpen, setBrokerStatusOpen] = useState(false);
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
    const browserRuntimeMetrics = {
      longTaskCount: 0,
      totalLongTaskMs: 0,
      worstLongTaskMs: 0,
      lastLongTaskAt: 0,
      longTaskDurations: [] as number[],
      webglContextLossCount: 0,
      webglContextRestoreCount: 0,
      heapSamples: [] as Array<{ capturedAt: number; usedBytes: number }>,
    };
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
      const queryLayout = new URLSearchParams(window.location.search).get('velaLayout') || '';
      const initialLayout = ['1','4','8'].includes(queryLayout) ? queryLayout : (defaults.layout || '1');

      workspace = new VelaWorkspaceClass(host.current, createTcoVelaTerminalOptions({
        layout: initialLayout,
        symbol: 'NSE:NIFTY50-INDEX',
        timeframe: defaults.timeframe || '5',
        storage: createTcoVelaSupabaseStorage(() => tradingCoreRuntime.getPrimaryBrokerId() ?? 'fyers'),
        createDataProvider: createTcoVelaDataProvider,
        createCoreSpiritEngine: () => new LazyCoreSpiritVelaEngine(),
        resolveIndicatorManifest: readCoreSpiritManifest,
      }));
      workspaceRef.current = workspace;

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
          activeHistorySymbols.length ? activeHistorySymbols : ['NSE:NIFTY50-INDEX'],
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
      <div className="tco-live-surface fixed inset-0 z-[100] bg-[#050609]">
        <div
          ref={host}
          className="absolute inset-0"
          aria-label="TradingCoreOS Vela live trading chart"
        />
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
        {workspaceLoadState.phase === 'ready' && dismissedChartStatusKey !== chartStatusDismissKey && (
          <div
            className={`pointer-events-auto absolute left-[56px] top-[58px] z-[105] max-w-[min(430px,calc(100vw-72px))] rounded-lg border px-3 py-2 pr-8 shadow-lg backdrop-blur-md ${
              chartStatus.tone === 'good'
                ? 'border-emerald-800/70 bg-[#041b13]/90 text-emerald-200'
                : chartStatus.tone === 'error'
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
                chartStatus.tone === 'good' ? 'bg-emerald-400'
                  : chartStatus.tone === 'error' ? 'bg-red-400'
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
