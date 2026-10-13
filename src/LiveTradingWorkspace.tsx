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

function timestampMs(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
    const numeric = Number(value);
    const milliseconds = numeric > 1e12 ? numeric : numeric * 1000;
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isIndianCashSession(timestamp: number): boolean {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = get('weekday');
  if (day === 'Sat' || day === 'Sun') return false;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  return Number.isFinite(minute) && minute >= 9 * 60 + 15 && minute < 15 * 60 + 30;
}

/** Only show Vela's bar-close countdown when a recent exchange timestamp confirms a live NSE/BSE session. */
function shouldShowExchangeCountdown(symbol: string, now = Date.now()): boolean {
  if (!/^(NSE|BSE):/i.test(String(symbol || '')) || !isIndianCashSession(now)) return false;
  const tick = tradingCoreRuntime.getMarketSnapshot(symbol);
  if (!tick) return false;
  const received = timestampMs(tick.receivedAtEpoch ?? tick.receivedAt);
  const exchangeTimes = [timestampMs(tick.lastTradeTimestamp), timestampMs(tick.brokerTimestamp)]
    .filter((value): value is number => value !== undefined && value <= now + 60_000);
  if (received == null || !exchangeTimes.length) return false;
  const exchangeTime = Math.max(...exchangeTimes);
  return now - received >= -1_000 && now - received < 4_000
    && now - exchangeTime >= -60_000 && now - exchangeTime < 120_000
    && isIndianCashSession(exchangeTime);
}

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
    let chartFeatureTimer: number | undefined;
    const configuredCharts = new WeakSet<object>();
    const countdownState = new WeakMap<object, boolean>();
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
      const initialLayout = ['1','4','8'].includes(queryLayout) ? queryLayout : (defaults.layout || '4');

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
          300,
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
      const configureNativeChartFeatures = () => {
        for (const cell of workspace?.cells() ?? []) {
          const chart = cell.chart;
          void chart.ready().then(() => {
            if (cancelled || !workspace || !chart.renderer) return;
            const renderer = chart.renderer;
            if (!configuredCharts.has(chart as object)) {
              // Upgrade the old UTC default once. After initial migration, the
              // native Vela settings dialog owns the user's timezone preference.
              const timezone = renderer.readFeature('timezone');
              if (!timezone || timezone === 'UTC' || timezone === 'Etc/UTC') {
                renderer.applyFeature('timezone', 'Asia/Kolkata');
              }
              // This is Vela's native in-plot settings gear/dialog, not a TCO duplicate.
              renderer.applyFeature('settings', true);
              configuredCharts.add(chart as object);
            }
            const countdown = shouldShowExchangeCountdown(cell.chart.market.symbol);
            if (countdownState.get(chart as object) !== countdown) {
              renderer.applyFeature('countdown', countdown);
              countdownState.set(chart as object, countdown);
            }
          }).catch(() => undefined);
        }
      };
      const bindActiveChart = () => configureNativeChartFeatures();
      workspaceListenerDisposers.push(
        workspace.on('cell:active', bindActiveChart),
        workspace.on('layout:changed', bindActiveChart),
      );
      bindActiveChart();
      chartFeatureTimer = window.setInterval(configureNativeChartFeatures, 15_000);
      workspaceRef.current = workspace;
    };

    void mount();

    return () => {
      cancelled = true;
      if (chartFeatureTimer !== undefined) window.clearInterval(chartFeatureTimer);
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
