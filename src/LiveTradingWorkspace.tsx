import { useEffect, useRef } from 'react';
import { VelaWorkspace } from './vendor/vela/src/workspace';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine';

const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela';

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

  useEffect(() => {
    if (!host.current) return;

    const workspace = new VelaWorkspace(host.current, {
      layout: false,
      symbol: 'NIFTY50-INDEX',
      timeframe: '5',
      timeframes: ['1', '3', '5', '10', '15'],
      live: true,
      theme: 'dark',
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
      volume: true,
      watermark: true,
      statusline: true,
      bottombar: true,
      autofocus: false,
      persist: VELA_STATE_KEY,
      maxWebglCells: 1,
    });

    return () => {
      workspace.destroy();
    };
  }, []);

  return <div ref={host} className="fixed inset-0 z-[100] bg-[#050609]" aria-label="TradingCoreOS Vela live trading chart" />;
}

export default LiveTradingWorkspace;
