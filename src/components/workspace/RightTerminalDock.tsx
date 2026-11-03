import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, Bell, Bookmark, ChevronDown, GripVertical, Layers3, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import { fetchTradingCoreNewsBundle, type TradingCoreNewsBundle, type TradingCoreNewsItem } from '../../services/news/newsService';
import type { InstrumentSearchSegment, SearchInstrument } from '../../services/marketData/instrumentSearch';
import { buildWatchlistTechnicalSummary, type WatchlistTechnicalSummary } from '../../services/marketData/watchlistTechnicals';
import { historyStore } from '../../services/marketData/HistoryStore';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import type { MarketDepthLevel, NormalizedMarketTick } from '../../types/market';
import { classifyMarketDataHealth } from '../../services/marketData/dataHealth';

export type RightDockTab = 'watchlist' | 'orderbook' | 'alerts';
export type WatchlistDockTab = RightDockTab;
export type WatchlistDockItem = SearchInstrument & { key: string; label: string; short?: string; type?: string };

export const RIGHT_DOCK_TABS = [
  { id: 'watchlist', label: 'WATCHLIST', shortcut: 'Alt+1' },
  { id: 'orderbook', label: 'ORDER BOOK', shortcut: 'Alt+2' },
  { id: 'alerts', label: 'ALERTS', shortcut: 'Alt+3' },
] as const satisfies ReadonlyArray<{ id: RightDockTab; label: string; shortcut: string }>;

export type RightTerminalDockProps = {
  open: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  activeTab: RightDockTab;
  onTabChange: (tab: RightDockTab) => void;
  watch: WatchlistDockItem[];
  selected: string;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: (item: SearchInstrument) => void;
  query: string;
  onQueryChange: (value: string) => void;
  segment: InstrumentSearchSegment;
  onSegmentChange: (value: InstrumentSearchSegment) => void;
  results: SearchInstrument[];
  searching: boolean;
  ticks: Record<string, NormalizedMarketTick>;
  broker: string;
};

type SurfaceContext = {
  watch: WatchlistDockItem[];
  selected: string;
  selectedItem?: WatchlistDockItem;
  selectedTick?: NormalizedMarketTick;
  ticks: Record<string, NormalizedMarketTick>;
  broker: string;
};

type WatchlistSurfaceProps = SurfaceContext & Pick<RightTerminalDockProps,
  'onSelect' | 'onRemove' | 'onAdd' | 'query' | 'onQueryChange' | 'segment' | 'onSegmentChange' | 'results' | 'searching'
>;

type LocalAlert = { id: string; symbol?: string; price: number; createdAt: string; status: string };

const MIN_RIGHT_DOCK_WIDTH = 260;
const MAX_RIGHT_DOCK_WIDTH = 460;

const clampDockWidth = (value: number) => Math.min(MAX_RIGHT_DOCK_WIDTH, Math.max(MIN_RIGHT_DOCK_WIDTH, Math.round(value)));

const sectionFor = (item: WatchlistDockItem) => {
  const text = `${item.type || ''} ${item.label || ''}`.toLowerCase();
  if (text.includes('future')) return 'FUTURES';
  if (text.includes('commodity')) return 'COMMODITIES';
  if (text.includes('option')) return 'OPTIONS';
  return 'INDICES';
};

const formatPrice = (value: unknown) => value == null || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatNewsTime = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'recent' : d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const depthRows = (levels: MarketDepthLevel[] | undefined) => (Array.isArray(levels) ? levels : []).slice(0, 8);

function useSymbolAlerts(selectedKey?: string) {
  const storageKey = `tradingcore:alerts:${selectedKey || 'chart'}`;
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const [alertPrice, setAlertPrice] = useState('');

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setAlerts(Array.isArray(value) ? value : []);
    } catch {
      setAlerts([]);
    }
    setAlertPrice('');
  }, [storageKey]);

  const persist = (next: LocalAlert[]) => {
    setAlerts(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const arm = () => {
    const price = Number(alertPrice);
    if (!selectedKey || !Number.isFinite(price) || price <= 0) return false;
    const next: LocalAlert = {
      id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
      symbol: selectedKey,
      price,
      createdAt: new Date().toISOString(),
      status: 'armed',
    };
    persist([...alerts, next].slice(-50));
    setAlertPrice('');
    return true;
  };

  const remove = (id: string) => persist(alerts.filter(x => x.id !== id));

  return { alerts, alertPrice, setAlertPrice, arm, remove };
}

const WatchlistSurface = memo(function WatchlistSurface(props: WatchlistSurfaceProps) {
  const { watch, selected, selectedItem, selectedTick, broker, ticks, onSelect, onRemove, onAdd, query, onQueryChange, segment, onSegmentChange, results, searching } = props;
  const [newsByKey, setNewsByKey] = useState<Record<string, TradingCoreNewsBundle>>({});
  const [newsLoadingByKey, setNewsLoadingByKey] = useState<Record<string, boolean>>({});
  const [technicalByKey, setTechnicalByKey] = useState<Record<string, WatchlistTechnicalSummary | null>>({});
  const [technicalLoadingByKey, setTechnicalLoadingByKey] = useState<Record<string, boolean>>({});
  const newsByKeyRef = useRef<Record<string, TradingCoreNewsBundle>>({});
  const technicalByKeyRef = useRef<Record<string, WatchlistTechnicalSummary | null>>({});
  const newsInFlightRef = useRef(new Set<string>());
  const technicalInFlightRef = useRef(new Set<string>());

  const watchItems = useMemo(() => {
    const byKey = new Map<string, WatchlistDockItem>();
    for (const item of watch) byKey.set(item.key, item);
    if (selectedItem) byKey.set(selectedItem.key, selectedItem);
    return [...byKey.values()];
  }, [watch, selectedItem]);
  const watchItemsRef = useRef(watchItems);
  watchItemsRef.current = watchItems;
  const watchKeys = watchItems.map(item => item.key).join('\u001f');

  // Fetch news for all visible watchlist symbols with a small concurrency budget.
  // The server already deduplicates in-flight calls and caches feeds for 90 seconds.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const pending = watchItemsRef.current.filter(item =>
      !Object.prototype.hasOwnProperty.call(newsByKeyRef.current, item.key)
      && !newsInFlightRef.current.has(item.key));
    for (const item of pending) {
      newsInFlightRef.current.add(item.key);
      setNewsLoadingByKey(current => ({ ...current, [item.key]: true }));
    }
    let cursor = 0;
    const worker = async () => {
      while (active && cursor < pending.length) {
        const item = pending[cursor++]!;
        try {
          const bundle = await fetchTradingCoreNewsBundle(item.short || item.label || item.key, controller.signal);
          if (active) {
            newsByKeyRef.current[item.key] = bundle;
            setNewsByKey(current => ({ ...current, [item.key]: bundle }));
          }
        } catch {
          if (active && !controller.signal.aborted) {
            const unavailable: TradingCoreNewsBundle = { provider: 'Unavailable', items: [], fetchedAt: new Date().toISOString() };
            newsByKeyRef.current[item.key] = unavailable;
            setNewsByKey(current => ({ ...current, [item.key]: unavailable }));
          }
        } finally {
          newsInFlightRef.current.delete(item.key);
          if (active) setNewsLoadingByKey(current => ({ ...current, [item.key]: false }));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(2, pending.length) }, () => worker()));
    return () => {
      active = false;
      controller.abort();
      for (const item of pending) newsInFlightRef.current.delete(item.key);
    };
  }, [watchKeys]);

  // Calculate watchlist technicals from the same cached 5-minute candle timeline.
  // No external indicator endpoint is needed for RSI/EMA/MACD summaries.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const pending = watchItemsRef.current.filter(item =>
      !Object.prototype.hasOwnProperty.call(technicalByKeyRef.current, item.key)
      && !technicalInFlightRef.current.has(item.key));
    for (const item of pending) {
      technicalInFlightRef.current.add(item.key);
      setTechnicalLoadingByKey(current => ({ ...current, [item.key]: true }));
    }
    let cursor = 0;
    const worker = async () => {
      while (active && cursor < pending.length) {
        const item = pending[cursor++]!;
        try {
          const cacheBrokerId = String(tradingCoreRuntime.getPrimaryBrokerId() || broker || 'unknown').toLowerCase();
          await historyStore.hydrate(cacheBrokerId, item.key, '5minute');
          const savedCandles = historyStore.getStale(cacheBrokerId, item.key, '5minute');
          const candles = savedCandles?.length
            ? savedCandles.slice(-2_000)
            : await tradingCoreRuntime.getHistoricalData(item.key, '5minute', controller.signal, 2_000);
          if (active) {
            const summary = buildWatchlistTechnicalSummary(candles);
            technicalByKeyRef.current[item.key] = summary;
            setTechnicalByKey(current => ({ ...current, [item.key]: summary }));
          }
        } catch {
          if (active && !controller.signal.aborted) {
            technicalByKeyRef.current[item.key] = null;
            setTechnicalByKey(current => ({ ...current, [item.key]: null }));
          }
        } finally {
          technicalInFlightRef.current.delete(item.key);
          if (active) setTechnicalLoadingByKey(current => ({ ...current, [item.key]: false }));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(2, pending.length) }, () => worker()));
    return () => {
      active = false;
      controller.abort();
      for (const item of pending) technicalInFlightRef.current.delete(item.key);
    };
  }, [watchKeys, broker]);

  const refreshNews = (item: WatchlistDockItem) => {
    const key = item.key;
    setNewsLoadingByKey(current => ({ ...current, [key]: true }));
    void fetchTradingCoreNewsBundle(item.short || item.label || item.key)
      .then(bundle => {
        newsByKeyRef.current[key] = bundle;
        setNewsByKey(current => ({ ...current, [key]: bundle }));
      })
      .catch(() => {
        const unavailable: TradingCoreNewsBundle = { provider: 'Unavailable', items: [], fetchedAt: new Date().toISOString() };
        newsByKeyRef.current[key] = unavailable;
        setNewsByKey(current => ({ ...current, [key]: unavailable }));
      })
      .finally(() => setNewsLoadingByKey(current => ({ ...current, [key]: false })));
  };

  const selectedNewsBundle = selectedItem ? newsByKey[selectedItem.key] : undefined;
  const news: TradingCoreNewsItem[] = selectedNewsBundle?.items || [];
  const newsLoading = Boolean(selectedItem && newsLoadingByKey[selectedItem.key]);
  const selectedTechnical = selectedItem ? technicalByKey[selectedItem.key] : undefined;
  const selectedTechnicalLoading = Boolean(selectedItem && technicalLoadingByKey[selectedItem.key]);

  const groups = useMemo(() => {
    const map = new Map<string, WatchlistDockItem[]>([['INDICES', []], ['FUTURES', []], ['COMMODITIES', []], ['OPTIONS', []]]);
    for (const item of watch) {
      const section = sectionFor(item);
      const list = map.get(section) || [];
      list.push(item);
      map.set(section, list);
    }
    return [...map.entries()].filter(([section, items]) => section === 'INDICES' || items.length > 0);
  }, [watch]);

  return <div className="tct-dock-content" id="tct-panel-watchlist" role="tabpanel" aria-labelledby="tct-tab-watchlist" data-tco-dock-surface="watchlist">
    <div className="tct-wl-head"><div className="tct-wl-account">WATCHLIST <span>· {broker.toUpperCase()}</span></div><div className="tct-wl-actions"><button className="tct-rail-mini" title="More watchlist actions" type="button"><MoreHorizontal size={15}/></button></div></div>
    <div className="tct-wl-search"><Search size={14}/><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search instruments" aria-label="Search instruments"/><span>{watch.length}</span></div>
    <div className="tct-wl-filters">
      <select value={segment} onChange={e => onSegmentChange(e.target.value as InstrumentSearchSegment)} aria-label="Instrument segment"><option value="all">All</option><option value="equity">Equity</option><option value="index">Index</option><option value="futures">Futures</option><option value="options">Options</option></select>
      {selectedItem && <span className="tct-selection-chip">{selectedItem.short || selectedItem.label}</span>}
    </div>
    <div className="tct-wl-columns"><span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span></div>
    <div className="tct-wl-scroll">
      {query.length >= 2 && <div className="tct-wl-results">{searching ? <div className="tct-wl-empty">Searching broker instruments…</div> : results.length ? results.map(r => <button type="button" className="tct-wl-result" key={r.key} onClick={() => onAdd(r)}><Plus size={13}/><span><b>{r.label || r.symbol}</b><small>{r.exchange || ''} {r.type || ''} {r.expiry || ''} {r.strike || ''} {r.optionType || ''}</small></span></button>) : <div className="tct-wl-empty">No matching broker instrument.</div>}</div>}
      {groups.map(([group, items]) => <div key={group} className="tct-wl-group">
        <div className="tct-wl-section"><ChevronDown size={12}/>{group}</div>
        {items.map(item => {
          const tick = ticks[item.key];
          const change = tick?.change;
          const pct = tick?.changePercent;
          const health = classifyMarketDataHealth({ source: tick?.source, lastUpdateAt: tick?.brokerTimestamp ?? tick?.timestamp ?? tick?.lastTradeTimestamp, receivedAt: tick?.receivedAtEpoch ?? tick?.receivedAt, providerConnected: tick?.source === 'fyers', expectedIntervalMs: 5_000 });
          const positive = Number(pct ?? change ?? 0) >= 0;
          return <button type="button" key={item.key} className={`tct-wl-row ${selected === item.key ? 'selected' : ''}`} onClick={() => onSelect(item.key)}>
            <span className="tct-wl-badge">{(item.short || item.label || '?').slice(0, 3).toUpperCase()}</span>
            <span className="tct-wl-symbol">
              <b>{item.short || item.label}</b>
              <small>{item.label !== item.short ? item.label : item.type || ''}</small>
              <small className={`tct-wl-data-health tct-wl-data-health-${health.state}`} title={health.reason}>{health.label} · {health.source.toUpperCase()}</small>
              <small className={technicalByKey[item.key] ? `tct-wl-tech tct-wl-tech-${technicalByKey[item.key]!.trend.toLowerCase()}` : 'tct-wl-tech'}>
                {technicalByKey[item.key]
                  ? `${technicalByKey[item.key]!.trend.toUpperCase()} · RSI ${technicalByKey[item.key]!.rsi14.toFixed(1)} · EMA20 ${formatPrice(technicalByKey[item.key]!.ema20)}`
                  : technicalLoadingByKey[item.key] ? 'Calculating technicals…'
                    : Object.prototype.hasOwnProperty.call(technicalByKey, item.key) ? 'Technicals unavailable' : 'Technicals pending'}
              </small>
              <small className="tct-wl-news">
                {newsByKey[item.key]?.items[0]?.title || (newsLoadingByKey[item.key] ? 'Fetching news…' : newsByKey[item.key] ? 'No recent news' : 'News pending')}
              </small>
            </span>
            <span className="tct-wl-last">{formatPrice(tick?.ltp)}</span>
            <span className={positive ? 'tct-wl-up' : 'tct-wl-down'}>{change == null ? '—' : `${positive ? '+' : ''}${formatPrice(change)}`}</span>
            <span className={positive ? 'tct-wl-up' : 'tct-wl-down'}>{pct == null ? '—' : `${positive ? '+' : ''}${Number(pct).toFixed(2)}%`}</span>
            <span className="tct-wl-remove" role="button" tabIndex={0} title={`Remove ${item.short || item.label}`} onClick={e => { e.stopPropagation(); onRemove(item.key); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onRemove(item.key); } }}><Trash2 size={11}/></span>
          </button>;
        })}
      </div>)}
      {!watch.length && <div className="tct-wl-empty">Your watchlist is empty.</div>}
    </div>

    {selectedItem && <section className="tct-ticker-card">
      <div className="tct-ticker-top"><div className="tct-ticker-ident"><span className="tct-wl-badge large">{(selectedItem.short || selectedItem.label).slice(0, 3).toUpperCase()}</span><div><b>{selectedItem.short || selectedItem.label}</b><small>{selectedItem.label} · {selectedItem.type || 'Instrument'}</small></div></div></div>
      <div className="tct-ticker-price">{formatPrice(selectedTick?.ltp)} <span>LAST</span></div>
      <div className={`tct-ticker-change ${(selectedTick?.changePercent ?? selectedTick?.change ?? 0) >= 0 ? 'tct-wl-up' : 'tct-wl-down'}`}>{selectedTick?.change == null ? '—' : `${selectedTick.change >= 0 ? '+' : ''}${formatPrice(selectedTick.change)}`} <b>{selectedTick?.changePercent == null ? '—' : `${selectedTick.changePercent >= 0 ? '+' : ''}${Number(selectedTick.changePercent).toFixed(2)}%`}</b></div>
      <div className="tct-market-state"><span className="tct-state-dot"/> Market data live <small>{selectedTick?.receivedAt ? new Date(selectedTick.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</small></div>
      <div className={selectedTechnical ? `tct-ticker-technical tct-wl-tech-${selectedTechnical.trend.toLowerCase()}` : 'tct-ticker-technical'}>
        <div className="tct-ticker-technical-title"><b>TECHNICALS</b><span>{selectedTechnical?.trend.toUpperCase() || (selectedTechnicalLoading ? 'CALCULATING…' : 'UNAVAILABLE')}</span></div>
        {selectedTechnical && <div className="tct-ticker-technical-values">
          <span>RSI 14 <b>{selectedTechnical.rsi14.toFixed(1)}</b></span>
          <span>EMA 20 <b>{formatPrice(selectedTechnical.ema20)}</b></span>
          <span>EMA 50 <b>{formatPrice(selectedTechnical.ema50)}</b></span>
          <span>MACD H <b>{selectedTechnical.macdHistogram.toFixed(2)}</b></span>
        </div>}
        {selectedTechnical && <small>From {selectedTechnical.candleCount.toLocaleString()} 5-minute candles · {formatNewsTime(selectedTechnical.asOf)}</small>}
      </div>
      <div className="tct-news">
        <div className="tct-news-head"><b>NEWS</b><span>{selectedNewsBundle?.provider || (newsLoading ? 'Loading provider…' : 'Market news')}</span><button type="button" title="Refresh news" onClick={() => { if (selectedItem) refreshNews(selectedItem); }}>{newsLoading ? '…' : '↻'}</button></div>
        {newsLoading && !news.length ? <small>Loading market news…</small> : news.length ? <div className="tct-news-list">{news.slice(0, 4).map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="tct-news-item"><b>{item.title}</b><small>{item.source} · {formatNewsTime(item.publishedAt)}</small></a>)}</div> : <small>No news available for this instrument right now.</small>}
      </div>
    </section>}
  </div>;
});

const OrderBookSurface = memo(function OrderBookSurface({ selectedItem, selectedTick }: Pick<SurfaceContext, 'selectedItem' | 'selectedTick'>) {
  const ask = depthRows(selectedTick?.ask);
  const bid = depthRows(selectedTick?.bid);
  const spread = ask.length && bid.length ? Number(ask[0].price) - Number(bid[0].price) : 0;
  const maxQty = Math.max(1, ...ask.map(x => Number(x.quantity) || 0), ...bid.map(x => Number(x.quantity) || 0));

  return <div className="tct-dock-content tct-orderbook-content" id="tct-panel-orderbook" role="tabpanel" aria-labelledby="tct-tab-orderbook" data-tco-dock-surface="orderbook">
    <div className="tct-ob-summary"><div><span>LAST</span><b>{formatPrice(selectedTick?.ltp)}</b></div><div><span>SPREAD</span><b>{spread ? formatPrice(spread) : '—'}</b></div><div><span>VOLUME</span><b>{selectedTick?.volume == null ? '—' : formatPrice(selectedTick.volume)}</b></div></div>
    <div className="tct-ob-title"><b>{selectedItem?.short || selectedItem?.label || 'Selected instrument'}</b><span>Level 2</span></div>
    <div className="tct-ob-head"><span>ASK QTY</span><span>ASK</span><span>BID</span><span>BID QTY</span></div>
    <div className="tct-ob-scroll">
      {Array.from({length: Math.max(ask.length, bid.length, 1)}, (_, i) => {
        const a = ask[ask.length - 1 - i];
        const b = bid[i];
        const askStyle = {'--ob-pct': `${Math.min(100, ((Number(a?.quantity) || 0) / maxQty) * 100)}%`} as CSSProperties;
        const bidStyle = {'--ob-pct': `${Math.min(100, ((Number(b?.quantity) || 0) / maxQty) * 100)}%`} as CSSProperties;
        return <div key={i} className="tct-ob-row">
          <span className="tct-ob-askbar" style={askStyle}>{a ? formatPrice(a.quantity) : '—'}</span>
          <span className="tct-ob-ask">{a ? formatPrice(a.price) : '—'}</span>
          <span className="tct-ob-bid">{b ? formatPrice(b.price) : '—'}</span>
          <span className="tct-ob-bidbar" style={bidStyle}>{b ? formatPrice(b.quantity) : '—'}</span>
        </div>;
      })}
      {!ask.length && !bid.length && <div className="tct-wl-empty"><AlertTriangle size={14}/> No Level 2 depth is currently available from this route.</div>}
    </div>
  </div>;
});

const AlertsSurface = memo(function AlertsSurface({ selectedItem }: Pick<SurfaceContext, 'selectedItem'>) {
  const { alerts, alertPrice, setAlertPrice, arm, remove } = useSymbolAlerts(selectedItem?.key);
  return <div className="tct-dock-content tct-alerts-content" id="tct-panel-alerts" role="tabpanel" aria-labelledby="tct-tab-alerts" data-tco-dock-surface="alerts">
    <div className="tct-alert-create"><div className="tct-alert-ident"><Bell size={14}/><div><b>PRICE ALERT</b><small>{selectedItem?.label || 'Select an instrument'}</small></div></div><div className="tct-alert-entry"><input type="number" value={alertPrice} onChange={e => setAlertPrice(e.target.value)} placeholder="Trigger price" aria-label="Trigger price"/><button type="button" onClick={arm} disabled={!selectedItem || !alertPrice}>ARM</button></div></div>
    <div className="tct-alert-head"><span>ACTIVE ALERTS</span><b>{alerts.length}</b></div>
    <div className="tct-alert-list">{alerts.length ? alerts.slice().reverse().map(alert => <div className="tct-alert-row" key={alert.id}><div><b>₹{formatPrice(alert.price)}</b><small>{alert.status.toUpperCase()} · {new Date(alert.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><button type="button" onClick={() => remove(alert.id)} title="Remove alert"><X size={12}/></button></div>) : <div className="tct-wl-empty"><Bell size={14}/> No alerts armed for this instrument.</div>}</div>
  </div>;
});

export function RightTerminalDock(props: RightTerminalDockProps) {
  const { open, onToggle, width, onWidthChange, activeTab, onTabChange, watch, selected, onSelect, onRemove, onAdd, query, onQueryChange, segment, onSegmentChange, results, searching, ticks, broker } = props;
  const [resizing, setResizing] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedItem = watch.find(x => x.key === selected) || watch[0];
  const selectedTick = selectedItem ? ticks[selectedItem.key] : undefined;

  useEffect(() => {
    if (!resizing) return;
    let frame: number | null = null;
    let pendingWidth: number | null = null;
    const flush = () => {
      frame = null;
      if (pendingWidth != null) {
        onWidthChange(pendingWidth);
        pendingWidth = null;
      }
    };
    const onMove = (event: PointerEvent) => {
      pendingWidth = clampDockWidth(window.innerWidth - event.clientX);
      if (frame == null) frame = requestAnimationFrame(flush);
    };
    const onUp = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      if (pendingWidth != null) onWidthChange(pendingWidth);
      pendingWidth = null;
      setResizing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing, onWidthChange]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const current = RIGHT_DOCK_TABS.findIndex(tab => tab.id === activeTab);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = (current + 1) % RIGHT_DOCK_TABS.length;
      const tab = RIGHT_DOCK_TABS[next].id;
      onTabChange(tab);
      tabRefs.current[next]?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (current - 1 + RIGHT_DOCK_TABS.length) % RIGHT_DOCK_TABS.length;
      const tab = RIGHT_DOCK_TABS[next].id;
      onTabChange(tab);
      tabRefs.current[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : RIGHT_DOCK_TABS.length - 1;
      const tab = RIGHT_DOCK_TABS[next].id;
      onTabChange(tab);
      tabRefs.current[next]?.focus();
    }
  };

  const tabPanel = activeTab === 'watchlist'
    ? <WatchlistSurface {...props} selectedItem={selectedItem} selectedTick={selectedTick} />
    : activeTab === 'orderbook'
      ? <OrderBookSurface selectedItem={selectedItem} selectedTick={selectedTick} />
      : <AlertsSurface selectedItem={selectedItem} />;

  return <aside className={`tct-rightdock ${open ? 'open' : 'closed'} ${resizing ? 'resizing' : ''}`} style={open ? { ['--tct-right-width' as string]: `${clampDockWidth(width)}px` } : undefined} aria-label="TradingCore right workspace dock">
    {open && <>
      <button type="button" className="tct-right-resizer" title="Resize right dock" aria-label="Resize right dock" onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setResizing(true); }}><GripVertical size={13}/></button>
      <section className="tct-watchpanel" data-tco-dock="right">
        <header className="tct-dock-tabs" role="tablist" aria-label="Right dock panels">
          {RIGHT_DOCK_TABS.map((definition, index) => {
            const tab = definition.id;
            const active = activeTab === tab;
            return <button type="button" key={tab} id={`tct-tab-${tab}`} ref={node => { tabRefs.current[index] = node; }} role="tab" aria-selected={active} aria-controls={`tct-panel-${tab}`} tabIndex={active ? 0 : -1} className={active ? 'active' : ''} onClick={() => onTabChange(tab)} onKeyDown={handleTabKeyDown} title={`${definition.label} · ${definition.shortcut}`}>
              <span>{definition.label}</span><kbd>{definition.shortcut}</kbd>
            </button>;
          })}
          <button type="button" className="tct-dock-close" aria-label="Collapse right dock" title="Collapse right dock" onClick={onToggle}><X size={14}/></button>
        </header>

        {tabPanel}
        <footer className="tct-dock-status" aria-label="Right dock status">
          <span><i className="tct-status-dot"/>LIVE</span>
          <span>{selectedItem?.short || selectedItem?.label || 'NO SYMBOL'}</span>
          <span className="tct-status-key">Alt+0 collapse</span>
        </footer>
      </section>
    </>}
    {!open && <nav className="tct-right-rail" aria-label="Right dock shortcuts">
      <button type="button" className="tct-right-rail-btn" title="Open watchlist" onClick={() => { onTabChange('watchlist'); onToggle(); }}><Bookmark size={18}/></button>
      <button type="button" className="tct-right-rail-btn" title="Open order book" onClick={() => { onTabChange('orderbook'); onToggle(); }}><Layers3 size={16}/></button>
      <button type="button" className="tct-right-rail-btn" title="Open alerts" onClick={() => { onTabChange('alerts'); onToggle(); }}><Bell size={18}/></button>
    </nav>}
  </aside>;
}

// Compatibility export for older imports. New code should import RightTerminalDock.
export const WatchlistDock = RightTerminalDock;
