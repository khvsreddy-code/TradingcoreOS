import { useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, Eye, EyeOff, Radio, Star, Wifi, X } from 'lucide-react';
import { VelaWorkspace } from './services/core/chart/velaChartFacade';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine';
import { BrokerSettingsModal } from './components/brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { MarketFeedEvent } from './types/market';

const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela-fyers-v2';

const WATCHLIST = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
] as const;

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

function quoteFor(quotes: Record<string, number>, symbol: string): number | null {
  const value = quotes[symbol];
  return Number.isFinite(value) ? value : null;
}

export function LiveTradingWorkspace() {
  const host = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<VelaWorkspace | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [brokerStatusOpen, setBrokerStatusOpen] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [activeSymbol, setActiveSymbol] = useState('NSE:NIFTY50-INDEX');

  useEffect(() => {
    if (!host.current) return;

    let workspace: VelaWorkspace | null = null;
    let cancelled = false;

    const mount = async () => {
      // The chart must never race broker restoration. This is intentionally
      // awaited before Vela builds its provider registry and requests candles.
      try {
        await tradingCoreRuntime.restoreBrokerConnections();
      } catch {
        // Vela/runtime surface the actual market-data error below.
      }
      if (cancelled || !host.current) return;

      workspace = new VelaWorkspace(host.current, {
        layout: false,
        symbol: 'NSE:NIFTY50-INDEX',
        timeframe: '5',
        bars: 750,
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
      workspaceRef.current = workspace;
      setActiveSymbol(workspace.chart.market.symbol || 'NSE:NIFTY50-INDEX');
    };

    void mount();

    return () => {
      cancelled = true;
      workspaceRef.current = null;
      workspace?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!watchlistOpen) return;
    const symbols = WATCHLIST.map((item) => item.symbol);
    const stop = tradingCoreRuntime.subscribeMarketData(symbols, (event: MarketFeedEvent) => {
      if (event.type !== 'tick' || !event.tick) return;
      const symbol = String(event.tick.instrumentKey || '');
      const ltp = Number(event.tick.ltp ?? event.tick.close);
      if (!symbol || !Number.isFinite(ltp)) return;
      setQuotes((previous) => ({ ...previous, [symbol]: ltp }));
    });
    return stop;
  }, [watchlistOpen]);

  useEffect(() => {
    const chart = workspaceRef.current?.chart;
    if (!chart) return;
    return chart.on('market:changed', ({ symbol }) => {
      if (symbol) setActiveSymbol(String(symbol));
    });
  }, [watchlistOpen, brokerStatusOpen]);

  const selectSymbol = async (symbol: string) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    setActiveSymbol(symbol);
    setWatchlistOpen(false);
    try {
      await workspace.chart.setMarket({ symbol, timeframe: workspace.chart.market.timeframe || '5' });
    } catch (error) {
      workspace.toast(error instanceof Error ? error.message : 'Unable to switch market', 'error', 5000);
    }
  };

  return (
    <div
      ref={host}
      className="fixed inset-0 z-[100] bg-[#050609]"
      aria-label="TradingCoreOS Vela live trading chart"
    >
      <div className="absolute top-1.5 right-[92px] z-[250] flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setBrokerStatusOpen(false);
            setWatchlistOpen((open) => !open);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-mono font-bold tracking-wide shadow-lg backdrop-blur-md transition-colors ${watchlistOpen ? 'border-blue-400/60 bg-blue-500/15 text-blue-300' : 'border-white/10 bg-[#0b0d12]/95 text-slate-200 hover:border-blue-400/40 hover:text-white'}`}
          aria-label="Open watchlist"
          aria-expanded={watchlistOpen}
        >
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          Watchlist
        </button>
        <button
          type="button"
          onClick={() => {
            setWatchlistOpen(false);
            setBrokerStatusOpen((open) => !open);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0b0d12]/95 px-3 py-1.5 text-[10px] font-mono font-bold tracking-wide text-slate-200 shadow-lg backdrop-blur-md transition-colors hover:border-blue-400/40 hover:text-white"
          aria-label="Open broker connection status"
          aria-expanded={brokerStatusOpen}
        >
          <Wifi className="h-3.5 w-3.5" />
          Broker Connection Status
        </button>
      </div>

      {watchlistOpen && (
        <div className="absolute top-11 right-2 z-[260] w-[340px] overflow-hidden rounded-xl border border-white/10 bg-[#0b0e14]/98 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                <Radio className="h-3.5 w-3.5 text-blue-400" />
                FYERS Watchlist
              </div>
              <div className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-slate-500">Live market stream</div>
            </div>
            <button
              type="button"
              onClick={() => setWatchlistOpen(false)}
              className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"
              aria-label="Close watchlist"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2">
            {WATCHLIST.map((item) => {
              const ltp = quoteFor(quotes, item.symbol);
              const selected = activeSymbol === item.symbol;
              return (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => void selectSymbol(item.symbol)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? 'bg-blue-500/10 ring-1 ring-blue-400/30' : 'hover:bg-white/5'}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-100">
                      {selected ? <Star className="h-3 w-3 fill-current text-blue-300" /> : <span className="w-3" />}
                      {item.label}
                    </span>
                    <span className="mt-0.5 block pl-4 text-[9px] font-mono text-slate-500">{item.short}</span>
                  </span>
                  <span className="ml-3 text-right font-mono text-[11px] font-semibold text-slate-200">
                    {ltp == null ? '—' : ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </button>
              );
            })}
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
