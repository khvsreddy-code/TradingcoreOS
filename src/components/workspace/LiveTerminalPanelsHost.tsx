import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, BookOpen, Wallet, X } from 'lucide-react';
import { RightTerminalDock, type RightDockTab, type WatchlistDockItem } from './RightTerminalDock';
import { TerminalJournalPanel } from './TerminalJournalPanel';
import { TerminalPortfolioPanel } from './TerminalPortfolioPanel';
import { CoreSpiritChartAssistant } from './CoreSpiritChartAssistant';
import { searchBrokerInstruments, type InstrumentSearchSegment, type SearchInstrument } from '../../services/marketData/instrumentSearch';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { claimTerminalAlertRuleTrigger, createTerminalWatchlist, deleteTerminalWatchlist, deleteTerminalWatchlistItem, ensureDefaultTerminalWatchlist, listTerminalAlertRules, listTerminalWatchlists, loadDefaultTerminalWatchlist, loadTerminalWatchlistItems, renameTerminalWatchlist, saveDefaultTerminalWatchlist, upsertTerminalWatchlistItem, type TerminalAlertRuleRecord, type TerminalWatchlistRecord } from '../../services/terminal/terminalDataService';
import { evaluateTerminalAlertRule, isEligibleTerminalAlertTick } from '../../services/terminal/terminalAlertEngine';
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

function toDockItem(item: SearchInstrument & { short?: string }): WatchlistDockItem {
  return { ...item, key: item.key, label: item.label || item.symbol, short: item.short || item.label || item.symbol };
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
  const [watchlists, setWatchlists] = useState<TerminalWatchlistRecord[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');
  const [watch, setWatch] = useState<WatchlistDockItem[]>(DEFAULT_WATCHLIST);
  const [selected, setSelected] = useState(DEFAULT_WATCHLIST[0].key);
  const [ticks, setTicks] = useState<Record<string, NormalizedMarketTick>>({});
  const [alertSymbols, setAlertSymbols] = useState<string[]>([]);
  const [alertNotice, setAlertNotice] = useState<{ symbol: string; label: string; condition: string; price: number; source: string } | null>(null);
  const alertRulesRef = useRef<TerminalAlertRuleRecord[]>([]);
  const previousAlertPricesRef = useRef(new Map<string, number>());
  const pendingAlertClaimsRef = useRef(new Set<string>());
  const alertClaimBackoffRef = useRef(new Map<string, number>());
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
    void (async () => {
      try {
        let lists = await listTerminalWatchlists();
        if (!active) return;
        if (!lists.length) {
          const main = await ensureDefaultTerminalWatchlist();
          if (main) lists = [main];
        }
        if (!active) return;
        setWatchlists(lists);
        const storedId = (() => {
          try { return localStorage.getItem('tradingcore:vela:active-watchlist') || ''; } catch { return ''; }
        })();
        const target = lists.find(item => item.id === storedId)
          || lists.find(item => item.is_default)
          || lists[0];
        const saved = target ? await loadTerminalWatchlistItems(target.id) : await loadDefaultTerminalWatchlist();
        if (!active) return;
        setActiveWatchlistId(target?.id || null);
        const next = (target ? saved : (saved?.length ? saved : readLocalWatchlist())).map(item => toDockItem({
          ...item, key: item.symbol, symbol: item.symbol, label: item.label, short: item.short,
        }));
        const usable = target ? next : next.length ? next : DEFAULT_WATCHLIST;
        setWatch(usable);
        setSelected(current => usable.some(item => item.key === current) ? current : usable[0]?.key || '');
      } catch (caught) {
        if (!active) return;
        setWatchlistError(caught instanceof Error ? caught.message : 'Watchlists could not be loaded.');
        const local = readLocalWatchlist();
        const usable = local.length ? local : DEFAULT_WATCHLIST;
        setWatch(usable);
        setSelected(usable[0]?.key || '');
      }
    })();
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

  const refreshArmedAlerts = useCallback(async () => {
    try {
      const rows = await listTerminalAlertRules();
      const armed = rows.filter(rule => rule.status === 'armed' && Boolean(rule.symbol));
      alertRulesRef.current = armed;
      const symbols = [...new Set(armed.map(rule => rule.symbol.trim()).filter(Boolean))].sort();
      setAlertSymbols(current => current.join('|') === symbols.join('|') ? current : symbols);
    } catch {
      // Keep the last verified rule set; the next explicit change or refresh retries.
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) void refreshArmedAlerts(); };
    refresh();
    window.addEventListener('tco:terminal-alerts-changed', refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener('tco:terminal-alerts-changed', refresh);
      window.clearInterval(interval);
    };
  }, [refreshArmedAlerts]);

  useEffect(() => {
    const onTriggered = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: unknown; label?: unknown; condition?: unknown; price?: unknown; source?: unknown }>).detail || {};
      const price = Number(detail.price);
      if (!Number.isFinite(price) || price <= 0) return;
      setAlertNotice({
        symbol: String(detail.symbol || ''),
        label: String(detail.label || detail.symbol || 'Price alert'),
        condition: String(detail.condition || 'price condition'),
        price,
        source: String(detail.source || 'broker'),
      });
    };
    window.addEventListener('tco:terminal-alert-triggered', onTriggered);
    return () => window.removeEventListener('tco:terminal-alert-triggered', onTriggered);
  }, []);

  useEffect(() => {
    if (!alertNotice) return;
    const timeout = window.setTimeout(() => setAlertNotice(null), 8_000);
    return () => window.clearTimeout(timeout);
  }, [alertNotice]);

  useEffect(() => {
    const watchKeys = watch.map(item => item.key).filter(Boolean);
    const keys = [...new Set([...watchKeys, ...alertSymbols])];
    if (!keys.length) return;
    let active = true;
    for (const key of keys) {
      const cached = tradingCoreRuntime.getMarketSnapshot(key);
      if (cached) setTicks(current => ({ ...current, [key]: cached }));
    }
    const stop = tradingCoreRuntime.subscribeMarketData(keys, event => {
      if (!active || event.type !== 'tick' || !event.tick) return;
      const tick = event.tick as NormalizedMarketTick;
      const key = String(tick.instrumentKey || '');
      if (!key || !keys.includes(key)) return;

      setTicks(current => ({ ...current, [key]: tick }));
      if (!isEligibleTerminalAlertTick(tick)) return;

      const currentPrice = Number(tick.ltp);
      const previousPrice = previousAlertPricesRef.current.get(key) ?? null;
      previousAlertPricesRef.current.set(key, currentPrice);
      const source = tick.source;
      if (source !== 'fyers' && source !== 'upstox') return;

      const now = Date.now();
      for (const rule of alertRulesRef.current) {
        if (rule.symbol !== key || pendingAlertClaimsRef.current.has(rule.id)) continue;
        if ((alertClaimBackoffRef.current.get(rule.id) || 0) > now) continue;
        if (!evaluateTerminalAlertRule(rule, previousPrice, currentPrice)) continue;

        pendingAlertClaimsRef.current.add(rule.id);
        const firedAt = new Date(now).toISOString();
        void claimTerminalAlertRuleTrigger(rule, {
          price: currentPrice,
          source,
          firedAt,
          marketTimestamp: tick.brokerTimestamp ?? tick.timestamp ?? null,
        }).then(claimed => {
          if (!claimed) return;
          alertRulesRef.current = alertRulesRef.current.filter(item => item.id !== rule.id);
          window.dispatchEvent(new CustomEvent('tco:terminal-alert-triggered', {
            detail: {
              symbol: rule.symbol,
              label: rule.label || rule.symbol,
              condition: rule.condition,
              price: currentPrice,
              source,
            },
          }));
          window.dispatchEvent(new Event('tco:terminal-alerts-changed'));
        }).catch(() => {
          alertClaimBackoffRef.current.set(rule.id, Date.now() + 10_000);
        }).finally(() => {
          pendingAlertClaimsRef.current.delete(rule.id);
        });
      }
    }, selected);
    return () => { active = false; stop(); };
  }, [watch.map(item => item.key).join('|'), alertSymbols.join('|'), selected, broker]);

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

  const toStoredItem = (item: WatchlistDockItem) => ({
    symbol: item.symbol, label: item.label, short: item.short || item.label,
    exchange: item.exchange, type: item.type,
  });

  const add = useCallback((item: SearchInstrument) => {
    const next = watch.some(existing => existing.key === item.key)
      ? watch
      : watch.length >= 50 ? watch : [...watch, toDockItem(item)];
    if (next !== watch) {
      setWatch(next);
      if (activeWatchlistId) {
        void upsertTerminalWatchlistItem(activeWatchlistId, toStoredItem(next[next.length - 1]!), next.length - 1)
          .catch(caught => setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist item could not be saved.'));
      } else {
        void saveDefaultTerminalWatchlist(next.map(toStoredItem))
          .catch(caught => setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be saved.'));
      }
    }
    setSelected(item.key);
    setQuery('');
    setResults([]);
  }, [activeWatchlistId, watch]);

  const remove = useCallback((key: string) => {
    const next = watch.filter(item => item.key !== key);
    setWatch(next);
    if (activeWatchlistId) {
      void deleteTerminalWatchlistItem(activeWatchlistId, key)
        .catch(caught => setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist item could not be removed.'));
    } else {
      void saveDefaultTerminalWatchlist(next.map(toStoredItem))
        .catch(caught => setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be saved.'));
    }
    if (selected === key) setSelected(next[0]?.key || '');
  }, [activeWatchlistId, selected, watch]);

  const switchWatchlist = useCallback(async (id: string) => {
    if (!id || id === activeWatchlistId) return;
    setWatchlistBusy(true);
    setWatchlistError('');
    try {
      const items = await loadTerminalWatchlistItems(id);
      const next = items.map(item => toDockItem({ ...item, key: item.symbol, symbol: item.symbol }));
      setActiveWatchlistId(id);
      setWatchlists(current => current);
      setWatch(next);
      setSelected(next[0]?.key || '');
      try { localStorage.setItem('tradingcore:vela:active-watchlist', id); } catch { /* best effort */ }
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be opened.');
    } finally {
      setWatchlistBusy(false);
    }
  }, [activeWatchlistId]);

  const createWatchlist = useCallback(async () => {
    const name = window.prompt('Name this watchlist', 'Scalps');
    if (!name?.trim()) return;
    setWatchlistBusy(true);
    setWatchlistError('');
    try {
      const created = await createTerminalWatchlist(name);
      setWatchlists(current => [...current, created]);
      setActiveWatchlistId(created.id);
      setWatch([]);
      setSelected('');
      try { localStorage.setItem('tradingcore:vela:active-watchlist', created.id); } catch { /* best effort */ }
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be created.');
    } finally {
      setWatchlistBusy(false);
    }
  }, []);

  const renameWatchlist = useCallback(async () => {
    const activeList = watchlists.find(item => item.id === activeWatchlistId);
    if (!activeList || activeList.is_default) return;
    const name = window.prompt('Rename watchlist', activeList.name);
    if (!name?.trim()) return;
    setWatchlistBusy(true);
    setWatchlistError('');
    try {
      await renameTerminalWatchlist(activeList.id, name);
      setWatchlists(current => current.map(item => item.id === activeList.id ? { ...item, name: name.trim().slice(0, 40) } : item));
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be renamed.');
    } finally {
      setWatchlistBusy(false);
    }
  }, [activeWatchlistId, watchlists]);

  const deleteWatchlist = useCallback(async () => {
    const activeList = watchlists.find(item => item.id === activeWatchlistId);
    if (!activeList || activeList.is_default || !window.confirm(`Delete watchlist “${activeList.name}” and its saved symbols?`)) return;
    setWatchlistBusy(true);
    setWatchlistError('');
    try {
      await deleteTerminalWatchlist(activeList.id);
      const lists = watchlists.filter(item => item.id !== activeList.id);
      setWatchlists(lists);
      const target = lists.find(item => item.is_default) || lists[0];
      if (target) await switchWatchlist(target.id);
      else {
        setActiveWatchlistId(null);
        setWatch(DEFAULT_WATCHLIST);
        setSelected(DEFAULT_WATCHLIST[0].key);
      }
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : 'Watchlist could not be deleted.');
    } finally {
      setWatchlistBusy(false);
    }
  }, [activeWatchlistId, switchWatchlist, watchlists]);

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
          watchlists={watchlists}
          activeWatchlistId={activeWatchlistId || ''}
          watchlistBusy={watchlistBusy}
          watchlistError={watchlistError}
          onSwitchWatchlist={switchWatchlist}
          onCreateWatchlist={() => void createWatchlist()}
          onRenameWatchlist={() => void renameWatchlist()}
          onDeleteWatchlist={() => void deleteWatchlist()}
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
    {alertNotice && <div role="status" className="pointer-events-auto fixed bottom-24 right-6 z-[260] w-[min(360px,calc(100vw-32px))] rounded-xl border border-emerald-800/70 bg-[#0d1b1b]/95 p-3 text-[#e5f7ef] shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Price alert triggered · {alertNotice.source}</div>
          <div className="mt-1 truncate text-[11px] font-semibold">{alertNotice.label}</div>
          <div className="mt-1 text-[10px] text-[#b6c9c3]">{alertNotice.condition.replace('_', ' ')} · ₹{alertNotice.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
        </div>
        <button type="button" aria-label="Dismiss price alert" onClick={() => setAlertNotice(null)} className="rounded p-1 text-[#9eb6ac] hover:bg-white/10"><X size={13}/></button>
      </div>
      <button type="button" onClick={() => { setOpen(true); setActiveTab('alerts'); setAlertNotice(null); }} className="mt-2 rounded-md border border-emerald-700/70 px-2 py-1 text-[9px] font-semibold text-emerald-200 hover:bg-emerald-950/50">View alerts</button>
    </div>}
  </>;
}
