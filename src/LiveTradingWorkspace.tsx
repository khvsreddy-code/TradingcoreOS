import { Profiler, useEffect, useRef, useState } from 'react';
import { loadVelaWorkspace } from './services/core/chart/velaWorkspaceLoader';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider';
import { LazyCoreSpiritVelaEngine } from './services/coreSpirit/coreSpiritVelaEngineLoader';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import './services/core/chart/tcoVelaChrome';
import './services/core/chart/tcoVelaNativeExtensions';
import { createTcoVelaSupabaseStorage, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';
import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry';

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
      const brokerReady = tradingCoreRuntime.hasConnectedBroker()
        ? Promise.resolve()
        : tradingCoreRuntime.restoreBrokerConnections().catch(() => undefined);
      const defaultsPromise = loadTcoVelaDefaults();
      await Promise.all([brokerReady, defaultsPromise]);
      const [defaults, VelaWorkspaceClass] = await Promise.all([defaultsPromise, loadVelaWorkspace()]);
      if (cancelled || !host.current) return;
      const queryLayout = new URLSearchParams(window.location.search).get('velaLayout') || '';
      const initialLayout = ['1','4','8'].includes(queryLayout) ? queryLayout : (defaults.layout || '4');

      workspace = new VelaWorkspaceClass(host.current, {
        layout: initialLayout,
        symbol: 'NSE:NIFTY50-INDEX',
        timeframe: defaults.timeframe || '5',
        bars: 5000,
        timeframes: ['1', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
        live: true,
        theme: {
          background: '#07080c',
          textColor: '#9aa1b2',
          gridColor: '#171b27',
          borderColor: '#252a35',
          upColor: '#46d89a',
          downColor: '#ef6b7a',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        },
        // Live trading stays motion-light: the market feed is the animation.
        animations: false,
        defaultLanguage: 'corespirit',
        providers: {
          tco: () => createTcoVelaDataProvider(),
        },
        engines: {
          corespirit: () => new LazyCoreSpiritVelaEngine(),
        },
        indicators: async () => readCoreSpiritManifest(),
        drawings: true,
        drawingToolbar: true,
        indicatorPicker: true,
        topbar: {
          left: ['tco.brand', 'symbol', 'timeframes', 'style', 'layout', 'indicators'],
          right: ['tco.watchlist', 'tco.journal', 'tco.replay', 'tco.positions', 'tco.risk', 'tco.orderbook', 'tco.options', 'alerts', 'panels', 'tco.profile', 'tco.broker-connection', 'screenshot'],
        },
        // Vela owns workspace synchronization. Keep symbols/timeframes independent for
        // focused multi-chart analysis, but synchronize cursor and visual style across cells.
        sync: { symbol: false, timeframe: false, crosshair: true, style: true, drawings: false },
        volume: true,
        watermark: true,
        statusline: true,
        bottombar: true,
        autofocus: false,
        persist: VELA_STATE_KEY,
        storage: createTcoVelaSupabaseStorage(() => tradingCoreRuntime.getPrimaryBrokerId() ?? 'fyers'),
        maxWebglCells: 8,
        alertCap: 100,
        cells: {
          primary: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
          bank: { symbol: 'NSE:NIFTYBANK-INDEX', timeframe: '5' },
          sensex: { symbol: 'BSE:SENSEX-INDEX', timeframe: '5' },
          finnifty: { symbol: 'NSE:FINNIFTY-INDEX', timeframe: '5' },
          midcap: { symbol: 'NSE:MIDCPNIFTY-INDEX', timeframe: '5' },
          nifty1m: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '1' },
          nifty15m: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '15' },
          nifty60m: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '60' },
        },
      });
      workspaceRef.current = workspace;
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
      for (const sample of stats) {
        chartPerformanceTelemetry.ingestRendererSnapshot(`vela:${sample.cellId}`, sample);
      }
      if (typeof window !== 'undefined') {
        (window as Window & { __TCO_PERF__?: unknown }).__TCO_PERF__ = {
          capturedAt: Date.now(),
          cells: stats,
          pipeline: chartPerformanceTelemetry.keys().map(key => chartPerformanceTelemetry.snapshot(key)),
          sharedMemory: {
            crossOriginIsolated: typeof window !== 'undefined' ? Boolean(window.crossOriginIsolated) : false,
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
    <div
      ref={host}
      className="tco-live-surface fixed inset-0 z-[100] bg-[#050609]"
      aria-label="TradingCoreOS Vela live trading chart"
    >
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
