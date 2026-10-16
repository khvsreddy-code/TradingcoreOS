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
        prewarmTcoVelaHistory(
          ['NSE:NIFTY50-INDEX'],
          defaults.timeframe || '5',
          500,
        );
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
