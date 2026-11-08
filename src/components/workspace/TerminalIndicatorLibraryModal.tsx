import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, CircleHelp, Heart, Loader2, MessageCircle, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import { getTerminalIndicatorFavoriteKeys, setTerminalIndicatorFavorite } from '../../services/terminal/terminalDataService';
import { listMyIndicatorPublications, listPublicIndicatorPublications, saveIndicatorSourceLocally, type IndicatorPublication } from '../../services/coreSpirit/indicatorPublicationService';

type NativeIndicatorInfo = {
  type: string;
  title: string;
  supported: boolean;
  present: boolean;
  multiInstance?: boolean;
  beta?: boolean;
};

type VelaIndicatorBridge = {
  [key: string]: unknown;
  getNativeIndicatorCatalog?: () => Promise<NativeIndicatorInfo[]>;
  addNativeIndicator?: (type: string) => Promise<{ id?: string; alreadyPresent?: boolean }>;
};

declare global {
  interface Window {
    __TCO_VELA__?: VelaIndicatorBridge;
  }
}

const CATEGORIES = [
  'Discover', 'Favorites', 'My Scripts', 'Bring a Script', 'Basic',
  'Trend', 'Momentum', 'Volatility', 'Volume & Order Flow', 'SMC / ICT',
  'Market Structure', 'Patterns', 'Statistics', 'Support/Resistance & Levels',
  'Time & Seasonality', 'Elliott & Harmonics', 'Sentiment & Breadth',
  'Meta & Composition', 'Machine Learning', 'Wyckoff', 'Risk', 'Other',
] as const;

type Category = typeof CATEGORIES[number];
type NativeFamily = Exclude<Category, 'Discover' | 'Favorites' | 'My Scripts' | 'Bring a Script' | 'Basic'>;

function familyFor(item: NativeIndicatorInfo): NativeFamily {
  const value = (item.type + ' ' + item.title).toLowerCase();
  if (/smc|ict|order block|fair value gap|liquidity|bos|choch/.test(value)) return 'SMC / ICT';
  if (/volume|vwap|obv|chaikin|money flow|delta|footprint|accumulation|cvd/.test(value)) return 'Volume & Order Flow';
  if (/rsi|stochastic|momentum|roc|cmo|macd|cci|williams|awesome oscillator/.test(value)) return 'Momentum';
  if (/atr|volatil|band|keltner|donchian|deviation|range/.test(value)) return 'Volatility';
  if (/aroon|adx|trend|supertrend|moving average|sma|ema|hma|ichimoku|directional/.test(value)) return 'Trend';
  if (/pivot|support|resistance|swing|fractal|structure|zigzag|market profile/.test(value)) return 'Support/Resistance & Levels';
  if (/pattern|harmonic|triangle|wedge|flag|head and shoulders/.test(value)) return 'Patterns';
  if (/statistics|zscore|z-score|regression|correlation|variance|deviation/.test(value)) return 'Statistics';
  if (/season|session|time|opening range|killzone/.test(value)) return 'Time & Seasonality';
  if (/elliott|fibonacci|harmonic|wave/.test(value)) return 'Elliott & Harmonics';
  if (/breadth|sentiment|advance|decline|put.call/.test(value)) return 'Sentiment & Breadth';
  if (/machine learning|ml|classifier|cluster|forecast|prediction/.test(value)) return 'Machine Learning';
  if (/wyckoff|accumulation|distribution|spring|upthrust/.test(value)) return 'Wyckoff';
  if (/risk|position size|sizing|stop|target|exit/.test(value)) return 'Risk';
  if (/meta|composite|combine|multi/.test(value)) return 'Meta & Composition';
  if (/bos|choch|swing|structure|zigzag/.test(value)) return 'Market Structure';
  return 'Other';
}

function descriptionFor(item: NativeIndicatorInfo, family: string): string {
  const name = item.title.toLowerCase();
  if (name.includes('relative strength') || item.type.includes('rsi')) return 'Measures the speed and magnitude of recent price changes to help identify momentum regimes and stretched conditions.';
  if (name.includes('average true range') || item.type.includes('true-range')) return 'Measures realised range expansion and contraction. ATR is a volatility measure, not a directional signal.';
  if (name.includes('directional index') || item.type.includes('directional-index')) return 'Measures trend strength using directional movement. Read ADX alongside +DI and −DI rather than as a standalone direction signal.';
  if (name.includes('volume profile') || item.type.includes('vpvr')) return 'Maps traded volume by price to help inspect high- and low-acceptance areas within the selected range.';
  if (family === 'Volume & Order Flow') return 'Analyses participation and volume behaviour using the market data available for this instrument. Results depend on source volume quality.';
  if (family === 'Trend') return 'Highlights directional structure and smoothing behaviour. Review the selected inputs and the active timeframe before using it in a trading decision.';
  if (family === 'Momentum') return 'Summarises the strength and persistence of price movement. Oscillator readings should be interpreted with the broader market regime.';
  if (family === 'Volatility') return 'Measures price dispersion and range behaviour to contextualise risk, expansion and contraction.';
  return 'A native Vela chart study. Its calculations, inputs and plots are rendered by the chart engine.';
}

function PreviewGraphic({ type, family, large = false }: { type: string; family: string; large?: boolean }) {
  const seed = Array.from(type).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const candles = Array.from({ length: 24 }, (_, index) => {
    const mid = 49 + Math.sin(index * 0.62 + seed * 0.01) * 12 + Math.cos(index * 0.21 + seed * 0.02) * 6;
    const open = mid + Math.sin(index * 1.4 + seed) * 4;
    const close = mid + Math.cos(index * 1.1 + seed * 0.03) * 5;
    return { x: 12 + index * 10, open, close, high: Math.min(open, close) - 4 - (index % 3), low: Math.max(open, close) + 4 + (index % 2) };
  });
  const path = candles.map((candle, index) => {
    const value = 47 + Math.sin(index * 0.47 + seed * 0.03) * 10 + Math.cos(index * 0.17) * 4;
    return (index ? 'L' : 'M') + (candle.x + 2) + ' ' + value.toFixed(1);
  }).join(' ');
  const oscillator = family === 'Momentum' || family === 'Volatility';
  return (
    <svg viewBox="0 0 260 112" role="img" aria-label={type + ' chart preview'} className={large ? 'h-full w-full' : 'h-full w-full'}>
      <defs>
        <linearGradient id={'preview-fill-' + seed} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity=".20" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="260" height="112" rx="8" fill="#080d15" />
      {[22, 48, 74, 100].map(y => <line key={y} x1="7" x2="253" y1={y} y2={y} stroke="#263142" strokeWidth=".7" strokeDasharray="2 4" />)}
      {!oscillator && candles.map((candle, index) => {
        const bullish = candle.close < candle.open;
        const top = Math.min(candle.open, candle.close);
        const height = Math.max(2, Math.abs(candle.open - candle.close));
        return <g key={index} opacity=".9">
          <line x1={candle.x + 2} x2={candle.x + 2} y1={candle.high} y2={candle.low} stroke={bullish ? '#22c55e' : '#f87171'} strokeWidth="1" />
          <rect x={candle.x - 1} y={top} width="6" height={height} rx=".6" fill={bullish ? '#22c55e' : '#f87171'} />
        </g>;
      })}
      {oscillator && <>
        <line x1="7" x2="253" y1="40" y2="40" stroke="#475569" strokeDasharray="3 3" />
        <line x1="7" x2="253" y1="77" y2="77" stroke="#475569" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="#a78bfa" strokeWidth="2" />
      </>}
      {!oscillator && <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {family === 'Volume & Order Flow' && candles.map((candle, index) => <rect key={'v' + index} x={candle.x - 1} y={91 - (index % 5) * 2} width="5" height={5 + (index % 5) * 2} fill={index % 3 ? '#64748b' : '#60a5fa'} opacity=".65" />)}
      {family === 'Volatility' && <path d="M10 25 Q45 4 85 26 T165 25 T250 27" fill="none" stroke="#fbbf24" strokeWidth="1.2" opacity=".8" />}
      {family === 'Market Structure' && <g stroke="#c084fc" strokeWidth="1.2" opacity=".9"><path d="M18 84 H64 V57 H118 V68 H171 V38 H238" fill="none"/><path d="M118 68 V90 H168" fill="none" strokeDasharray="3 3"/></g>}
    </svg>
  );
}

export function TerminalIndicatorLibraryHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('tco:open-indicator-library', show);
    return () => window.removeEventListener('tco:open-indicator-library', show);
  }, []);
  return <TerminalIndicatorLibraryModal open={open} onClose={() => setOpen(false)} />;
}

function TerminalIndicatorLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [catalog, setCatalog] = useState<NativeIndicatorInfo[]>([]);
  const [publishedCatalog, setPublishedCatalog] = useState<IndicatorPublication[]>([]);
  const [myPublications, setMyPublications] = useState<IndicatorPublication[]>([]);
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>('Discover');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const bridge = window.__TCO_VELA__;
      if (!bridge?.getNativeIndicatorCatalog) throw new Error('The Vela chart workspace is still starting. Open the library again in a moment.');
      const [nativeItems, saved, published, mine] = await Promise.all([
        bridge.getNativeIndicatorCatalog(),
        getTerminalIndicatorFavoriteKeys().catch(() => []),
        listPublicIndicatorPublications({ sort: 'popular', scriptKind: 'indicator' }).catch(() => []),
        listMyIndicatorPublications().catch(() => []),
      ]);
      setCatalog(nativeItems.filter(item => item && item.type && item.title).sort((a, b) => a.title.localeCompare(b.title)));
      setPublishedCatalog(published);
      setMyPublications(mine);
      setFavorites(saved);
      setSelectedPublicationId(null);
      setSelected(current => current && nativeItems.some(item => item.type === current) ? current : nativeItems[0]?.type || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the Vela indicator catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setStatus('');
      void load();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
        const target = event.target as HTMLElement | null;
        if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
          event.preventDefault();
          document.getElementById('tco-indicator-library-search')?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const visible = useMemo(() => catalog.filter(item => {
    const family = familyFor(item);
    const categoryMatch = category === 'Discover' || category === 'Basic'
      || (category === 'Favorites' ? favorites.includes(item.type) : category === 'My Scripts' || category === 'Bring a Script' ? false : family === category);
    const queryMatch = !query.trim()
      || (item.title + ' ' + item.type + ' ' + family).toLowerCase().includes(query.trim().toLowerCase());
    return categoryMatch && queryMatch;
  }), [catalog, category, favorites, query]);
  const publishedVisible = useMemo(() => {
    const source = category === 'My Scripts' ? myPublications : publishedCatalog;
    if (category === 'Bring a Script' || category === 'Basic' || category === 'Favorites') return [];
    return source.filter(item => {
      const familyText = (item.category + ' ' + (item.tags || []).join(' ')).toLowerCase();
      const familyMatch = category === 'Discover' || category === 'My Scripts'
        || (category === 'SMC / ICT' ? /smc|ict|order block|fvg|liquidity/.test(familyText) : familyText.includes(category.toLowerCase()));
      const queryMatch = !query.trim() || (item.title + ' ' + item.description + ' ' + item.category + ' ' + (item.tags || []).join(' ')).toLowerCase().includes(query.trim().toLowerCase());
      return familyMatch && queryMatch;
    });
  }, [category, myPublications, publishedCatalog, query]);
  const selectedItem = selectedPublicationId ? null : visible.find(item => item.type === selected) || visible[0] || null;
  const selectedPublication = [...publishedCatalog, ...myPublications].find(item => item.id === selectedPublicationId) || null;
  const counts = useMemo(() => {
    const result: Record<string, number> = { Discover: catalog.length + publishedCatalog.length, Favorites: favorites.length, 'My Scripts': myPublications.length, 'Bring a Script': 0, Basic: catalog.length };
    catalog.forEach(item => { const family = familyFor(item); result[family] = (result[family] || 0) + 1; });
    publishedCatalog.forEach(item => { const family = item.category || 'Other'; result[family] = (result[family] || 0) + 1; });
    return result;
  }, [catalog, favorites, publishedCatalog, myPublications]);

  const toggleFavorite = async (item: NativeIndicatorInfo) => {
    const next = !favorites.includes(item.type);
    setFavorites(current => next ? [...current, item.type] : current.filter(key => key !== item.type));
    try {
      await setTerminalIndicatorFavorite({ key: item.type, title: item.title, family: familyFor(item), sourceType: 'native' }, next);
      setStatus(next ? 'Saved to your Supabase favorites.' : 'Removed from favorites.');
    } catch (caught) {
      setFavorites(current => next ? current.filter(key => key !== item.type) : [...current, item.type]);
      setStatus(caught instanceof Error ? caught.message : 'Favorite could not be synchronized.');
    }
  };

  const addToChart = async (item: NativeIndicatorInfo) => {
    setAdding(true);
    setStatus('');
    try {
      const bridge = window.__TCO_VELA__;
      if (!bridge?.addNativeIndicator) throw new Error('The active Vela chart is not ready.');
      if (!item.supported) throw new Error('This indicator is not supported by the active instrument.');
      const result = await bridge.addNativeIndicator(item.type);
      setStatus(result?.alreadyPresent ? 'This indicator is already on the chart.' : item.title + ' added to the chart.');
      await load();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Could not add this indicator.');
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="TradingCoreOS indicator library" className="flex h-[min(900px,calc(100vh-24px))] w-[min(1480px,calc(100vw-24px))] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#273449] bg-[#0b1019] text-[#e6edf7] shadow-[0_28px_100px_rgba(0,0,0,.65)]">
        <header className="flex shrink-0 items-center gap-4 border-b border-[#273449] bg-[#101722] px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#4b5e7a] bg-[#18263b] text-[#93c5fd]"><Sparkles className="h-4 w-4" /></span>
            <div><div className="text-[13px] font-semibold tracking-wide">Indicator Library</div><div className="text-[10px] text-[#7f91aa]">Native Vela studies · CoreSpirit-ready chart workspace</div></div>
          </div>
          <div className="relative ml-auto w-full max-w-[560px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#75859b]" />
            <input id="tco-indicator-library-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search indicators, studies and categories…" className="h-10 w-full rounded-lg border border-[#2a394f] bg-[#080e17] pl-9 pr-3 text-xs text-white outline-none placeholder:text-[#62748e] focus:border-[#5b8bd6]" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close indicator library" className="rounded-lg p-2 text-[#8293aa] transition hover:bg-[#1d2939] hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[205px_minmax(0,1fr)_310px]">
          <aside className="hidden min-h-0 flex-col border-r border-[#263449] bg-[#0c131e] p-3 lg:flex">
            <div className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-[#687b96]">Library</div>
            <nav className="space-y-1">
              {CATEGORIES.map(item => {
                const active = category === item;
                return <button key={item} type="button" onClick={() => { if (item === 'Bring a Script') { window.dispatchEvent(new CustomEvent('tco:open-corespirit-studio')); return; } setCategory(item); setSelectedPublicationId(null); }} className={'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[11px] transition ' + (active ? 'border border-[#34517a] bg-[#16263b] font-semibold text-[#dbeafe]' : 'border border-transparent text-[#94a3b8] hover:bg-[#141f2e] hover:text-white')}>
                  <span className="flex items-center gap-2">{item === 'Favorites' ? <Heart className="h-3.5 w-3.5" /> : item === 'Discover' ? <Sparkles className="h-3.5 w-3.5" /> : <ChevronRight className="h-3 w-3" />}{item}</span>
                  <span className="text-[9px] tabular-nums text-[#71839e]">{counts[item] || 0}</span>
                </button>;
              })}
            </nav>
            <div className="mt-auto rounded-xl border border-[#27364b] bg-[#101b2a] p-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#b7c8df]"><CircleHelp className="h-3.5 w-3.5" /> Chart-native studies</div>
              <p className="mt-2 text-[9px] leading-4 text-[#7e91aa]">These are indicators registered in the active Vela chart. CoreScript and community scripts remain managed in the existing Indicators and CoreSpirit workspaces.</p>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto bg-[#0b111b] p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><div className="text-[15px] font-semibold">{category}</div><div className="mt-1 text-[10px] text-[#788aa2]">{visible.length} chart studies available for this workspace</div></div>
              <div className="hidden items-center gap-2 text-[9px] text-[#8192a8] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Vela-native execution</div>
            </div>
            {loading && <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-[#91a4bd]"><Loader2 className="h-4 w-4 animate-spin" /> Loading chart indicator catalog…</div>}
            {!loading && error && <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-xs text-rose-200">{error}<button onClick={() => void load()} className="ml-3 underline">Retry</button></div>}
            {!loading && !error && !visible.length && !publishedVisible.length && <div className="rounded-xl border border-[#273449] bg-[#101824] p-8 text-center text-xs text-[#8798b0]">No indicators match this search.</div>}
            {!loading && !error && publishedVisible.length > 0 && <>
              <div className="mb-3 mt-7 flex items-end justify-between"><div><div className="text-[12px] font-semibold text-[#e5edf7]">{category === 'My Scripts' ? 'My published scripts' : 'Community CoreSpirit indicators'}</div><div className="mt-1 text-[9px] text-[#788aa2]">{publishedVisible.length} published indicators · source snapshots are compiled through CoreScript</div></div></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {publishedVisible.map(item => <article key={item.id} className={'overflow-hidden rounded-xl border transition ' + (selectedPublicationId === item.id ? 'border-[#5481ba] bg-[#142238]' : 'border-[#273449] bg-[#101823] hover:border-[#3c5371]')}>
                  <button type="button" onClick={() => { setSelected(null); setSelectedPublicationId(item.id); }} className="block w-full text-left">
                    <div className="relative h-[112px] overflow-hidden border-b border-[#263449] bg-[#080d15]">{item.cover_image_url ? <img src={item.cover_image_url} alt={item.title + ' preview'} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center text-[10px] text-[#70839c]">CoreScript indicator · preview not supplied</div>}<span className="absolute left-2 top-2 rounded-md border border-[#405572] bg-[#0c1521]/90 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-[#aec9eb]">{item.category || 'Community'}</span></div>
                    <div className="px-3 py-3"><div className="truncate text-[11px] font-semibold text-[#e5edf7]">{item.title}</div><div className="mt-1 truncate text-[9px] text-[#778ba5]">by {item.author_name} · {item.installs_count.toLocaleString()} installs</div></div>
                  </button>
                </article>)}
              </div>
            </>}
            {!loading && !error && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {visible.map(item => {
                const family = familyFor(item);
                const active = selectedItem?.type === item.type;
                const favorite = favorites.includes(item.type);
                return <article key={item.type} className={'overflow-hidden rounded-xl border transition ' + (active ? 'border-[#5481ba] bg-[#142238] shadow-[0_0_0_1px_rgba(84,129,186,.18)]' : 'border-[#273449] bg-[#101823] hover:border-[#3c5371]')}>
                  <button type="button" onClick={() => { setSelectedPublicationId(null); setSelected(item.type); }} className="block w-full text-left">
                    <div className="relative h-[112px] overflow-hidden border-b border-[#263449]"><PreviewGraphic type={item.type} family={family} /><span className="absolute left-2 top-2 rounded-md border border-[#405572] bg-[#0c1521]/90 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-[#aec9eb]">{family}</span></div>
                    <div className="px-3 py-3">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#e5edf7]">{item.title}</div><div className="mt-1 truncate text-[9px] text-[#778ba5]">{item.type}</div></div>{item.beta && <span className="rounded bg-amber-500/10 px-1.5 py-1 text-[8px] font-bold text-amber-300">BETA</span>}</div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between border-t border-[#263449] px-3 py-2">
                    <span className="text-[8px] text-[#8293aa]">{item.present ? 'ON CHART' : item.supported ? 'READY' : 'UNSUPPORTED'}</span>
                    <button type="button" onClick={() => void toggleFavorite(item)} aria-label={favorite ? 'Remove favorite' : 'Add favorite'} className={'rounded-md p-1.5 ' + (favorite ? 'text-amber-300' : 'text-[#71839c] hover:text-amber-200')}><Star className={'h-3.5 w-3.5 ' + (favorite ? 'fill-current' : '')} /></button>
                  </div>
                </article>;
              })}
            </div>}
          </main>

          <aside className="hidden min-h-0 flex-col border-l border-[#263449] bg-[#0d1520] p-4 lg:flex">
            {selectedPublication ? <>
              <div className="mb-3 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.15em] text-[#7e91aa]">CoreScript details</span><span className="text-[8px] text-[#7f93ad]">{selectedPublication.license}</span></div>
              <div className="overflow-hidden rounded-xl border border-[#2b3b51] bg-[#080e17]">{selectedPublication.cover_image_url ? <img src={selectedPublication.cover_image_url} alt={selectedPublication.title + ' preview'} className="h-[148px] w-full object-cover"/> : <div className="flex h-[148px] items-center justify-center text-[10px] text-[#71839a]">No preview supplied</div>}</div>
              <div className="mt-4 text-[15px] font-semibold leading-5 text-white">{selectedPublication.title}</div>
              <div className="mt-1 text-[9px] text-[#8093ad]">{selectedPublication.category} · by {selectedPublication.author_name}</div>
              <p className="mt-3 text-[10px] leading-5 text-[#b2c0d2]">{selectedPublication.description || 'Published CoreScript indicator.'}</p>
              <div className="mt-4 flex flex-wrap gap-1">{(selectedPublication.tags || []).map(tag => <span key={tag} className="rounded-md border border-[#2b3b51] bg-[#101b2a] px-2 py-1 text-[8px] text-[#9eb2cc]">{tag}</span>)}</div>
              <div className="mt-4 space-y-2 rounded-lg border border-[#27364a] bg-[#101b2a] p-3 text-[9px] text-[#92a3ba]">
                <div className="flex justify-between"><span>Visibility</span><span>{selectedPublication.visibility}</span></div>
                <div className="flex justify-between"><span>License</span><span>{selectedPublication.license}</span></div>
                <div className="flex justify-between"><span>Source</span><span className="text-[#c5d7ee]">CoreScript snapshot</span></div>
              </div>
              <div className="mt-auto pt-4">
                <button type="button" onClick={() => { saveIndicatorSourceLocally(selectedPublication.source_snapshot); window.dispatchEvent(new CustomEvent('tco:corespirit:source-changed', { detail: { name: selectedPublication.title, source: selectedPublication.source_snapshot } })); window.dispatchEvent(new CustomEvent('tco:open-corespirit-studio')); setStatus('Loaded into CoreSpirit Studio. Review, compile and add it to the chart.'); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#4b78ad] bg-[#24456c] px-3 py-3 text-[11px] font-semibold text-white transition hover:bg-[#2d5685]"><Plus className="h-4 w-4"/>Open in CoreSpirit</button>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tco:open-quant', { detail: { prompt: 'Review the published CoreScript indicator ' + selectedPublication.title + '. Explain its source, calculations, inputs, temporal safety, repainting/lookahead risks and whether it is suitable for the current NIFTY chart.' } }))} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#34465e] bg-[#101b2a] px-3 py-2.5 text-[10px] font-semibold text-[#b9cce4] transition hover:border-[#5a7ca7] hover:text-white"><MessageCircle className="h-3.5 w-3.5"/>Ask Quant about this script</button>
                <div className="mt-2 text-center text-[8px] leading-4 text-[#6f8199]">Opening a community script never executes it automatically. Review and compile it in CoreSpirit first.</div>
              </div>
            </> : selectedItem ? <>
              <div className="mb-3 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.15em] text-[#7e91aa]">Indicator details</span><button type="button" onClick={() => void toggleFavorite(selectedItem)} className={favorites.includes(selectedItem.type) ? 'text-amber-300' : 'text-[#8293aa]'}><Star className={'h-4 w-4 ' + (favorites.includes(selectedItem.type) ? 'fill-current' : '')} /></button></div>
              <div className="overflow-hidden rounded-xl border border-[#2b3b51] bg-[#080e17]"><div className="h-[148px]"><PreviewGraphic type={selectedItem.type} family={familyFor(selectedItem)} large /></div></div>
              <div className="mt-4 text-[15px] font-semibold leading-5 text-white">{selectedItem.title}</div>
              <div className="mt-1 text-[9px] text-[#8093ad]">{familyFor(selectedItem)} · Vela native</div>
              <p className="mt-3 text-[10px] leading-5 text-[#b2c0d2]">{descriptionFor(selectedItem, familyFor(selectedItem))}</p>
              <div className="mt-4 space-y-2 rounded-lg border border-[#27364a] bg-[#101b2a] p-3 text-[9px] text-[#92a3ba]">
                <div className="flex justify-between"><span>Chart support</span><span className={selectedItem.supported ? 'text-emerald-300' : 'text-rose-300'}>{selectedItem.supported ? 'Supported' : 'Unavailable'}</span></div>
                <div className="flex justify-between"><span>Instance</span><span>{selectedItem.multiInstance ? 'Multiple allowed' : selectedItem.present ? 'Already on chart' : 'Single instance'}</span></div>
                <div className="flex justify-between"><span>Execution</span><span className="text-[#c5d7ee]">Vela native engine</span></div>
              </div>
              <div className="mt-auto pt-4">
                <button type="button" onClick={() => void addToChart(selectedItem)} disabled={adding || !selectedItem.supported || (selectedItem.present && !selectedItem.multiInstance)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#4b78ad] bg-[#24456c] px-3 py-3 text-[11px] font-semibold text-white transition hover:bg-[#2d5685] disabled:cursor-not-allowed disabled:opacity-40">{adding ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedItem.present && !selectedItem.multiInstance ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{selectedItem.present && !selectedItem.multiInstance ? 'Already on chart' : 'Add to chart'}</button>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tco:open-quant', { detail: { prompt: 'Explain the ' + selectedItem.title + ' indicator: its calculation, inputs, strengths, limitations, repainting/lookahead risks, and how I could adapt it for NIFTY on the current chart.' } }))} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#34465e] bg-[#101b2a] px-3 py-2.5 text-[10px] font-semibold text-[#b9cce4] transition hover:border-[#5a7ca7] hover:text-white"><MessageCircle className="h-3.5 w-3.5"/>Ask Quant about this indicator</button>
                <div className="mt-2 text-center text-[8px] leading-4 text-[#6f8199]">Preview graphics are illustrative. The active chart renders the selected indicator's real output.</div>
              </div>
            </> : <div className="flex flex-1 items-center justify-center text-center text-xs text-[#7d8fa7]">Select an indicator to inspect its details.</div>}
          </aside>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#263449] bg-[#101722] px-5 py-2 text-[9px] text-[#71839a]">
          <span>{status || (favorites.length + ' favorites synced when signed in')}</span>
          <span className="flex items-center gap-3"><span>/ Search</span><span>Esc Close</span><span>Vela chart stays active</span></span>
        </footer>
      </section>
    </div>
  );
}
