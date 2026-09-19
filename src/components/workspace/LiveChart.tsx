import { useEffect, useRef, useState } from 'react';
import { ChartLifecycle } from '../../services/core/chart/chartLifecycle';
import { ChartUpdateScheduler } from '../../services/core/chart/chartUpdateScheduler';
import { CoreDrawing, normalizeCoreDrawings } from '../../services/core/drawing/coreDrawing';
import { CoreDrawingStore } from '../../services/core/drawing/coreDrawingStore';
import { hitTestDrawings, moveDrawingHandle, snapDataPoint } from '../../services/core/drawing/drawingGeometry';
import { RealtimeCalculationEngine } from '../../services/core/calculation/realtimeCalculationEngine';
import { coreEventBus } from '../../services/core/event/eventBus';
import { CORE_DRAWING_TOOLS, getCoreDrawingTool, validateDrawingPoints } from '../../services/core/drawing/drawingTools';
import { createChart, createSeriesMarkers, ColorType, CandlestickSeries, HistogramSeries, LineSeries, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { NormalizedMarketTick } from '../../types/market';
import { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { buildChartAnalytics, ChartAnalytics } from '../../services/marketData/levelEngine';
import { getIndicators, saveIndicators, getAutomations, AutomationConfig } from '../../services/workspace/workspaceState';
import { buildOIChartAnalytics, OIChartAnalytics } from '../../services/marketData/oiEngine';
import { Plus, Settings2, Eye, EyeOff, Trash2, RotateCcw, Pencil, Search, Check, X, Crosshair, Minus, ArrowUpRight, MoveHorizontal, MoveVertical, Square, Circle, Ruler, Type, MousePointer2, Eraser, Paintbrush, Highlighter, Waves, GitBranch, Triangle, BoxSelect, Target, Undo2 } from 'lucide-react';
import { PREDICTION_MODELS, getSavedPredictionModelIds, predictWithModel } from '../../services/predictionEngine';
import { fetchProductionPredictions } from '../../services/productionPredictionService';
import { IndicatorConfig, INDICATOR_LIBRARY, PRICE_SOURCES, defaultIndicatorStyle, series, vwap, bollinger, rsi, macd, supertrend, keltner, donchian, stochastic, ichimoku, pivots, marketStructure, fairValueGaps, dynamicSupportResistance, liquiditySweeps, orderBlocks, indianKeyLevels, cpr, classicPivots, openingRange, swingLevels, gapLevels, previousDayLevels, previousPeriodLevels, gapZones, equalHighLow, liquidityPools, bosChoch, priceActionEvents, nr7, developingDayLevels, vwapDeviationBands, anchoredVwap, extendedCpr, periodPivots, tradingCoreVPriceAction, advancedTradingViewIndicator } from '../../services/marketData/indicatorEngine';

const intervals: Record<string,string> = {'1m':'1minute','3m':'3minute','5m':'5minute','15m':'15minute','30m':'30minute','1H':'60minute','1D':'day'};
const HISTORY_PAGE_CANDLES=5_000;
const MAX_HISTORY_CANDLES=30_000;
const HISTORY_PREFETCH_THRESHOLD=300;
const canonicalInstrumentKey=(brokerId:string,key:string)=>{
 const value=String(key||'').trim();
 if(String(brokerId).toLowerCase()!=='fyers') return value;
 const n=value.toLowerCase().replace(/\s+/g,'');
 if(n==='nse_index|nifty50'||n==='nse_index|nifty50index'||n==='nifty'||n==='nifty50'||n==='nifty50index'||n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
 if(n==='nse_index|niftybank'||n==='nse_index|banknifty'||n==='banknifty'||n==='niftybank'||n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
 if(n==='nse_index|finnifty'||n==='nse_index|niftyfinancialservices'||n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
 if(n==='nse_index|niftymidcapselect'||n==='nse_index|midcap'||n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
 if(n==='bse_index|sensex'||n==='sensex'||n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';
 const pipe=value.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
 if(pipe) return `${pipe[1].toUpperCase()}:${pipe[3]}`;
 if(!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return `NSE:${value}`;
 return value;
};
const seconds: Record<string,number> = {'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1H':3600,'1D':86400};
type Props={instrumentKey:string;brokerId?:string;tick?:NormalizedMarketTick;onAnalytics?:(a:ChartAnalytics)=>void;levelsRequest?:number;chartIndex?:number;showEmbeddedDrawingToolbar?:boolean};
const colors:Record<string,string>={EMA:'#38bdf8',SMA:'#f59e0b',HMA:'#e879f9',VWAP:'#c084fc',ADX:'#22c55e',RSI:'#f59e0b',CCI:'#fb7185',OBV:'#60a5fa',MFI:'#a78bfa',ATR:'#22c55e'};
const oscillatorKinds=(x:IndicatorConfig[])=>x.some(i=>i.enabled&&['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Delta Sigma Heatmap','Neural Weight Oscillator','Trend Pressure','Trinity','Volatility Shock Half Life Monitor'].includes(i.kind));
const TrendingIcon=ArrowUpRight;
type DrawingTool=
 'none'|'trendline'|'ray'|'extendedLine'|'horizontal'|'horizontalRay'|'vertical'|'rectangle'|'ellipse'|
 'parallelChannel'|'fib'|'fibExtension'|'pitchfork'|'arrow'|'priceRange'|'dateRange'|'brush'|'highlighter'|
 'text'|'longPosition'|'shortPosition'|'crosshair'|'measure';
type DrawingPoint={time:number;price:number};
type Drawing = CoreDrawing;

const chartStateKey=(brokerId:string,instrumentKey:string)=>`tradingcore:chart-state:${brokerId}:${encodeURIComponent(instrumentKey)}`;
const finiteNumber=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const safeLinePoints=(rows:any[],valueKey='value')=>(Array.isArray(rows)?rows:[]).map((x:any)=>({time:x?.time as Time,value:finiteNumber(x?.[valueKey])})).filter((x:any)=>x.time!=null&&x.value!=null);
const safeNamedPoints=(rows:any[],key:string)=>(Array.isArray(rows)?rows:[]).map((x:any)=>({time:x?.time as Time,value:finiteNumber(x?.[key])})).filter((x:any)=>x.time!=null&&x.value!=null);

type PersistedChartState={version:2;timeframe:string;drawings:Drawing[];showLevels?:boolean;showVolume?:boolean;showOI?:boolean;showDepth?:boolean};
function loadChartState(brokerId:string,instrumentKey:string):PersistedChartState{
 try{
   const raw=localStorage.getItem(chartStateKey(brokerId,instrumentKey)); const x=raw?JSON.parse(raw):null;
   if(x&&typeof x==='object'){
     const drawings=normalizeCoreDrawings(x.drawings, 'user');
     return{version:2,timeframe:typeof x.timeframe==='string'&&intervals[x.timeframe]?x.timeframe:'5m',drawings,showLevels:Boolean(x.showLevels),showVolume:Boolean(x.showVolume),showOI:Boolean(x.showOI),showDepth:Boolean(x.showDepth)};
   }
 }catch{}
 return{version:2,timeframe:'5m',drawings:[]};
}
function saveChartState(brokerId:string,instrumentKey:string,state:PersistedChartState){
 try{localStorage.setItem(chartStateKey(brokerId,instrumentKey),JSON.stringify({...state,version:2}));window.dispatchEvent(new CustomEvent('tradingcore:chart-state-saved',{detail:{brokerId,instrumentKey}}));}catch{}
}

function markerForAutomation(a:AutomationConfig,c:HistoricalCandle[]):{time:number;position:'aboveBar'|'belowBar';color:string;shape:'arrowUp'|'arrowDown';text:string}|null{
 if(!a.enabled||a.mode==='Off'||c.length<3)return null; const last=c[c.length-1],prev=c[c.length-2],time=Math.floor(new Date(last.timestamp).getTime()/1000);
 if(a.kind==='VWAP_RECLAIM'){const w=vwap(c,'hlc3');if(w.length<2)return null;const pv=w[w.length-2].value,cv=w[w.length-1].value;if(prev.close<=pv&&last.close>cv)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'VWAP BUY'};if(prev.close>=pv&&last.close<cv)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'VWAP SELL'};}
 if(a.kind==='EMA_CROSS'){const fast=series(c,'EMA',{id:a.id,kind:'EMA',period:a.fast||9,enabled:true}),slow=series(c,'EMA',{id:a.id,kind:'EMA',period:a.slow||21,enabled:true});if(fast.length>1&&slow.length>1){const f0=fast[fast.length-2].value,s0=slow[slow.length-2].value,f1=fast[fast.length-1].value,s1=slow[slow.length-1].value;if(f0<=s0&&f1>s1)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'EMA BUY'};if(f0>=s0&&f1<s1)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'EMA SELL'};}}
 if(a.kind==='OPENING_RANGE'){const day=new Date(last.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),today=c.filter(x=>new Date(x.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})===day),opening=today.slice(0,Math.max(1,Math.round(900/300)));if(opening.length&&today.length>opening.length){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(prev.close<=hi&&last.close>hi)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'OR BUY'};if(prev.close>=lo&&last.close<lo)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'OR SELL'};}}
 if(a.kind==='RSI_REVERSAL'){const pts=rsi(c,a.period||14);if(pts.length>=2){const r0=pts[pts.length-2].value,r1=pts[pts.length-1].value;if(r0<=30&&r1>30)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'RSI BUY'};if(r0>=70&&r1<70)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'RSI SELL'};}}
 if(a.kind==='DONCHIAN_BREAKOUT'){const ch=donchian(c,a.period||20);if(ch.length>=2){const prevCh=ch[ch.length-2],lastCh=ch[ch.length-1];if(prev.close<=prevCh.upper&&last.close>lastCh.upper)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'BREAKOUT BUY'};if(prev.close>=prevCh.lower&&last.close<lastCh.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BREAKOUT SELL'};}}
 if(a.kind==='SUPERTREND_FLIP'){const st=supertrend(c,a.period||10);if(st.length>=2){const p0=st[st.length-2],p1=st[st.length-1];if(p0.direction<0&&p1.direction>0)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'ST BUY'};if(p0.direction>0&&p1.direction<0)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'ST SELL'};}}
 if(a.kind==='PDH_PDL_SWEEP'){const lv=indianKeyLevels(c);const pdh=lv.find(x=>x.label==='PDH'),pdl=lv.find(x=>x.label==='PDL');if(pdh&&prev.high>pdh.price&&last.close<pdh.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'PDH SWEEP'};if(pdl&&prev.low<pdl.price&&last.close>pdl.price)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'PDL SWEEP'};}
 if(a.kind==='CPR_BREAKOUT'){const lv=cpr(c);const tc=lv.find(x=>x.label==='CPR TC'),bc=lv.find(x=>x.label==='CPR BC');if(tc&&prev.close<=tc.price&&last.close>tc.price)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'CPR BUY'};if(bc&&prev.close>=bc.price&&last.close<bc.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'CPR SELL'};}
 if(a.kind==='BOLLINGER_BREAKOUT'){const bb=bollinger(c,a.period||20,a.multiplier||2);if(bb.length>=2){const p0=bb[bb.length-2],p1=bb[bb.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'BB BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BB SELL'};}}
 return null;
}

const line=(chart:IChartApi,color:string,width=1,lineStyle:0|1|2=0)=>chart.addSeries(LineSeries,{color,lineWidth:width,lineStyle,priceLineVisible:false,lastValueVisible:true});

export function LiveChart({instrumentKey,brokerId='unknown',tick,onAnalytics,levelsRequest,chartIndex,showEmbeddedDrawingToolbar=true}:Props){
 const resolvedInstrumentKey=canonicalInstrumentKey(brokerId,instrumentKey);
 const host=useRef<HTMLDivElement>(null),oscHost=useRef<HTMLDivElement>(null); const chart=useRef<IChartApi>(); const oscChart=useRef<IChartApi>(); const candle=useRef<ISeriesApi<'Candlestick'>>(); const closeLine=useRef<ISeriesApi<'Line'>>(); const volume=useRef<ISeriesApi<'Histogram'>>(); const indicatorSeries=useRef<ISeriesApi<'Line'>[]>([]);
 const markerPlugin=useRef<any>(null); const oscSeries=useRef<ISeriesApi<'Line'>[]>([]); const candles=useRef<HistoricalCandle[]>([]);
 const lifecycle=useRef(new ChartLifecycle()); const chartUpdateScheduler=useRef(new ChartUpdateScheduler()); const chartId=useRef(`chart-${Math.random().toString(36).slice(2,10)}`); const analyticsWorker=useRef<Worker>(); const indicatorWorker=useRef<Worker>(); const analyticsJob=useRef(0); const indicatorJob=useRef(0); const calculationEngine=useRef(new RealtimeCalculationEngine()); const workerSeriesMap=useRef(new Map<string, Array<ISeriesApi<'Line'>|ISeriesApi<'Histogram'>>>());
 const persistedChart=loadChartState(brokerId,resolvedInstrumentKey); const [selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null); const [timeframe,setTimeframe]=useState(persistedChart.timeframe),[drawingTool,setDrawingTool]=useState<DrawingTool>('none'),[showDrawingMenu,setShowDrawingMenu]=useState(false),[crosshairVisible,setCrosshairVisible]=useState(true),[showLevels,setShowLevels]=useState(persistedChart.showLevels??false),[showVolume,setShowVolume]=useState(persistedChart.showVolume??false),[showOI,setShowOI]=useState(persistedChart.showOI??false),[showDepth,setShowDepth]=useState(persistedChart.showDepth??false),[showIndicatorMenu,setShowIndicatorMenu]=useState(false),[showPredictionMenu,setShowPredictionMenu]=useState(false),[editingIndicator,setEditingIndicator]=useState<string|null>(null),[indicators,setIndicators]=useState<IndicatorConfig[]>(getIndicators),[automations,setAutomations]=useState<AutomationConfig[]>(getAutomations),[predictionModelIds,setPredictionModelIds]=useState<string[]>(getSavedPredictionModelIds()),[predictionQuery,setPredictionQuery]=useState(''),[chartType,setChartType]=useState<'candlestick'|'line'>('candlestick'),[error,setError]=useState(''),[historyLoading,setHistoryLoading]=useState(false);
 useEffect(()=>{if(levelsRequest==null)return;setShowLevels(true);},[levelsRequest]); const drawingToolRef=useRef<DrawingTool>('none'); const drawingPoints=useRef<DrawingPoint[]>([]);
 useEffect(()=>{const onTimeframe=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;const tf=String(detail?.timeframe||'');if(intervals[tf])setTimeframe(tf)};const onIndicators=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;setShowIndicatorMenu(true);setShowPredictionMenu(false)};const onPredictions=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;setShowPredictionMenu(true);setShowIndicatorMenu(false)};const onChartType=(e:any)=>{const detail=e?.detail||{};if(detail.chartIndex!=null&&detail.chartIndex!==chartIndex)return;const next=detail.type==='line'?'line':'candlestick';setChartType(next)};const onFit=(e:any)=>{const detail=e?.detail||{};if(detail.chartIndex!=null&&detail.chartIndex!==chartIndex)return;try{chart.current?.timeScale().fitContent();chart.current?.applyOptions({autoSize:true});}catch{}};const onTool=(e:any)=>{const detail=e?.detail;const targetIndex=typeof detail==='object'?detail?.chartIndex:undefined;if(targetIndex!=null&&targetIndex!==chartIndex)return;const tool=String(typeof detail==='object'?(detail?.tool||'none'):detail||'none') as DrawingTool;setDrawingTool(tool);drawingToolRef.current=tool;drawingPoints.current=[];setShowDrawingMenu(false)};const onClear=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;clearDrawings()};const onUndo=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;const before=drawingStore.current.list();if(drawingStore.current.undo()){drawings.current=drawingStore.current.list() as Drawing[];const removed=before[before.length-1];if(removed)coreEventBus.emit('drawing.deleted',{id:removed.id,owner:removed.owner,timestamp:Date.now()});saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings()}};const onRedo=(e:any)=>{const detail=e?.detail;if(detail?.chartIndex!=null&&detail.chartIndex!==chartIndex)return;if(drawingStore.current.redo()){drawings.current=drawingStore.current.list() as Drawing[];saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings()}};window.addEventListener('TRADINGCORE_SET_TIMEFRAME',onTimeframe as EventListener);window.addEventListener('TRADINGCORE_OPEN_INDICATORS',onIndicators as EventListener);window.addEventListener('TRADINGCORE_OPEN_PREDICTIONS',onPredictions as EventListener);window.addEventListener('TRADINGCORE_CHART_TYPE',onChartType as EventListener);window.addEventListener('TRADINGCORE_FIT_CHART',onFit as EventListener);window.addEventListener('TRADINGCORE_DRAW_TOOL',onTool as EventListener);window.addEventListener('TRADINGCORE_CLEAR_DRAWINGS',onClear as EventListener);window.addEventListener('TRADINGCORE_UNDO_DRAWING',onUndo as EventListener);window.addEventListener('TRADINGCORE_REDO_DRAWING',onRedo as EventListener);return()=>{window.removeEventListener('TRADINGCORE_SET_TIMEFRAME',onTimeframe as EventListener);window.removeEventListener('TRADINGCORE_OPEN_INDICATORS',onIndicators as EventListener);window.removeEventListener('TRADINGCORE_OPEN_PREDICTIONS',onPredictions as EventListener);window.removeEventListener('TRADINGCORE_CHART_TYPE',onChartType as EventListener);window.removeEventListener('TRADINGCORE_FIT_CHART',onFit as EventListener);window.removeEventListener('TRADINGCORE_DRAW_TOOL',onTool as EventListener);window.removeEventListener('TRADINGCORE_CLEAR_DRAWINGS',onClear as EventListener);window.removeEventListener('TRADINGCORE_UNDO_DRAWING',onUndo as EventListener);window.removeEventListener('TRADINGCORE_REDO_DRAWING',onRedo as EventListener)}},[chartIndex,brokerId,resolvedInstrumentKey,timeframe,showLevels,showVolume,showOI,showDepth]);
 useEffect(()=>{try{candle.current?.applyOptions({visible:chartType==='candlestick'});closeLine.current?.applyOptions({visible:chartType==='line'});}catch{}},[chartType]);
 useEffect(() => {
  const onCrosshair = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    if (detail.chartIndex != null && detail.chartIndex !== chartIndex) return;
    setCrosshairVisible(Boolean(detail.visible));
    try { chart.current?.applyOptions({ crosshair: { mode: detail.visible ? 0 : 2 } }); } catch {}
  };
  window.addEventListener('TRADINGCORE_CROSSHAIR', onCrosshair);
  return () => window.removeEventListener('TRADINGCORE_CROSSHAIR', onCrosshair);
 }, [chartIndex]);
 const drawingStore=useRef(new CoreDrawingStore(persistedChart.drawings)); const drawingDrag=useRef<{id:string;index:number}|null>(null); const drawings=useRef<Drawing[]>(drawingStore.current.list() as Drawing[]); const drawingSeries=useRef<ISeriesApi<'Line'>[]>([]); const analytics=useRef<ChartAnalytics|null>(null); const oiAnalytics=useRef<OIChartAnalytics|null>(null); const oiChainRef=useRef<{signature:string;chain:any}>(); const oiLines=useRef<any[]>([]); const predictionLines=useRef<any[]>([]); const predictionJob=useRef(0); const analyticsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{const a=(e:Event)=>setIndicators((e as CustomEvent<IndicatorConfig[]>).detail||getIndicators());const b=(e:Event)=>setAutomations((e as CustomEvent<AutomationConfig[]>).detail||getAutomations());const c=(e:Event)=>setPredictionModelIds((e as CustomEvent<string[]>).detail||getSavedPredictionModelIds());window.addEventListener('tradingcore:indicators',a);window.addEventListener('tradingcore:automations',b);window.addEventListener('tradingcore:prediction-models-changed',c);return()=>{window.removeEventListener('tradingcore:indicators',a);window.removeEventListener('tradingcore:automations',b);window.removeEventListener('tradingcore:prediction-models-changed',c)}},[]);
 useEffect(()=>{saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});},[timeframe,showLevels,showVolume,showOI,showDepth,brokerId,resolvedInstrumentKey]);
 const publishDrawing=(event:'drawing.created'|'drawing.updated',drawing:CoreDrawing)=>{coreEventBus.emit(event,{drawing:drawing as unknown as Record<string,unknown>});};
 const publishChartLifecycle=(state:'ready'|'loading'|'updating'|'error'|'recovering'|'disposed')=>{coreEventBus.emit('chart.lifecycle',{chartId:chartId.current,state,timestamp:Date.now()});};
 const requestIndicatorWorker=(data:HistoricalCandle[])=>{
   const worker=indicatorWorker.current; if(!worker)return;
   const id=++indicatorJob.current;
   worker.postMessage({id,candles:data,configs:indicators});
 };
 const renderWorkerIndicators=(results:any[])=>{
   if(!chart.current)return;
   const active=indicators.filter(x=>x.enabled);
   if(oscillatorKinds(active)&&oscHost.current&&!oscChart.current)oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#090c12'},textColor:'#64748b',fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:'#141824'},horzLines:{color:'#141824'}},rightPriceScale:{borderColor:'#252b3a'},timeScale:{visible:false}});
   const getSeries=(key:string,target:IChartApi,kind:'line'|'histogram',color:string,width=1,style:0|1|2=0)=>{
     const existing=workerSeriesMap.current.get(key);
     if(existing?.[0]){try{(existing[0] as any).applyOptions({color,lineWidth:width,lineStyle:style});}catch{}return existing[0];}
     const created=kind==='histogram'?target.addSeries(HistogramSeries,{color,priceFormat:{type:'price'},priceScaleId:'right'}):line(target,color,width,style);
     workerSeriesMap.current.set(key,[created as any]); return created as any;
   };
   const getGroup=(id:string,count:number,target:IChartApi,colorsFor:string[],width=1,style:0|1|2=0)=>{
     let group=workerSeriesMap.current.get(id);
     if(group?.length===count){group.forEach((g,i)=>{try{(g as any).applyOptions({color:colorsFor[i],lineWidth:width,lineStyle:style});}catch{}});return group;}
     group=colorsFor.slice(0,count).map(color=>line(target,color,width,style)); workerSeriesMap.current.set(id,group); return group;
   };
   for(const result of results){
     const cfg=active.find(x=>x.id===result.id); if(!cfg||!result.data?.length)continue;
     const targetOsc=['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI'].includes(result.kind);
     const target=targetOsc?oscChart.current:chart.current; if(!target)continue;
     if(result.kind==='MACD'){const [s1,s2,h]=(()=>{const c1=cfg.color||'#38bdf8',c2=cfg.signalColor||'#c084fc',w=cfg.lineWidth||1,ls=cfg.lineStyle||0;let g=workerSeriesMap.current.get(result.id);if(!g||g.length!==3){g=[line(target,c1,w,ls),line(target,c2,w,ls),target.addSeries(HistogramSeries,{priceFormat:{type:'price'},priceScaleId:'right'}) as any];workerSeriesMap.current.set(result.id,g);}else{try{(g[0] as any).applyOptions({color:c1,lineWidth:w,lineStyle:ls});(g[1] as any).applyOptions({color:c2,lineWidth:w,lineStyle:ls});}catch{}}return g as any[];})();s1.setData(safeNamedPoints(result.data,'macd') as any);s2.setData(safeNamedPoints(result.data,'signal') as any);h.setData((Array.isArray(result.data)?result.data:[]).map((x:any)=>({time:x?.time as Time,value:finiteNumber(x?.histogram),color:Number(x?.histogram)>=0?(cfg.color||'#10b981')+'55':(cfg.signalColor||'#ef4444')+'55'})).filter((x:any)=>x.time!=null&&x.value!=null) as any);continue;}
     if(result.kind==='Stochastic'){const g=getGroup(result.id,2,target,[cfg.color||'#38bdf8',cfg.signalColor||'#f59e0b'],cfg.lineWidth||1,cfg.lineStyle||0);g[0].setData(safeNamedPoints(result.data,'k') as any);g[1].setData(safeNamedPoints(result.data,'d') as any);continue;}
     if(result.kind==='Bollinger Bands'||result.kind==='Keltner Channels'||result.kind==='Donchian Channels'){const base=cfg.color||'#60a5fa',colorsFor=[cfg.upperColor||base,cfg.signalColor||'#64748b',cfg.lowerColor||base];const g=getGroup(result.id,3,target,colorsFor,cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<3;i++){const key=['upper','middle','lower'][i];g[i].setData(safeNamedPoints(result.data,key) as any);}continue;}
     if(result.kind==='Supertrend'){const g=getGroup(result.id,2,target,[cfg.color||'#22c55e',cfg.signalColor||'#ef4444'],cfg.lineWidth||2,cfg.lineStyle||0);g[0].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===1) as any);g[1].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===-1) as any);continue;}
     if(result.kind==='Ichimoku Cloud'){const base=cfg.color||'#38bdf8';const g=getGroup(result.id,4,target,[base,cfg.signalColor||'#f59e0b',cfg.upperColor||'#22c55e',cfg.lowerColor||'#ef4444'],cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<4;i++){const key=['tenkan','kijun','spanA','spanB'][i];g[i].setData(safeNamedPoints(result.data,key) as any);}continue;}
     const s=getSeries(result.id,target,'line',cfg.color||colors[result.kind]||'#94a3b8',cfg.lineWidth||2,cfg.lineStyle||0);s.setData(safeLinePoints(result.data,'value') as any);
   }
 };
 useEffect(()=>{
   const aw=new Worker(new URL('../../services/marketData/chartAnalytics.worker.ts',import.meta.url),{type:'module'});
   const iw=new Worker(new URL('../../services/marketData/indicator.worker.ts',import.meta.url),{type:'module'});
   analyticsWorker.current=aw; indicatorWorker.current=iw;
   aw.onmessage=(e:MessageEvent<any>)=>{if(!lifecycle.current.isAlive()||e.data?.id!==analyticsJob.current||!e.data?.analytics)return;analytics.current=e.data.analytics;onAnalytics?.(e.data.analytics);window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:e.data.analytics}));};
   iw.onmessage=(e:MessageEvent<any>)=>{if(!lifecycle.current.isAlive()||e.data?.id!==indicatorJob.current||!e.data?.results||!chart.current)return;chartUpdateScheduler.current.schedule(()=>{try{renderWorkerIndicators(e.data.results);}catch(indicatorError){console.warn('[TradingCore] Worker indicator render skipped invalid data:',indicatorError);}});};
   return()=>{aw.terminate();iw.terminate();chartUpdateScheduler.current.cancel();analyticsWorker.current=undefined;indicatorWorker.current=undefined;};
 },[]);
 const clearChartMarkers=()=>{ try{markerPlugin.current?.setMarkers([]);}catch{} };
 const setChartMarkers=(markers:any[])=>{
   if(!candle.current)return;
   try{
     if(!markerPlugin.current) markerPlugin.current=createSeriesMarkers(candle.current,[]);
     markerPlugin.current.setMarkers(markers.slice(-100));
   }catch{}
 };
 const renderStudies=(data:HistoricalCandle[])=>{
   clearChartMarkers();

   indicatorSeries.current.forEach(s=>{try{chart.current?.removeSeries(s)}catch{}});indicatorSeries.current=[];oscSeries.current.forEach(s=>{try{oscChart.current?.removeSeries(s as any)}catch{}});oscSeries.current=[];
   workerSeriesMap.current.forEach(group=>group.forEach(s=>{try{chart.current?.removeSeries(s as any)}catch{} try{oscChart.current?.removeSeries(s as any)}catch{}})); workerSeriesMap.current.clear();
   const active=indicators.filter(x=>x.enabled); const needsOsc=oscillatorKinds(active); const chartMarkers:any[]=[];
   if(needsOsc&&oscHost.current&&!oscChart.current)oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#090c12'},textColor:'#64748b',fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:'#141824'},horzLines:{color:'#141824'}},rightPriceScale:{borderColor:'#252b3a'},timeScale:{visible:false}});
   if(!needsOsc&&oscChart.current){try{oscChart.current.remove()}catch{}oscChart.current=undefined;}
   for(const cfg of active){
     if(!chart.current)continue;
     if(['EMA','SMA','HMA','ATR','RSI','ADX','CCI','OBV','MFI','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Ichimoku Cloud'].includes(cfg.kind))continue;
     if(cfg.kind==='Market Structure'){const ms=marketStructure(data,cfg.period||3);const latest=ms.slice(-6);for(const x of latest){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.type.includes('H')?'#ef4444':'#22c55e'),lineWidth:1,priceLineVisible:true,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Fair Value Gaps'){const zones=fairValueGaps(data);for(const z of zones.slice(-8)){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#22c55e66':'#ef444466'),lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(s);}}continue;}
     if(cfg.kind==='Dynamic Support/Resistance'){const levels=dynamicSupportResistance(data,cfg.period||5).slice(-10);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#22c55e':'#ef4444'),lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Liquidity Sweeps'){const sweeps=liquiditySweeps(data,cfg.period||5).slice(-12);for(const x of sweeps){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='sell-side'?'#22c55e':'#f59e0b'),lineWidth:2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Order Blocks'){const zones=orderBlocks(data,cfg.period||5).slice(-8);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const z of zones){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#38bdf8':'#fb7185'),lineWidth:1,lineStyle:1,priceLineVisible:false,lastValueVisible:false});s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(s);}}continue;}
     if(cfg.kind==='CPR' || cfg.kind==='Key Levels' || cfg.kind==='Opening Range' || cfg.kind==='Weekly Levels' || cfg.kind==='Swing Levels' || cfg.kind==='Gap Levels'){
       const levels=cfg.kind==='CPR'?cpr(data):cfg.kind==='Key Levels'?indianKeyLevels(data):cfg.kind==='Opening Range'?openingRange(data,cfg.period||15):cfg.kind==='Swing Levels'?swingLevels(data,cfg.period||3):gapLevels(data);
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#22c55e':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label.includes('CPR')?2:1,lineStyle: x.label.includes('GAP')?1:2,priceLineVisible:false,lastValueVisible:true});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}
       continue;
     }
     if(['Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range Pro','Developing Day High/Low','Equal Highs/Lows','Liquidity Pools','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots'].includes(cfg.kind)){
       let levels:any[]=[];
       if(cfg.kind==='Previous Day Levels') levels=previousDayLevels(data);
       else if(cfg.kind==='Previous Week Levels') levels=previousPeriodLevels(data,'week');
       else if(cfg.kind==='Previous Month Levels') levels=previousPeriodLevels(data,'month');
       else if(cfg.kind==='Opening Range Pro') levels=openingRange(data,cfg.period||30);
       else if(cfg.kind==='Developing Day High/Low') levels=developingDayLevels(data);
       else if(cfg.kind==='Equal Highs/Lows') levels=equalHighLow(data,cfg.period||3);
       else if(cfg.kind==='Liquidity Pools') levels=liquidityPools(data,cfg.period||5);
       else if(cfg.kind==='CPR R1-R5 / S1-S5') levels=extendedCpr(data);
       else if(cfg.kind==='Camarilla Pivots') { const x=periodPivots(data,'week','classic'); levels=x.map((v:any)=>({...v,label:`CAM ${v.label}`})); }
       else if(cfg.kind==='Fibonacci Pivots') levels=periodPivots(data,'week','fib');
       else if(cfg.kind==='Weekly Pivots') levels=periodPivots(data,'week','classic');
       else if(cfg.kind==='Monthly Pivots') levels=periodPivots(data,'month','classic');
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of levels){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#22c55e':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label==='P'||x.label==='TC'||x.label==='BC'?2:1,lineStyle:2,priceLineVisible:false,lastValueVisible:true});ss.setData([{time:(x.time||start) as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(ss);} continue;
     }
     if(cfg.kind==='Gap Zones'){
       const zones=gapZones(data); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones){for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#22c55e99':'#ef444499',lineWidth:2,lineStyle:1,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(ss);}}
       continue;
     }
     if(['BOS / CHOCH','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'].includes(cfg.kind)){
       const ev=priceActionEvents(data); const structure=cfg.kind==='BOS / CHOCH'?bosChoch(data,cfg.period||3):[]; let all:any[]=cfg.kind==='BOS / CHOCH'?structure:ev.filter(x=>{if(cfg.kind==='Rejection Candles')return x.label.startsWith('REJECTION');if(cfg.kind==='Inside Bar Breakout')return x.label.startsWith('INSIDE');if(cfg.kind==='Engulfing Patterns')return x.label.startsWith('ENGULF');if(cfg.kind==='Pin Bars')return x.label.startsWith('PIN');return false;});
       if(cfg.kind==='NR7 Volatility Contraction') all=nr7(data);
       if(cfg.kind==='Breakout / Retest' || cfg.kind==='Failed Breakout'){const sw=dynamicSupportResistance(data,cfg.period||5);for(let i=1;i<data.length;i++){const prev=data[i-1],cur=data[i],t=Math.floor(new Date(cur.timestamp).getTime()/1000);for(const lv of sw.slice(-12)){if(prev.close<=lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'BREAK ↑',side:'bullish'});if(prev.close>=lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'BREAK ↓',side:'bearish'});if(cfg.kind==='Failed Breakout'){if(prev.high>lv.price&&prev.close<lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'FAILED ↓',side:'bearish'});if(prev.low<lv.price&&prev.close>lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'FAILED ↑',side:'bullish'});}}}}
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of all.slice(-30)){ chartMarkers.push({time:x.time as Time,position:x.side==='bullish'?'belowBar':'aboveBar',color:cfg.color||(x.side==='bullish'?'#22c55e':'#ef4444'),shape:x.side==='bullish'?'arrowUp':'arrowDown',text:x.label}); }
       continue;
     }
     if(cfg.kind==='FVG + Mitigation' || cfg.kind==='Order Blocks + Mitigation'){
       const zones=cfg.kind==='FVG + Mitigation'?fairValueGaps(data):orderBlocks(data,cfg.period||5); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones.slice(-10)){let mitigated=false;const zi=data.findIndex(x=>Math.floor(new Date(x.timestamp).getTime()/1000)===z.time);for(let i=Math.max(0,zi);i<data.length;i++){if(data[i].low<=z.upper&&data[i].high>=z.lower){mitigated=true;break;}}const alpha=mitigated?'44':'99';for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||`#94a3b8${alpha}`,lineWidth:mitigated?1:2,lineStyle:mitigated?2:0,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(ss);}} continue;
     }
     if(cfg.kind==='VWAP Deviation Bands'){
       const bands=vwapDeviationBands(data,cfg.multiplier||1,cfg.source||'hlc3');for(const key of ['middle','upper','lower'] as const){const ss=line(chart.current,key==='middle'?(cfg.color||'#c084fc'):(key==='upper'?(cfg.upperColor||cfg.color||'#a78bfa'):(cfg.lowerColor||cfg.color||'#a78bfa')),key==='middle'?(cfg.lineWidth||2):Math.max(1,(cfg.lineWidth||2)-1),cfg.lineStyle||0);ss.setData(bands.map(x=>({time:x.time as Time,value:x[key]})) as any);indicatorSeries.current.push(ss);}continue;
     }
     if(cfg.kind==='Anchored VWAP'){const ss=line(chart.current,cfg.color||'#f97316',cfg.lineWidth||2,cfg.lineStyle||0);ss.setData(anchoredVwap(data,cfg.period||5,cfg.source||'hlc3') as any);indicatorSeries.current.push(ss);continue;}
     if(['Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff'].includes(cfg.kind)){
       const result=advancedTradingViewIndicator(data,cfg.kind,cfg);
       const lineColors=[cfg.color||'#38bdf8',cfg.upperColor||'#a78bfa',cfg.lowerColor||'#f59e0b','#22c55e','#e879f9'];
       Object.entries(result.lines).forEach(([name,pts],idx)=>{
         const ss=line(chart.current,lineColors[idx%lineColors.length],cfg.lineWidth||2,cfg.lineStyle||0);
         ss.applyOptions({title:`${cfg.kind} · ${name}`}); ss.setData(pts.map(x=>({time:x.time as Time,value:x.value})) as any); indicatorSeries.current.push(ss);
       });
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of result.zones.slice(-20)){
         const col=z.side==='bull'?'#22c55e':z.side==='bear'?'#ef4444':'#60a5fa';
         const outline=[{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower}];
         const ss=line(chart.current,`${col}99`,1,1); ss.setData(outline as any); indicatorSeries.current.push(ss);
       }
       for(const m of result.markers.slice(-40)){
         chartMarkers.push({time:m.time as Time,position:m.side==='bull'?'belowBar':'aboveBar',color:m.side==='bull'?'#22c55e':m.side==='bear'?'#ef4444':'#f59e0b',shape:m.side==='bull'?'arrowUp':m.side==='bear'?'arrowDown':'circle',text:`${cfg.kind} · ${m.label}`});
       }
       continue;
     }
     if(cfg.kind==='TradingCore V Price Action'){
       const result=tradingCoreVPriceAction(data,cfg.period||5,cfg.multiplier||2,cfg.lookback||200);
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of result.levels.slice(0,12)){
         const col=x.side==='support'?'#22c55e':x.side==='resistance'?'#ef4444':'#60a5fa';
         const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:x.score>=.8?2:1,lineStyle:x.score>=.8?0:2,priceLineVisible:false,lastValueVisible:true,title:`${x.label} · ${Math.round(x.score*100)}%`});
         ss.setData([{time:start,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(ss);
       }
       for(const z of result.zones){
         const col=z.kind==='Demand'?'#22c55e':'#ef4444';
         const st=Math.max(Number(z.startTime),Number(start));
         const outline=[{time:st as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:st as Time,value:z.upper},{time:st as Time,value:z.lower}];
         const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:z.score>=.8?2:1,lineStyle:z.mitigated?2:1,priceLineVisible:false,lastValueVisible:false,title:`${z.kind} · ${Math.round(z.score*100)}%`});
         ss.setData(outline as any);indicatorSeries.current.push(ss);
       }
       continue;
     }
     if(cfg.kind==='Pivot Points'){const pv=classicPivots(data).length?classicPivots(data):pivots(data),start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of pv){const s=chart.current.addSeries(LineSeries,{color:cfg.color||'#f59e0b',lineWidth:cfg.lineWidth||1,lineStyle:cfg.lineStyle??2,priceLineVisible:true,lastValueVisible:true});s.setData([{time:start,value:x.value},{time:end,value:x.value}] as any);indicatorSeries.current.push(s);}continue;}
   }
   setChartMarkers(chartMarkers);
 };
 const renderOI=(oi:OIChartAnalytics|null)=>{
   oiLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}}); oiLines.current=[];
   if(!showOI||!oi||!candle.current)return;
   const fmtOi=(n:number)=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:Math.round(n).toString();
   for(const level of oi.levels.slice(0,6)){
     const color=level.side==='resistance'?'#ef4444':'#22c55e';
     const faded=level.state==='MITIGATED';
     oiLines.current.push(candle.current.createPriceLine({
       price:level.strike, color:faded?`${color}44`:color, lineWidth:faded?1:level.width, lineStyle:faded?2:level.state==='TESTING'?1:0,
       axisLabelVisible:true,lastValueVisible:true,
       title:`${level.label} · ${fmtOi(level.oi)} · Δ ${level.deltaOi>=0?'+':''}${fmtOi(Math.abs(level.deltaOi))}${level.distanceStrikes?` · ${level.distanceStrikes} str`:''}`,
     }));
   }
   if(oi.maxPain)oiLines.current.push(candle.current.createPriceLine({price:oi.maxPain,color:'#f59e0b',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'MAX PAIN'}));
   if(oi.flip)oiLines.current.push(candle.current.createPriceLine({price:oi.flip.strike,color:'#a78bfa',lineWidth:2,lineStyle:1,axisLabelVisible:true,title:`OI FLIP · ${oi.flip.direction==='PUT_DOMINANT'?'PUT':'CALL'}`}));
 };
 const refreshOI=async()=>{
   try{
     const chain=await tradingCoreRuntime.getOptionChain(resolvedInstrumentKey);
     const currentSpot=tick?.ltp||chain.spot||candles.current[candles.current.length-1]?.close||0;
     const signature=(chain.contracts||[]).map((c:any)=>`${c.strike}:${c.call?.oi||0}:${c.call?.previousOi||0}:${c.put?.oi||0}:${c.put?.previousOi||0}`).join('|');
     if(oiChainRef.current?.signature===signature&&oiAnalytics.current){
       const spotOnly={...oiAnalytics.current,spot:Number(currentSpot)||oiAnalytics.current.spot,updatedAt:new Date().toISOString()};
       oiAnalytics.current=spotOnly; renderOI(spotOnly); return;
     }
     oiChainRef.current={signature,chain};
     const oi=buildOIChartAnalytics(chain,currentSpot,analytics.current?.atr||0);
     oiAnalytics.current=oi; renderOI(oi); window.dispatchEvent(new CustomEvent('tradingcore:oi-analytics',{detail:oi}));
   }catch{ /* OI is optional; price chart remains live if the broker has no chain. */ }
 };
 const renderDrawings=()=>{
   if(!chart.current)return;
   drawingSeries.current.forEach(s=>{try{chart.current?.removeSeries(s)}catch{}}); drawingSeries.current=[];
   const data=candles.current; if(!data.length)return;
   const first=Math.floor(Date.parse(data[0].timestamp)/1000), last=Math.floor(Date.parse(data[data.length-1].timestamp)/1000);
   const lo=Math.min(...data.slice(-600).map(x=>x.low)), hi=Math.max(...data.slice(-600).map(x=>x.high));
   const add=(pts:DrawingPoint[],style:{color:string;lineWidth:number;lineStyle:0|1|2})=>{
     if(pts.length<2)return;
     const ss=chart.current!.addSeries(LineSeries,{color:style.color,lineWidth:style.lineWidth,lineStyle:style.lineStyle,priceLineVisible:false,lastValueVisible:false});
     ss.setData(pts.map(p=>({time:p.time as Time,value:p.price})) as any); drawingSeries.current.push(ss);
   };
   const color='#60a5fa', accent='#f59e0b';
   const extend=(a:DrawingPoint,b:DrawingPoint,to:number):DrawingPoint[]=>{
     const dt=b.time-a.time; if(!dt)return[{time:a.time,price:a.price},{time:to,price:b.price}];
     const slope=(b.price-a.price)/dt; return[{time:a.time,price:a.price},{time:to,price:a.price+slope*(to-a.time)}];
   };
   const arrow=(a:DrawingPoint,b:DrawingPoint)=>{
     add([a,b],{color:color,lineWidth:2,lineStyle:0});
     const ang=Math.atan2(b.price-a.price,b.time-a.time), len=Math.max(Math.abs(b.price-a.price)*.08,(hi-lo)*.018);
     const p1={time:b.time-Math.cos(ang-.55)*Math.max(1,(b.time-a.time)*.025),price:b.price-Math.sin(ang-.55)*len};
     const p2={time:b.time-Math.cos(ang+.55)*Math.max(1,(b.time-a.time)*.025),price:b.price-Math.sin(ang+.55)*len};
     add([p1,b,p2],{color:color,lineWidth:2,lineStyle:0});
   };
   const ellipse=(a:DrawingPoint,b:DrawingPoint)=>{
     const pts:DrawingPoint[]=[]; const cx=(a.time+b.time)/2,cy=(a.price+b.price)/2,rx=Math.abs(b.time-a.time)/2,ry=Math.abs(b.price-a.price)/2;
     for(let i=0;i<=48;i++){const t=2*Math.PI*i/48;pts.push({time:cx+rx*Math.cos(t),price:cy+ry*Math.sin(t)})} add(pts,{color:color,lineWidth:2,lineStyle:0});
   };
   const fib=(a:DrawingPoint,b:DrawingPoint,extension=false)=>{
     const diff=b.price-a.price, levels=extension?[0,0.382,0.618,1,1.272,1.618,2.618]:[0,0.236,0.382,0.5,0.618,0.786,1];
     levels.forEach((r,i)=>add([{time:Math.min(first,a.time),price:a.price+diff*r},{time:Math.max(last,b.time),price:a.price+diff*r}],{color:i===0||i===levels.length-1?accent:color,lineWidth:i===3?2:1,lineStyle:i===3?0:2}));
   };
   for(const d of drawings.current){
     const p=d.points; const selected=d.id===selectedDrawingId; const drawColor=selected?'#ffffff':color; const drawAccent=selected?'#ffffff':accent;
     if(d.kind==='horizontal')add([{time:first,price:p[0].price},{time:last,price:p[0].price}],{color:accent,lineWidth:2,lineStyle:0});
     else if(d.kind==='horizontalRay')add([{time:p[0].time,price:p[0].price},{time:last,price:p[0].price}],{color:accent,lineWidth:2,lineStyle:0});
     else if(d.kind==='vertical')add([{time:p[0].time,price:lo},{time:p[0].time,price:hi}],{color:'#a78bfa',lineWidth:1,lineStyle:2});
     else if(d.kind==='trendline')add(p,{color:drawColor,lineWidth:2,lineStyle:0});
     else if(d.kind==='ray'&&p.length>=2)add(extend(p[0],p[1],last),{color:drawColor,lineWidth:2,lineStyle:0});
     else if(d.kind==='extendedLine'&&p.length>=2){add(extend(p[0],p[1],first),{color:drawColor,lineWidth:2,lineStyle:0});}
     else if(d.kind==='rectangle'&&p.length>=2){const [a,b]=p;add([{time:a.time,price:a.price},{time:b.time,price:a.price},{time:b.time,price:b.price},{time:a.time,price:b.price},{time:a.time,price:a.price}],{color:drawColor,lineWidth:2,lineStyle:0});}
     else if(d.kind==='ellipse'&&p.length>=2)ellipse(p[0],p[1]);
     else if(d.kind==='fib'&&p.length>=2)fib(p[0],p[1],false);
     else if(d.kind==='fibExtension'&&p.length>=3){const [a,b,c]=p;const base=b.price-a.price;fib({time:a.time,price:c.price},{time:b.time,price:c.price+base},true);}
     else if(d.kind==='parallelChannel'&&p.length>=3){const [a,b,c]=p;const dt=b.time-a.time||1, slope=(b.price-a.price)/dt, delta=c.price-(a.price+slope*(c.time-a.time));const e1=extend(a,b,last),e2=extend({time:a.time,price:a.price+delta},{time:b.time,price:b.price+delta},last);add(e1,{color:drawColor,lineWidth:2,lineStyle:0});add(e2,{color:drawColor,lineWidth:2,lineStyle:0});add([{time:a.time,price:a.price},{time:a.time,price:a.price+delta}],{color:drawColor,lineWidth:1,lineStyle:2});}
     else if(d.kind==='pitchfork'&&p.length>=3){const [a,b,c]=p;const m={time:(b.time+c.time)/2,price:(b.price+c.price)/2};add([a,m],{color:drawColor,lineWidth:2,lineStyle:0});add(extend(a,m,first),{color:drawColor,lineWidth:1,lineStyle:2});add(extend(a,m,last),{color:drawColor,lineWidth:1,lineStyle:2});add([b,c],{color:drawColor,lineWidth:1,lineStyle:2});}
     else if(d.kind==='arrow'&&p.length>=2)arrow(p[0],p[1]);
     else if(d.kind==='priceRange'&&p.length>=2){const [a,b]=p;add([{time:a.time,price:a.price},{time:b.time,price:a.price},{time:b.time,price:b.price}],{color:'#22c55e',lineWidth:2,lineStyle:0});}
     else if(d.kind==='dateRange'&&p.length>=2){const y=(lo+hi)/2;add([{time:p[0].time,price:y},{time:p[1].time,price:y}],{color:'#a78bfa',lineWidth:2,lineStyle:2});}
     else if((d.kind==='brush'||d.kind==='highlighter')&&p.length>=2)add(p,{color:d.kind==='brush'?'#f97316':'#facc15',lineWidth:d.kind==='brush'?3:6,lineStyle:0});
     else if(d.kind==='longPosition'&&p.length>=2){const [a,b]=p, risk=Math.abs(a.price-b.price);add([{time:a.time,price:a.price},{time:last,price:a.price}],{color:'#38bdf8',lineWidth:2,lineStyle:0});add([{time:a.time,price:a.price+risk*2},{time:last,price:a.price+risk*2}],{color:'#22c55e',lineWidth:1,lineStyle:2});add([{time:a.time,price:a.price-risk},{time:last,price:a.price-risk}],{color:'#ef4444',lineWidth:1,lineStyle:2});}
     else if(d.kind==='shortPosition'&&p.length>=2){const [a,b]=p, risk=Math.abs(a.price-b.price);add([{time:a.time,price:a.price},{time:last,price:a.price}],{color:'#38bdf8',lineWidth:2,lineStyle:0});add([{time:a.time,price:a.price-risk*2},{time:last,price:a.price-risk*2}],{color:'#22c55e',lineWidth:1,lineStyle:2});add([{time:a.time,price:a.price+risk},{time:last,price:a.price+risk}],{color:'#ef4444',lineWidth:1,lineStyle:2});}
     else if(d.kind==='measure'&&p.length>=2){const [a,b]=p;add([a,b],{color:'#f59e0b',lineWidth:2,lineStyle:2});}
     else if(d.kind==='text'&&p.length>=1){add([{time:p[0].time,price:p[0].price},{time:Math.min(last,p[0].time+Math.max(1,(last-first)*.02)),price:p[0].price}],{color:'#e5e7eb',lineWidth:2,lineStyle:0});}
   }
 };
 const commitDrawing=(tool:DrawingTool,points:DrawingPoint[],label?:string)=>{
   if(tool==='none'||tool==='crosshair'||!points.length)return;
   const definition=getCoreDrawingTool(tool as any);
   if(!definition||!validateDrawingPoints(tool as any,points))return;
   const drawing={
   id:`draw-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
   kind:tool as Exclude<DrawingTool,'none'>,
   points:[...points],
   owner:'user',
   coordinateSpace:'data',
   lifecycle:'active',
   ...(label?{label}:{}),
   createdAt:Date.now(),
   updatedAt:Date.now()
 } as Drawing;
   const stored=drawingStore.current.add(drawing); if(!stored)return;
   drawings.current=drawingStore.current.list() as Drawing[];
   publishDrawing('drawing.created',stored);
   drawingPoints.current=[];setDrawingTool('none');drawingToolRef.current='none';
   saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings();
 };
 const clearDrawings=()=>{const count=drawingStore.current.clear('user');drawings.current=drawingStore.current.list() as Drawing[];drawingPoints.current=[];saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});if(count)coreEventBus.emit('drawing.cleared',{timestamp:Date.now(),owner:'user'});renderDrawings();};
 const selectDrawingTool=(tool:DrawingTool)=>{setDrawingTool(tool);drawingToolRef.current=tool;drawingPoints.current=[];setShowDrawingMenu(false);};
 const renderPredictionOverlay=async(data:HistoricalCandle[])=>{
   if(!chart.current)return;
   const job=++predictionJob.current;
   // Clear means genuinely clear: never inject default models after the user
   // explicitly selected zero models. This also prevents stale series from
   // surviving an async production-model response.
   predictionLines.current.forEach(x=>{try{chart.current?.removeSeries(x)}catch{}});
   predictionLines.current=[];
   if(data.length<30 || predictionModelIds.length===0)return;
   const ids=predictionModelIds.slice(0,39);
   const last=data[data.length-1], lastTime=Math.floor(Date.parse(last.timestamp)/1000); const sec=seconds[timeframe]||300;
   const palette=['#38bdf8','#a78bfa','#f59e0b','#22c55e','#ef4444','#ec4899','#14b8a6','#f97316','#8b5cf6','#84cc16','#06b6d4','#e879f9','#fb7185','#2dd4bf','#60a5fa','#c084fc','#fbbf24','#4ade80','#f472b6','#67e8f9','#fdba74','#a3e635','#818cf8','#f0abfc','#34d399','#f87171','#93c5fd','#d8b4fe'];
   const styles=[0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0];
   const localId=(id:string)=>id==='production-xgboost-direction'?'xgb-direction':id==='production-lstm-sequence'?'lstm-sequence':id==='production-transformer'?'transformer-attention':id;
   const localFallback:Record<string,any>={};
   for(const id of ids){try{const v=predictWithModel(data,resolvedInstrumentKey,timeframe,localId(id));if(v)localFallback[id]=v;}catch{}}
   const plot=(production:Record<string,any>|null)=>{
     if(!chart.current||job!==predictionJob.current)return 0;
     predictionLines.current.forEach(x=>{try{chart.current?.removeSeries(x)}catch{}}); predictionLines.current=[];
     let plotted=0;
     for(const [idx,id] of ids.entries()){
       const model=PREDICTION_MODELS.find(m=>m.id===id); if(!model)continue;
       const remote=production?.[id] || (id==='production-xgboost-direction'?production?.xgboost:null) || (id==='production-lstm-sequence'?production?.lstm:null) || (id==='production-transformer'?production?.transformer:null);
       const source:any=remote&&remote.trained!==false&&remote.status!=='unavailable'?remote:localFallback[id];
       if(!source)continue;
       const predictedPrice=Number(source?.predicted_price ?? source?.predictedPrice ?? last.close);
       const expectedMove=Math.max(0,Number(source?.expected_move ?? source?.expectedMove ?? Math.abs(predictedPrice-last.close)));
       if(!Number.isFinite(predictedPrice)||!Number.isFinite(expectedMove))continue;
       const sign=predictedPrice>=last.close?1:-1; const totalMove=predictedPrice-last.close; const alg=model.algorithm;
       const shape = alg==='arima' ? [0,.18,.38,.57,.78,1] : alg==='sarima' ? [0,.12,.48,.30,.72,1] : alg==='ets' ? [0,.28,.50,.68,.84,1] : alg==='prophet' ? [0,.16,.36,.60,.82,1] : alg==='knn' ? [0,.34,.12,.55,.76,1] : alg==='svr' ? [0,.10,.27,.49,.72,1] : alg==='lstm'||alg==='bilstm'||alg==='lstm_gru' ? [0,.06,.20,.43,.70,1] : alg==='cnn_lstm' ? [0,.22,.08,.39,.67,1] : alg==='transformer'||alg==='tft' ? [0,.30,.18,.56,.78,1] : alg==='garch' ? [0,.18,.40,.62,.82,1] : alg==='sentiment_hybrid' ? [0,.14,.42,.66,.88,1] : alg==='conformal_ensemble'||alg==='quantile_forest' ? [0,.20,.40,.60,.80,1] : [0,.20,.40,.60,.80,1];
       const points=shape.map((q,j)=>({time:(lastTime+sec*j) as Time,value:last.close+totalMove*q+(j>0&&j<shape.length-1?sign*expectedMove*(0.035*Math.sin(j*1.7+idx)):0)}));
       const lineColor=palette[idx%palette.length];
       const mid=chart.current.addSeries(LineSeries,{color:lineColor,lineWidth:id==='ensemble-voting'?3:2,lineStyle:styles[idx%styles.length] as 0|1|2,priceLineVisible:false,lastValueVisible:true,title:`${model.name}${source?.model_version?` · v${source.model_version}`:''}`});
       mid.setData(points as any); predictionLines.current.push(mid);
       const upperBoundRaw=Number(source?.upper_bound ?? source?.upperBound ?? (last.close+expectedMove)); const lowerBoundRaw=Number(source?.lower_bound ?? source?.lowerBound ?? (last.close-expectedMove));
       const upperBound=Number.isFinite(upperBoundRaw)?upperBoundRaw:last.close+expectedMove; const lowerBound=Number.isFinite(lowerBoundRaw)?lowerBoundRaw:last.close-expectedMove;
       const upperPoints=points.map((pt,j)=>({time:pt.time,value:pt.value+(upperBound-last.close)*(j/Math.max(1,shape.length-1))}));
       const lowerPoints=points.map((pt,j)=>({time:pt.time,value:pt.value+(lowerBound-last.close)*(j/Math.max(1,shape.length-1))}));
       const upper=chart.current.addSeries(LineSeries,{color:lineColor+'66',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false}); upper.setData(upperPoints as any); predictionLines.current.push(upper);
       const lower=chart.current.addSeries(LineSeries,{color:lineColor+'66',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false}); lower.setData(lowerPoints as any); predictionLines.current.push(lower);
       plotted++;
     }
     if(plotted&&chart.current){try{chart.current.timeScale().setVisibleRange({from:Math.max(0,lastTime-sec*80) as any,to:(lastTime+sec*6) as any});}catch{}}
     return plotted;
   };
   // Render native fallbacks immediately; the hosted ML service can replace them
   // when a trained artifact is available, without leaving the chart blank.
   plot(null);
   try{
     const production=await fetchProductionPredictions(data,resolvedInstrumentKey,timeframe,ids);
     if(production&&job===predictionJob.current)plot(production);
   }catch{}
 }; const publish=(data:HistoricalCandle[],spot:number,immediate=false)=>{
   const run=()=>{
     analyticsTimer.current=null;
     const worker=analyticsWorker.current;
     if(worker){const id=++analyticsJob.current;worker.postMessage({id,candles:data,spot});}
     else {const a=buildChartAnalytics(data,spot);analytics.current=a;onAnalytics?.(a);window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:a}));}
   };
   if(immediate){if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}run();return;}
   if(analyticsTimer.current)return;
   analyticsTimer.current=setTimeout(run,200);
 };
 useEffect(()=>{if(candles.current.length&&chart.current)renderDrawings();},[selectedDrawingId]);
 useEffect(()=>{if(!host.current)return;const generation=lifecycle.current.begin();let dead=false;setError('');const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#0b0e15'},textColor:'#8c93a6',fontFamily:'JetBrains Mono, monospace',fontSize:10},grid:{vertLines:{color:'#171b27'},horzLines:{color:'#171b27'}},crosshair:{mode:crosshairVisible?0:2},rightPriceScale:{borderColor:'#252b3a',scaleMargins:{top:.08,bottom:.2}},timeScale:{borderColor:'#252b3a',timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:3},watermark:{visible:true,fontSize:28,horzAlign:'center',vertAlign:'center',color:'#ffffff08',text:'TRADINGCORE'}});chart.current=c;candle.current=c.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#ef4444',borderUpColor:'#10b981',borderDownColor:'#ef4444',wickUpColor:'#10b981',wickDownColor:'#ef4444'});closeLine.current=c.addSeries(LineSeries,{color:'#38bdf8',lineWidth:2,priceLineVisible:false,lastValueVisible:true,visible:chartType==='line'});volume.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});volume.current.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
 const coordinateAdapter=()=>({
   timeToX:(time:number)=>Number((c.timeScale() as any).timeToCoordinate?.(time as any)),
   priceToY:(price:number)=>Number((candle.current as any)?.priceToCoordinate?.(price)),
   xToTime:(x:number)=>{const v=(c.timeScale() as any).coordinateToTime?.(x);return v==null?null:Number(v);},
   yToPrice:(y:number)=>{const v=(candle.current as any)?.coordinateToPrice?.(y);return v==null?null:Number(v);},
 });
 const onPointerDown=(event:PointerEvent)=>{
   if(drawingToolRef.current!=='none'||!candle.current)return;
   const rect=host.current?.getBoundingClientRect(); if(!rect)return;
   const cursor={x:event.clientX-rect.left,y:event.clientY-rect.top};
   const hit=hitTestDrawings(drawings.current,cursor,coordinateAdapter(),9);
   setSelectedDrawingId(hit?.drawingId||null);
   if(hit?.handle){drawingDrag.current={id:hit.drawingId,index:hit.handle.index};host.current?.setPointerCapture?.(event.pointerId);event.preventDefault();}
 };
 const onPointerMove=(event:PointerEvent)=>{
   const drag=drawingDrag.current; if(!drag)return;
   const rect=host.current?.getBoundingClientRect(); if(!rect)return;
   const moved=moveDrawingHandle(drawingStore.current.get(drag.id)!,drag.index,{x:event.clientX-rect.left,y:event.clientY-rect.top},coordinateAdapter());
   if(moved){drawingStore.current.update(drag.id,moved);drawings.current=drawingStore.current.list() as Drawing[];renderDrawings();}
 };
 const onPointerUp=()=>{if(!drawingDrag.current)return;drawingDrag.current=null;saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});};
 host.current?.addEventListener('pointerdown',onPointerDown); host.current?.addEventListener('pointermove',onPointerMove); host.current?.addEventListener('pointerup',onPointerUp); host.current?.addEventListener('pointercancel',onPointerUp);
 const onChartClick=(param:any)=>{
   const tool=drawingToolRef.current;
   if(tool==='none'||tool==='crosshair'||!param?.point||!candle.current)return;
   const rawTime=(c.timeScale() as any).coordinateToTime?.(param.point.x);
   const rawPrice=(candle.current as any).coordinateToPrice?.(param.point.y);
   if(rawTime==null||rawPrice==null||!Number.isFinite(Number(rawPrice)))return;
   const rawPoint={time:Number(rawTime),price:Number(rawPrice)};
   const snapCandidates=candles.current.slice(-250).flatMap((b:any)=>{const t=Math.floor(Date.parse(b.timestamp)/1000);return [{time:t,price:Number(b.open),kind:'ohlc' as const},{time:t,price:Number(b.high),kind:'ohlc' as const},{time:t,price:Number(b.low),kind:'ohlc' as const},{time:t,price:Number(b.close),kind:'ohlc' as const}].filter(x=>Number.isFinite(x.price));});
   const point=snapDataPoint(rawPoint,snapCandidates,coordinateAdapter(),10);
   if(['horizontal','horizontalRay','vertical'].includes(tool)){commitDrawing(tool,[point]);return;}
   if(tool==='text'){const label=window.prompt('Chart text','Text')||'';if(label)commitDrawing(tool,[point],label);return;}
   drawingPoints.current=[...drawingPoints.current,point];
   const needed=['parallelChannel','pitchfork','fibExtension'].includes(tool)?3:2;
   if(drawingPoints.current.length>=needed)commitDrawing(tool,drawingPoints.current);
 }; c.subscribeClick(onChartClick);
 const resizeObserver=typeof ResizeObserver!=='undefined'&&host.current?new ResizeObserver(()=>{if(!dead&&lifecycle.current.isCurrent(generation)){try{const r=host.current!.getBoundingClientRect();if(r.width>0&&r.height>0)c.resize(Math.floor(r.width),Math.floor(r.height));}catch{}}}):undefined;
 resizeObserver?.observe(host.current);
 let historyReady=false;
 let historyRequestInFlight=false;
 let previousLogicalRange:any=null;
 let ignoreRangeEvents=0;
 const normalizeHistory=(rows:HistoricalCandle[])=>{
   const byTime=new Map<number,HistoricalCandle>();
   for(const row of rows||[]){
     const raw=Date.parse(String(row.timestamp));
     const time=Math.floor(raw/1000);
     const values=[Number(row.open),Number(row.high),Number(row.low),Number(row.close)];
     if(!Number.isFinite(raw)||!Number.isFinite(time)||time<=0||values.some(v=>!Number.isFinite(v)))continue;
     byTime.set(time,{timestamp:new Date(time*1000).toISOString(),open:values[0],high:values[1],low:values[2],close:values[3],volume:Number.isFinite(Number(row.volume))?Number(row.volume):0});
   }
   return [...byTime.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 };
 const loadOlderHistory=async()=>{
   if(dead||historyRequestInFlight||!historyReady||candles.current.length>=MAX_HISTORY_CANDLES)return;
   const oldest=candles.current[0];
   if(!oldest?.timestamp)return;
   historyRequestInFlight=true;
   setHistoryLoading(true);
   publishChartLifecycle('updating');
   const visibleRange=c.timeScale().getVisibleRange?.() as any;
   try{
     const olderRaw=await tradingCoreRuntime.getHistoricalDataBefore(resolvedInstrumentKey,intervals[timeframe],oldest.timestamp,HISTORY_PAGE_CANDLES);
     if(dead||!lifecycle.current.isCurrent(generation))return;
     const older=normalizeHistory(olderRaw).filter(x=>Date.parse(x.timestamp)<Date.parse(oldest.timestamp));
     if(!older.length)return;
     const merged=normalizeHistory([...older,...candles.current]).slice(-MAX_HISTORY_CANDLES);
     candles.current=merged;
     calculationEngine.current.reset(merged,resolvedInstrumentKey,timeframe);
     candle.current?.setData(merged.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)})));
     closeLine.current?.setData(merged.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,value:Number(x.close)})) as any);
     volume.current?.setData(merged.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,value:Number(x.volume)||0,color:Number(x.close)>=Number(x.open)?'#10b98155':'#ef444455'})) as any);
     try{renderStudies(merged);requestIndicatorWorker(merged);}catch(indicatorError){console.warn('[TradingCore] Incremental history indicator update skipped:',indicatorError);}
     renderDrawings();
     publish(merged,tick?.ltp||merged[merged.length-1]?.close||0,true);
     void renderPredictionOverlay(merged);
     ignoreRangeEvents=3;
     if(visibleRange&&c.timeScale().setVisibleRange){try{c.timeScale().setVisibleRange(visibleRange);}catch{}}
   }catch(loadError){
     console.warn('[TradingCore] Older history page unavailable:',loadError);
   }finally{
     historyRequestInFlight=false;
     if(!dead){setHistoryLoading(false);publishChartLifecycle('ready');}
   }
 };
 const onVisibleLogicalRangeChange=(range:any)=>{
   if(!range)return;
   if(ignoreRangeEvents>0){ignoreRangeEvents-=1;previousLogicalRange=range;return;}
   const movingBackward=previousLogicalRange&&Number(range.from)<Number(previousLogicalRange.from)-2;
   previousLogicalRange=range;
   if(historyReady&&movingBackward&&Number(range.from)<=HISTORY_PREFETCH_THRESHOLD)void loadOlderHistory();
 };
 c.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
 tradingCoreRuntime.getHistoricalData(resolvedInstrumentKey,intervals[timeframe]).then(data=>{
   if(dead||!lifecycle.current.isCurrent(generation))return;
   if(!data.length)throw new Error('No historical candles available');
   const bySecond=new Map<number,HistoricalCandle>();
   for(const row of data){
     const raw=Date.parse(String(row.timestamp));
     const time=Math.floor(raw/1000);
     const values=[Number(row.open),Number(row.high),Number(row.low),Number(row.close)];
     if(!Number.isFinite(time)||time<=0||values.some(v=>!Number.isFinite(v)))continue;
     const [open,high,low,close]=values;
     const volume=Number(row.volume);
     bySecond.set(time,{timestamp:new Date(time*1000).toISOString(),open,high,low,close,volume:Number.isFinite(volume)?volume:0});
   }
   data=[...bySecond.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-MAX_HISTORY_CANDLES);
   if(!data.length)throw new Error(`${brokerId.toUpperCase()} returned no valid chart candles`);
   if(dead||!lifecycle.current.isCurrent(generation))return;
   candles.current=data;
   calculationEngine.current.reset(data, resolvedInstrumentKey, timeframe);
   if(!candle.current||!lifecycle.current.isCurrent(generation))return;
   candle.current!.setData(data.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)})));
   closeLine.current!.setData(data.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,value:Number(x.close)})) as any);
   volume.current!.setData(data.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,value:Number.isFinite(Number(x.volume))?Number(x.volume):0,color:Number(x.close)>=Number(x.open)?'#10b98155':'#ef444455'})) as any);
   try{renderStudies(data);requestIndicatorWorker(data);}catch(indicatorError:any){console.warn('[TradingCore] Indicator render skipped invalid values:',indicatorError);}renderDrawings();publish(data,tick?.ltp||data[data.length-1].close,true);publishChartLifecycle('ready');
   // TradingView-style first paint: keep the full history available for indicators
   // and left-edge pagination, but show a sensible recent window instead of fitting
   // 10,000 candles into the canvas. For intraday charts this is roughly three
   // NSE sessions; higher timeframes get a wider logical window.
   const initialVisibleBars:Record<string,number>={'1m':1125,'3m':375,'5m':225,'15m':75,'30m':45,'1H':36,'1D':30};
   const visibleBars=Math.min(data.length,initialVisibleBars[timeframe]||60);
   if(visibleBars>1){
     ignoreRangeEvents=3;
     try{c.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-visibleBars-0.5),to:data.length-0.5+8});}
     catch{try{c.timeScale().fitContent();}catch{}}
   }else{try{c.timeScale().fitContent();}catch{}}
   previousLogicalRange=c.timeScale().getVisibleLogicalRange?.()||null;historyReady=true;void renderPredictionOverlay(data); if(showOI&&oiAnalytics.current)renderOI(oiAnalytics.current);
 }).catch(e=>{
  if(dead||!lifecycle.current.isCurrent(generation))return;
  const live=Number(tick?.ltp);
  if(Number.isFinite(live)&&live>0&&candle.current){
    const now=Math.floor(Date.now()/1000);
    const sec=seconds[timeframe]||300;
    const bucket=Math.floor(now/sec)*sec;
    const seed=[{timestamp:new Date(bucket*1000).toISOString(),open:live,high:live,low:live,close:live,volume:Number(tick?.volume||0)}];
    candles.current=seed;
    calculationEngine.current.reset(seed,resolvedInstrumentKey,timeframe);
    candle.current.setData([{time:bucket as Time,open:live,high:live,low:live,close:live}]);
    closeLine.current?.setData([{time:bucket as Time,value:live}] as any);
    volume.current?.setData([{time:bucket as Time,value:Number(tick?.volume||0)}] as any);
    publishChartLifecycle('ready');
    setError('');
    console.warn('[TradingCore] Historical candles unavailable; chart seeded from live quote.',e);
  } else {
    setError(e?.message||'Historical candles unavailable');
    publishChartLifecycle('error');
  }
 });return()=>{dead=true;historyReady=false;historyRequestInFlight=false;setHistoryLoading(false);try{c.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}publishChartLifecycle('disposed');lifecycle.current.invalidate();analyticsJob.current++;indicatorJob.current++;if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}try{resizeObserver?.disconnect()}catch{} chartUpdateScheduler.current.cancel();try{c.unsubscribeClick(onChartClick)}catch{} try{host.current?.removeEventListener('pointerdown',onPointerDown);host.current?.removeEventListener('pointermove',onPointerMove);host.current?.removeEventListener('pointerup',onPointerUp);host.current?.removeEventListener('pointercancel',onPointerUp)}catch{} try{c.remove()}catch{}try{oscChart.current?.remove()}catch{}try{markerPlugin.current?.detach?.()}catch{}markerPlugin.current=null;workerSeriesMap.current.clear();predictionLines.current=[];predictionJob.current++;drawingSeries.current=[];drawingPoints.current=[];chart.current=undefined;oscChart.current=undefined;candle.current=undefined;closeLine.current=undefined;volume.current=undefined;indicatorSeries.current=[];oscSeries.current=[];markerPlugin.current=null}},[resolvedInstrumentKey,timeframe,brokerId]);
 useEffect(()=>{if(candles.current.length&&chart.current){try{renderStudies(candles.current);requestIndicatorWorker(candles.current);}catch(indicatorError){console.warn('[TradingCore] Indicator update skipped invalid values:',indicatorError);}void renderPredictionOverlay(candles.current);}},[indicators.map(x=>`${x.id}:${x.enabled}:${x.period}:${x.fast}:${x.slow}:${x.signal}:${x.multiplier}:${x.smooth}:${x.source}:${x.color}:${x.signalColor}:${x.upperColor}:${x.lowerColor}:${x.lineWidth}:${x.lineStyle}`).join('|'),predictionModelIds.join('|')]);
 useEffect(()=>{if(!tick?.ltp||!candle.current)return;const p=Number(tick.ltp),sec=seconds[timeframe]||300,rawTs=new Date(tick.lastTradeTimestamp||tick.receivedAt||Date.now()).getTime(),ts=Math.floor((Number.isFinite(rawTs)?rawTs:Date.now())/1000),bucket=Math.floor(ts/sec)*sec;let b=candles.current[candles.current.length-1];const lastBucket=b?Math.floor(Date.parse(b.timestamp)/1000/sec)*sec:undefined;if(lastBucket!=null&&bucket<lastBucket)return;const bucketChanged=!b||lastBucket!==bucket;if(bucketChanged){b={timestamp:new Date(bucket*1000).toISOString(),open:b?.close??p,high:p,low:p,close:p,volume:Number(tick.volume||0)};candles.current=[...candles.current,b]}else{b.high=Math.max(Number(b.high),p);b.low=Math.min(Number(b.low),p);b.close=p;if(tick.volume)b.volume=Number(tick.volume)};candle.current.update({time:bucket as Time,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)});volume.current?.update({time:bucket as Time,value:Number(b.volume)||0,color:Number(b.close)>=Number(b.open)?'#10b98155':'#ef444455'} as any);calculationEngine.current.updateTick(b, candles.current.length - 1, bucketChanged);
   if(bucketChanged){requestIndicatorWorker(candles.current);renderPredictionOverlay(candles.current);renderDrawings();}
   publish(candles.current,p);},[tick,timeframe]);
 useEffect(()=>{if(!candle.current||!showLevels||!analytics.current)return;const levels=[...analytics.current.support.slice(0,6),...analytics.current.resistance.slice(0,6)];const lines=levels.map(x=>{const broken=x.state==='BROKEN';const base=x.side==='support'?'#22c55e':'#ef4444';return candle.current!.createPriceLine({price:x.price,color:broken?'#64748b':base,lineWidth:broken?1:Math.max(1,Math.min(3,Math.round((x.strength||.5)*3))),lineStyle:broken?2:0,axisLabelVisible:true,title:`${broken?'BROKEN · ':''}${x.side==='support'?'S':'R'}${x.strength!=null?` · ${Math.round(x.strength*100)}%`:''}`});});return()=>lines.forEach(x=>candle.current?.removePriceLine(x));},[showLevels,tick?.ltp]);
 useEffect(()=>{renderOI(oiAnalytics.current);},[showOI]);
 useEffect(()=>{if(!showOI)return;let dead=false; void refreshOI(); const id=window.setInterval(()=>{if(!dead)void refreshOI();},15000); return()=>{dead=true;window.clearInterval(id);};},[resolvedInstrumentKey,showOI,brokerId]);
 useEffect(()=>{if(oiAnalytics.current&&tick?.ltp){const current=oiAnalytics.current; const spot=Number(tick.ltp); const tolerance=Math.max(analytics.current?.atr||0,1)*.18; const walls=current.walls.map(w=>({...w,state:w.side==='PUT'?(spot<w.strike-tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>w.strike+tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE')})); const levels=current.levels.map(l=>({...l,state:l.side==='support'?(spot<l.strike-tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>l.strike+tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE')})); const changed=walls.some((w,i)=>w.state!==current.walls[i]?.state)||levels.some((l,i)=>l.state!==current.levels[i]?.state); const refreshed={...current,spot,walls,levels}; oiAnalytics.current=refreshed; if(changed)renderOI(refreshed);}},[tick?.ltp]);
 useEffect(()=>{volume.current?.applyOptions({visible:showVolume});},[showVolume]);
 const addIndicatorFromChart=(kind:IndicatorConfig['kind'])=>{
   const lib=INDICATOR_LIBRARY.find(x=>x.kind===kind); if(!lib)return;
   const style=defaultIndicatorStyle(kind);const next=[...indicators,{id:`${kind.toLowerCase().replace(/\W/g,'-')}-${Date.now()}`,kind,enabled:true,...lib.defaults,source:kind==='VWAP'||kind==='CCI'||kind==='MFI'?'hlc3':'close',color:style.color,lineWidth:style.lineWidth,lineStyle:style.lineStyle}];
   setIndicators(next); saveIndicators(next); setShowIndicatorMenu(false);
 };
 const patchIndicator=(id:string, patch:Partial<IndicatorConfig>)=>{const next=indicators.map(x=>x.id===id?{...x,...patch}:x);setIndicators(next);saveIndicators(next);};
 const removeIndicator=(id:string)=>{const next=indicators.filter(x=>x.id!==id);setIndicators(next);saveIndicators(next);if(editingIndicator===id)setEditingIndicator(null);};
 const resetIndicator=(x:IndicatorConfig)=>{const lib=INDICATOR_LIBRARY.find(l=>l.kind===x.kind);const style=defaultIndicatorStyle(x.kind);patchIndicator(x.id,{...(lib?.defaults||{}),source:x.kind==='VWAP'||x.kind==='CCI'||x.kind==='MFI'?'hlc3':'close',color:style.color,lineWidth:style.lineWidth,lineStyle:style.lineStyle,signalColor:undefined,upperColor:undefined,lowerColor:undefined});};
 const supportsSource=(kind:IndicatorConfig['kind'])=>!['ATR','ADX','Supertrend','Ichimoku Cloud','Pivot Points','CPR','Key Levels','Opening Range','Weekly Levels','Swing Levels','Gap Levels','Market Structure','Fair Value Gaps','Dynamic Support/Resistance','Liquidity Sweeps','Order Blocks','Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range Pro','Gap Zones','Equal Highs/Lows','Liquidity Pools','BOS / CHOCH','FVG + Mitigation','Order Blocks + Mitigation','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction','Developing Day High/Low','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots','TradingCore V Price Action','Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff'].includes(kind);
 const automationSignals=automations.map(a=>({automation:a,signal:markerForAutomation(a,candles.current)})).filter(x=>x.signal) as any[]; const automationLines=useRef<any[]>([]);
 useEffect(()=>{if(!candle.current)return;automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[];automationSignals.forEach(({automation,signal}:any)=>{const line=candle.current!.createPriceLine({price:candles.current[candles.current.length-1]?.close||0,color:signal.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:`AUTO · ${automation.name}`});automationLines.current.push(line);});return()=>{automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[]}},[automations,tick?.ltp]);
 return <div className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-1.5 border-b border-[#222636] pb-2 mb-2"><span className="text-[9px] uppercase tracking-widest text-[#64748b] mr-1">Chart</span>{Object.keys(intervals).map(v=><button key={v} onClick={()=>setTimeframe(v)} className={`px-2 py-1 rounded border text-[10px] font-mono ${timeframe===v?'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]':'border-[#222636] text-[#8c93a6]'}`}>{v}</button>)}<span className="mx-1 h-4 w-px bg-[#222636]"/><div className="relative"><button onClick={()=>{setShowIndicatorMenu(x=>!x);setEditingIndicator(null)}} className="toolbar-pill">Indicators {indicators.filter(x=>x.enabled).length}</button>{showIndicatorMenu&&<div className="absolute left-0 top-8 z-50 w-[360px] max-w-[calc(100vw-24px)] max-h-[560px] overflow-y-auto rounded-xl border border-[#2a3040] bg-[#0b0e15] p-2 shadow-2xl"><div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[#64748b]">Chart indicators · TradingView-style settings</div><div className="mb-2 space-y-1.5">{indicators.filter(x=>x.enabled).map(x=>{const lib=INDICATOR_LIBRARY.find(l=>l.kind===x.kind);const edit=editingIndicator===x.id;return <div key={x.id} className="rounded-lg border border-[#222636] bg-[#090c12]"><div className="flex items-center gap-2 px-2 py-2"><button onClick={()=>patchIndicator(x.id,{enabled:false})} className="text-[#10b981]" title="Hide"><Eye className="h-3.5 w-3.5"/></button><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold text-[#e5e7eb]">{x.kind}</div><div className="text-[8px] text-[#64748b]">{lib?.overlay?'Overlay':'Pane'} · {x.source||'close'} · {x.lineWidth||2}px</div></div><button onClick={()=>setEditingIndicator(edit?null:x.id)} className={`rounded-md p-1.5 ${edit?'bg-[#10b981]/10 text-[#10b981]':'text-[#64748b] hover:text-white'}`} title="Settings"><Settings2 className="h-3.5 w-3.5"/></button><button onClick={()=>removeIndicator(x.id)} className="rounded-md p-1.5 text-[#64748b] hover:text-[#ef4444]" title="Remove"><Trash2 className="h-3.5 w-3.5"/></button></div>{edit&&<div className="grid grid-cols-2 gap-2 border-t border-[#222636] px-2.5 py-2.5 text-[8px] text-[#8c93a6]">{supportsSource(x.kind)&&<label>Source<select value={x.source||'close'} onChange={e=>patchIndicator(x.id,{source:e.target.value as any})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[9px] text-white outline-none">{PRICE_SOURCES.map(src=><option key={src.value} value={src.value}>{src.label}</option>)}</select></label>}<label>Line width<input type="number" min="1" max="4" value={x.lineWidth||2} onChange={e=>patchIndicator(x.id,{lineWidth:Math.max(1,Math.min(4,Number(e.target.value)||1))})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Line style<select value={x.lineStyle??0} onChange={e=>patchIndicator(x.id,{lineStyle:Number(e.target.value) as 0|1|2})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[9px] text-white outline-none"><option value="0">Solid</option><option value="1">Dotted</option><option value="2">Dashed</option></select></label><label>Color<input type="color" value={x.color||defaultIndicatorStyle(x.kind).color} onChange={e=>patchIndicator(x.id,{color:e.target.value})} className="mt-1 h-7 w-full cursor-pointer rounded border border-[#222636] bg-[#080a10] p-0.5"/></label>{x.kind==='MACD'&&<label>Signal color<input type="color" value={x.signalColor||'#c084fc'} onChange={e=>patchIndicator(x.id,{signalColor:e.target.value})} className="mt-1 h-7 w-full cursor-pointer rounded border border-[#222636] bg-[#080a10] p-0.5"/></label>}{['Bollinger Bands','Keltner Channels','Donchian Channels','Ichimoku Cloud'].includes(x.kind)&&<><label>Upper color<input type="color" value={x.upperColor||'#60a5fa'} onChange={e=>patchIndicator(x.id,{upperColor:e.target.value})} className="mt-1 h-7 w-full cursor-pointer rounded border border-[#222636] bg-[#080a10] p-0.5"/></label><label>Lower color<input type="color" value={x.lowerColor||'#60a5fa'} onChange={e=>patchIndicator(x.id,{lowerColor:e.target.value})} className="mt-1 h-7 w-full cursor-pointer rounded border border-[#222636] bg-[#080a10] p-0.5"/></label></>}{['EMA','SMA','HMA','RSI','ATR','ADX','CCI','MFI','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Stochastic','Market Structure','Swing Levels','Opening Range','Opening Range Pro','Equal Highs/Lows','Liquidity Pools','Order Blocks','Order Blocks + Mitigation','Anchored VWAP','TradingCore V Price Action','Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff'].includes(x.kind)&&<label>Period<input type="number" min="2" max="500" value={x.period??14} onChange={e=>patchIndicator(x.id,{period:Math.max(2,Number(e.target.value)||2)})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label>}{['Bollinger Bands','Keltner Channels','Supertrend','VWAP Deviation Bands','TradingCore V Price Action','ATR Percentile Bands','HTF Volume Spike & Imbalance Projection','OrderBlock AI','Stoploss Cascades','Trend Target Ribbon'].includes(x.kind)&&<label>Multiplier<input type="number" step="0.1" min="0.1" max="10" value={x.multiplier??2} onChange={e=>patchIndicator(x.id,{multiplier:Number(e.target.value)||2})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label>}{x.kind==='MACD'&&<><label>Fast<input type="number" min="2" value={x.fast??12} onChange={e=>patchIndicator(x.id,{fast:Number(e.target.value)||12})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Slow<input type="number" min="3" value={x.slow??26} onChange={e=>patchIndicator(x.id,{slow:Number(e.target.value)||26})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Signal<input type="number" min="2" value={x.signal??9} onChange={e=>patchIndicator(x.id,{signal:Number(e.target.value)||9})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}{x.kind==='Stochastic'&&<><label>Smoothing<input type="number" min="1" value={x.smooth??3} onChange={e=>patchIndicator(x.id,{smooth:Number(e.target.value)||3})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Signal<input type="number" min="1" value={x.signal??3} onChange={e=>patchIndicator(x.id,{signal:Number(e.target.value)||3})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}{x.kind==='Ichimoku Cloud'&&<><label>Conversion<input type="number" min="2" value={x.period??9} onChange={e=>patchIndicator(x.id,{period:Number(e.target.value)||9})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label><label>Base<input type="number" min="3" value={x.slow??26} onChange={e=>patchIndicator(x.id,{slow:Number(e.target.value)||26})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label></>}{['Opening Range','Opening Range Pro'].includes(x.kind)&&<label>Minutes<input type="number" min="5" max="120" value={x.period??15} onChange={e=>patchIndicator(x.id,{period:Math.max(5,Math.min(120,Number(e.target.value)||15))})} className="mt-1 w-full rounded border border-[#222636] bg-[#080a10] p-1.5 text-[10px] text-white outline-none"/></label>}<button onClick={()=>resetIndicator(x)} className="col-span-2 inline-flex items-center justify-center gap-1 rounded border border-[#222636] px-2 py-1.5 text-[9px] text-[#94a3b8] hover:text-white"><RotateCcw className="h-3 w-3"/> Reset this indicator</button></div>}</div>})}</div><div className="border-t border-[#222636] pt-2"><div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[#64748b]">Add indicator</div><div className="grid grid-cols-2 gap-1">{INDICATOR_LIBRARY.map(lib=><button key={lib.kind} onClick={()=>addIndicatorFromChart(lib.kind)} className="rounded-md border border-[#222636] px-2 py-1.5 text-left text-[9px] text-[#cbd5e1] hover:border-[#10b981]/40 hover:bg-[#10b981]/5"><span className="font-semibold">{lib.kind}</span><span className="block text-[8px] text-[#64748b]">{lib.overlay?'Overlay':'Pane'}</span></button>)}</div></div></div>}</div><div className="relative"><button onClick={()=>{setShowPredictionMenu(v=>!v);setShowIndicatorMenu(false);setShowDrawingMenu(false)}} className={`toolbar-pill ${predictionModelIds.length?'toolbar-pill-active':''}`}>AI {predictionModelIds.length}</button>{showPredictionMenu&&<div onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="absolute left-0 top-full z-[10000] mt-1 w-[360px] max-w-[calc(100vw-20px)] rounded-lg border border-[#303747] bg-[#0b0e15] p-2 shadow-2xl" style={{maxHeight:'min(72vh,620px)',overflowY:'scroll',overscrollBehavior:'contain',WebkitOverflowScrolling:'touch'}}><div className="sticky top-0 z-10 bg-[#0b0e15] pb-2"><div className="flex items-center gap-2 px-2 pb-2"><div className="text-[9px] uppercase tracking-widest text-[#64748b] flex-1">Prediction overlays · {predictionModelIds.length} selected · max 39 plotted</div><button onClick={()=>{setPredictionModelIds([]);try{localStorage.setItem('tradingcore_prediction_models','[]');window.dispatchEvent(new CustomEvent('tradingcore:prediction-models-changed',{detail:[]}))}catch{}}} className="text-[8px] text-[#64748b] hover:text-white">Clear</button></div><div className="flex gap-1.5 px-1"><div className="flex flex-1 items-center gap-1.5 rounded border border-[#222636] bg-[#090c12] px-2"><Search className="h-3 w-3 text-[#64748b]"/><input value={predictionQuery} onChange={e=>setPredictionQuery(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Search model…" className="w-full bg-transparent py-1.5 text-[9px] text-white outline-none"/><button onClick={()=>setPredictionQuery('')} className="text-[#64748b]"><X className="h-3 w-3"/></button></div><button onClick={()=>{const ids=PREDICTION_MODELS.map(m=>m.id);setPredictionModelIds(ids);try{localStorage.setItem('tradingcore_prediction_models',JSON.stringify(ids));window.dispatchEvent(new CustomEvent('tradingcore:prediction-models-changed',{detail:ids}))}catch{}}} className="rounded border border-[#222636] px-2 text-[8px] text-[#94a3b8]">All</button></div></div><div className="px-1 pt-1">{PREDICTION_MODELS.filter(m=>!predictionQuery.trim()||`${m.name} ${m.purpose} ${m.algorithm}`.toLowerCase().includes(predictionQuery.trim().toLowerCase())).map(m=>{const checked=predictionModelIds.includes(m.id);return <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded px-2 py-2 ${checked?'bg-[#10221e]/60':'hover:bg-[#111722]'}`}><input type="checkbox" checked={checked} onChange={()=>{const next=checked?predictionModelIds.filter(x=>x!==m.id):[...predictionModelIds,m.id];setPredictionModelIds(next);try{localStorage.setItem('tradingcore_prediction_models',JSON.stringify(next));window.dispatchEvent(new CustomEvent('tradingcore:prediction-models-changed',{detail:next}))}catch{}}} className="mt-0.5"/><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[9px] text-white"><span>{m.name}</span><span className={`rounded border px-1 py-0.5 text-[7px] ${m.execution==='server'?'border-[#38bdf8]/30 text-[#38bdf8]':'border-[#303747] text-[#64748b]'}`}>{m.execution==='server'?'SERVER':'LOCAL'}</span>{checked&&<Check className="h-3 w-3 text-[#10b981]"/>}</span><span className="block text-[8px] leading-3 text-[#64748b]">{m.purpose} · {m.algorithm.toUpperCase()}</span><span className="mt-0.5 block text-[8px] leading-3 text-[#475569]">{m.description}</span></span></label>})}{!PREDICTION_MODELS.some(m=>!predictionQuery.trim()||`${m.name} ${m.purpose} ${m.algorithm}`.toLowerCase().includes(predictionQuery.trim().toLowerCase()))&&<div className="px-3 py-6 text-center text-[9px] text-[#64748b]">No prediction model matches this search.</div>}</div><div className="sticky bottom-0 mt-2 border-t border-[#222636] bg-[#0b0e15] px-2 pt-2 text-[8px] leading-3 text-[#64748b]">SERVER models use trained artifacts when ML_SERVICE_URL is configured; LOCAL models are browser-native research proxies.</div></div>}</div><div className="relative"><button onClick={()=>setShowDrawingMenu(v=>!v)} className={`toolbar-pill ${drawingTool!=='none'?'toolbar-pill-active':''}`}><Pencil className="mr-1 inline h-3 w-3"/>Draw</button>{showDrawingMenu&&<div className="absolute left-0 top-full z-[10000] mt-1 w-48 rounded-lg border border-[#303747] bg-[#0b0e15] p-2 shadow-2xl"><div className="px-2 pb-1.5 text-[9px] uppercase tracking-widest text-[#64748b]">Drawing tools</div>{CORE_DRAWING_TOOLS.map(({kind:tool,label})=><button key={tool} onClick={()=>selectDrawingTool(tool)} className="block w-full rounded px-2 py-1.5 text-left text-[9px] text-[#cbd5e1] hover:bg-[#111722]">{label}</button>)}<button onClick={clearDrawings} className="mt-1 block w-full rounded border-t border-[#222636] px-2 py-1.5 pt-2 text-left text-[9px] text-[#ef4444]">Clear drawings</button></div>}</div><button onClick={()=>setShowLevels(x=>!x)} className={`toolbar-pill ${showLevels?'toolbar-pill-active':''}`}>Levels</button><button onClick={()=>setShowOI(x=>!x)} className={`toolbar-pill ${showOI?'toolbar-pill-active':''}`}>OI</button><button onClick={()=>setShowDepth(x=>!x)} className={`toolbar-pill ${showDepth?'toolbar-pill-active':''}`}>L2</button><button onClick={()=>setShowVolume(x=>!x)} className={`toolbar-pill ${showVolume?'toolbar-pill-active-blue':''}`}>Volume</button><span className="ml-auto text-[9px] font-mono text-[#64748b]">{indicators.filter(x=>x.enabled).length} indicators · {automations.filter(x=>x.enabled).length} automations</span></div>{showDepth&&<div className="mb-2 rounded-lg border border-[#222636] bg-[#090c12] px-2 py-1.5 font-mono text-[9px]"><div className="mb-1 flex items-center justify-between text-[#64748b]"><span>L2 · 5-level market depth</span><span className={tick?.bid?.length||tick?.ask?.length?'text-[#10b981]':'text-[#64748b]'}>{tick?.bid?.length||tick?.ask?.length?'LIVE':'WAITING'}</span></div><div className="grid grid-cols-[1fr_80px_1fr] gap-1 text-[9px]"><div className="text-right text-[#22c55e]">BID QTY · PRICE</div><div className="text-center text-[#64748b]">LEVEL</div><div className="text-[#ef4444]">PRICE · ASK QTY</div>{Array.from({length:5},(_,i)=>{const b=tick?.bid?.[i],a=tick?.ask?.[i];return <div key={i} className="contents"><div className="text-right text-[#22c55e]">{b?`${Math.round(b.quantity).toLocaleString()} · ${b.price.toFixed(2)}`:'—'}</div><div className="text-center text-[#64748b]">{i+1}</div><div className="text-[#ef4444]">{a?`${a.price.toFixed(2)} · ${Math.round(a.quantity).toLocaleString()}`:'—'}</div></div>})}</div></div>}<div className="flex items-center justify-between px-1 pb-2 text-[10px] font-mono"><span className="text-[#64748b]">Normalized broker candles · native indicator engine</span><span className="text-[#10b981]">● LIVE ENGINE</span>{showOI&&oiAnalytics.current&&<span className="ml-2 text-[#a78bfa]">OI · PCR {oiAnalytics.current.pcr.toFixed(2)} · FLIP {oiAnalytics.current.flip?.strike??'—'}</span>}</div>{error?<div className="flex-1 min-h-[360px] items-center justify-center flex rounded-xl border border-[#ef4444]/20 bg-[#0c0e15] text-xs text-[#ef4444]">{error}</div>:<><div className="relative min-h-[430px] flex-1 rounded-xl overflow-hidden border border-[#222636]">
  {showEmbeddedDrawingToolbar && <div className="absolute left-1 top-2 z-30 flex w-10 flex-col items-center gap-1 rounded-lg border border-[#2a3040] bg-[#0b0e15]/95 p-1 shadow-2xl backdrop-blur">
    {[
      ['none','Pointer',MousePointer2],['trendline','Trend line',TrendingIcon],['ray','Ray',ArrowUpRight],['extendedLine','Extended line',MoveHorizontal],
      ['horizontal','Horizontal',Minus],['horizontalRay','Horizontal ray',Minus],['vertical','Vertical',MoveVertical],
      ['parallelChannel','Parallel channel',Waves],['rectangle','Rectangle',Square],['ellipse','Ellipse',Circle],
      ['fib','Fib retracement',GitBranch],['fibExtension','Fib extension',GitBranch],['pitchfork','Pitchfork',Triangle],
      ['arrow','Arrow',ArrowUpRight],['priceRange','Price range',Ruler],['dateRange','Date range',Ruler],
      ['brush','Brush',Paintbrush],['highlighter','Highlighter',Highlighter],['text','Text',Type],
      ['longPosition','Long position',Target],['shortPosition','Short position',Target],['measure','Measure',Ruler]
    ].map(([tool,label,Icon]:any)=><button key={String(tool)} title={String(label)} onClick={()=>selectDrawingTool(tool as DrawingTool)}
      className={`flex h-8 w-8 items-center justify-center rounded ${drawingTool===tool?'bg-[#2563eb]/20 text-[#60a5fa]':'text-[#8c93a6] hover:bg-[#171b27] hover:text-white'}`}><Icon size={15}/></button>)}
    <div className="my-1 h-px w-7 bg-[#222636]"/>
    <button title="Undo last drawing" onClick={()=>{const before=drawingStore.current.list();if(drawingStore.current.undo()){drawings.current=drawingStore.current.list() as Drawing[];const removed=before[before.length-1];if(removed)coreEventBus.emit('drawing.deleted',{id:removed.id,owner:removed.owner,timestamp:Date.now()});saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings()}}} className="flex h-8 w-8 items-center justify-center rounded text-[#8c93a6] hover:bg-[#171b27] hover:text-white"><Undo2 size={15}/></button>
    <button title="Clear all drawings" onClick={clearDrawings} className="flex h-8 w-8 items-center justify-center rounded text-[#8c93a6] hover:bg-[#171b27] hover:text-[#ef4444]"><Eraser size={15}/></button>
  </div>}
  <div ref={host} className="h-full min-h-[430px] w-full"/>{historyLoading&&<div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2"><div className="flex items-center gap-2 rounded-full border border-[#303747] bg-[#0b0e15]/95 px-3 py-1.5 font-mono text-[9px] text-[#cbd5e1] shadow-xl backdrop-blur"><span className="h-2.5 w-2.5 animate-spin rounded-full border border-[#475569] border-t-[#10b981]"/>Loading more history…</div></div>}
</div>{oscillatorKinds(indicators)&&<div ref={oscHost} className="mt-2 h-32 rounded-xl overflow-hidden border border-[#222636]"/>}</>}</div>;
}