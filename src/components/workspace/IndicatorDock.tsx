import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Settings2, Trash2, X } from 'lucide-react';
import { IndicatorConfig, INDICATOR_LIBRARY } from '../../services/marketData/indicatorEngine';
import { getIndicators, saveIndicators } from '../../services/workspace/workspaceState';

const fmtConfig = (x: IndicatorConfig) => {
  const parts: string[] = [];
  if (x.period) parts.push(`P${x.period}`);
  if (x.fast || x.slow || x.signal) parts.push(`${x.fast ?? '—'}/${x.slow ?? '—'}/${x.signal ?? '—'}`);
  if (x.multiplier) parts.push(`${x.multiplier}×`);
  if (x.smooth) parts.push(`S${x.smooth}`);
  return parts.join(' · ');
};

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
  if (path !== '/live') return null;

  const commit = (next: IndicatorConfig[]) => {
    setItems(next);
    saveIndicators(next);
  };

  const patch = (id: string, value: Partial<IndicatorConfig>) => commit(items.map(x => x.id === id ? { ...x, ...value } : x));
  const remove = (id: string) => { commit(items.filter(x => x.id !== id)); if (editing === id) setEditing(null); };

  return <div className="fixed z-[80] top-[185px] right-[310px] max-w-[330px] font-mono text-[10px] max-[1500px]:right-4 max-[900px]:top-[120px] max-[900px]:right-3">
    {!open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-[#222636] bg-[#0b0e15]/95 px-3 py-2 text-[#cbd5e1] shadow-2xl backdrop-blur hover:border-[#10b981]/50 hover:text-white"><span className="text-[#10b981]">●</span> STUDIES <b className="ml-1">{active.length}</b></button> :
      <div className="w-[330px] max-w-[calc(100vw-24px)] rounded-xl border border-[#2a3040] bg-[#0b0e15]/98 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-[#222636] px-3 py-2.5"><div><div className="text-[9px] uppercase tracking-widest text-[#64748b]">Chart studies</div><div className="mt-0.5 text-xs font-semibold text-white">{active.length} active</div></div><button onClick={() => { setOpen(false); setEditing(null); }} className="rounded-md p-1 text-[#64748b] hover:text-white"><X className="h-3.5 w-3.5"/></button></div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {active.length ? active.map(x => {
            const lib = INDICATOR_LIBRARY.find(l => l.kind === x.kind);
            const isEditing = editing === x.id;
            return <div key={x.id} className="mb-1.5 rounded-lg border border-[#222636] bg-[#090c12] last:mb-0">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button onClick={() => patch(x.id, { enabled: false })} title="Hide study" className="text-[#10b981] hover:text-white"> <Eye className="h-3.5 w-3.5"/></button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[10px] font-semibold text-[#e5e7eb]">{x.kind}</div><div className="mt-0.5 text-[8px] text-[#64748b]">{fmtConfig(x) || (lib?.overlay ? 'Overlay' : 'Pane')}</div></button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} title="Settings" className={`rounded-md p-1.5 ${isEditing ? 'bg-[#10b981]/10 text-[#10b981]' : 'text-[#64748b] hover:text-white'}`}><Settings2 className="h-3.5 w-3.5"/></button>
                <button onClick={() => remove(x.id)} title="Delete study" className="rounded-md p-1.5 text-[#64748b] hover:text-[#ef4444]"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
              {isEditing && <div className="grid grid-cols-2 gap-2 border-t border-[#222636] px-2.5 py-2.5 text-[8px] text-[#8c93a6]">
                {['EMA','SMA','HMA','RSI','ATR','ADX','CCI','MFI','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Stochastic','Market Structure','Swing Levels','Opening Range','Opening Range Pro','Equal Highs/Lows','Liquidity Pools','Order Blocks','Order Blocks + Mitigation','Anchored VWAP'].includes(x.kind) && <label>Period<input type="number" min="2" max="500" value={x.period ?? 14} onChange={e => patch(x.id, { period: Math.max(2, Number(e.target.value) || 2) })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label>}
                {['Bollinger Bands','Keltner Channels','Supertrend','VWAP Deviation Bands'].includes(x.kind) && <label>Multiplier<input type="number" step="0.1" min="0.5" max="10" value={x.multiplier ?? 2} onChange={e => patch(x.id, { multiplier: Number(e.target.value) || 2 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label>}
                {x.kind === 'MACD' && <><label>Fast<input type="number" min="2" value={x.fast ?? 12} onChange={e => patch(x.id, { fast: Number(e.target.value) || 12 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Slow<input type="number" min="3" value={x.slow ?? 26} onChange={e => patch(x.id, { slow: Number(e.target.value) || 26 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Signal<input type="number" min="2" value={x.signal ?? 9} onChange={e => patch(x.id, { signal: Number(e.target.value) || 9 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}
                {x.kind === 'Stochastic' && <><label>Smoothing<input type="number" min="1" value={x.smooth ?? 3} onChange={e => patch(x.id, { smooth: Number(e.target.value) || 3 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Signal<input type="number" min="1" value={x.signal ?? 3} onChange={e => patch(x.id, { signal: Number(e.target.value) || 3 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}
                {x.kind === 'Ichimoku Cloud' && <><label>Conversion<input type="number" min="2" value={x.period ?? 9} onChange={e => patch(x.id, { period: Number(e.target.value) || 9 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Base<input type="number" min="3" value={x.slow ?? 26} onChange={e => patch(x.id, { slow: Number(e.target.value) || 26 })} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}
              </div>}
            </div>;
          }) : <div className="px-2 py-5 text-center text-[#64748b]">No active studies. Use + Indicator to add one.</div>}
        </div>
        <div className="flex items-center justify-between border-t border-[#222636] px-3 py-2 text-[8px] text-[#64748b]"><span>TradingView-style controls</span><button onClick={() => commit(items.map(x => ({ ...x, enabled: false })))} className="text-[#ef4444] hover:text-white">Hide all</button></div>
      </div>}
  </div>;
}
