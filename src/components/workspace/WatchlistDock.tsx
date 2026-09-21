import { useEffect, useMemo, useState } from 'react';
import { fetchTradingCoreNews, TradingCoreNewsItem } from '../../services/news/newsService';
import { Bookmark, Bell, CircleDot, Grid3X3, HelpCircle, History, Layers3, MoreHorizontal, Pencil, Plus, Search, X } from 'lucide-react';
import type { NormalizedMarketTick } from '../../types/market';
import type { InstrumentSearchSegment, SearchInstrument } from '../../services/marketData/instrumentSearch';

export type WatchlistDockItem = SearchInstrument & { key: string; label: string; short?: string; type?: string };

type Props = {
  open: boolean;
  onToggle: () => void;
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
}

const railItems = [
  ['watchlist', Bookmark, 'Watchlist'],
  ['history', History, 'Recent / history'],
  ['layers', Layers3, 'Object tree'],
  ['alerts', Bell, 'Alerts'],
  ['snap', CircleDot, 'TradingCore tools'],
  ['calendar', Grid3X3, 'Calendar / events'],
  ['help', HelpCircle, 'Help'],
] as const;

const sectionFor = (item: WatchlistDockItem) => {
  const text = `${item.type || ''} ${item.label || ''}`.toLowerCase();
  if (text.includes('future')) return 'FUTURES';
  if (text.includes('commodity')) return 'COMMODITIES';
  if (text.includes('option')) return 'OPTIONS';
  return 'INDICES';
};

const formatPrice = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatNewsTime = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'recent' : d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function WatchlistDock(props: Props) {
  const { open, onToggle, watch, selected, onSelect, onRemove, onAdd, query, onQueryChange, segment, onSegmentChange, results, searching, ticks, broker } = props;
  const [railActive, setRailActive] = useState('watchlist');
  const [news, setNews] = useState<TradingCoreNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const selectedItem = watch.find(x => x.key === selected) || watch[0];
  const selectedTick = selectedItem ? ticks[selectedItem.key] : undefined;

  useEffect(() => {
    if (open) setRailActive('watchlist');
  }, [open]);

  useEffect(() => {
    if (!selectedItem) { setNews([]); return; }
    const controller = new AbortController();
    let dead = false;
    setNewsLoading(true);
    const timer = window.setTimeout(() => {
      void fetchTradingCoreNews(selectedItem.short || selectedItem.label || selectedItem.key, controller.signal)
        .then(items => { if (!dead) setNews(items); })
        .catch(() => { if (!dead) setNews([]); })
        .finally(() => { if (!dead) setNewsLoading(false); });
    }, 80);
    return () => { dead = true; controller.abort(); window.clearTimeout(timer); };
  }, [selectedItem?.key]);

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

  return (
    <aside className="tct-rightdock" aria-label="TradingCore right workspace dock">
      {open && <section className="tct-watchpanel">
        <header className="tct-wl-head">
          <div className="tct-wl-account">WATCHLIST <span>· {broker.toUpperCase()}</span></div>
          <div className="tct-wl-actions"><button className="tct-rail-mini" title="Edit watchlist"><Pencil size={14} /></button><button className="tct-rail-mini" title="More watchlist actions"><MoreHorizontal size={15} /></button><button className="tct-rail-mini" title="Close watchlist" onClick={onToggle}><X size={15} /></button></div>
        </header>
        <div className="tct-wl-search"><Search size={14}/><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search"/><span>{watch.length}</span></div>
        <div className="tct-wl-columns"><span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span></div>
        <div className="tct-wl-scroll">
          {query.length >= 2 && <div className="tct-wl-results">{searching ? <div className="tct-wl-empty">Searching broker instruments…</div> : results.length ? results.map(r => <button className="tct-wl-result" key={r.key} onClick={() => onAdd(r)}><Plus size={13}/><span><b>{r.label || r.symbol}</b><small>{r.exchange || ''} {r.type || ''} {r.expiry || ''} {r.strike || ''} {r.optionType || ''}</small></span></button>) : <div className="tct-wl-empty">No matching broker instrument.</div>}</div>}
          {groups.map(([group, items]) => <div key={group} className="tct-wl-group">
            <div className="tct-wl-section"><span>⌄</span>{group}</div>
            {items.map(item => {
              const tick = ticks[item.key];
              const change = tick?.change;
              const pct = tick?.changePercent;
              const positive = Number(pct ?? change ?? 0) >= 0;
              return <button key={item.key} className={`tct-wl-row ${selected === item.key ? 'selected' : ''}`} onClick={() => onSelect(item.key)}>
                <span className="tct-wl-badge">{(item.short || item.label || '?').slice(0, 3).toUpperCase()}</span>
                <span className="tct-wl-symbol"><b>{item.short || item.label}</b><small>{item.label !== item.short ? item.label : item.type || ''}</small></span>
                <span className="tct-wl-last">{formatPrice(tick?.ltp)}</span>
                <span className={positive ? 'tct-wl-up' : 'tct-wl-down'}>{change == null ? '—' : `${positive ? '+' : ''}${formatPrice(change)}`}</span>
                <span className={positive ? 'tct-wl-up' : 'tct-wl-down'}>{pct == null ? '—' : `${positive ? '+' : ''}${Number(pct).toFixed(2)}%`}</span>
                <span className="tct-wl-remove" onClick={e => { e.stopPropagation(); onRemove(item.key); }}><X size={11}/></span>
              </button>;
            })}
          </div>)}
          {!watch.length && <div className="tct-wl-empty">Your watchlist is empty.</div>}
        </div>

        {selectedItem && <section className="tct-ticker-card">
          <div className="tct-ticker-top"><div className="tct-ticker-ident"><span className="tct-wl-badge large">{(selectedItem.short || selectedItem.label).slice(0, 3).toUpperCase()}</span><div><b>{selectedItem.short || selectedItem.label}</b><small>{selectedItem.label} · {selectedItem.type || 'Instrument'}</small></div></div><button className="tct-rail-mini"><MoreHorizontal size={15}/></button></div>
          <div className="tct-ticker-price">{formatPrice(selectedTick?.ltp)} <span>POINT</span></div>
          <div className={`tct-ticker-change ${(selectedTick?.changePercent ?? selectedTick?.change ?? 0) >= 0 ? 'tct-wl-up' : 'tct-wl-down'}`}>{selectedTick?.change == null ? '—' : `${selectedTick.change >= 0 ? '+' : ''}${formatPrice(selectedTick.change)}`} <b>{selectedTick?.changePercent == null ? '—' : `${selectedTick.changePercent >= 0 ? '+' : ''}${Number(selectedTick.changePercent).toFixed(2)}%`}</b></div>
          <div className="tct-market-state"><span className="tct-state-dot"/> Market data live <small>Last update {(selectedTick?.lastTradeTimestamp || selectedTick?.receivedAt) ? new Date(selectedTick.lastTradeTimestamp || selectedTick.receivedAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</small></div>
          <div className="tct-range"><div><span>DAY'S RANGE</span><b>—</b><b>—</b></div><div className="tct-range-bar"><i/><em/></div><div><span>52WK RANGE</span><b>—</b><b>—</b></div></div>
          <div className="tct-news">
            <div className="tct-news-head"><b>News</b><span>GDELT · free</span><button type="button" title="Refresh news" onClick={() => {
              if (!selectedItem) return;
              setNewsLoading(true);
              void fetchTradingCoreNews(selectedItem.short || selectedItem.label || selectedItem.key)
                .then(setNews).catch(() => setNews([])).finally(() => setNewsLoading(false));
            }}>{newsLoading ? '…' : '↻'}</button></div>
            {newsLoading && !news.length ? <small>Loading market news…</small> : news.length ? (
              <div className="tct-news-list">{news.slice(0, 5).map(item => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="tct-news-item">
                  <b>{item.title}</b><small>{item.source} · {formatNewsTime(item.publishedAt)}</small>
                </a>
              ))}</div>
            ) : <small>No news available for this instrument right now.</small>}
          </div>
          <div className="tct-performance"><b>Performance</b><div className="tct-performance-grid"><span>Change</span><strong>{selectedTick?.changePercent == null ? '—' : `${Number(selectedTick.changePercent).toFixed(2)}%`}</strong></div></div>
        </section>}
      </section>}
      <nav className="tct-right-rail" aria-label="Workspace tools">
        <button className={`tct-right-rail-btn ${open ? 'active' : ''}`} title="Watchlist" aria-label="Watchlist" onClick={() => { setRailActive('watchlist'); onToggle(); }}>
          <Bookmark size={18} strokeWidth={1.65}/>
        </button>
      </nav>
    </aside>
  );
}
