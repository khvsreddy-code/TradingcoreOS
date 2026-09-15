import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Settings2, Trash2, X } from 'lucide-react';
import { IndicatorConfig, INDICATOR_LIBRARY, PRICE_SOURCES } from '../../services/marketData/indicatorEngine';
import { defaultIndicators, getIndicators, saveIndicators } from '../../services/workspace/workspaceState';

const anchorOptions = ['Swing High','Swing Low','Day Start','Week Start','Month Start','Visible Range Start','Manual Time'];
const periodKinds = new Set(['EMA','SMA','HMA','RSI','ATR','ADX','CCI','MFI','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Stochastic','Market Structure','Swing Levels','Opening Range','Opening Range Pro','Equal Highs/Lows','Liquidity Pools','Order Blocks','Order Blocks + Mitigation','Breakout / Retest','Failed Breakout','HTF 3-Candle System [Zeiierman]','Trend Target Ribbon [BOSWaves]','Volatility Shock Half-Life Monitor','Wyckoff [theUltimator5]']);
const sourceKinds = new Set(['EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','RSI','CCI','MFI','OBV','Anchored VWAP','VWAP Deviation Bands']);
const fmtConfig = (x: IndicatorConfig) => {
  const parts: string[] = [];
  if (x.period) parts.push(`P${x.period}`);
  if (x.fast || x.slow || x.signal) parts.push(`${x.fast ?? '—'}/${x.slow ?? '—'}/${x.signal ?? '—'}`);
  if (x.multiplier) parts.push(`${x.multiplier}×`);
  if (x.smooth) parts.push(`S${x.smooth}`);
  return parts.join(' · ');
};

const defaultIds = new Set(defaultIndicators.map(x => x.id));

export function IndicatorDock() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [items, setItems] = useState<IndicatorConfig[]>(() => getIndicators());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const onPath = () => setPath(window.location.pathname);
    const onIndicators = (event: Event) => setItems((event as CustomEvent<IndicatorConfig[]>).detail || getIndicators());
    window.addEventListener('popstate', onPath);
    window.addEventListener('tradingcore:indicators', onIndicators);
    return () => {
      window.removeEventListener('popstate', onPath);
      window.removeEventListener('tradingcore:indicators', onIndicators);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.pathname !== path) setPath(window.location.pathname);
    }, 250);
    return () => window.clearInterval(timer);
  }, [path]);

  const active = useMemo(() => items.filter(x => x.enabled), [items]);
  const managed = useMemo(() => items.filter(x => x.enabled || !defaultIds.has(x.id)), [items]);
  if (path !== '/live') return null;

  const commit = (next: IndicatorConfig[]) => {
    setItems(next);
    saveIndicators(next);
  };

  const patch = (id: string, value: Partial<IndicatorConfig>) => commit(items.map(x => x.id === id ? { ...x, ...value } : x));
  const remove = (id: string) => { commit(items.filter(x => x.id !== id)); if (editing === id) setEditing(null); };

  return <div className="fixed z-[80] top-[185px] right-[310px] max-w-[330px] font-mono text-[10px] max-[1500px]:right-4 max-[900px]:top-[120px] max-[900px]:right-3">
    {!open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-[#222636] bg-[#0b0e15]/95 px-3 py-2 text-[#cbd5e1] shadow-2xl backdrop-blur hover:border-[#10b981]/50 hover:text-white"><span className="text-[#10b981]">●</span> INDICATORS <b className="ml-1">{active.length}</b></button> :
      <div className="w-[330px] max-w-[calc(100vw-24px)] rounded-xl border border-[#2a3040] bg-[#0b0e15]/98 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-[#222636] px-3 py-2.5"><div><div className="text-[9px] uppercase tracking-widest text-[#64748b]">Chart indicators</div><div className="mt-0.5 text-xs font-semibold text-white">{active.length} active · {managed.length} added</div></div><button onClick={() => { setOpen(false); setEditing(null); }} className="rounded-md p-1 text-[#64748b] hover:text-white"><X className="h-3.5 w-3.5"/></button></div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {managed.length ? managed.map(x => {
            const lib = INDICATOR_LIBRARY.find(l => l.kind === x.kind);
            const isEditing = editing === x.id;
            return <div key={x.id} className={`mb-1.5 rounded-lg border bg-[#090c12] last:mb-0 ${x.enabled ? 'border-[#222636]' : 'border-[#222636]/70 opacity-70'}`}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button onClick={() => patch(x.id, { enabled: !x.enabled })} title={x.enabled ? 'Hide study' : 'Show study'} className={x.enabled ? 'text-[#10b981] hover:text-white' : 'text-[#64748b] hover:text-white'}>{x.enabled ? <Eye className="h-3.5 w-3.5"/> : <EyeOff className="h-3.5 w-3.5"/>}</button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[10px] font-semibold text-[#e5e7eb]">{x.kind}</div><div className="mt-0.5 text-[8px] text-[#64748b]">{x.enabled ? (fmtConfig(x) || (lib?.overlay ? 'Overlay' : 'Pane')) : 'Hidden · ' + (fmtConfig(x) || (lib?.overlay ? 'Overlay' : 'Pane'))}</div></button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} title="Settings" className={`rounded-md p-1.5 ${isEditing ? 'bg-[#10b981]/10 text-[#10b981]' : 'text-[#64748b] hover:text-white'}`}><Settings2 className="h-3.5 w-3.5"/></button>
                <button onClick={() => remove(x.id)} title="Delete study" className="rounded-md p-1.5 text-[#64748b] hover:text-[#ef4444]"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
              {isEditing && <div className="space-y-2 border-t border-[#222636] px-2.5 py-2.5 text-[8px] text-[#8c93a6]">
                {sourceKinds.has(x.kind) && <label className="block">Price Source<select value={x.source || 'close'} onChange={e => patch(x.id, { source: e.target.value as any })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white outline-none">{PRICE_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>}
                {x.kind === 'Anchored VWAP' && <label className="block">Anchor From<select value={(x as any).anchor || 'Swing High'} onChange={e => patch(x.id, { ...(x as any), anchor: e.target.value } as any)} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white outline-none">{anchorOptions.map(v => <option key={v}>{v}</option>)}</select></label>}
                {periodKinds.has(x.kind) && <label className="block">{x.kind === 'Opening Range' || x.kind === 'Opening Range Pro' ? 'Range Duration (minutes)' : 'Period'}<input type="number" min="1" max="500" value={x.period ?? 14} onChange={e => patch(x.id, { period: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white outline-none"/></label>}
                {['Bollinger Bands','Keltner Channels','Supertrend','VWAP Deviation Bands'].includes(x.kind) && <label className="block">{x.kind === 'VWAP Deviation Bands' ? 'Deviation Multiplier' : 'Multiplier'}<input type="number" step="0.1" min="0.1" max="10" value={x.multiplier ?? 2} onChange={e => patch(x.id, { multiplier: Number(e.target.value) || 2 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white outline-none"/></label>}{x.kind === 'Trend Target Ribbon [BOSWaves]' && <><label className="block">Confirmation<input type="number" step="0.05" min="0.1" max="3" value={x.multiplier ?? .65} onChange={e => patch(x.id,{multiplier:Number(e.target.value)||.65})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white"/></label><label className="block">Stop lookback<input type="number" min="2" max="100" value={x.stopLookback ?? 12} onChange={e => patch(x.id,{stopLookback:Number(e.target.value)||12})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white"/></label><label className="block">Targets<input type="number" min="1" max="4" value={x.targetCount ?? 4} onChange={e => patch(x.id,{targetCount:Number(e.target.value)||4})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] px-2 py-1.5 text-[10px] text-white"/></label></>}
                {x.kind === 'MACD' && <div className="grid grid-cols-3 gap-2"><label>Fast<input type="number" min="2" value={x.fast ?? 12} onChange={e => patch(x.id, { fast: Number(e.target.value) || 12 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Slow<input type="number" min="3" value={x.slow ?? 26} onChange={e => patch(x.id, { slow: Number(e.target.value) || 26 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Signal<input type="number" min="2" value={x.signal ?? 9} onChange={e => patch(x.id, { signal: Number(e.target.value) || 9 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label></div>}
                {x.kind === 'Volatility Shock Half-Life Monitor' && <div className="grid grid-cols-2 gap-2"><label>Baseline<input type="number" min="5" max="300" value={x.baselinePeriod ?? 34} onChange={e=>patch(x.id,{baselinePeriod:Number(e.target.value)||34})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Shock ×<input type="number" step="0.1" min="1" max="10" value={x.shockMultiple ?? 2} onChange={e=>patch(x.id,{shockMultiple:Number(e.target.value)||2})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Decay fraction<input type="number" step="0.05" min="0.1" max="0.9" value={x.halfLifeFraction ?? .5} onChange={e=>patch(x.id,{halfLifeFraction:Number(e.target.value)||.5})} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label></div>}
                {x.kind === 'Stochastic' && <div className="grid grid-cols-2 gap-2"><label>%K Period<input type="number" min="1" value={x.period ?? 14} onChange={e => patch(x.id, { period: Number(e.target.value) || 14 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>%D Smoothing<input type="number" min="1" value={x.smooth ?? 3} onChange={e => patch(x.id, { smooth: Number(e.target.value) || 3 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label></div>}
                {x.kind === 'Ichimoku Cloud' && <div className="grid grid-cols-3 gap-2"><label>Conversion<input type="number" min="2" value={x.period ?? 9} onChange={e => patch(x.id, { period: Number(e.target.value) || 9 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Base<input type="number" min="3" value={x.slow ?? 26} onChange={e => patch(x.id, { slow: Number(e.target.value) || 26 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label><label>Displacement<input type="number" min="1" value={x.displacement ?? 26} onChange={e => patch(x.id, { displacement: Number(e.target.value) || 26 })} className="mt-1 w-full rounded-md border border-[#252b38] bg-[#080a10] p-1.5 text-[10px] text-white"/></label></div>}
                {['Pivot Points','CPR','Key Levels','Weekly Levels','Previous Day Levels','Previous Week Levels','Previous Month Levels','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots','Fair Value Gaps','FVG + Mitigation','Gap Levels','Gap Zones','Developing Day High/Low','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'].includes(x.kind) && <div className="rounded-md border border-[#252b38] bg-[#0d1119] px-2 py-2 text-[8px] text-[#64748b]">Native session/pattern settings — no unrelated period control.</div>}
              </div>}
            </div>;
          }) : <div className="px-2 py-5 text-center text-[#64748b]">No active or user-added studies. Use + Indicator to add one.</div>}
        </div>
        <div className="flex items-center justify-between border-t border-[#222636] px-3 py-2 text-[8px] text-[#64748b]"><span>TradingView-style controls</span><button onClick={() => commit(items.map(x => ({ ...x, enabled: false })))} className="text-[#ef4444] hover:text-white">Hide all</button></div>
      </div>}
  </div>;
}
