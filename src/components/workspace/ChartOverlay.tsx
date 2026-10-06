import { Code2, Eye, Pencil, RotateCcw, Search, Settings2, Trash2, X, Play, Zap } from 'lucide-react';
import type { CandleAppearance } from '../../services/core/chart/candleAppearance';
import { DEFAULT_CANDLE_APPEARANCE } from '../../services/core/chart/candleAppearance';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import { INDICATOR_LIBRARY, getIndicatorDefaultPatch } from '../../services/marketData/indicatorEngine';
import { IndicatorSettingsPanel } from '../indicators/IndicatorSettingsPanel';
import { IndicatorCodeViewer } from '../indicators/IndicatorCodeViewer';
import type { CoreSpiritChartStoreState } from '../../services/coreSpirit/CoreSpiritStore';
import type { ChartAnalytics } from '../../services/marketData/levelEngine';
import type { DrawingTool } from './drawingTypes';

export function ChartOverlay({
  resolvedInstrumentKey,timeframe,intervals,setTimeframe,candleAppearance,setCandleAppearance,showCandleSettings,setShowCandleSettings,
  indicators,indicatorCount,showIndicatorMenu,setShowIndicatorMenu,editingIndicator,setEditingIndicator,addIndicatorFromChart,patchIndicator,removeIndicator,viewingIndicator,setViewingIndicatorCode,
  predictionModelIds,predictionQuery,setPredictionQuery,showPredictionMenu,setShowPredictionMenu,savePredictionModelIds,setPredictionModelIds,
  drawingTool,showDrawingMenu,setShowDrawingMenu,selectDrawingTool,clearDrawings,undoDrawing,showLevels,setShowLevels,showOI,setShowOI,showDepth,setShowDepth,showVolume,setShowVolume,
  coreSpiritState,setCoreSpiritSource,openCoreSpirit,compileCoreSpirit,deployCoreSpirit,closeCoreSpirit,analytics,
}: {
  resolvedInstrumentKey:string;
  timeframe:string;
  intervals:Record<string,string>;
  setTimeframe:(value:string)=>void;
  candleAppearance:CandleAppearance;
  setCandleAppearance:(next:CandleAppearance)=>void;
  showCandleSettings:boolean;
  setShowCandleSettings:(value:boolean)=>void;
  indicators:IndicatorConfig[];
  indicatorCount:number;
  showIndicatorMenu:boolean;
  setShowIndicatorMenu:(value:boolean)=>void;
  editingIndicator:string|null;
  setEditingIndicator:(value:string|null)=>void;
  addIndicatorFromChart:(kind:IndicatorConfig['kind'])=>void;
  patchIndicator:(id:string,patch:Partial<IndicatorConfig>)=>void;
  removeIndicator:(id:string)=>void;
  viewingIndicator:IndicatorConfig|undefined;
  setViewingIndicatorCode:(value:string|null)=>void;
  predictionModelIds:string[];
  predictionQuery:string;
  setPredictionQuery:(value:string)=>void;
  showPredictionMenu:boolean;
  setShowPredictionMenu:(value:boolean)=>void;
  savePredictionModelIds:(ids:string[])=>void;
  setPredictionModelIds:(ids:string[])=>void;
  drawingTool:DrawingTool;
  showDrawingMenu:boolean;
  setShowDrawingMenu:(value:boolean)=>void;
  selectDrawingTool:(tool:DrawingTool)=>void;
  clearDrawings:()=>void;
  undoDrawing:()=>void;
  showLevels:boolean;
  setShowLevels:(value:boolean)=>void;
  showOI:boolean;
  setShowOI:(value:boolean)=>void;
  showDepth:boolean;
  setShowDepth:(value:boolean)=>void;
  showVolume:boolean;
  setShowVolume:(value:boolean)=>void;
  coreSpiritState:CoreSpiritChartStoreState;
  setCoreSpiritSource:(source:string)=>void;
  openCoreSpirit:()=>void;
  compileCoreSpirit:()=>void;
  deployCoreSpirit:()=>void;
  closeCoreSpirit:()=>void;
  analytics:ChartAnalytics|null;
}) {
  return <>
    <div className="absolute left-2 top-2 z-40 flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 p-1.5 text-[9px] shadow-xl backdrop-blur">
      <span className="px-1.5 font-mono uppercase tracking-widest text-[var(--tco-dim)]">Chart</span>
      {Object.keys(intervals).map(value=><button key={value} onClick={()=>setTimeframe(value)} className={`rounded border px-2 py-1 font-mono ${timeframe===value?'border-[#3b82f6]/50 bg-[#3b82f6]/10 text-[#93c5fd]':'border-[var(--tco-border)] text-[var(--tco-muted)]'}`}>{value}</button>)}
      <button onClick={()=>setShowCandleSettings(!showCandleSettings)} className="toolbar-pill"><Settings2 className="mr-1 inline h-3 w-3"/>Style</button>
      <button onClick={()=>{setShowIndicatorMenu(!showIndicatorMenu);setShowPredictionMenu(false);setShowDrawingMenu(false)}} className="toolbar-pill">Indicators {indicatorCount}</button>
      <button onClick={()=>{setShowPredictionMenu(!showPredictionMenu);setShowIndicatorMenu(false);setShowDrawingMenu(false)}} className={`toolbar-pill ${predictionModelIds.length?'toolbar-pill-active':''}`}>AI {predictionModelIds.length}</button>
      <button onClick={()=>{setShowDrawingMenu(!showDrawingMenu);setShowIndicatorMenu(false);setShowPredictionMenu(false)}} className={`toolbar-pill ${drawingTool!=='none'?'toolbar-pill-active':''}`}><Pencil className="mr-1 inline h-3 w-3"/>Draw</button>
      <button onClick={()=>setShowLevels(!showLevels)} className={`toolbar-pill ${showLevels?'toolbar-pill-active':''}`}>Levels</button>
      <button onClick={()=>setShowOI(!showOI)} className={`toolbar-pill ${showOI?'toolbar-pill-active':''}`}>OI</button>
      <button onClick={()=>setShowDepth(!showDepth)} className={`toolbar-pill ${showDepth?'toolbar-pill-active':''}`}>L2</button>
      <button onClick={()=>setShowVolume(!showVolume)} className={`toolbar-pill ${showVolume?'toolbar-pill-active-blue':''}`}>Volume</button>
      <span className="ml-1 font-mono text-[var(--tco-dim)]">{indicators.filter(x=>x.enabled).length} indicators</span>
    </div>

    {showCandleSettings&&<div className="absolute left-2 top-14 z-50 w-[340px] max-w-[calc(100%-16px)] rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-3 shadow-2xl">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--tco-border)] pb-2"><div className="flex-1"><div className="text-[10px] font-semibold text-white">Candle appearance</div><div className="text-[8px] text-[var(--tco-dim)]">Saved per broker + symbol</div></div><button onClick={()=>setShowCandleSettings(false)}><X size={13}/></button></div>
      <div className="grid grid-cols-2 gap-2 text-[8px] text-[var(--tco-code-muted)]">{(['upBody','downBody','upBorder','downBorder','upWick','downWick','volumeUp','volumeDown'] as const).map(key=><label key={key}>{key}<input type="color" value={candleAppearance[key]} onChange={e=>setCandleAppearance({...candleAppearance,[key]:e.target.value})} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] text-[var(--tco-text-2)]">
        <label className="flex items-center gap-2 rounded border border-[var(--tco-border)] px-2 py-2"><input type="checkbox" checked={candleAppearance.borderVisible} onChange={e=>setCandleAppearance({...candleAppearance,borderVisible:e.target.checked})}/>Show borders</label>
        <label className="flex items-center gap-2 rounded border border-[var(--tco-border)] px-2 py-2"><input type="checkbox" checked={candleAppearance.wickVisible} onChange={e=>setCandleAppearance({...candleAppearance,wickVisible:e.target.checked})}/>Show wicks</label>
      </div>
      <div className="mt-3 flex gap-2"><button onClick={()=>setCandleAppearance(DEFAULT_CANDLE_APPEARANCE)} className="flex-1 rounded border border-[var(--tco-control)] px-2 py-1.5 text-[8px]"><RotateCcw className="mr-1 inline h-3 w-3"/>Reset</button><button onClick={()=>setShowCandleSettings(false)} className="rounded border border-[#3b82f6]/40 px-3 py-1.5 text-[8px]">Done</button></div>
    </div>}

    {showIndicatorMenu&&<div className="absolute left-2 top-14 z-50 max-h-[70vh] w-[360px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl">
      <div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Chart indicators</div>
      {indicators.filter(x=>x.enabled).map(item=><div key={item.id} className="border-b border-[var(--tco-border)] last:border-0">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-white">
          <span className="flex-1">{item.kind}</span>
          <button title="Indicator settings" onClick={()=>setEditingIndicator(editingIndicator===item.id?null:item.id)}><Settings2 size={13}/></button>
          <button title="View code" onClick={()=>setViewingIndicatorCode(item.id)}><Code2 size={13}/></button>
          <button onClick={()=>patchIndicator(item.id,{enabled:false})}><Eye size={13}/></button>
          <button onClick={()=>removeIndicator(item.id)} className="text-[#ef4444]"><Trash2 size={13}/></button>
        </div>
        {editingIndicator===item.id&&<div className="border-t border-[var(--tco-border)] px-2 py-2"><IndicatorSettingsPanel item={item} compact onChange={patch=>patchIndicator(item.id,patch)} onOpenSource={()=>setViewingIndicatorCode(item.id)} onReset={()=>patchIndicator(item.id,getIndicatorDefaultPatch(item as unknown as Record<string,unknown>,item.kind) as Partial<IndicatorConfig>)}/></div>}
      </div>)}
      <div className="grid grid-cols-2 gap-1 border-t border-[var(--tco-border)] p-2">{INDICATOR_LIBRARY.map(item=><button key={item.kind} onClick={()=>addIndicatorFromChart(item.kind)} className="rounded border border-[var(--tco-control)] px-2 py-1.5 text-left text-[9px]">{item.kind}</button>)}</div>
    </div>}

    {showPredictionMenu&&<div className="absolute left-2 top-14 z-50 w-[360px] max-w-[calc(100%-16px)] rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-2 pb-2"><b className="flex-1 text-[10px] uppercase tracking-widest text-[var(--tco-text-2)]">AI prediction models</b><button onClick={()=>setShowPredictionMenu(false)}><X size={13}/></button></div>
      <div className="flex gap-2 p-2"><div className="flex flex-1 items-center gap-1 rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] px-2"><Search size={12} className="text-[var(--tco-dim)]"/><input value={predictionQuery} onChange={e=>setPredictionQuery(e.target.value)} placeholder="Search models…" className="min-w-0 flex-1 bg-transparent py-1 text-[9px] text-white outline-none"/></div><button onClick={()=>{setPredictionModelIds([]);savePredictionModelIds([])}} className="rounded border border-[var(--tco-border)] px-2 text-[8px]">Clear</button></div>
      <div className="max-h-[52vh] overflow-y-auto">
        <div className="px-3 py-2 text-[8px] text-[var(--tco-dim)]">Model execution stays off the candle render path. Configure active models from the prediction center.</div>
      </div>
      <div className="border-t border-[var(--tco-border)] px-2 pt-2 text-[8px] text-[var(--tco-dim)]">{predictionModelIds.length} selected</div>
    </div>}

    {showDrawingMenu&&<div className="absolute left-2 top-14 z-50 w-56 rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-2 pb-2"><b className="flex-1 text-[10px] uppercase tracking-widest text-[var(--tco-text-2)]">Drawing tools</b><button onClick={()=>setShowDrawingMenu(false)}><X size={13}/></button></div>
      <div className="grid grid-cols-2 gap-1 p-2">{['trendline','ray','horizontal','horizontalRay','vertical','rectangle','ellipse','fib','fibExtension','pitchfork','arrow','priceRange','dateRange','brush','highlighter','text','longPosition','shortPosition','measure'].map(tool=><button key={tool} onClick={()=>selectDrawingTool(tool as DrawingTool)} className={`rounded border px-2 py-1.5 text-left text-[8px] ${drawingTool===tool?'border-[#3b82f6]/50 bg-[#3b82f6]/10 text-white':'border-[var(--tco-control)] text-[var(--tco-text-2)]'}`}>{tool}</button>)}</div>
      <button onClick={clearDrawings} className="w-full border-t border-[var(--tco-border)] px-2 pt-2 text-left text-[8px] text-[#ef4444]">Clear drawings</button><button onClick={undoDrawing} className="mt-1 w-full border-t border-[var(--tco-border)] px-2 pt-2 text-left text-[8px]">Undo</button>
    </div>}

    <div className="absolute right-2 top-2 z-40 flex flex-col items-center gap-1 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 p-1 shadow-2xl">
      <button title="CoreSpirit Editor" onClick={openCoreSpirit} className={`flex h-8 w-8 items-center justify-center rounded ${coreSpiritState.open?'bg-[#3b82f6]/20 text-[#93c5fd]':'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}><Code2 size={15}/></button>
    </div>

    {coreSpiritState.open&&<div className="absolute right-12 top-2 z-50 w-[min(520px,calc(100%-70px))] overflow-hidden rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-blue)] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-3 py-2"><div className="flex-1"><div className="text-[10px] font-mono font-bold text-white">CoreSpirit Editor</div><div className="text-[8px] text-[var(--tco-dim)]">{resolvedInstrumentKey} · {timeframe}</div></div><button onClick={closeCoreSpirit}><X size={13}/></button></div>
      <textarea value={coreSpiritState.source} onChange={e=>setCoreSpiritSource(e.target.value)} spellCheck={false} className="h-[300px] w-full resize-none bg-[var(--tco-code-bg-deep)] p-3 font-mono text-[11px] leading-5 text-[var(--tco-code-text)] outline-none"/>
      <div className="flex items-center gap-2 border-t border-[var(--tco-border)] px-3 py-2"><button onClick={compileCoreSpirit} className="inline-flex items-center gap-1 rounded border border-[var(--tco-control)] px-2 py-1 text-[9px]"><Play size={11}/>Compile</button><button onClick={deployCoreSpirit} className="inline-flex items-center gap-1 rounded border border-[#3b82f6]/40 px-2 py-1 text-[9px] text-[#93c5fd]"><Zap size={11}/>Deploy</button><span className="ml-auto text-[8px] text-[var(--tco-dim)]">{coreSpiritState.status}</span></div>
      {coreSpiritState.diagnostics.length>0&&<div className="max-h-24 overflow-auto border-t border-[var(--tco-border)] px-3 py-2 text-[8px] font-mono text-[#f59e0b]">{coreSpiritState.diagnostics.map((diagnostic,index)=><div key={index}>{diagnostic}</div>)}</div>}
    </div>}

    {viewingIndicator&&<IndicatorCodeViewer item={viewingIndicator} onClose={()=>setViewingIndicatorCode(null)}/>}
    {analytics&&<div className="pointer-events-none absolute bottom-2 left-2 z-30 rounded border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/85 px-2 py-1 font-mono text-[8px] text-[var(--tco-dim)]">ATR {analytics.atr?.toFixed?.(2)??'—'}</div>}
  </>;
}
