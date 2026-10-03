import { useEffect, useRef, useState } from 'react';
import { VelaWorkspace } from './services/core/chart/velaChartFacade';
import { createTcoVelaDataProvider, toFyersVelaSymbol } from './TcoVelaDataProvider';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine';
import { BrokerOAuthService } from './services/oauth/BrokerOAuthService';
import { searchFyersInstruments, type InstrumentSearchSegment, type SearchInstrument } from './services/marketData/instrumentSearch';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { MarketFeedEvent } from './types/market';

const CORESPIRIT_LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const VELA_STATE_KEY = 'tradingcore-live-vela-v115';
const WATCHLIST_KEY = 'tradingcore-live-watchlist-v2';
const MAX_BARS = 5_000;

type WatchItem = {
  key: string;
  label: string;
  symbol?: string;
  exchange?: string;
  type?: string;
};

type BrokerView = {
  connected: boolean;
  status: string;
  clientCode?: string;
  expiresAt?: string;
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

function readWatchlist(): WatchItem[] {
  const defaults: WatchItem[] = [
    { key: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', symbol: 'NIFTY50-INDEX', exchange: 'NSE', type: 'Index' },
    { key: 'NSE:NIFTYBANK-INDEX', label: 'BANK NIFTY', symbol: 'NIFTYBANK-INDEX', exchange: 'NSE', type: 'Index' },
    { key: 'NSE:FINNIFTY-INDEX', label: 'FINNIFTY', symbol: 'FINNIFTY-INDEX', exchange: 'NSE', type: 'Index' },
    { key: 'NSE:MIDCPNIFTY-INDEX', label: 'MIDCAP NIFTY', symbol: 'MIDCPNIFTY-INDEX', exchange: 'NSE', type: 'Index' },
    { key: 'BSE:SENSEX-INDEX', label: 'SENSEX', symbol: 'SENSEX-INDEX', exchange: 'BSE', type: 'Index' },
  ];
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || 'null');
    if (!Array.isArray(saved)) return defaults;
    const normalized = saved
      .filter((row) => row && typeof row.key === 'string')
      .map((row) => ({
        key: String(row.key),
        label: String(row.label || row.key),
        symbol: row.symbol ? String(row.symbol) : undefined,
        exchange: row.exchange ? String(row.exchange) : undefined,
        type: row.type ? String(row.type) : undefined,
      }))
      .slice(0, 40);
    return normalized.length ? normalized : defaults;
  } catch {
    return defaults;
  }
}

function writeWatchlist(rows: WatchItem[]): void {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(rows.slice(0, 40)));
  } catch {
    // Local storage is optional; live trading must not depend on it.
  }
}

function connectionView(): BrokerView {
  const info = tradingCoreRuntime.getPrimaryBrokerInfo();
  return {
    connected: info?.status === 'Connected' && info.brokerId.toLowerCase() === 'fyers',
    status: info?.status || 'Not connected',
    clientCode: info?.clientCode,
    expiresAt: info?.expiresAt,
  };
}

export function LiveTradingWorkspace() {
  const host = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<VelaWorkspace | null>(null);
  const activeSymbolRef = useRef('fyers:NSE:NIFTY50-INDEX');
  const activeTimeframeRef = useRef('5');
  const [watchOpen, setWatchOpen] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(readWatchlist);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<InstrumentSearchSegment>('all');
  const [results, setResults] = useState<SearchInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [broker, setBroker] = useState<BrokerView>(connectionView);
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [brokerMessage, setBrokerMessage] = useState('');
  const [chartError, setChartError] = useState('');
  const [chartReady, setChartReady] = useState(false);

  const setActiveMarket = (symbol: string, timeframe = activeTimeframeRef.current) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const normalized = toFyersVelaSymbol(symbol);
    activeSymbolRef.current = normalized;
    activeTimeframeRef.current = timeframe;
    setChartError('');
    void workspace.active.chart.setMarket({
      symbol: normalized,
      timeframe,
      bars: MAX_BARS,
    }).then(() => setChartReady(true)).catch((error: unknown) => {
      setChartError(error instanceof Error ? error.message : String(error));
      setChartReady(false);
    });
  };

  const refreshChartFromBroker = () => {
    setBroker(connectionView());
    setActiveMarket(activeSymbolRef.current, activeTimeframeRef.current);
  };

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;

    const workspace = new VelaWorkspace(host.current, {
      layout: false,
      symbol: 'fyers:NSE:NIFTY50-INDEX',
      timeframe: '5',
      bars: MAX_BARS,
      timeframes: ['1', '3', '5', '10', '15', '30', '60', '240', 'D', 'W', 'M'],
      live: true,
      theme: 'dark',
      defaultLanguage: 'corespirit',
      providers: {
        fyers: () => createTcoVelaDataProvider(),
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

    const restoreAndPaint = async () => {
      try {
        await tradingCoreRuntime.restoreBrokerConnections();
      } catch {
        // Broker status is shown in the popup.
      }
      if (disposed) return;

      const info = tradingCoreRuntime.getPrimaryBrokerInfo();
      setBroker(connectionView());

      if (info?.brokerId?.toLowerCase() === 'fyers' && info.status === 'Connected') {
        setChartReady(false);
        try {
          await workspace.active.chart.setMarket({
            symbol: activeSymbolRef.current,
            timeframe: activeTimeframeRef.current,
            bars: MAX_BARS,
          });
          if (!disposed) setChartReady(true);
        } catch (error: unknown) {
          if (!disposed) {
            setChartError(error instanceof Error ? error.message : String(error));
            setChartReady(false);
          }
        }
      } else {
        try {
          await workspace.active.chart.ready();
          if (!disposed) setChartReady(true);
        } catch {
          if (!disposed) setChartReady(false);
        }
      }
    };

    void restoreAndPaint();

    const brokerMessageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'TRADINGCORE_BROKER_CONNECTED') return;
      if (String(event.data?.brokerId || event.data?.broker || '').toLowerCase() !== 'fyers') return;

      setBrokerMessage('FYERS authorization completed. Restoring the authenticated data route…');
      void tradingCoreRuntime.restoreBrokerConnections().then(() => {
        if (disposed) return;
        setBroker(connectionView());
        setBrokerMessage('FYERS connected. Reloading candles and live stream…');
        refreshChartFromBroker();
      });
    };

    window.addEventListener('message', brokerMessageHandler);

    return () => {
      disposed = true;
      window.removeEventListener('message', brokerMessageHandler);
      workspace.destroy();
      workspaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const tickKeys = [...new Set(watchlist.map((item) => item.key).filter(Boolean))];
    if (!tickKeys.length) return;

    const unsubscribe = tradingCoreRuntime.subscribeMarketData(tickKeys, (event: MarketFeedEvent) => {
      if (event.type !== 'tick' || !event.tick) return;
      const key = String(event.tick.instrumentKey || '');
      const ltp = Number(event.tick.ltp ?? event.tick.close);
      if (!key || !Number.isFinite(ltp)) return;
      setQuotes((prev) => prev[key] === ltp ? prev : { ...prev, [key]: ltp });
    });

    return unsubscribe;
  }, [watchlist]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await searchFyersInstruments(q, segment, 40);
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, segment]);

  useEffect(() => {
    writeWatchlist(watchlist);
  }, [watchlist]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBroker(connectionView());
      if (tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId?.toLowerCase() !== 'fyers') return;
      if (!workspaceRef.current) return;
      void workspaceRef.current.active.chart.ready()
        .then(() => setChartReady(true))
        .catch(() => undefined);
    }, 2_500);

    return () => window.clearInterval(timer);
  }, []);

  const addWatch = (item: SearchInstrument) => {
    const row: WatchItem = {
      key: item.key,
      label: item.label || item.symbol || item.key,
      symbol: item.symbol,
      exchange: item.exchange,
      type: item.type,
    };
    setWatchlist((prev) => prev.some((x) => x.key === row.key) ? prev : [...prev, row].slice(0, 40));
  };

  const removeWatch = (key: string) => {
    setWatchlist((prev) => prev.filter((x) => x.key !== key));
  };

  const connectFyers = async () => {
    setBrokerBusy(true);
    setBrokerMessage('');
    const result = await BrokerOAuthService.initiateOAuth('fyers');
    setBrokerBusy(false);
    if (!result.success) setBrokerMessage(result.error || 'Unable to start FYERS authorization.');
    else setBrokerMessage('FYERS authorization opened in a secure popup.');
  };

  const disconnectFyers = async () => {
    setBrokerBusy(true);
    setBrokerMessage('');
    try {
      await tradingCoreRuntime.disconnectBroker('fyers');
      setBroker(connectionView());
      setChartReady(false);
      setBrokerMessage('FYERS disconnected. Connect again to load authenticated candles.');
    } catch (error: unknown) {
      setBrokerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBrokerBusy(false);
    }
  };

  const testFyers = async () => {
    setBrokerBusy(true);
    setBrokerMessage('');
    try {
      await tradingCoreRuntime.restoreBrokerConnections();
      const result = await tradingCoreRuntime.testConnectivity('fyers');
      setBroker(result.success ? { ...connectionView(), connected: true, status: 'Connected' } : { ...connectionView(), status: 'Test failed' });
      setBrokerMessage(result.message || (result.success ? 'FYERS connection is healthy.' : 'FYERS connection test failed.'));
    } catch (error: unknown) {
      setBrokerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBrokerBusy(false);
    }
  };

  const syncFyers = async () => {
    setBrokerBusy(true);
    setBrokerMessage('');
    try {
      await tradingCoreRuntime.restoreBrokerConnections();
      setBroker(connectionView());
      refreshChartFromBroker();
      setBrokerMessage('FYERS session and Vela market data have been synchronized.');
    } catch (error: unknown) {
      setBrokerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBrokerBusy(false);
    }
  };

  return (
    <div ref={host} className="fixed inset-0 z-[100] bg-[#050609]" aria-label="TradingCoreOS Vela live trading chart">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3000] flex justify-end px-3 py-2">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setWatchOpen((value) => !value); setBrokerOpen(false); }}
            className="rounded-md border border-white/10 bg-[#111318]/95 px-3 py-1.5 text-[11px] font-semibold text-slate-200 shadow-xl backdrop-blur hover:border-blue-400/40 hover:text-white"
          >
            Watchlist
          </button>
          <button
            type="button"
            onClick={() => { setBrokerOpen((value) => !value); setWatchOpen(false); }}
            className="rounded-md border border-white/10 bg-[#111318]/95 px-3 py-1.5 text-[11px] font-semibold text-slate-200 shadow-xl backdrop-blur hover:border-blue-400/40 hover:text-white"
          >
            Broker Connection Status
            <span className={'ml-2 inline-block h-1.5 w-1.5 rounded-full ' + (broker.connected ? 'bg-blue-400' : 'bg-red-400')} />
          </button>
        </div>
      </div>

      {watchOpen && (
        <section className="absolute right-3 top-11 z-[3100] flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0e14]/98 text-slate-100 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Watchlist</div>
              <div className="text-[10px] text-slate-500">FYERS live quotes · chart switching stays inside Vela</div>
            </div>
            <button type="button" className="text-xs text-slate-500 hover:text-white" onClick={() => setWatchOpen(false)}>Close</button>
          </div>

          <div className="max-h-[280px] overflow-y-auto p-2">
            {watchlist.map((item) => (
              <div key={item.key} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActiveMarket(item.key); setWatchOpen(false); }}>
                  <div className="truncate text-xs font-medium">{item.label}</div>
                  <div className="truncate text-[9px] text-slate-500">{item.key}</div>
                </button>
                <div className="w-20 text-right font-mono text-[11px] text-slate-200">
                  {Number.isFinite(quotes[item.key]) ? quotes[item.key].toFixed(2) : '—'}
                </div>
                <button type="button" onClick={() => removeWatch(item.key)} className="px-1.5 text-slate-600 hover:text-red-300" aria-label={'Remove ' + item.label}>×</button>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="flex gap-1 overflow-x-auto pb-2">
              {(['all', 'stocks', 'futures', 'options', 'commodities', 'currency'] as InstrumentSearchSegment[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setSegment(entry)}
                  className={'rounded border px-2 py-1 text-[9px] ' + (segment === entry ? 'border-blue-400/40 bg-blue-400/10 text-blue-300' : 'border-white/10 text-slate-500')}
                >
                  {entry}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search FYERS symbol, index, future, option…"
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-blue-400/40"
            />

            <div className="mt-2 max-h-48 overflow-y-auto">
              {searching && <div className="px-2 py-3 text-[10px] text-slate-500">Searching FYERS symbol master…</div>}
              {!searching && results.map((item) => (
                <div key={item.key} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-white/[0.04]">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => addWatch(item)}>
                    <div className="truncate text-[11px]">{item.label || item.symbol}</div>
                    <div className="truncate text-[9px] text-slate-500">
                      {item.key}
                      {item.expiry ? ' · ' + item.expiry : ''}
                      {item.strike ? ' · ' + item.strike : ''}
                      {item.optionType ? ' · ' + item.optionType : ''}
                    </div>
                  </button>
                  <button type="button" onClick={() => addWatch(item)} className="rounded border border-blue-400/30 px-2 py-1 text-[9px] text-blue-300">Add</button>
                </div>
              ))}
              {!searching && search.trim().length >= 2 && !results.length && <div className="px-2 py-3 text-[10px] text-slate-600">No active FYERS instrument matched.</div>}
            </div>
          </div>
        </section>
      )}

      {brokerOpen && (
        <section className="absolute right-3 top-11 z-[3100] w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-white/10 bg-[#0b0e14]/98 p-4 text-slate-100 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold">Broker Connection Status</div>
              <div className="mt-1 text-[10px] text-slate-500">One authenticated broker route: FYERS</div>
            </div>
            <button type="button" className="text-xs text-slate-500 hover:text-white" onClick={() => setBrokerOpen(false)}>Close</button>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">FYERS</span>
              <span className={'rounded-full px-2 py-1 text-[9px] ' + (broker.connected ? 'bg-blue-400/10 text-blue-300' : 'bg-red-400/10 text-red-300')}>{broker.connected ? 'CONNECTED' : broker.status.toUpperCase()}</span>
            </div>
            <div className="mt-3 text-xs text-slate-300">
              {broker.clientCode ? 'Client ' + broker.clientCode : 'Authenticated session required for candles and live ticks.'}
            </div>
            {broker.expiresAt && <div className="mt-1 text-[9px] text-slate-500">Session expiry: {new Date(broker.expiresAt).toLocaleString()}</div>}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={brokerBusy} onClick={() => void connectFyers()} className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-[#041018] disabled:opacity-50">Connect FYERS</button>
            <button type="button" disabled={brokerBusy || !broker.connected} onClick={() => void testFyers()} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40">Test connection</button>
            <button type="button" disabled={brokerBusy || !broker.connected} onClick={() => void syncFyers()} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40">Sync data route</button>
            <button type="button" disabled={brokerBusy || !broker.connected} onClick={() => void disconnectFyers()} className="rounded-md border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-40">Disconnect</button>
          </div>

          <div className="mt-3 rounded-md bg-blue-400/5 p-3 text-[10px] leading-4 text-slate-400">
            <div className="font-medium text-blue-300">Vela data path</div>
            <div className="mt-1">Historical candles → TradingCore runtime → FYERS API → Vela feed. Live prices → shared FYERS stream → Vela forming candle.</div>
          </div>

          {brokerMessage && <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-[10px] text-slate-300">{brokerMessage}</div>}
        </section>
      )}

      {!broker.connected && !chartReady && (
        <div className="pointer-events-none absolute inset-0 z-[2000] flex items-center justify-center">
          <div className="pointer-events-auto max-w-md rounded-xl border border-white/10 bg-[#0b0e14]/95 p-5 text-center shadow-2xl">
            <div className="text-sm font-semibold text-white">Connect FYERS to load the Vela market</div>
            <div className="mt-2 text-xs leading-5 text-slate-400">The chart is already mounted. The authenticated FYERS route is required for historical candles and live ticks.</div>
            <button type="button" onClick={() => setBrokerOpen(true)} className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-[#041018]">Broker Connection Status</button>
          </div>
        </div>
      )}

      {chartError && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-[2000] -translate-x-1/2">
          <div className="pointer-events-auto rounded-lg border border-red-400/20 bg-[#160b0e]/95 px-4 py-2 text-[10px] text-red-200 shadow-xl">{chartError}</div>
        </div>
      )}
    </div>
  );
}

export default LiveTradingWorkspace;
