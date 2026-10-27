import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Code2, ExternalLink, Layers3, Plus, SlidersHorizontal, Trash2, Eye, Users, CheckCircle2 } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { INDICATOR_LIBRARY, IndicatorConfig } from '../services/marketData/indicatorEngine';
import { defaultIndicators, getIndicators, saveIndicators } from '../services/workspace/workspaceState';
import { getOILevelCount, setOILevelCount } from '../services/marketData/oiEngine';
import { listPublicIndicatorPublications, type IndicatorPublication } from '../services/coreSpirit/indicatorPublicationService';
import { IndicatorSettingsPanel } from '../components/indicators/IndicatorSettingsPanel';
const IndicatorSourceEditor = lazy(() => import('../components/indicators/IndicatorSourceEditor').then((m) => ({ default: m.IndicatorSourceEditor })));
import { useAuth } from '../auth/hooks/useAuth';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from '../services/coreSpirit/luxAlgoSmcCoreSource';

const groups: Record<string, string[]> = {
  Trend: ['EMA','SMA','HMA','Supertrend','Ichimoku Cloud'],
  Volatility: ['Bollinger Bands','Keltner Channels','Donchian Channels','ATR'],
  Momentum: ['RSI','MACD','Stochastic','CCI','ADX'],
  Volume: ['VWAP','OBV','MFI'],
  'India Levels': ['CPR','Key Levels','Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range','Opening Range Pro','Weekly Levels','Swing Levels','Gap Levels','Gap Zones','Developing Day High/Low','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots','Pivot Points'],
  'Price Action': ['Market Structure','BOS / CHOCH','Swing Levels','Equal Highs/Lows','Liquidity Pools','Fair Value Gaps','FVG + Mitigation','Dynamic Support/Resistance','Liquidity Sweeps','Order Blocks','Order Blocks + Mitigation','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'],
  'Anchored / VWAP': ['VWAP','VWAP Deviation Bands','Anchored VWAP'],
};

const periodKinds = new Set(['EMA','SMA','HMA','RSI','ATR','ADX','CCI','MFI','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Stochastic','Market Structure','Swing Levels','Opening Range','Opening Range Pro','Equal Highs/Lows','Liquidity Pools','Order Blocks','Order Blocks + Mitigation','Breakout / Retest','Failed Breakout','TradingCore V Price Action','Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff']);

const fmtConfig = (x: IndicatorConfig) => [
  x.period ? `P${x.period}` : '',
  x.fast || x.slow || x.signal ? `${x.fast ?? '—'}/${x.slow ?? '—'}/${x.signal ?? '—'}` : '',
  x.multiplier ? `${x.multiplier}×` : '',
].filter(Boolean).join(' · ');

export function IndicatorsPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<IndicatorConfig[]>(getIndicators);
  const [selected, setSelected] = useState<string | null>(null);
  const [sourceEditorId, setSourceEditorId] = useState<string | null>(null);
  const [communitySearch, setCommunitySearch] = useState('');
  const [communityCategory, setCommunityCategory] = useState('All');
  const [oiCount, setOiCount] = useState<4 | 6>(getOILevelCount());
  const [community, setCommunity] = useState<IndicatorPublication[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);

  useEffect(() => saveIndicators(items), [items]);

  const add = (kind: IndicatorConfig['kind']) => {
    const lib = INDICATOR_LIBRARY.find(x => x.kind === kind);
    if (!lib) return;
    const id = `${kind.toLowerCase().replace(/\W/g, '-')}-${Date.now()}`;
    const next: IndicatorConfig = { id, kind, enabled: true, display: { showLegend: true, showValues: true, opacity: 1, pane: lib.overlay ? 'overlay' : 'separate', scale: 'price', precision: 2 }, ...lib.defaults };
    setItems(v => [next, ...v]);
    setSelected(id);
    return id;
  };

  const update = (id: string, patch: Partial<IndicatorConfig>) => setItems(v => v.map(x => x.id === id ? { ...x, ...patch } : x));
  const reset = () => setItems(defaultIndicators);
  const enabled = useMemo(() => items.filter(x => x.enabled), [items]);
  const sourceEditorItem = useMemo(() => items.find(x => x.id === sourceEditorId) || null, [items, sourceEditorId]);
  useEffect(() => {
    let live = true;
    setCommunityLoading(true);
    void listPublicIndicatorPublications({ query: communitySearch, category: communityCategory, sort: 'newest' })
      .then(result => { if (live) setCommunity(result); })
      .catch(() => { if (live) setCommunity([]); })
      .finally(() => { if (live) setCommunityLoading(false); });
    return () => { live = false; };
  }, [communitySearch, communityCategory]);
  const communityCategories = useMemo(() => ['All', ...Array.from(new Set(community.map(x => x.category).filter(Boolean)))], [community]);

  return <WorkspaceModuleShell active="/indicators" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader
      eyebrow="Chart Studies"
      title="Indicators"
      description="Configure native studies, inspect editable CoreSpirit source, save versions to Supabase, and publish community indicators."
      action={<div className="flex items-center gap-2"><a href="/explore/indicators" className="premium-button premium-button-secondary"><Users className="h-4 w-4"/> Explore community</a><button onClick={() => add('EMA')} className="premium-button premium-button-primary"><Plus className="h-4 w-4"/> Add study</button></div>}
    />
    <main className="grid gap-4 p-4 md:p-8 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-4">
        <Panel title="Indicator settings" subtitle="Each active study has inputs, visual style, display scale, visibility, and source controls.">
          <div className="mt-3 space-y-2">
            {enabled.length ? enabled.map(item => <div key={item.id} className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-3">
              <div className="flex items-center gap-2">
                <button onClick={() => update(item.id, { enabled: !item.enabled })} className={`rounded-md px-2 py-1 text-[9px] font-mono ${item.enabled ? 'text-[#60a5fa]' : 'text-[var(--tco-dim)]'}`}>{item.enabled ? 'ON' : 'OFF'}</button>
                <button onClick={() => setSelected(selected === item.id ? null : item.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-xs font-semibold">{String(item.customName ?? item.kind)}</div><div className="mt-1 text-[9px] font-mono text-[var(--tco-dim)]">{String(fmtConfig(item) || (INDICATOR_LIBRARY.find(x => x.kind === item.kind)?.overlay ? 'Overlay' : 'Pane'))}</div></button>
                <button onClick={() => setSourceEditorId(item.id)} title="Edit CoreSpirit source" className="rounded-md border border-[var(--tco-border)] p-2 text-[#60a5fa] hover:bg-[#3b82f6]/10"><Code2 className="h-3.5 w-3.5"/></button>
                <button onClick={() => update(item.id, { enabled: false })} title="Hide" className="rounded-md border border-[var(--tco-border)] p-2 text-[var(--tco-dim)]"><Eye className="h-3.5 w-3.5"/></button>
                <button onClick={() => setItems(v => v.filter(x => x.id !== item.id))} title="Remove" className="rounded-md border border-[var(--tco-border)] p-2 text-[var(--tco-dim)] hover:text-[#ef4444]"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
              {selected === item.id && <div className="mt-3 border-t border-[var(--tco-border)] pt-3"><IndicatorSettingsPanel item={item} onChange={patch => update(item.id, patch)} compact profileId={user?.id ?? null} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><button onClick={() => setSourceEditorId(item.id)} className="flex items-center justify-center gap-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2.5 text-[9px] font-semibold text-[#60a5fa]"><Code2 className="h-3.5 w-3.5"/> Edit CoreSpirit source</button><a href="/explore/indicators" className="flex items-center justify-center gap-2 rounded-lg border border-[var(--tco-border)] px-3 py-2.5 text-[9px] text-[var(--tco-text-2)]"><ExternalLink className="h-3.5 w-3.5"/> Browse public indicators</a></div></div>}
            </div>) : <div className="px-3 py-5 text-center text-[10px] text-[var(--tco-dim)]">No active studies. Add one from the library.</div>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2"><button onClick={reset} className="rounded-lg border border-[var(--tco-border)] px-3 py-2 text-[9px] text-[var(--tco-dim)] hover:text-white"><SlidersHorizontal className="mr-1 inline h-3 w-3"/> Reset starter set</button><span className="text-[8px] font-mono text-[var(--tco-dim)]">{enabled.length} active</span></div>
        </Panel>

        <Panel title="CoreSpirit Indicators" subtitle="Native CoreScript indicators compiled by CoreSpirit and rendered through Vela.">
          <div className="rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-[var(--tco-surface-2)] to-[#3b82f6]/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-white"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300"><Code2 className="h-4 w-4"/></span>Smart Money Concepts · CoreSpirit port</div>
                <p className="mt-2 text-[10px] leading-5 text-[var(--tco-muted)]">CoreScript conversion of the supplied LuxAlgo SMC Pine v5 script. This first runnable port plots swing/internal structure levels, BOS/CHoCH labels, provisional order-block zones and causal three-candle fair-value gaps. Pine-only MTF and pivot/object lifecycle features are not claimed as exact parity yet.</p>
                <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full border border-[#22c55e]/30 px-2 py-1 text-[8px] text-[#86efac]">CoreScript</span><span className="rounded-full border border-[#3b82f6]/30 px-2 py-1 text-[8px] text-[#93c5fd]">Overlay</span><span className="rounded-full border border-orange-500/30 px-2 py-1 text-[8px] text-orange-200">Runnable port</span></div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { try { localStorage.setItem('tradingcore:corespirit:editor', CORESPIRIT_LUXALGO_SMC_SOURCE); localStorage.setItem('tradingcore:corespirit:chart-source', CORESPIRIT_LUXALGO_SMC_SOURCE); localStorage.setItem('tradingcore:corespirit:editor-name', 'Smart Money Concepts [CoreSpirit]'); localStorage.setItem('tradingcore:corespirit:editor-category', 'CoreSpirit Indicators'); } catch {} window.location.assign('/corespirit'); }} className="rounded-lg bg-orange-500 px-3 py-2 text-[9px] font-bold text-black hover:bg-orange-400"><Code2 className="mr-1 inline h-3.5 w-3.5"/> Open in CoreSpirit</button>
              <button onClick={() => { try { localStorage.setItem('tradingcore:corespirit:editor', CORESPIRIT_LUXALGO_SMC_SOURCE); localStorage.setItem('tradingcore:corespirit:chart-source', CORESPIRIT_LUXALGO_SMC_SOURCE); localStorage.setItem('tradingcore:corespirit:editor-name', 'Smart Money Concepts [CoreSpirit]'); localStorage.setItem('tradingcore:corespirit:editor-category', 'CoreSpirit Indicators'); } catch {} window.location.assign('/live'); }} className="rounded-lg border border-[var(--tco-border)] px-3 py-2 text-[9px] font-semibold text-[var(--tco-text-2)] hover:text-white">Open live chart</button>
            </div>
          </div>
        </Panel>

        <Panel title="Indicator library" subtitle="Add any native study; selected settings are persisted to the workspace.">
          <div className="space-y-4">{Object.entries(groups).map(([group, kinds]) => <section key={group}><div className="mb-2 flex items-center justify-between"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">{group}</div><div className="text-[8px] font-mono text-[var(--tco-dim)]">{kinds.length}</div></div><div className="grid gap-2 md:grid-cols-2">{kinds.map(kind => { const lib = INDICATOR_LIBRARY.find(l => l.kind === kind); if (!lib) return null; return <div key={kind} className="group rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-3 transition hover:-translate-y-0.5 hover:border-[#3b82f6]/40"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{kind}</span><span className="text-[8px] font-mono uppercase tracking-widest text-[#4f5a70]">{lib.overlay ? 'Overlay' : 'Pane'}</span></div><div className="mt-1 text-[10px] leading-4 text-[var(--tco-dim)]">{lib.description}</div><div className="mt-3 flex gap-2"><button onClick={() => add(kind as IndicatorConfig['kind'])} className="flex-1 rounded-lg bg-[#3b82f6]/10 px-2.5 py-2 text-[9px] font-semibold text-[#60a5fa] hover:bg-[#3b82f6]/20"><Plus className="mr-1 inline h-3.5 w-3.5"/> Add</button><button onClick={() => { const id = add(kind as IndicatorConfig['kind']); if (id) setSourceEditorId(id); }} className="rounded-lg border border-[var(--tco-border)] px-2.5 py-2 text-[9px] text-[var(--tco-text-2)] hover:text-white"><Code2 className="mr-1 inline h-3.5 w-3.5"/> Code</button></div></div>; })}</div></section>)}</div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="OI level selection" subtitle="Choose how many high-impact option-chain levels the chart should display.">
          <div className="flex flex-wrap items-center gap-2"><Layers3 className="h-4 w-4 text-[#a78bfa]"/>{([4,6] as const).map(n => <button key={n} onClick={() => { setOiCount(n); setOILevelCount(n); }} className={`rounded-lg border px-3 py-1.5 text-[9px] font-mono ${oiCount === n ? 'border-[#a78bfa]/50 bg-[#a78bfa]/10 text-[#c4b5fd]' : 'border-[var(--tco-border)] text-[var(--tco-dim)]'}`}>{n} levels</button>)}<span className="text-[8px] text-[var(--tco-dim)]">Strongest OI + ΔOI around LTP.</span></div>
        </Panel>

        <Panel title="CoreSpirit source workflow" subtitle="Default indicator code is visible and editable; saving creates versions in Supabase.">
          <div className="space-y-3"><div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/5 p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-[#22c55e]"/> Source-first authoring</div><p className="mt-1 text-[9px] leading-4 text-[var(--tco-muted)]">Open an active study, inspect its starter source, edit it, save a version, then optionally publish a public snapshot with a cover image, description, tags, and license.</p></div><div className="grid gap-2 sm:grid-cols-2"><a href="/corespirit/docs" className="rounded-lg border border-[var(--tco-border)] px-3 py-2.5 text-[9px] text-[var(--tco-text-2)]">Read CoreSpirit scripting docs</a><a href="/explore/indicators" className="rounded-lg bg-[#3b82f6] px-3 py-2.5 text-center text-[9px] font-semibold text-white">Open public indicator explore</a></div></div>
        </Panel>

        <Panel title="CoreSpirit Community Indicators" subtitle={communityLoading ? 'Loading published CoreSpirit indicators…' : `${community.length} published community indicators. Source snapshots are versioned and CoreSpirit-native.`}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row"><input value={communitySearch} onChange={e => setCommunitySearch(e.target.value)} placeholder="Search CoreSpirit indicators…" className="min-w-0 flex-1 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-3 py-2 text-[10px] outline-none"/><select value={communityCategory} onChange={e => setCommunityCategory(e.target.value)} className="rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-3 py-2 text-[10px]">{communityCategories.map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="space-y-2">{community.slice(0, 6).map(x => <div key={x.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-3 py-2.5"><div className="min-w-0"><div className="truncate text-[9px] font-semibold">{x.title}</div><div className="mt-0.5 truncate text-[8px] text-[var(--tco-dim)]">{x.author_name} · {x.category} · v{x.language_version}</div></div><a href={`/explore/indicators/${encodeURIComponent(x.slug)}`} className="rounded-md border border-[var(--tco-border)] p-1.5 text-[var(--tco-dim)] hover:text-white" title="Open CoreSpirit publication"><ExternalLink className="h-3.5 w-3.5"/></a></div>)}</div>
        </Panel>
      </div>
    </main>
    {sourceEditorItem && user && <Suspense fallback={null}><IndicatorSourceEditor item={sourceEditorItem} user={user} onClose={() => setSourceEditorId(null)} onSaved={({ scriptId, source }) => { update(sourceEditorItem.id, { scriptId, sourceCode: source, isUserAuthored: true, authorName: user.name || 'Trader', customName: sourceEditorItem.customName || sourceEditorItem.kind }); }} /></Suspense>}
    {!isAuthenticated && <div className="fixed bottom-4 right-4 z-[100] rounded-xl border border-[#3b82f6]/30 bg-[var(--tco-surface)] px-4 py-3 shadow-2xl"><div className="text-[9px] font-mono uppercase tracking-widest text-[#60a5fa]">Public publishing</div><div className="mt-1 text-[10px] text-[var(--tco-muted)]">Sign in to save source versions or publish indicators.</div></div>}
  </WorkspaceModuleShell>;
}
