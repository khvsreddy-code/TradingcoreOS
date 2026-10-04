import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { VelaWorkspace } from './services/core/chart/velaChartFacade';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import './services/core/chart/tcoVelaChrome';
import { createTcoVelaSupabaseStorage, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';

const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela-fyers-v3-multichart';

type IndicatorWheelItem = {
  type: string;
  title: string;
  supported: boolean;
  present: boolean;
  multiInstance?: boolean;
};


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
  const workspaceRef = useRef<VelaWorkspace | null>(null);
  const [brokerStatusOpen, setBrokerStatusOpen] = useState(false);
  const [indicatorWheelOpen, setIndicatorWheelOpen] = useState(false);
  const [indicatorWheelItems, setIndicatorWheelItems] = useState<IndicatorWheelItem[]>([]);
  const [indicatorWheelIndex, setIndicatorWheelIndex] = useState(0);
  const indicatorWheelCancelled = useRef(false);

  useEffect(() => {
    if (!host.current) return;

    let workspace: VelaWorkspace | null = null;
    const workspaceListenerDisposers: Array<() => void> = [];
    let cancelled = false;

    const mount = async () => {
      const brokerReady = tradingCoreRuntime.hasConnectedBroker()
        ? Promise.resolve()
        : tradingCoreRuntime.restoreBrokerConnections().catch(() => undefined);
      const defaultsPromise = loadTcoVelaDefaults();
      await Promise.all([brokerReady, defaultsPromise]);
      const defaults = await defaultsPromise;
      if (cancelled || !host.current) return;

      workspace = new VelaWorkspace(host.current, {
        layout: defaults.layout || '4',
        symbol: 'NSE:NIFTY50-INDEX',
        timeframe: defaults.timeframe || '5',
        bars: 5000,
        timeframes: ['1', '3', '5', '10', '15'],
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
        animations: {
          zoom: 280,
          pan: 340,
          scroll: 400,
          autoscale: 300,
          liveBar: 180,
          intro: { style: 'grow', duration: 1200 },
        },
        defaultLanguage: 'corespirit',
        providers: {
          tco: () => createTcoVelaDataProvider(),
        },
        engines: {
          corespirit: () => new CoreSpiritVelaEngine(),
        },
        indicators: async () => readCoreSpiritManifest(),
        drawings: true,
        drawingToolbar: true,
        indicatorPicker: true,
        sync: { symbol: false, timeframe: false, crosshair: true, style: false, drawings: false },
        volume: true,
        watermark: true,
        statusline: true,
        bottombar: true,
        autofocus: false,
        persist: VELA_STATE_KEY,
        storage: createTcoVelaSupabaseStorage('fyers'),
        maxWebglCells: 8,
        cells: {
          primary: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
          bank: { symbol: 'NSE:NIFTYBANK-INDEX', timeframe: '5' },
          sensex: { symbol: 'BSE:SENSEX-INDEX', timeframe: '5' },
          finnifty: { symbol: 'NSE:FINNIFTY-INDEX', timeframe: '5' },
        },
      });
      workspaceRef.current = workspace;
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
    window.addEventListener('tco:open-broker', openBroker);
    window.addEventListener('tco:open-profile-panel', openProfile);
    window.addEventListener('tco:toggle-primary-panel', togglePrimary);
    return () => {
      window.removeEventListener('tco:open-broker', openBroker);
      window.removeEventListener('tco:open-profile-panel', openProfile);
      window.removeEventListener('tco:toggle-primary-panel', togglePrimary);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      workspaceRef.current?.saveNow();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      const element = target instanceof HTMLElement ? target : null;
      return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
    };
    const openWheel = () => {
      const chart = workspaceRef.current?.chart;
      if (!chart) return;
      indicatorWheelCancelled.current = false;
      setIndicatorWheelOpen(true);
      void chart.availableNativeIndicators().then((entries) => {
        const supported = entries
          .filter((entry) => entry.supported)
          .sort((a, b) => Number(a.present) - Number(b.present) || a.title.localeCompare(b.title))
          .slice(0, 8)
          .map((entry) => ({ type: entry.type, title: entry.title, supported: entry.supported, present: entry.present, multiInstance: entry.multiInstance }));
        setIndicatorWheelItems(supported);
        setIndicatorWheelIndex((index) => Math.min(index, Math.max(0, supported.length - 1)));
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && !event.repeat && !isEditable(event.target)) {
        event.preventDefault();
        openWheel();
        return;
      }
      if (event.key === 'Escape' && indicatorWheelOpen) {
        event.preventDefault();
        indicatorWheelCancelled.current = true;
        setIndicatorWheelOpen(false);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || !indicatorWheelOpen) return;
      event.preventDefault();
      const item = indicatorWheelItems[indicatorWheelIndex];
      const cancelled = indicatorWheelCancelled.current;
      indicatorWheelCancelled.current = false;
      setIndicatorWheelOpen(false);
      if (!cancelled && item) {
        try {
          workspaceRef.current?.chart.addNativeIndicator(item.type);
        } catch (error) {
          workspaceRef.current?.toast(error instanceof Error ? error.message : 'Unable to add indicator', 'error', 3500);
        }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!indicatorWheelOpen || indicatorWheelItems.length === 0) return;
      const dx = event.clientX - window.innerWidth / 2;
      const dy = event.clientY - window.innerHeight / 2;
      if ((dx * dx + dy * dy) < 52 * 52) return;
      const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      setIndicatorWheelIndex(Math.min(indicatorWheelItems.length - 1, Math.floor(angle / (Math.PI * 2 / indicatorWheelItems.length))));
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointermove', onPointerMove, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointermove', onPointerMove, true);
    };
  }, [indicatorWheelOpen, indicatorWheelItems, indicatorWheelIndex]);


  return (
    <div
      ref={host}
      className="fixed inset-0 z-[100] bg-[#050609]"
      aria-label="TradingCoreOS Vela live trading chart"
    >
      {indicatorWheelOpen && indicatorWheelItems.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[500] flex items-center justify-center" aria-label="Quick indicator wheel">
          <div className="relative h-[300px] w-[300px] rounded-full border border-violet-400/30 bg-[#070a10]/92 shadow-[0_0_90px_rgba(124,92,255,0.16)] backdrop-blur-xl">
            {indicatorWheelItems.map((item, index) => {
              const angle = index * (360 / indicatorWheelItems.length);
              const rad = (angle - 90) * Math.PI / 180;
              const x = 50 + Math.cos(rad) * 37;
              const y = 50 + Math.sin(rad) * 37;
              const selected = indicatorWheelIndex === index;
              return (
                <div
                  key={item.type}
                  className={`absolute w-24 -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-2 text-center font-mono text-[9px] font-bold uppercase tracking-wide ${selected ? 'border-violet-300/80 bg-violet-500/20 text-violet-100 shadow-[0_0_24px_rgba(124,92,255,0.25)]' : 'border-white/10 bg-black/65 text-slate-400'}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  {item.title}
                </div>
              );
            })}
            <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/10 bg-black/80 text-center">
              <Activity className="mb-1 h-4 w-4 text-violet-400" />
              <span className="text-[8px] font-mono font-bold tracking-[0.2em] text-slate-200">ALT</span>
              <span className="mt-0.5 text-[7px] font-mono uppercase tracking-wider text-slate-500">Indicator wheel</span>
            </div>
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
  );
}

export default LiveTradingWorkspace;
