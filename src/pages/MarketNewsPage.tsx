import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, Globe2, Newspaper, RefreshCw, Search, Wifi, WifiOff, ArrowUpRight } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, type WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';

type NewsItem = {
  id?: string;
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  snippet?: string;
};
type NewsPayload = {
  success?: boolean;
  provider?: string;
  items?: NewsItem[];
  error?: string;
  fetchedAt?: string;
};

const PRESETS = [
  { label: 'Global markets', query: 'financial markets' },
  { label: 'NIFTY 50', query: 'NIFTY50' },
  { label: 'Banking', query: 'BANKNIFTY' },
  { label: 'Commodities', query: 'commodities' },
  { label: 'Technology', query: 'technology stocks' },
];

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatTime(value?: string): string {
  if (!value) return 'Publication time unavailable';
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value.trim());
  if (compact) {
    const normalized = `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
    const date = new Date(normalized);
    if (Number.isFinite(date.getTime())) return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return 'Publication time unavailable';
}

export function MarketNewsPage({ onNavigate, onBackToLanding, onBroker }: {
  onNavigate: (path: WorkspaceRoute) => void;
  onBackToLanding: () => void;
  onBroker?: () => void;
}) {
  const [draft, setDraft] = useState('financial markets');
  const [query, setQuery] = useState('financial markets');
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState('News provider');
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ symbol: query.slice(0, 80) || 'financial markets' });
    void fetch(`/api/news?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json().catch(() => ({})) as NewsPayload;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `News request failed (HTTP ${response.status})`);
      }
      if (!current) return;
      const validItems = (Array.isArray(payload.items) ? payload.items : [])
        .filter(item => typeof item?.title === 'string' && item.title.trim() && typeof item.url === 'string' && safeExternalUrl(item.url))
        .slice(0, 20);
      setItems(validItems);
      setProvider(typeof payload.provider === 'string' ? payload.provider : 'News provider not reported');
      setFetchedAt(typeof payload.fetchedAt === 'string' ? payload.fetchedAt : '');
    }).catch((reason: unknown) => {
      if (!current || (reason instanceof Error && reason.name === 'AbortError')) return;
      setError(reason instanceof Error ? reason.message : 'Market news is temporarily unavailable.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [query, refreshKey]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = draft.trim().slice(0, 80) || 'financial markets';
    setDraft(next);
    if (next === query) setRefreshKey(value => value + 1);
    else setQuery(next);
  };
  const choosePreset = (value: string) => {
    setDraft(value);
    if (value === query) setRefreshKey(value => value + 1);
    else setQuery(value);
  };
  const refresh = () => setRefreshKey(value => value + 1);

  return (
    <WorkspaceModuleShell active="/news" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
      <ModuleHeader
        eyebrow="Market Intelligence / News Wire"
        title="Market News & Macro Intelligence"
        description="Search sourced headlines and open the original publisher. News availability depends on the upstream feed; no synthetic headlines or unsupported sentiment scores are shown."
        action={
          <button type="button" onClick={refresh} disabled={loading} className="premium-button premium-button-secondary disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh feed
          </button>
        }
      />
      <main className="space-y-5 p-4 md:p-7">
        <section className="tco-stitch-news-hero rounded-2xl border border-[var(--tco-border)] p-4 md:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[.18em] text-[var(--tco-accent)]"><Globe2 className="h-3.5 w-3.5"/> Sourced market feed</div>
              <h2 className="mt-2 text-xl font-bold md:text-2xl">The latest, with a source attached.</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--tco-muted)]">Choose an index or topic to narrow the request. Article links open the original publisher in a separate tab.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
              <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-3">
                <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--tco-dim)]">Headlines returned</div>
                <div className="mt-2 font-mono text-2xl font-semibold">{loading && !items.length ? '…' : items.length}</div>
              </div>
              <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-3">
                <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--tco-dim)]">Feed state</div>
                <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${error ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {error ? <WifiOff className="h-3.5 w-3.5"/> : <Wifi className="h-3.5 w-3.5"/>}
                  {error ? 'Unavailable' : loading ? 'Refreshing' : 'Response received'}
                </div>
              </div>
            </div>
          </div>
          <form onSubmit={submitSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--tco-border)] bg-[var(--tco-code-bg)] px-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--tco-dim)]"/>
              <span className="sr-only">Search market news</span>
              <input value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} placeholder="Search topic, index or symbol…" className="w-full bg-transparent py-3 text-xs outline-none"/>
            </label>
            <button type="submit" disabled={loading} className="premium-button premium-button-primary disabled:opacity-50"><Search className="h-4 w-4"/> Search</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="News presets">
            {PRESETS.map(preset => (
              <button type="button" key={preset.query} onClick={() => choosePreset(preset.query)} aria-pressed={query === preset.query} className={`rounded-lg border px-3 py-2 text-[10px] font-semibold transition ${query === preset.query ? 'border-[var(--tco-accent)]/45 bg-[var(--tco-accent)]/10 text-[var(--tco-accent)]' : 'border-[var(--tco-border)] bg-[var(--tco-surface)] text-[var(--tco-muted)] hover:text-[var(--tco-text)]'}`}>
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="Headline wire" subtitle={`${provider} · query: ${query}`}>
            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-xs text-rose-300">
                <div className="font-semibold">The news feed couldn't be refreshed.</div>
                <p className="mt-1 leading-5">{error}</p>
                <button type="button" onClick={refresh} className="mt-3 inline-flex items-center gap-1.5 font-semibold hover:text-white"><RefreshCw className="h-3.5 w-3.5"/> Try again</button>
              </div>
            )}
            {loading && !items.length ? (
              <div role="status" className="flex items-center gap-2 py-6 text-xs text-[var(--tco-muted)]"><RefreshCw className="h-4 w-4 animate-spin"/>Loading attributed headlines…</div>
            ) : items.length ? (
              <div className="divide-y divide-[var(--tco-border-soft)]">
                {items.map((item, index) => {
                  const url = safeExternalUrl(item.url);
                  return url ? <article key={item.id || item.url || index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] text-[var(--tco-accent)]"><Newspaper className="h-4 w-4"/></div>
                      <div className="min-w-0 flex-1">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold leading-6 hover:text-[var(--tco-accent)]">{item.title}</a>
                        {item.snippet && <p className="mt-1 text-xs leading-5 text-[var(--tco-muted)]">{item.snippet}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[var(--tco-dim)]">
                          <span className="font-semibold text-[var(--tco-text-2)]">{item.source || 'Publisher not provided'}</span><span aria-hidden="true">·</span><time>{formatTime(item.publishedAt)}</time>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--tco-accent)]">Read original <ExternalLink className="h-3 w-3"/></a>
                        </div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-1 pt-1 text-[var(--tco-dim)] sm:flex"><ArrowUpRight className="h-4 w-4"/></div>
                    </div>
                  </article> : null;
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Newspaper className="mx-auto h-8 w-8 text-[var(--tco-dim)]"/>
                <div className="mt-3 text-sm font-semibold">{error ? 'No current results' : 'No headlines returned'}</div>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--tco-muted)]">Try a broader topic or refresh the feed. Empty results are shown as empty rather than filled with placeholder headlines.</p>
              </div>
            )}
          </Panel>
          <div className="space-y-4">
            <Panel title="Feed details" subtitle="Status from the actual response">
              <div className="space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--tco-border-soft)] pb-3"><span className="text-[var(--tco-muted)]">Provider</span><span className="max-w-[150px] text-right font-semibold">{provider}</span></div>
                <div className="flex items-start justify-between gap-3 border-b border-[var(--tco-border-soft)] pb-3"><span className="text-[var(--tco-muted)]">Search</span><span className="max-w-[150px] break-words text-right font-mono text-[10px]">{query}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-[var(--tco-muted)]">Last response</span><span className="max-w-[150px] text-right text-[10px]">{fetchedAt ? formatTime(fetchedAt) : 'Not received yet'}</span></div>
              </div>
            </Panel>
            <Panel title="Continue research" subtitle="Open a live tool without losing this feed">
              <div className="space-y-2">
                <button type="button" onClick={() => onNavigate('/live')} className="flex w-full items-center justify-between rounded-lg border border-[var(--tco-border)] p-3 text-left text-xs hover:border-[var(--tco-accent)]/40"><span>Open live trading</span><ArrowRight className="h-4 w-4 text-[var(--tco-accent)]"/></button>
                <button type="button" onClick={() => onNavigate('/predictions')} className="flex w-full items-center justify-between rounded-lg border border-[var(--tco-border)] p-3 text-left text-xs hover:border-[var(--tco-accent)]/40"><span>Open prediction center</span><ArrowRight className="h-4 w-4 text-[var(--tco-accent)]"/></button>
                <button type="button" onClick={() => onNavigate('/portfolio')} className="flex w-full items-center justify-between rounded-lg border border-[var(--tco-border)] p-3 text-left text-xs hover:border-[var(--tco-accent)]/40"><span>Review portfolio risk</span><ArrowRight className="h-4 w-4 text-[var(--tco-accent)]"/></button>
              </div>
            </Panel>
            <p className="text-[10px] leading-5 text-[var(--tco-dim)]">Headlines are informational and may be delayed. Confirm market-sensitive information with its original publisher before acting.</p>
          </div>
        </div>
      </main>
    </WorkspaceModuleShell>
  );
}
