import { Profiler, useEffect, useRef, useState } from 'react';
import { loadVelaWorkspace } from './services/core/chart/velaWorkspaceLoader';
import { createTcoVelaDataProvider, prewarmTcoVelaHistory, tcoVelaPerformanceKey } from './TcoVelaDataProvider';
import { LazyCoreSpiritVelaEngine } from './services/coreSpirit/coreSpiritVelaEngineLoader';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import './services/core/chart/tcoVelaChrome';
import './services/core/chart/tcoVelaNativeExtensions';
import { createTcoVelaSupabaseStorage, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';
import { createTcoVelaTerminalOptions } from './services/core/chart/tcoVelaTerminal';
import { CoreSpiritLiveEditor } from './components/workspace/CoreSpiritLiveEditor';

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
  const [coreSpiritEditorOpen, setCoreSpiritEditorOpen] = useState(false);
  useEffect(() => {
    if (!host.current) return;

    let workspace: VelaWorkspaceInstance | null = null;
    const workspaceListenerDisposers: Array<() => void> = [];
    let cancelled = false;
    const browserErrors: Array<{ type: 'error' | 'unhandledrejection'; message: string; time: number }> = [];
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
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    (window as Window & { __TCO_VELA_ERRORS__?: unknown }).__TCO_VELA_ERRORS__ = [];

    const mount = async () => {
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

      // Warm common index history in the background once the broker is ready.
      // The workspace itself is already mounted, and its own getBars call is
      // allowed to drive first-candle loading concurrently.
      void brokerReady.then(() => {
        if (cancelled) return;
        // Keep speculative history off the user's critical path. The active chart's
        // initial request has priority; warm only the default symbol/timeframe, and let
        // rapid symbol/timeframe switches reuse the shared per-key single-flight cache.
        const activeSymbol = 'NSE:NIFTY50-INDEX';
        const activeTimeframe = defaults.timeframe || '5';
        prewarmTcoVelaHistory([activeSymbol], activeTimeframe, 300);
        // Warm the most common adjacent intraday intervals in the low-priority history
        // queue. Timeframe changes can paint from the shared cache instead of waiting
        // for a cold FYERS history round trip; these never block the active chart.
        for (const timeframe of ['1', '3', '15']) {
          if (timeframe !== activeTimeframe) prewarmTcoVelaHistory([activeSymbol], timeframe, 250);
        }
      });

      if (typeof window !== 'undefined') {
        (window as Window & { __TCO_VELA__?: unknown }).__TCO_VELA__ = {
          workspace,
          getPerformanceStats: () => workspace?.getPerformanceStats?.() ?? [],
          setLayout: (layout: string) => workspace?.setLayout(layout),
          saveNow: () => workspace?.saveNow(),
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
      }
      const bindActiveChart = () => undefined;
      workspaceListenerDisposers.push(
        workspace.on('cell:active', bindActiveChart),
        workspace.on('layout:changed', bindActiveChart),
      );
      bindActiveChart();
      workspaceRef.current = workspace;
    };

    void mount();

    return () => {
      cancelled = true;
      workspaceRef.current = null;
      for (const dispose of workspaceListenerDisposers) dispose();
      workspaceListenerDisposers.length = 0;
      workspace?.destroy();
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (typeof window !== 'undefined') {
        const exposed = (window as Window & { __TCO_VELA__?: { workspace?: unknown } }).__TCO_VELA__;
        if (exposed?.workspace === workspace) delete (window as Window & { __TCO_VELA__?: unknown }).__TCO_VELA__;
        delete (window as Window & { __TCO_VELA_ERRORS__?: unknown }).__TCO_VELA_ERRORS__;
      }
    };
  }, []);


  useEffect(() => {
    const openEditor = () => setCoreSpiritEditorOpen(true);
    window.addEventListener('tco:open-corespirit-editor', openEditor);
    return () => window.removeEventListener('tco:open-corespirit-editor', openEditor);
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
        (window as Window & { __TCO_PERF__?: unknown }).__TCO_PERF__ = {
          capturedAt: Date.now(),
          cells: stats,
          // Only expose active Vela chart data planes; omit unrelated profiler and legacy keys.
          pipeline: [...activePipelineKeys].map(key => chartPerformanceTelemetry.snapshot(key)),
          sharedMemory: {
            crossOriginIsolated: Boolean(window.crossOriginIsolated),
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          },
        };
      }
    }, 1000);
    const timer = window.setInterval(() => {
      workspaceRef.current?.saveNow();
    }, 15 * 60 * 1000);
    return () => { window.clearInterval(perfTimer); window.clearInterval(timer); };
  }, []);

  return (
    <Profiler id="tco-live-workspace" onRender={() => chartPerformanceTelemetry.recordReactCommit('workspace:live')}>
    <>
      <div
        ref={host}
        className="tco-live-surface fixed inset-0 z-[100] bg-[#050609]"
        aria-label="TradingCoreOS live trading chart"
      >
        {brokerStatusOpen && (
          <BrokerSettingsModal
            isOpen={brokerStatusOpen}
            onClose={() => setBrokerStatusOpen(false)}
          />
        )}
      </div>
      {coreSpiritEditorOpen && (
        <CoreSpiritLiveEditor
          onClose={() => setCoreSpiritEditorOpen(false)}
          getActiveChart={() => (workspaceRef.current as any)?.active?.chart ?? null}
          getMarket={() => {
            const market = (workspaceRef.current as any)?.active?.chart?.market;
            return {
              symbol: String(market?.symbol ?? 'NSE:NIFTY50-INDEX'),
              timeframe: String(market?.timeframe ?? '5'),
            };
          }}
        />
      )}
    </>
    </Profiler>
  );
}

export default LiveTradingWorkspace;
