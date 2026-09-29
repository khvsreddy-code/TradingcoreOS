import { useMemo, useState } from 'react';
import { Code2, Palette, Settings2 } from 'lucide-react';
import type { IndicatorConfig, IndicatorKind, PriceSource } from '../../services/marketData/indicatorEngine';
import { PRICE_SOURCES } from '../../services/marketData/indicatorEngine';

export const INDICATOR_SCALE_MODES = ['price', 'percent', 'indexed', 'log'] as const;
export type IndicatorScaleMode = typeof INDICATOR_SCALE_MODES[number];

export type IndicatorSettingsPanelProps = {
  item: IndicatorConfig;
  compact?: boolean;
  onChange: (patch: Partial<IndicatorConfig>) => void;
  onOpenSource?: () => void;
};

const periodKinds = new Set<IndicatorKind>(['EMA','SMA','HMA','RSI','ATR','ADX','CCI','MFI','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Stochastic','Market Structure','Swing Levels','Opening Range','Opening Range Pro','Equal Highs/Lows','Liquidity Pools','Order Blocks','Order Blocks + Mitigation','Breakout / Retest','Failed Breakout']);
const sourceKinds = new Set<IndicatorKind>(['EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','RSI','CCI','MFI','OBV','Anchored VWAP','VWAP Deviation Bands']);

function numberInput(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
}

export function IndicatorSettingsPanel({ item, compact = false, onChange, onOpenSource }: IndicatorSettingsPanelProps) {
  const [tab, setTab] = useState<'inputs' | 'style' | 'display'>('inputs');
  const display = item.display ?? {};
  const title = useMemo(() => item.kind === 'Anchored VWAP' ? 'Anchor + VWAP' : item.kind, [item.kind]);
  const fieldClass = 'mt-1 w-full rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#3b82f6]/50';
  return <div className={compact ? 'space-y-2' : 'space-y-3'}>
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--tco-dim)]"><Settings2 className="h-3 w-3 text-[#60a5fa]"/>{title} settings</div>
      {onOpenSource && <button type="button" onClick={onOpenSource} title="View CoreSpirit source" className="inline-flex items-center gap-1 rounded-md border border-[#3b82f6]/30 px-2 py-1 text-[8px] font-mono text-[#93c5fd] hover:bg-[#3b82f6]/10"><Code2 className="h-3 w-3"/> Code</button>}
    </div>
    <div className="flex gap-1 border-b border-[var(--tco-border)] pb-1">
      {([['inputs','Inputs',Settings2],['style','Style',Palette],['display','Display',Settings2]] as const).map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id)} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[8px] font-mono ${tab===id?'bg-[#3b82f6]/10 text-[#60a5fa]':'text-[var(--tco-dim)] hover:text-white'}`}><Icon className="h-3 w-3"/>{label}</button>)}
    </div>
    {tab === 'inputs' && <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
      {sourceKinds.has(item.kind) && <label>Source<select value={item.source || 'close'} onChange={e=>onChange({source:e.target.value as PriceSource})} className={fieldClass}>{PRICE_SOURCES.map(source=><option key={source.value} value={source.value}>{source.label}</option>)}</select></label>}
      {periodKinds.has(item.kind) && <label>{item.kind.startsWith('Opening Range') ? 'Duration (min)' : 'Period'}<input type="number" min={1} max={500} value={item.period ?? (item.kind==='RSI'?14:20)} onChange={e=>onChange({period:numberInput(Number(e.target.value),14,1,500)})} className={fieldClass}/></label>}
      {['Bollinger Bands','Keltner Channels','Supertrend','VWAP Deviation Bands','TradingCore V Price Action'].includes(item.kind) && <label>Multiplier<input type="number" min={0.1} max={10} step={0.1} value={item.multiplier ?? 2} onChange={e=>onChange({multiplier:numberInput(Number(e.target.value),2,0.1,10)})} className={fieldClass}/></label>}
      {item.kind === 'MACD' && <>
        <label>Fast<input type="number" min={2} max={200} value={item.fast ?? 12} onChange={e=>onChange({fast:numberInput(Number(e.target.value),12,2,200)})} className={fieldClass}/></label>
        <label>Slow<input type="number" min={3} max={500} value={item.slow ?? 26} onChange={e=>onChange({slow:numberInput(Number(e.target.value),26,3,500)})} className={fieldClass}/></label>
        <label>Signal<input type="number" min={2} max={200} value={item.signal ?? 9} onChange={e=>onChange({signal:numberInput(Number(e.target.value),9,2,200)})} className={fieldClass}/></label>
      </>}
      {item.kind === 'Stochastic' && <><label>%K Smooth<input type="number" min={1} max={50} value={item.smooth ?? 3} onChange={e=>onChange({smooth:numberInput(Number(e.target.value),3,1,50)})} className={fieldClass}/></label><label>Signal<input type="number" min={1} max={50} value={item.signal ?? 3} onChange={e=>onChange({signal:numberInput(Number(e.target.value),3,1,50)})} className={fieldClass}/></label></>}
      {item.kind === 'Ichimoku Cloud' && <><label>Conversion<input type="number" min={2} max={100} value={item.period ?? 9} onChange={e=>onChange({period:numberInput(Number(e.target.value),9,2,100)})} className={fieldClass}/></label><label>Base<input type="number" min={3} max={200} value={item.slow ?? 26} onChange={e=>onChange({slow:numberInput(Number(e.target.value),26,3,200)})} className={fieldClass}/></label><label>Displacement<input type="number" min={1} max={200} value={item.displacement ?? 26} onChange={e=>onChange({displacement:numberInput(Number(e.target.value),26,1,200)})} className={fieldClass}/></label></>}
      {item.kind === 'Anchored VWAP' && <label>Anchor<select value={(item as IndicatorConfig & {anchor?:string}).anchor || 'Swing High'} onChange={e=>onChange({anchor:e.target.value} as any)} className={fieldClass}>{['Swing High','Swing Low','Day Start','Week Start','Month Start','Visible Range Start','Manual Time'].map(v=><option key={v}>{v}</option>)}</select></label>}
    </div>}
    {tab === 'style' && <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
      <label>Primary color<input type="color" value={item.color || '#3b82f6'} onChange={e=>onChange({color:e.target.value})} className="mt-1 h-8 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1"/></label>
      {['MACD','Stochastic','Supertrend','Ichimoku Cloud'].includes(item.kind) && <label>Signal color<input type="color" value={item.signalColor || '#c084fc'} onChange={e=>onChange({signalColor:e.target.value})} className="mt-1 h-8 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1"/></label>}
      {['Bollinger Bands','Keltner Channels','Donchian Channels','Ichimoku Cloud','VWAP Deviation Bands'].includes(item.kind) && <label>Upper color<input type="color" value={item.upperColor || '#60a5fa'} onChange={e=>onChange({upperColor:e.target.value})} className="mt-1 h-8 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1"/></label>}
      {['Bollinger Bands','Keltner Channels','Donchian Channels','Ichimoku Cloud','VWAP Deviation Bands'].includes(item.kind) && <label>Lower color<input type="color" value={item.lowerColor || '#60a5fa'} onChange={e=>onChange({lowerColor:e.target.value})} className="mt-1 h-8 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1"/></label>}
      <label>Line width<input type="number" min={1} max={6} value={item.lineWidth ?? 2} onChange={e=>onChange({lineWidth:numberInput(Number(e.target.value),2,1,6)})} className={fieldClass}/></label>
      <label>Line style<select value={String(item.lineStyle ?? 0)} onChange={e=>onChange({lineStyle:Number(e.target.value) as 0|1|2})} className={fieldClass}><option value="0">Solid</option><option value="1">Dotted</option><option value="2">Dashed</option></select></label>
      <label className="col-span-2">Opacity<input type="range" min={0.15} max={1} step={0.05} value={display.opacity ?? 1} onChange={e=>onChange({display:{...display, opacity:Number(e.target.value)}})} className="mt-3 w-full"/></label>
    </div>}
    {tab === 'display' && <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
      <label className="flex items-center gap-2 rounded border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2 py-2"><input type="checkbox" checked={display.showLegend ?? true} onChange={e=>onChange({display:{...display,showLegend:e.target.checked}})}/> Legend</label>
      <label className="flex items-center gap-2 rounded border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2 py-2"><input type="checkbox" checked={display.showValues ?? true} onChange={e=>onChange({display:{...display,showValues:e.target.checked}})}/> Values</label>
      <label>Pane<select value={display.pane ?? 'auto'} onChange={e=>onChange({display:{...display,pane:e.target.value as any}})} className={fieldClass}><option value="auto">Auto</option><option value="overlay">Price</option><option value="separate">Separate</option></select></label>
      <label>Scale<select value={display.scale ?? 'price'} onChange={e=>onChange({display:{...display,scale:e.target.value as IndicatorScaleMode}})} className={fieldClass}>{INDICATOR_SCALE_MODES.map(mode=><option key={mode} value={mode}>{mode}</option>)}</select></label>
      <label>Precision<input type="number" min={0} max={8} value={display.precision ?? 2} onChange={e=>onChange({display:{...display,precision:numberInput(Number(e.target.value),2,0,8)}})} className={fieldClass}/></label>
      <label className="flex items-center gap-2 rounded border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2 py-2"><input type="checkbox" checked={item.enabled} onChange={e=>onChange({enabled:e.target.checked})}/> Visible</label>
    </div>}
  </div>;
}
