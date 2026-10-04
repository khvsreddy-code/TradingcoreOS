import { useEffect, useRef, useState } from 'react';
import { VelaWorkspace } from './services/core/chart/velaChartFacade';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import './services/core/chart/tcoVelaChrome';
import { createTcoVelaSupabaseStorage, loadTcoVelaDefaults } from './services/core/chart/tcoVelaSupabaseStorage';

const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela-fyers-v3-multichart';

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

  return (
    <div
      ref={host}
      className="fixed inset-0 z-[100] bg-[#050609]"
      aria-label="TradingCoreOS Vela live trading chart"
    >
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
