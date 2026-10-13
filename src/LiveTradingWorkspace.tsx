import { Profiler, useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Settings2, Sparkles } from 'lucide-react';
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

function readBrokerBadge(): { label: string; connected: boolean } {
  const info = tradingCoreRuntime.getPrimaryBrokerInfo();
  return {
    label: info?.brokerId ? String(info.brokerId).toUpperCase() : "BROKER",
    connected: info?.status === "Connected",
  };
}

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
  const [brokerBadge, setBrokerBadge] = useState(() => readBrokerBadge());
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
      const brokerId = tradingCoreRuntime.getPrimaryBrokerId();
      const nextBrokerBadge = readBrokerBadge();
      setBrokerBadge(previous => previous.label === nextBrokerBadge.label && previous.connected === nextBrokerBadge.connected ? previous : nextBrokerBadge);
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
      <div className="tco-live-shell fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#141518] text-[#d1d4dc]" aria-label="TradingCoreOS live trading terminal">
        <header className="relative z-[120] flex h-[42px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#1b1d24] px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-md border border-[#6a5e89]/40 bg-[#282432] text-[#d7c7ff]">
              <Activity size={16} strokeWidth={2.2} />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] font-semibold tracking-[-0.02em] text-[#f3f4f6]">TradingCoreOS</span>
              <span className="rounded border border-[#089981]/25 bg-[#089981]/10 px-1.5 py-[3px] font-mono text-[8px] font-bold tracking-[0.12em] text-[#50c6a7]">LIVE</span>
            </div>
            <span className="mx-1 hidden h-5 w-px bg-white/[0.09] sm:block" />
            <span className="hidden items-center gap-1.5 rounded-md border border-[#8571c4]/25 bg-[#8571c4]/[0.08] px-2 py-1 text-[10px] font-medium text-[#c9baff] sm:inline-flex">
              <Sparkles size={12} />
              Quant
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-[8px] tracking-[0.12em] text-[#687080] lg:inline">MARKET WORKSPACE</span>
            <button
              type="button"
              onClick={() => setBrokerStatusOpen(true)}
              title={brokerBadge.connected ? "Manage broker connection" : "Connect a broker"}
              aria-label={brokerBadge.connected ? "Manage broker connection" : "Connect a broker"}
              className="inline-flex h-[28px] max-w-[185px] items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-2.5 text-[10px] text-[#c4cad5] transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
            >
              <span className={brokerBadge.connected ? "h-1.5 w-1.5 shrink-0 rounded-full bg-[#30c59a] shadow-[0_0_9px_rgba(48,197,154,.45)]" : "h-1.5 w-1.5 shrink-0 rounded-full bg-[#e4a34d]"} />
              <span className="truncate">{brokerBadge.connected ? brokerBadge.label : "Connect broker"}</span>
              <ChevronDown size={12} className="shrink-0 text-[#778093]" />
            </button>
            <button
              type="button"
              title="Broker settings"
              aria-label="Broker settings"
              onClick={() => setBrokerStatusOpen(true)}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-md border border-transparent text-[#8d95a5] transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white"
            >
              <Settings2 size={15} />
            </button>
          </div>
        </header>
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[#141518]">
          <div
            ref={host}
            className="tco-live-surface absolute inset-0 bg-[#141518]"
            aria-label="TradingCoreOS Vela live trading chart"
          />
          {brokerStatusOpen && (
            <BrokerSettingsModal
              isOpen={brokerStatusOpen}
              onClose={() => setBrokerStatusOpen(false)}
            />
          )}
        </main>
      </div>
    </Profiler>
  );
}

export default LiveTradingWorkspace;
