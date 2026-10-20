import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BookOpen, Code2, ExternalLink,
  LineChart, Newspaper, RefreshCw, TrendingDown, TrendingUp,
} from 'lucide-react';
import { WorkspaceModuleShell, WorkspaceRoute, Panel } from '../components/workspace/WorkspaceModuleShell';
import { tradingCoreRuntime } from '../services/runtime/TradingCoreRuntime';
import { listPublicIndicatorPublications, type IndicatorPublication } from '../services/coreSpirit/indicatorPublicationService';
import type { NormalizedMarketTick } from '../types/market';

type MarketIndex = { symbol: string; label: string };
type MarketQuoteView = MarketIndex & { tick: NormalizedMarketTick | null; receivedAt: number; ageMs: number; live: boolean };
type NewsItem = { id?: string; title: string; source: string; url: string; publishedAt?: string };
type NewsPayload = { success?: boolean; provider?: string; items?: NewsItem[]; error?: string };

const MARKET_INDEXES: MarketIndex[] = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'SENSEX' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'MIDCAP SELECT' },
];

const MARKET_REFRESH_MS = 5_000;
const NEWS_REFRESH_MS = 5 * 60_000;

function receivedAtMs(tick: NormalizedMarketTick | undefined): number {
  if (!tick) return 0;
  const raw = tick.receivedAtEpoch ?? tick.timestamp ?? tick.receivedAt ?? tick.lastTradeTimestamp;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readMarketQuote(index: MarketIndex, now = Date.now()): MarketQuoteView {
  const candidates = [
    index.symbol,
    index.symbol.replace(/-INDEX$/i, ''),
    index.symbol.split(':').pop() ?? index.symbol,
  ];
  let tick: NormalizedMarketTick | undefined;
  for (const key of candidates) {
    tick = tradingCoreRuntime.getMarketSnapshot(key);
    if (tick) break;
  }
  const receivedAt = receivedAtMs(tick);
  const ageMs = receivedAt ? Math.max(0, now - receivedAt) : Number.POSITIVE_INFINITY;
  return { ...index, tick: tick ?? null, receivedAt, ageMs, live: Boolean(tick && Number.isFinite(Number(tick.ltp ?? tick.close)) && ageMs <= 60_000) };
}

function signedTone(value: number | null): string {
  return value == null ? 'text-[var(--tco-muted)]' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-[var(--tco-text)]';
}
function fmtPrice(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
}
function fmtPercent(value: unknown): string | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%` : null;
}
function fmtPublishedAt(value?: string): string {
  if (!value) return 'Time unavailable';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Time unavailable';
}

export function DashboardPage({ onNavigate, onBroker }: { onNavigate: (p: WorkspaceRoute) => void; onBroker?: () => void }) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const connected = tradingCoreRuntime.hasConnectedBroker();
  const [marketQuotes, setMarketQuotes] = useState<MarketQuoteView[]>(() => MARKET_INDEXES.map(index => readMarketQuote(index)));
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsProvider, setNewsProvider] = useState('Yahoo Finance RSS');
  const [newsError, setNewsError] = useState('');
  const [newsLoading, setNewsLoading] = useState(false);
  const [scripts, setScripts] = useState<IndicatorPublication[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState('');

  const sync = useCallback(async () => {
    setError('');
    if (!tradingCoreRuntime.hasConnectedBroker()) return;
    setLoading(true);
    try {
      const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
      setSnapshot(await tradingCoreRuntime.syncPortfolio(broker?.brokerId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Portfolio sync failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMarket = useCallback(() => {
    const now = Date.now();
    setMarketQuotes(MARKET_INDEXES.map(index => readMarketQuote(index, now)));
  }, []);

  const refreshNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError('');
    try {
      const response = await fetch('/api/news?symbol=financial%20markets', {
        headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      const payload = await response.json() as NewsPayload;
      if (!response.ok || payload.success === false) throw new Error(payload.error || `News request failed (${response.status})`);
      setNewsItems(Array.isArray(payload.items) ? payload.items.slice(0, 12) : []);
      setNewsProvider(payload.provider || 'Yahoo Finance RSS');
    } catch (e: unknown) {
      setNewsError(e instanceof Error ? e.message : 'Market news is temporarily unavailable.');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void sync();
    const unsubscribe = tradingCoreRuntime.on('PORTFOLIO_SYNCED', (s: any) => setSnapshot(s));
    return unsubscribe;
  }, [sync]);

  useEffect(() => {
    let cancelled = false;
    let stopMarketSubscription: (() => void) | undefined;
    refreshMarket();
    const unsubscribe = tradingCoreRuntime.on('TICK_UPDATE', refreshMarket);
    const timer = window.setInterval(refreshMarket, MARKET_REFRESH_MS);
    // A dashboard visit should receive fresh quotes even when the live chart hasn't
    // been mounted in this tab yet. This is a small lite-quote set, not full chart streams.
    void (async () => {
      if (!tradingCoreRuntime.hasConnectedBroker()) {
        try { await tradingCoreRuntime.restoreBrokerConnections(); } catch {}
      }
      if (cancelled || !tradingCoreRuntime.hasConnectedBroker()) return;
      stopMarketSubscription = tradingCoreRuntime.subscribeMarketData(
        MARKET_INDEXES.map(index => index.symbol),
        event => { if (event.type === 'tick') refreshMarket(); },
      );
      refreshMarket();
    })();
    return () => {
      cancelled = true;
      stopMarketSubscription?.();
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [refreshMarket]);

  useEffect(() => {
    void refreshNews();
    const timer = window.setInterval(() => void refreshNews(), NEWS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshNews]);

  useEffect(() => {
    let cancelled = false;
    void listPublicIndicatorPublications({ query: '', category: 'All', openSourceOnly: false, sort: 'popular', scriptKind: 'indicator' })
      .then(items => { if (!cancelled) setScripts(items.slice(0, 4)); })
      .catch((e: unknown) => { if (!cancelled) setScriptsError(e instanceof Error ? e.message : 'Community scripts are unavailable.'); })
      .finally(() => { if (!cancelled) setScriptsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const liveChanges = useMemo(() => marketQuotes
    .filter(item => item.live && Number.isFinite(Number(item.tick?.changePercent ?? item.tick?.change)))
    .map(item => Number(item.tick?.changePercent ?? item.tick?.change)), [marketQuotes]);
  const bullish = liveChanges.filter(value => value > 0).length;
  const bearish = liveChanges.filter(value => value < 0).length;
  const flat = liveChanges.length - bullish - bearish;
  const sentiment = liveChanges.length === 0 ? 'Waiting for live quotes'
    : bullish > bearish ? 'Bullish breadth' : bearish > bullish ? 'Bearish breadth' : 'Mixed breadth';
  const sentimentDescription = liveChanges.length
    ? `Calculated from ${liveChanges.length} fresh index snapshots only; unavailable or stale quotes are excluded.`
    : 'Open Live Trading or connect a broker to populate real index quotes. No sentiment score is fabricated.';
  const funds = snapshot?.funds;
  const positions = snapshot?.positions || [];
  const holdings = snapshot?.holdings || [];
  const trades = snapshot?.trades || [];
  const open = positions.reduce((sum: number, position: any) => sum + Number(position.pnl || 0), 0);
  const day = [...positions, ...holdings].reduce((sum: number, position: any) => sum + Number(position.dayChangePnl ?? position.dayChange ?? 0), 0);
  const pnlMap = new Map<string, number>();
  [...positions, ...holdings].forEach((position: any) => pnlMap.set(position.symbol, (pnlMap.get(position.symbol) || 0) + Number(position.pnl || 0)));
  const drivers = [...pnlMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return <WorkspaceModuleShell active="/dashboard" onNavigate={onNavigate} onBackToLanding={() => onNavigate('/dashboard')} onBroker={onBroker}>
    <main className="min-h-[calc(100vh-90px)] space-y-5 bg-[var(--tco-bg)] p-4 md:p-7">
      <section className="overflow-hidden rounded-2xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)]">
        <div className="flex flex-col justify-between gap-5 p-5 md:flex-row md:items-end md:p-7">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[.22em] text-[var(--tco-accent)]"><Activity size={13}/> TradingCore OS · Market Desk</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Your market, <span className="text-[var(--tco-accent)]">in context.</span></h1>
            <p className="mt-2 text-sm leading-6 text-[var(--tco-muted)]">Live index snapshots, transparent market breadth, community scripts and sourced financial headlines—alongside your account activity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigate('/live')} className="rounded-lg bg-[var(--tco-accent)] px-4 py-2.5 text-xs font-bold text-[var(--tco-surface-2)]"><LineChart className="mr-1 inline h-4 w-4"/>Open Live Trading</button>
            <button type="button" aria-label="Refresh dashboard market data" onClick={() => { refreshMarket(); void sync(); void refreshNews(); }} className="rounded-lg border border-[var(--tco-control)] px-3 py-2.5 text-xs hover:bg-[var(--tco-hover)]"><RefreshCw className={loading || newsLoading ? 'inline animate-spin' : 'inline'} size={15}/></button>
            {!connected && <button type="button" onClick={onBroker} className="rounded-lg border border-[var(--tco-border)] px-3 py-2.5 text-xs hover:bg-[var(--tco-hover)]">Connect broker</button>}
          </div>
        </div>
        {!connected && <div className="border-t border-[var(--tco-border)] px-5 py-3 text-xs text-[var(--tco-muted)]">Connect FYERS or Upstox for broker-backed live quotes and portfolio metrics. Headlines and community scripts can load independently.</div>}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel title="Market overview" subtitle="Quotes are sourced from the connected market feed; stale values are labelled, never presented as live.">
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-5">
            {marketQuotes.map(item => {
              const price = item.tick?.ltp ?? item.tick?.close;
              const pct = fmtPercent(item.tick?.changePercent);
              const change = Number.isFinite(Number(item.tick?.change)) ? Number(item.tick?.change) : null;
              const toneValue = Number.isFinite(Number(item.tick?.changePercent)) ? Number(item.tick?.changePercent) : change;
              return <div key={item.symbol} className="min-w-0 rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-3">
                <div className="flex items-center justify-between gap-2"><div className="truncate text-[10px] font-semibold">{item.label}</div><span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-mono ${item.live ? 'bg-emerald-500/10 text-emerald-400' : price != null ? 'bg-amber-500/10 text-amber-300' : 'bg-[var(--tco-hover)] text-[var(--tco-dim)]'}`}>{item.live ? 'LIVE' : price != null ? 'STALE' : 'NO QUOTE'}</span></div>
                <div className="mt-3 text-xl font-bold font-mono tracking-tight">{price != null ? fmtPrice(price) : '—'}</div>
                <div className={`mt-1 flex items-center gap-1 text-[10px] font-mono ${signedTone(toneValue)}`}>
                  {toneValue != null && toneValue > 0 ? <ArrowUpRight size={12}/> : toneValue != null && toneValue < 0 ? <ArrowDownRight size={12}/> : null}
                  {pct ?? (change == null ? 'Change unavailable' : `${change > 0 ? '+' : ''}${fmtPrice(change)}`)}
                </div>
                <div className="mt-2 text-[8px] text-[var(--tco-dim)]">{item.receivedAt ? `Updated ${Math.max(0, Math.floor(item.ageMs / 1000))}s ago` : 'Waiting for this instrument to stream'}</div>
              </div>;
            })}
          </div>
        </Panel>
        <Panel title="Market sentiment" subtitle="Observed index breadth, not a prediction">
          <div className="text-xl font-semibold">{sentiment}</div>
          <p className="mt-2 text-[10px] leading-5 text-[var(--tco-muted)]">{sentimentDescription}</p>
          <div className="mt-4 flex items-end justify-between text-[10px]"><span className="text-emerald-400">Advancing {bullish}</span><span className="text-rose-400">Declining {bearish}</span><span className="text-[var(--tco-dim)]">Flat {flat}</span></div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--tco-hover)]">
            {liveChanges.length > 0 && <><div className="bg-emerald-500" style={{ width: `${bullish / liveChanges.length * 100}%` }}/><div className="bg-rose-500" style={{ width: `${bearish / liveChanges.length * 100}%` }}/><div className="bg-slate-500" style={{ width: `${flat / liveChanges.length * 100}%` }}/></>}
          </div>
          <button type="button" onClick={() => onNavigate('/live')} className="mt-5 w-full rounded-lg border border-[var(--tco-border)] px-3 py-2 text-[10px] font-semibold hover:border-[var(--tco-accent)]/50">Open charts and market data</button>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <Panel title="Market news" subtitle={`${newsProvider} · refreshed every 5 minutes · headlines link to their publisher`}>
          {newsLoading && newsItems.length === 0 ? <div className="flex items-center gap-2 py-5 text-xs text-[var(--tco-muted)]"><RefreshCw size={13} className="animate-spin"/>Loading current headlines…</div>
            : newsItems.length ? <div className="divide-y divide-[var(--tco-border-soft)]">
              {newsItems.slice(0, 8).map((item, index) => <a key={item.id || item.url || index} href={item.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0"><span className="block text-xs font-medium leading-5 group-hover:text-[var(--tco-accent)]">{item.title}</span><span className="mt-1 block text-[9px] text-[var(--tco-dim)]">{item.source} · {fmtPublishedAt(item.publishedAt)}</span></span>
                <ExternalLink size={13} className="mt-1 shrink-0 text-[var(--tco-dim)] group-hover:text-[var(--tco-accent)]"/>
              </a>)}
            </div>
            : <div className="py-4 text-xs text-[var(--tco-muted)]">{newsError || 'No headlines were returned for this refresh.'}</div>}
          {newsError && newsItems.length > 0 && <div className="mt-3 text-[9px] text-amber-300">Refresh note: {newsError}</div>}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--tco-border-soft)] pt-3 text-[9px] text-[var(--tco-dim)]"><span><Newspaper className="mr-1 inline h-3 w-3"/> Headlines are attributed to their publisher.</span><button type="button" onClick={() => void refreshNews()} className="font-semibold hover:text-[var(--tco-accent)]">{newsLoading ? 'Refreshing…' : 'Refresh news'}</button></div>
        </Panel>
        <Panel title="Scripts to explore" subtitle="Public CoreSpirit community indicators">
          {scriptsLoading ? <div className="py-4 text-xs text-[var(--tco-muted)]">Loading community scripts…</div>
            : scripts.length ? <div className="space-y-2">
              {scripts.map(script => <a key={script.id} href={`/explore/scripts/${encodeURIComponent(script.slug)}?type=${script.script_kind}`} className="block rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-3 transition-colors hover:border-[var(--tco-accent)]/40">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0 text-xs font-semibold">{script.title}</div><ExternalLink size={12} className="shrink-0 text-[var(--tco-dim)]"/></div>
                <div className="mt-1 text-[9px] text-[var(--tco-dim)]">{script.category} · by {script.author_name}</div>
                {script.description && <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--tco-muted)]">{script.description}</p>}
              </a>)}
            </div>
            : <div className="py-4 text-xs text-[var(--tco-muted)]">{scriptsError || 'No public scripts are published yet.'}</div>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href="/explore/scripts" className="rounded-lg border border-[var(--tco-border)] px-3 py-2 text-center text-[10px] font-semibold hover:text-[var(--tco-accent)]"><BookOpen className="mr-1 inline h-3 w-3"/>Script library</a>
            <button type="button" onClick={() => onNavigate('/corespirit')} className="rounded-lg bg-[var(--tco-accent)]/10 px-3 py-2 text-[10px] font-semibold text-[var(--tco-accent)]"><Code2 className="mr-1 inline h-3 w-3"/>Open CoreSpirit</button>
          </div>
        </Panel>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[10px] font-mono uppercase tracking-widest text-[var(--tco-muted)]">Account workspace</div><h2 className="mt-1 text-lg font-semibold">Performance and activity</h2></div><button type="button" onClick={() => void sync()} className="rounded-lg border border-[var(--tco-border)] px-3 py-2 text-[10px] hover:bg-[var(--tco-hover)]"><RefreshCw size={12} className={loading ? 'mr-1 inline animate-spin' : 'mr-1 inline'}/>Refresh account</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {([['Account value', funds?.totalCapital], ['Day P&L', day], ['Open P&L', open], ['Available margin', funds?.availableMargin], ['Executions', trades.length]] as Array<[string, unknown]>).map(([label, value]) => <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4" key={label}><div className="text-[9px] font-mono uppercase tracking-widest text-[var(--tco-dim)]">{label}</div><div className={`mt-2 text-lg font-bold font-mono ${(label === 'Day P&L' || label === 'Open P&L') && typeof value === 'number' ? signedTone(value) : ''}`}>{typeof value === 'number' ? label === 'Executions' ? value : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</div></div>)}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="P&L drivers" subtitle="Current broker exposure">
          <div className="space-y-2">{drivers.length ? drivers.map(([symbol, value]) => <div className="flex justify-between border-b border-[var(--tco-border-soft)] py-2 text-xs" key={symbol}><span>{symbol}</span><span className={signedTone(value)}>₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>) : <span className="text-xs text-[var(--tco-dim)]">No exposure data yet.</span>}</div>
        </Panel>
        <Panel title="Trade review" subtitle="Evidence before conclusions">
          <div className="grid gap-3 sm:grid-cols-2"><Review title="Profits" text={drivers.filter(item => item[1] > 0).length ? `Positive contributors: ${drivers.filter(item => item[1] > 0).map(item => item[0]).join(', ')}` : 'No profitable exposure yet.'} positive/><Review title="Losses" text={drivers.filter(item => item[1] < 0).length ? `Negative contributors: ${drivers.filter(item => item[1] < 0).map(item => item[0]).join(', ')}` : 'No losing exposure yet.'}/></div>
          <p className="mt-3 text-[10px] leading-5 text-[var(--tco-dim)]">Broker data cannot prove a trader's actual thesis or mistake. Use CoreSpirit and the trade journal to record setup, entry rationale, risk and exit decisions.</p>
        </Panel>
      </div>
      <Panel title="Recent activity" subtitle="Broker-reported executions">
        <div className="space-y-2">{trades.slice(0, 12).map((trade: any) => <div className="flex flex-wrap justify-between gap-2 rounded-lg border border-[var(--tco-border-soft)] bg-[var(--tco-surface-2)] p-3 text-xs" key={trade.tradeId}><span>{trade.symbol} · {trade.side} · {trade.quantity} @ ₹{trade.price}</span><span className="text-[var(--tco-dim)]">{trade.timestamp}</span></div>)}{!trades.length && <div className="text-xs text-[var(--tco-dim)]">No executions returned.</div>}</div>
      </Panel>
      <Panel title="Workspaces" subtitle="Trading tools in one operating system">
        <div className="grid gap-2 md:grid-cols-4">{[['Live', 'Execute', '/live'], ['Models', 'Analyze', '/models'], ['Automations', 'Systemize', '/automations'], ['Portfolio', 'Review', '/portfolio']].map(([label, description, route]) => <button type="button" key={route} onClick={() => onNavigate(route as WorkspaceRoute)} className="rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4 text-left hover:border-[var(--tco-accent)]/30"><div className="text-sm font-semibold">{label}</div><div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">{description}</div></button>)}</div>
      </Panel>
      {error && <div className="text-xs text-rose-300">{error}</div>}
    </main>
  </WorkspaceModuleShell>;
}

function Review({ title, text, positive }: { title: string; text: string; positive?: boolean }) {
  return <div className={`rounded-lg border p-4 ${positive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}><div className="text-[10px] font-mono uppercase tracking-widest">{positive ? <TrendingUp className="mr-1 inline h-3 w-3"/> : <TrendingDown className="mr-1 inline h-3 w-3"/>}{title}</div><p className="mt-2 text-[11px] text-[var(--tco-muted)]">{text}</p></div>;
}
