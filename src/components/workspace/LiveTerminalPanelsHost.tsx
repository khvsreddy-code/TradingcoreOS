import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, BookOpen, Wallet, X } from 'lucide-react';
import { RightTerminalDock, type RightDockTab, type WatchlistDockItem } from './RightTerminalDock';
import { TerminalJournalPanel } from './TerminalJournalPanel';
import { TerminalPortfolioPanel } from './TerminalPortfolioPanel';
import { CoreSpiritChartAssistant } from './CoreSpiritChartAssistant';
import { searchBrokerInstruments, type InstrumentSearchSegment, type SearchInstrument } from '../../services/marketData/instrumentSearch';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { loadDefaultTerminalWatchlist, saveDefaultTerminalWatchlist } from '../../services/terminal/terminalDataService';
import type { NormalizedMarketTick } from '../../types/market';

const LOCAL_WATCHLIST_KEY = 'tradingcore:vela:watchlist:v2';
const DEFAULT_WATCHLIST: WatchlistDockItem[] = [{
  key: 'NSE:NIFTY50-INDEX',
  symbol: 'NSE:NIFTY50-INDEX',
  label: 'NIFTY 50',
  short: 'NIFTY',
  exchange: 'NSE',
  type: 'index',
}];

function toDockItem(item: SearchInstrument): WatchlistDockItem {
  return { ...item, key: item.key, label: item.label || item.symbol, short: item.description || item.label || item.symbol };
}

function readLocalWatchlist(): WatchlistDockItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_WATCHLIST_KEY) || '{}') as { items?: unknown[] } | unknown[];
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return rows.flatMap((value): WatchlistDockItem[] => {
      if (!value || typeof value !== 'object') return [];
      const row = value as Record<string, unknown>;
      const symbol = String(row.symbol || row.key || '').trim();
      if (!symbol) return [];
      return [{
        key: String(row.key || symbol),
        symbol,
        label: String(row.label || symbol),
        short: String(row.short || row.short_name || row.label || symbol),
        exchange: row.exchange == null ? undefined : String(row.exchange),
        type: row.type == null ? undefined : String(row.type),
      }];
    }).slice(0, 50);
  } catch {
    return [];
  }
}

export function LiveTerminalPanelsHost({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const [watch, setWatch] = useState<WatchlistDockItem[]>(DEFAULT_WATCHLIST);
  const [selected, setSelected] = useState(DEFAULT_WATCHLIST[0].key);
  const [ticks, setTicks] = useState<Record<string, NormalizedMarketTick>>({});
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('tradingcore:terminal:rightdock-open') !== '0'; } catch { return true; }
  });
  const [width, setWidth] = useState(() => {
    try { return Math.max(280, Math.min(460, Number(localStorage.getItem('tradingcore:terminal:rightdock-width')) || 360)); } catch { return 360; }
  });
  const [activeTab, setActiveTab] = useState<RightDockTab>('watchlist');
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<InstrumentSearchSegment>('all');
  const [results, setResults] = useState<SearchInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [auxPanel, setAuxPanel] = useState<'journal' | 'quant' | 'portfolio' | null>(null);
  const broker = String(tradingCoreRuntime.getPrimaryBrokerId() || 'fyers').toLowerCase();
  const selectedItem = watch.find(item => item.key === selected) || watch[0];
  const selectedTick = selectedItem ? ticks[selectedItem.key] || tradingCoreRuntime.getMarketSnapshot(selectedItem.key) : undefined;

  useEffect(() => {
    let active = true;
    void loadDefaultTerminalWatchlist().then(saved => {
      if (!active) return;
      const next = (saved?.length ? saved : readLocalWatchlist()).map(item => toDockItem({
        ...item,
        key: item.symbol,
        symbol: item.symbol,
        label: item.label,
        description: item.short,
      }));
      const usable = next.length ? next : DEFAULT_WATCHLIST;
      setWatch(usable);
      setSelected(current => usable.some(item => item.key === current) ? current : usable[0].key);
    }).catch(() => {
      if (!active) return;
      const local = readLocalWatchlist();
      if (local.length) {
        setWatch(local);
        setSelected(local[0].key);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify({ items: watch.map(item => ({
        key: item.key, symbol: item.symbol, label: item.label, short: item.short,
        exchange: item.exchange, type: item.type,
      })) }));
    } catch { /* device cache is best effort */ }
  }, [watch]);

  useEffect(() => {
    try {
      localStorage.setItem('tradingcore:terminal:rightdock-open', open ? '1' : '0');
      localStorage.setItem('tradingcore:terminal:rightdock-width', String(width));
    } catch { /* preference persistence is best effort */ }
  }, [open, width]);

  useEffect(() => {
    const openWatchlist = () => { setOpen(true); setActiveTab('watchlist'); };
    const openQuant = (event: Event) => {
      const prompt = String((event as CustomEvent<{ prompt?: unknown }>).detail?.prompt || '').slice(0, 500);
      setAuxPanel('quant');
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('tco:quant-prefill', { detail: { prompt } })), 80);
    };
    window.addEventListener('tco:open-terminal-watchlist', openWatchlist);
    window.addEventListener('tco:open-quant', openQuant);
    return () => {
      window.removeEventListener('tco:open-terminal-watchlist', openWatchlist);
      window.removeEventListener('tco:open-quant', openQuant);
    };
  }, []);

  useEffect(() => {
    if (!watch.length) return;
    let active = true;
    const keys = watch.map(item => item.key).filter(Boolean);
    for (const key of keys) {
      const cached = tradingCoreRuntime.getMarketSnapshot(key);
      if (cached) setTicks(current => ({ ...current, [key]: cached }));
    }
    const stop = tradingCoreRuntime.subscribeMarketData(keys, event => {
      if (!active || event.type !== 'tick' || !event.tick) return;
      const tick = event.tick as NormalizedMarketTick;
      const key = String(tick.instrumentKey || '');
      if (key && keys.includes(key)) setTicks(current => ({ ...current, [key]: tick }));
    }, selected);
    return () => { active = false; stop(); };
  }, [watch.map(item => item.key).join('|'), selected, broker]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchBrokerInstruments(broker, term, segment, 40)
        .then(items => { if (active) setResults(items); })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, segment, broker]);

  const persistWatchlist = useCallback((items: WatchlistDockItem[]) => {
    void saveDefaultTerminalWatchlist(items.map(item => ({
      symbol: item.symbol,
      label: item.label,
      short: item.short || item.label,
      exchange: item.exchange,
      type: item.type,
    }))).catch(() => undefined);
  }, []);

  const add = useCallback((item: SearchInstrument) => {
    setWatch(current => {
      if (current.some(existing => existing.key === item.key) || current.length >= 50) return current;
      const next = [...current, toDockItem(item)];
      persistWatchlist(next);
      setSelected(item.key);
      return next;
    });
    setQuery('');
    setResults([]);
  }, [persistWatchlist]);

  const remove = useCallback((key: string) => {
    setWatch(current => {
      const next = current.filter(item => item.key !== key);
      persistWatchlist(next);
      if (selected === key) setSelected(next[0]?.key || '');
      return next;
    });
  }, [persistWatchlist, selected]);

  const changeWidth = useCallback((next: number) => setWidth(Math.max(260, Math.min(460, next))), []);
  const assistantContext = useMemo(() => ({
    symbol,
    timeframe,
    lastPrice: selectedTick?.ltp ?? null,
    candleCount: undefined,
  }), [symbol, timeframe, selectedTick?.ltp]);

  return <>
    <div className="absolute inset-y-0 right-11 z-[125] pointer-events-none" style={{ width: open ? width : 44 }}>
      <div className="pointer-events-auto h-full w-full">
        <RightTerminalDock
          open={open}
          onToggle={() => setOpen(value => !value)}
          width={width}
          onWidthChange={changeWidth}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          watch={watch}
          selected={selected}
          onSelect={setSelected}
          onRemove={remove}
          onAdd={add}
          query={query}
          onQueryChange={setQuery}
          segment={segment}
          onSegmentChange={setSegment}
          results={results}
          searching={searching}
          ticks={ticks}
          broker={broker}
        />
      </div>
    </div>
    <div className="pointer-events-auto absolute bottom-12 left-14 z-[135] flex items-center gap-1 rounded-lg border border-[#29364a] bg-[#0b111b]/95 p-1 shadow-xl backdrop-blur">
      <button type="button" onClick={() => setAuxPanel(current => current === 'journal' ? null : 'journal')} className={'inline-flex items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold ' + (auxPanel === 'journal' ? 'bg-[#1d3552] text-white' : 'text-[#9fb0c6] hover:bg-white/5 hover:text-white')}><BookOpen size={13}/> Journal</button>
      <button type="button" onClick={() => setAuxPanel(current => current === 'quant' ? null : 'quant')} className={'inline-flex items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold ' + (auxPanel === 'quant' ? 'bg-[#1d3552] text-white' : 'text-[#9fb0c6] hover:bg-white/5 hover:text-white')}><Bot size={13}/> Quant</button>
      <button type="button" onClick={() => setAuxPanel(current => current === 'portfolio' ? null : 'portfolio')} className={'inline-flex items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold ' + (auxPanel === 'portfolio' ? 'bg-[#1d3552] text-white' : 'text-[#9fb0c6] hover:bg-white/5 hover:text-white')}><Wallet size={13}/> Activity</button>
      {auxPanel && <button type="button" onClick={() => setAuxPanel(null)} aria-label="Close terminal panel" className="rounded-md p-2 text-[#8193aa] hover:bg-white/5"><X size={13}/></button>}
    </div>
    {auxPanel && <section className="pointer-events-auto absolute bottom-[88px] left-14 z-[134] flex h-[min(430px,55vh)] w-[min(520px,calc(100vw-90px))] flex-col overflow-hidden rounded-xl border border-[#2a394e] bg-[#0b1018] shadow-2xl">
      {auxPanel === 'journal'
        ? <TerminalJournalPanel symbol={symbol} timeframe={timeframe}/>
        : auxPanel === 'portfolio'
          ? <TerminalPortfolioPanel />
          : <CoreSpiritChartAssistant context={assistantContext} embedded />}
    </section>}
  </>;
}
