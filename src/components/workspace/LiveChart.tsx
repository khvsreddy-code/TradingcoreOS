import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChartLifecycle } from '../../services/core/chart/chartLifecycle';
import { ChartUpdateScheduler } from '../../services/core/chart/chartUpdateScheduler';
import { CoreDrawing, normalizeCoreDrawings } from '../../services/core/drawing/coreDrawing';
import { CoreDrawingStore } from '../../services/core/drawing/coreDrawingStore';
import { CoreDrawingApi } from '../../services/core/drawing/drawingApi';
import { hitTestDrawings, moveDrawingHandle, snapDataPoint } from '../../services/core/drawing/drawingGeometry';
import { RealtimeCalculationEngine } from '../../services/core/calculation/realtimeCalculationEngine';
import { coreEventBus } from '../../services/core/event/eventBus';
import { CORE_DRAWING_TOOLS, getCoreDrawingTool, validateDrawingPoints } from '../../services/core/drawing/drawingTools';
import { createChart, createSeriesMarkers, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi, type Time } from '../../services/core/chart/velaChartFacade';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { NormalizedMarketTick } from '../../types/market';
import { ChartDepthPanel } from './ChartDepthPanel';
import { IndicatorSettingsPanel } from '../indicators/IndicatorSettingsPanel';
import { getIndicatorDefaultPatch, getIndicatorSettingsSchema, buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot } from '../../services/coreSpirit/indicatorSettingsSchema';
import { resolveIndicatorAppearance } from '../../services/coreSpirit/indicatorAppearance';
import { IndicatorCodeViewer } from '../indicators/IndicatorCodeViewer';
import { ChartToolbar } from './ChartToolbar';
import { useChartUiEvents } from './hooks/useChartUiEvents';
import { useChartLifecycle } from './hooks/useChartLifecycle';
import { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { ChartAnalytics } from '../../services/marketData/levelEngine';
import { chartDataPlaneKey, getChartDataPlane, CHART_TIMEFRAME_INTERVALS, CHART_TIMEFRAME_SECONDS, type ChartDataPlaneSnapshot } from '../../services/marketData/chartDataPlane';
import { chartMarketKey } from '../../services/marketData/chartMarketStore';
import { shouldLoadOlderHistory } from '../../services/marketData/chartHistoryCoordinator';
import { chartPerformanceTelemetry } from '../../services/marketData/chartPerformanceTelemetry';
import { chartComputeCoordinator } from '../../services/marketData/chartComputeCoordinator';
import { isIncrementalIndicatorSupported } from '../../services/marketData/incrementalIndicatorEngine';
import { selectIndicatorComputeWindow } from '../../services/marketData/chartComputeWindow';
import { historyDemandPageCandles } from '../../services/marketData/chartHistoryPolicy';
import { getIndicators, saveIndicators, getAutomations, AutomationConfig } from '../../services/workspace/workspaceState';
import { buildOIChartAnalytics, OIChartAnalytics } from '../../services/marketData/oiEngine';
import { Plus, Settings2, Code2, Play, Zap, Eye, EyeOff, Trash2, RotateCcw, Pencil, Search, Check, X, Crosshair, Minus, ArrowUpRight, MoveHorizontal, MoveVertical, Square, Circle, Ruler, Type, MousePointer2, Eraser, Paintbrush, Highlighter, Waves, GitBranch, Triangle, BoxSelect, Target, Undo2 } from 'lucide-react';
import { PREDICTION_MODELS, getSavedPredictionModelIds, savePredictionModelIds } from '../../services/predictionEngine';
import { chartPredictionCoordinator } from '../../services/marketData/chartPredictionCoordinator';
import { coreSpiritChartRegistry } from '../../services/coreSpirit/chartRegistry';
import { CoreSpiritChartOutputController } from '../../services/coreSpirit/chartOutputController';
import { runCoreSpiritInWorker } from '../../services/coreSpirit/chartRunner';
import { CoreSpiritEditorModel } from '../../services/coreSpirit/editorModel';
import { IndicatorConfig, INDICATOR_LIBRARY, series, vwap, bollinger, rsi, macd, supertrend, keltner, donchian, stochastic, ichimoku, pivots, marketStructure, fairValueGaps, dynamicSupportResistance, liquiditySweeps, orderBlocks, indianKeyLevels, cpr, classicPivots, openingRange, swingLevels, gapLevels, previousDayLevels, previousPeriodLevels, gapZones, equalHighLow, liquidityPools, bosChoch, priceActionEvents, nr7, developingDayLevels, vwapDeviationBands, anchoredVwap, extendedCpr, periodPivots, tradingCoreVPriceAction, advancedIndicatorModel } from '../../services/marketData/indicatorEngine';
import { CandleAppearance, DEFAULT_CANDLE_APPEARANCE, candleSeriesOptions, loadCandleAppearance, saveCandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { getCurrentTheme, getThemePalette } from '../../theme/theme';

const intervals = CHART_TIMEFRAME_INTERVALS;
const seconds = CHART_TIMEFRAME_SECONDS;
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
 if(pipe){const exchange=pipe[1].toUpperCase(),segment=pipe[2].toUpperCase(),ticker=pipe[3];if(segment==='CM'&&!/-(EQ|BE|SM|ST)$/i.test(ticker))return `${exchange}:${ticker}-EQ`;return `${exchange}:${ticker}`;}
 if(!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return `NSE:${value}`;
 if(/^NSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
 if(/^BSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
 return value;
};
type Props={instrumentKey:string;brokerId?:string;onAnalytics?:(a:ChartAnalytics)=>void;levelsRequest?:number;chartIndex?:number;showEmbeddedDrawingToolbar?:boolean};
const colorWithOpacity=(color:string|undefined, opacity:number|undefined, fallback:string):string=>{
 const raw=String(color||fallback).trim(); const alpha=Math.max(0.15,Math.min(1,Number(opacity??1)));
 if(!/^#[0-9a-f]{6}$/i.test(raw)||alpha>=0.999)return raw;
 return `${raw}${Math.round(alpha*255).toString(16).padStart(2,'0')}`;
};
const colors:Record<string,string>={EMA:'#38bdf8',SMA:'#f59e0b',HMA:'#e879f9',VWAP:'#c084fc',ADX:'#3b82f6',RSI:'#f59e0b',CCI:'#fb7185',OBV:'#60a5fa',MFI:'#a78bfa',ATR:'#3b82f6'};
const oscillatorKinds=(x:IndicatorConfig[])=>x.some(i=>i.enabled&&['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Delta Sigma Heatmap','Neural Weight Oscillator','Trend Pressure','Trinity','Volatility Shock Half Life Monitor'].includes(i.kind));
const TrendingIcon=ArrowUpRight;
type DrawingTool = CoreDrawing['kind'] | 'none' | 'crosshair';
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
 if(a.kind==='VWAP_RECLAIM'){const w=vwap(c,'hlc3');if(w.length<2)return null;const pv=w[w.length-2].value,cv=w[w.length-1].value;if(prev.close<=pv&&last.close>cv)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'VWAP BUY'};if(prev.close>=pv&&last.close<cv)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'VWAP SELL'};}
 if(a.kind==='EMA_CROSS'){const fast=series(c,'EMA',{id:a.id,kind:'EMA',period:a.fast||9,enabled:true}),slow=series(c,'EMA',{id:a.id,kind:'EMA',period:a.slow||21,enabled:true});if(fast.length>1&&slow.length>1){const f0=fast[fast.length-2].value,s0=slow[slow.length-2].value,f1=fast[fast.length-1].value,s1=slow[slow.length-1].value;if(f0<=s0&&f1>s1)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'EMA BUY'};if(f0>=s0&&f1<s1)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'EMA SELL'};}}
 if(a.kind==='OPENING_RANGE'){const day=new Date(last.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),today=c.filter(x=>new Date(x.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})===day),opening=today.slice(0,Math.max(1,Math.round(900/300)));if(opening.length&&today.length>opening.length){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(prev.close<=hi&&last.close>hi)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'OR BUY'};if(prev.close>=lo&&last.close<lo)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'OR SELL'};}}
 if(a.kind==='RSI_REVERSAL'){const pts=rsi(c,a.period||14);if(pts.length>=2){const r0=pts[pts.length-2].value,r1=pts[pts.length-1].value;if(r0<=30&&r1>30)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'RSI BUY'};if(r0>=70&&r1<70)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'RSI SELL'};}}
 if(a.kind==='DONCHIAN_BREAKOUT'){const ch=donchian(c,a.period||20);if(ch.length>=2){const prevCh=ch[ch.length-2],lastCh=ch[ch.length-1];if(prev.close<=prevCh.upper&&last.close>lastCh.upper)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BREAKOUT BUY'};if(prev.close>=prevCh.lower&&last.close<lastCh.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BREAKOUT SELL'};}}
 if(a.kind==='SUPERTREND_FLIP'){const st=supertrend(c,a.period||10);if(st.length>=2){const p0=st[st.length-2],p1=st[st.length-1];if(p0.direction<0&&p1.direction>0)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'ST BUY'};if(p0.direction>0&&p1.direction<0)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'ST SELL'};}}
 if(a.kind==='PDH_PDL_SWEEP'){const lv=indianKeyLevels(c);const pdh=lv.find(x=>x.label==='PDH'),pdl=lv.find(x=>x.label==='PDL');if(pdh&&prev.high>pdh.price&&last.close<pdh.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'PDH SWEEP'};if(pdl&&prev.low<pdl.price&&last.close>pdl.price)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'PDL SWEEP'};}
 if(a.kind==='CPR_BREAKOUT'){const lv=cpr(c);const tc=lv.find(x=>x.label==='CPR TC'),bc=lv.find(x=>x.label==='CPR BC');if(tc&&prev.close<=tc.price&&last.close>tc.price)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'CPR BUY'};if(bc&&prev.close>=bc.price&&last.close<bc.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'CPR SELL'};}
 if(a.kind==='BOLLINGER_BREAKOUT'){const bb=bollinger(c,a.period||20,a.multiplier||2);if(bb.length>=2){const p0=bb[bb.length-2],p1=bb[bb.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return {time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BB BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BB SELL'};}}
 return null;
}

const line=(chart:IChartApi,color:string,width=1,lineStyle:0|1|2=0)=>chart.addSeries(LineSeries,{color,lineWidth:width,lineStyle,priceLineVisible:false,lastValueVisible:true});
const LEVEL_APPEARANCE_KINDS=new Set(['Dynamic Support/Resistance','CPR','Key Levels','Opening Range','Swing Levels','Gap Levels','Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range Pro','Developing Day High/Low','Equal Highs/Lows','Liquidity Pools','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots']);

export const LiveChart = memo(function LiveChart({instrumentKey,brokerId='unknown',onAnalytics,levelsRequest,chartIndex,showEmbeddedDrawingToolbar=true}:Props){
 const resolvedInstrumentKey=canonicalInstrumentKey(brokerId,instrumentKey);
 const rendererController=useChartLifecycle();
 const host=useRef<HTMLDivElement>(null),oscHost=useRef<HTMLDivElement>(null); const chart=useRef<IChartApi>(); const oscChart=useRef<IChartApi>(); const candle=useRef<ISeriesApi<'Candlestick'>>(); const closeLine=useRef<ISeriesApi<'Line'>>(); const volume=useRef<ISeriesApi<'Histogram'>>(); const indicatorSeries=useRef<ISeriesApi<'Line'>[]>([]); const indicatorSeriesMap=useRef(new Map<string, ISeriesApi<'Line'>[]>()); const markerDataByIndicator=useRef(new Map<string, any[]>()); const indicatorFillMap=useRef(new Map<string, any[]>());
 const markerPlugin=useRef<any>(null); const oscSeries=useRef<ISeriesApi<'Line'>[]>([]); const candles=useRef<HistoricalCandle[]>([]); const visibleLogicalRangeRef=useRef<{from:number;to:number}|null>(null);
 const lifecycle=useRef(new ChartLifecycle()); const indicatorRequestSeq=useRef(0); const chartUpdateScheduler=useRef(new ChartUpdateScheduler()); const chartId=useRef(`chart-${Math.random().toString(36).slice(2,10)}`); const calculationEngine=useRef(new RealtimeCalculationEngine()); const workerSeriesMap=useRef(new Map<string, Array<ISeriesApi<'Line'>|ISeriesApi<'Histogram'>>>());
 const coreSpiritOutput=useRef<CoreSpiritChartOutputController>(); const coreSpiritRunId=useRef(0);
 const historyPaintedRef=useRef(false);
 const registerIndicatorSeries=(indicatorId:string,s:ISeriesApi<'Line'>)=>{indicatorSeries.current.push(s);const group=indicatorSeriesMap.current.get(indicatorId)||[];group.push(s);indicatorSeriesMap.current.set(indicatorId,group);return s;};
 const persistedChart=useMemo(()=>loadChartState(brokerId,resolvedInstrumentKey),[brokerId,resolvedInstrumentKey]); const [selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null); const [timeframe,setTimeframe]=useState(persistedChart.timeframe),[drawingTool,setDrawingTool]=useState<DrawingTool>('none'),[showDrawingMenu,setShowDrawingMenu]=useState(false),[crosshairVisible,setCrosshairVisible]=useState(true),[showLevels,setShowLevels]=useState(persistedChart.showLevels??false),[showVolume,setShowVolume]=useState(persistedChart.showVolume??false),[showOI,setShowOI]=useState(persistedChart.showOI??false),[showDepth,setShowDepth]=useState(persistedChart.showDepth??false),[showIndicatorMenu,setShowIndicatorMenu]=useState(false),[showPredictionMenu,setShowPredictionMenu]=useState(false),[editingIndicator,setEditingIndicator]=useState<string|null>(null),[viewingIndicatorCode,setViewingIndicatorCode]=useState<string|null>(null),[indicators,setIndicators]=useState<IndicatorConfig[]>(getIndicators),[automations,setAutomations]=useState<AutomationConfig[]>(getAutomations),[predictionModelIds,setPredictionModelIds]=useState<string[]>(getSavedPredictionModelIds()),[predictionQuery,setPredictionQuery]=useState(''),[chartType,setChartType]=useState<'candlestick'|'line'>('candlestick'),[error,setError]=useState(''),[historyLoading,setHistoryLoading]=useState(false),[showCandleSettings,setShowCandleSettings]=useState(false),[candleAppearance,setCandleAppearance]=useState<CandleAppearance>(()=>loadCandleAppearance(brokerId,resolvedInstrumentKey)),[coreSpiritOpen,setCoreSpiritOpen]=useState(false),[coreSpiritSource,setCoreSpiritSource]=useState(() => localStorage.getItem('tradingcore:corespirit:chart-source') || `fast = ema(close, 20)\nslow = ema(close, 50)\n\nshow fast, slow\n\nwhen fast crossesAbove slow:\n    emit "LONG"`),[coreSpiritStatus,setCoreSpiritStatus]=useState(''),[coreSpiritDiagnostics,setCoreSpiritDiagnostics]=useState<string[]>([]);
 const chartDataPlane=useMemo(()=>getChartDataPlane(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);
 const chartDatasetKey=useMemo(()=>chartDataPlaneKey(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);
 const latestTick=useRef<NormalizedMarketTick>();
 const dataRevisionRef=useRef(0);
 const candleAppearanceRef=useRef<CandleAppearance>(candleAppearance); candleAppearanceRef.current=candleAppearance; const appearanceScopeRef=useRef(`${brokerId}:${resolvedInstrumentKey}`); const skipAppearanceSaveRef=useRef(false);
 useEffect(()=>{if(levelsRequest==null)return;setShowLevels(true);},[levelsRequest]);
 useEffect(()=>{window.dispatchEvent(new CustomEvent('TRADINGCORE_LEVELS_STATE',{detail:{chartIndex,visible:showLevels}}));},[chartIndex,showLevels]);
 useEffect(()=>{window.dispatchEvent(new CustomEvent('TRADINGCORE_PREDICTIONS_STATE',{detail:{chartIndex,visible:showPredictionMenu}}));},[chartIndex,showPredictionMenu]); const drawingToolRef=useRef<DrawingTool>('none'); const drawingPoints=useRef<DrawingPoint[]>([]);
 useEffect(()=>{rendererController.setChartType(chartType);},[chartType,rendererController]);
 useEffect(()=>{const scope=`${brokerId}:${resolvedInstrumentKey}`;if(appearanceScopeRef.current!==scope){appearanceScopeRef.current=scope;skipAppearanceSaveRef.current=true;setCandleAppearance(loadCandleAppearance(brokerId,resolvedInstrumentKey));}},[brokerId,resolvedInstrumentKey]);
 useEffect(()=>{if(skipAppearanceSaveRef.current){skipAppearanceSaveRef.current=false;return;}saveCandleAppearance(brokerId,resolvedInstrumentKey,candleAppearance);rendererController.setCandleAppearance(candleAppearance);if(candles.current.length&&volume.current){volume.current.setData(candles.current.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000) as Time,value:Number(x.volume)||0,color:volumeColor(candleAppearance,Number(x.open),Number(x.close))})));}},[candleAppearance,brokerId,resolvedInstrumentKey]);
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
 const drawingStore=useRef(new CoreDrawingStore(persistedChart.drawings)); const drawingApi=useRef(new CoreDrawingApi(drawingStore.current,coreEventBus)); const drawingDrag=useRef<{id:string;index:number}|null>(null); const drawings=useRef<Drawing[]>(drawingStore.current.list() as Drawing[]); const drawingSeries=useRef<ISeriesApi<'Line'>[]>([]); const analytics=useRef<ChartAnalytics|null>(null); const oiAnalytics=useRef<OIChartAnalytics|null>(null); const oiChainRef=useRef<{signature:string;chain:any}>(); const oiLines=useRef<any[]>([]); const predictionLines=useRef<any[]>([]); const predictionJob=useRef(0); const analyticsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{const a=(e:Event)=>setIndicators((e as CustomEvent<IndicatorConfig[]>).detail||getIndicators());const b=(e:Event)=>setAutomations((e as CustomEvent<AutomationConfig[]>).detail||getAutomations());const c=(e:Event)=>setPredictionModelIds((e as CustomEvent<string[]>).detail||getSavedPredictionModelIds());window.addEventListener('tradingcore:indicators',a);window.addEventListener('tradingcore:automations',b);window.addEventListener('tradingcore:prediction-models-changed',c);return()=>{window.removeEventListener('tradingcore:indicators',a);window.removeEventListener('tradingcore:automations',b);window.removeEventListener('tradingcore:prediction-models-changed',c)}},[]);
 useEffect(()=>{
   const unregister=coreSpiritChartRegistry.register({
     chartId: chartId.current,
     symbol: resolvedInstrumentKey,
     timeframe,
     getBars: () => [...candles.current] as any,
     run: async (source:string, sourceId='coreSpirit-editor') => {
       const runId=++coreSpiritRunId.current;
       const bars=[...candles.current];
       if(!bars.length) throw new Error('Chart has no candles yet; wait for the first history paint.');
       publishChartLifecycle('updating');
       try {
         const result=await runCoreSpiritInWorker(source,bars,sourceId);
         if(runId!==coreSpiritRunId.current)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:`${sourceId}:${runId}`,outputs:[]};
         coreSpiritOutput.current?.reset();
         coreSpiritOutput.current?.applyObjects(result.outputs);
         coreEventBus.emit('market.calculation',{symbol:resolvedInstrumentKey,timeframe,mode:'bar',timestamp:Date.now(),barIndex:bars.length-1,isBarClose:true,values:{coreSpiritOutputs:result.outputs.length}});
         publishChartLifecycle('ready');
         return {barsProcessed:bars.length,plotsEmitted:result.outputs.filter(x=>x.kind==='series').length,signalsEmitted:result.outputs.filter(x=>x.kind==='signal').length,diagnostics:result.diagnostics,runId:`${sourceId}:${runId}`,outputs:result.outputs};
       } catch(error) {
         publishChartLifecycle('error');
         throw error;
       }
     },
   });
   return ()=>{unregister();coreSpiritRunId.current++;coreSpiritOutput.current?.reset();};
 },[brokerId,resolvedInstrumentKey,timeframe]);
 useEffect(()=>{saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});},[timeframe,showLevels,showVolume,showOI,showDepth,brokerId,resolvedInstrumentKey]);
 const openCoreSpirit=()=>{ setCoreSpiritOpen(true); setCoreSpiritStatus(''); setCoreSpiritDiagnostics([]); coreSpiritChartRegistry.activate(chartId.current); };
 const compileCoreSpirit=()=>{ try { const model=new CoreSpiritEditorModel(coreSpiritSource); const result=model.compile(); const errors=(result.diagnostics||[]).filter((d:any)=>d.severity==='error'); setCoreSpiritDiagnostics((result.diagnostics||[]).map((d:any)=>`${d.line?`Line ${d.line}: `:''}${d.message}`)); setCoreSpiritStatus(errors.length?'Compile failed':'Compiled'); return !errors.length; } catch(e:any){ setCoreSpiritDiagnostics([String(e?.message||e)]); setCoreSpiritStatus('Compile failed'); return false; } };
 const deployCoreSpirit=async()=>{ if(!compileCoreSpirit())return; try { localStorage.setItem('tradingcore:corespirit:chart-source',coreSpiritSource); coreSpiritChartRegistry.activate(chartId.current); setCoreSpiritStatus('Deploying…'); const target=coreSpiritChartRegistry.getActive(); if(!target)throw new Error('No active chart'); const run=await target.run(coreSpiritSource,'chart-indicator'); setCoreSpiritStatus(`${run.barsProcessed.toLocaleString()} bars · ${run.plotsEmitted} plots · ${run.signalsEmitted} signals`); setCoreSpiritDiagnostics(run.diagnostics); setCoreSpiritOpen(false); } catch(e:any){ setCoreSpiritStatus('Deploy failed'); setCoreSpiritDiagnostics([String(e?.message||e)]); } };
 const publishDrawing=(event:'drawing.created'|'drawing.updated',drawing:CoreDrawing)=>{coreEventBus.emit(event,{drawing:drawing as unknown as Record<string,unknown>});};
 const publishChartLifecycle=(state:'ready'|'loading'|'updating'|'error'|'recovering'|'disposed')=>{coreEventBus.emit('chart.lifecycle',{chartId:chartId.current,state,timestamp:Date.now()});};
 const requestIndicatorWorker=(data:HistoricalCandle[], range=visibleLogicalRangeRef.current, mode:'snapshot'|'incremental'='snapshot', operation:'replace'|'append'='replace')=>{
   const requestSeq=++indicatorRequestSeq.current;
   const revision=dataRevisionRef.current;
   const computeWindow=mode==='incremental'?data:selectIndicatorComputeWindow(data,range).data;
   const incrementalKey=`${chartDatasetKey}|${chartId.current}`;
   void chartComputeCoordinator.runIndicators(chartDatasetKey,revision,computeWindow,indicators,{mode,operation,incrementalKey}).then(results=>{
     if(requestSeq!==indicatorRequestSeq.current||!lifecycle.current.isAlive()||revision!==dataRevisionRef.current||data!==candles.current||!chart.current)return;
     chartUpdateScheduler.current.scheduleLatest('shared-worker-indicators',()=>{try{renderWorkerIndicators(results);}catch(indicatorError){console.warn('[TradingCore] Shared indicator render skipped invalid data:',indicatorError);}});
   });
 };
 const renderWorkerIndicators=(results:any[])=>{
   if(!chart.current)return;
   const active=indicators.filter(x=>x.enabled);
   if(oscillatorKinds(active)&&oscHost.current&&!oscChart.current){const p=getThemePalette(getCurrentTheme());oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis},timeScale:{visible:false}})};
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
   const updateOrSet=(seriesApi:any,points:any[],incremental:boolean)=>{if(!seriesApi||!points.length)return; if(incremental)seriesApi.update(points[points.length-1] as any); else seriesApi.setData(points as any);};
   const updateWhitespace=(seriesApi:any,time:any)=>{try{seriesApi.update({time} as any);}catch{}};
   const advancedOscillatorKinds=new Set(['Trend Pressure','Neural Weight Oscillator','Trinity']);
   for(const result of results){
     const cfg=active.find(x=>x.id===result.id); if(!cfg||!result.data?.length)continue;
     const incremental=result.incremental===true&&result.incrementalMode==='update'; const opacity=cfg.display?.opacity; const primary=colorWithOpacity(cfg.color,opacity,colors[result.kind]||'#94a3b8'); const signalColor=colorWithOpacity(cfg.signalColor,opacity,'#c084fc'); const upperColor=colorWithOpacity(cfg.upperColor,opacity,primary); const lowerColor=colorWithOpacity(cfg.lowerColor,opacity,primary);
     const targetOsc=['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI',...advancedOscillatorKinds].includes(result.kind);
     const target=targetOsc?oscChart.current:chart.current; if(!target)continue;
     if(result.kind==='MACD'){const [s1,s2,h]=(()=>{const c1=primary||'#38bdf8',c2=signalColor,w=cfg.lineWidth||1,ls=cfg.lineStyle||0;let g=workerSeriesMap.current.get(result.id);if(!g||g.length!==3){g=[line(target,c1,w,ls),line(target,c2,w,ls),target.addSeries(HistogramSeries,{priceFormat:{type:'price'},priceScaleId:'right'}) as any];workerSeriesMap.current.set(result.id,g);}else{try{(g[0] as any).applyOptions({color:c1,lineWidth:w,lineStyle:ls});(g[1] as any).applyOptions({color:c2,lineWidth:w,lineStyle:ls});}catch{}}return g as any[];})();const rows=Array.isArray(result.data)?result.data:[];const macdPts=safeNamedPoints(rows,'macd');const signalPts=safeNamedPoints(rows,'signal');const histPts=rows.map((x:any)=>({time:x?.time as Time,value:finiteNumber(x?.histogram),color:Number(x?.histogram)>=0?colorWithOpacity(cfg.color,Math.min(1,(opacity??1)*.35),'#3b82f6'):colorWithOpacity(cfg.signalColor,Math.min(1,(opacity??1)*.35),'#ef4444')})).filter((x:any)=>x.time!=null&&x.value!=null);updateOrSet(s1,macdPts,incremental);updateOrSet(s2,signalPts,incremental);updateOrSet(h,histPts,incremental);continue;}
     if(result.kind==='Stochastic'){const g=getGroup(result.id,2,target,[primary||'#38bdf8',signalColor||'#f59e0b'],cfg.lineWidth||1,cfg.lineStyle||0);updateOrSet(g[0],safeNamedPoints(result.data,'k'),incremental);updateOrSet(g[1],safeNamedPoints(result.data,'d'),incremental);continue;}
     if(result.kind==='Bollinger Bands'||result.kind==='Keltner Channels'||result.kind==='Donchian Channels'){const colorsFor=[upperColor,colorWithOpacity(cfg.signalColor,opacity,'#64748b'),lowerColor];const g=getGroup(result.id,3,target,colorsFor,cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<3;i++){const key=['upper','middle','lower'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}try{indicatorFillMap.current.set(cfg.id,[chart.current?.addFillBetweenSeries(g[0] as any,g[2] as any,{id:`indicator-fill:${cfg.id}`,enabled:false})].filter(Boolean));}catch{}continue;}
     if(result.kind==='Supertrend'){const g=getGroup(result.id,2,target,[primary||'#3b82f6',signalColor||'#ef4444'],cfg.lineWidth||2,cfg.lineStyle||0);if(incremental){const point=result.data[result.data.length-1];const t=point?.time as Time;if(point?.direction===1){g[0].update({time:t,value:finiteNumber(point.value)} as any);updateWhitespace(g[1],t);}else{updateWhitespace(g[0],t);g[1].update({time:t,value:finiteNumber(point.value)} as any);} }else{g[0].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===1) as any);g[1].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===-1) as any);}continue;}
     if(result.kind==='Ichimoku Cloud'){const g=getGroup(result.id,4,target,[primary||'#38bdf8',signalColor||'#f59e0b',upperColor||'#3b82f6',lowerColor||'#ef4444'],cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<4;i++){const key=['tenkan','kijun','spanA','spanB'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}try{indicatorFillMap.current.set(cfg.id,[chart.current?.addFillBetweenSeries(g[2] as any,g[3] as any,{id:`indicator-fill:${cfg.id}`,enabled:false})].filter(Boolean));}catch{}continue;}
     if(result.kind==='Trend Target Ribbon'){const g=getGroup(result.id,5,target,[primary,'#a78bfa',signalColor,'#3b82f6','#e879f9'],cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<5;i++){const key=['fast','mid','slow','Target+','Target-'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}continue;}
     const s=getSeries(result.id,target,'line',primary,cfg.lineWidth||2,cfg.lineStyle||0);updateOrSet(s,safeLinePoints(result.data,'value'),incremental);
   }
 };
 const clearChartMarkers=()=>{ try{markerPlugin.current?.setMarkers([]);}catch{} };
 const setChartMarkers=(markers:any[])=>{
   if(!candle.current)return;
   try{
     if(!markerPlugin.current) markerPlugin.current=createSeriesMarkers(candle.current,[]);
     markerPlugin.current.setMarkers(markers.slice(-100));
   }catch{}
 };
 const appearanceVisibleBars=()=>{const r=visibleLogicalRangeRef.current;return r?Math.max(1,Math.abs(Number(r.to)-Number(r.from))):candles.current.length;};
 const applyIndicatorAppearanceOnly=()=>{
   if(!chart.current)return;
   const visibleBars=appearanceVisibleBars();
   for(const cfg of indicators){
     const appearance=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
     const options={color:appearance.line.color,lineWidth:appearance.line.width,lineStyle:appearance.line.style==='solid'?0:appearance.line.style==='dashed'?1:2,opacity:appearance.line.opacity,gradient:appearance.line.gradient,gradientColor:appearance.line.gradientColor,glow:appearance.line.glow,glowStrength:appearance.line.glowStrength,visible:appearance.visible,lastValueVisible:cfg.display?.showValues!==false};
     const group=indicatorSeriesMap.current.get(cfg.id)||[];
     const isLevelIndicator=LEVEL_APPEARANCE_KINDS.has(String(cfg.kind));
     for(const series of group){try{(series as any).applyOptions(options); if(isLevelIndicator){(series as any).applyOptions({visible:appearance.visible&&appearance.levels.enabled,lineWidth:appearance.levels.width,lineStyle:appearance.levels.style==='solid'?0:appearance.levels.style==='dashed'?1:2,lastValueVisible:appearance.levels.label&&appearance.levels.labelPlacement==='axis'});}}catch{}}
     const worker=workerSeriesMap.current.get(cfg.id)||[];
     for(const series of worker){try{(series as any).applyOptions({...options, ...(isLevelIndicator?{visible:appearance.visible&&appearance.levels.enabled}: {})});}catch{}}
   }
   for(const cfg of indicators){
     const appearance=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
     const targetPaneId=appearance.pane.mode==='separate'?`tco-indicator-pane:${cfg.id}`:undefined;
     const group=indicatorSeriesMap.current.get(cfg.id)||[];
     for(const series of group){try{(series as any).setPaneAppearance(appearance.pane,targetPaneId);}catch{}}
     const fills=indicatorFillMap.current.get(cfg.id)||[];
     for(const handle of fills){try{handle.setOptions({enabled:appearance.visible&&appearance.fill.enabled,upperColor:appearance.fill.upperColor,lowerColor:appearance.fill.lowerColor,opacity:appearance.fill.opacity,gradient:appearance.fill.gradient,conditional:appearance.fill.conditional,bullishColor:appearance.fill.bullishColor,bearishColor:appearance.fill.bearishColor});}catch{}}
   }
   const markerStyles:any[]=[];
   for(const [indicatorId,rawMarkers] of markerDataByIndicator.current){
     const cfg=indicators.find(x=>x.id===indicatorId); if(!cfg)continue;
     const a=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
     if(!a.marker.enabled||!a.visible)continue;
     const size=a.marker.size<=4?'tiny':a.marker.size<=6?'small':a.marker.size<=10?'normal':a.marker.size<=14?'large':'huge';
     for(const marker of rawMarkers.slice(-100)) markerStyles.push({...marker,position:a.marker.position,color:a.marker.color,shape:a.marker.shape,text:a.marker.text||marker.text,size,textSize:a.marker.textSize,offset:a.marker.offset});
   }
   setChartMarkers(markerStyles);
 };
 const renderStudies=(data:HistoricalCandle[], preserveWorkerSeries=false)=>{
   clearChartMarkers();

   indicatorSeries.current.forEach(s=>{try{chart.current?.removeSeries(s)}catch{}});indicatorSeries.current=[];indicatorSeriesMap.current.clear();markerDataByIndicator.current.clear();indicatorFillMap.current.forEach(handles=>handles.forEach(h=>{try{h.remove()}catch{}}));indicatorFillMap.current.clear();oscSeries.current.forEach(s=>{try{oscChart.current?.removeSeries(s as any)}catch{}});oscSeries.current=[];
   if(!preserveWorkerSeries){workerSeriesMap.current.forEach(group=>group.forEach(s=>{try{chart.current?.removeSeries(s as any)}catch{} try{oscChart.current?.removeSeries(s as any)}catch{}})); workerSeriesMap.current.clear();}
   const active=indicators.filter(x=>x.enabled); const needsOsc=oscillatorKinds(active); const chartMarkers:any[]=[];
   if(needsOsc&&oscHost.current&&!oscChart.current){const p=getThemePalette(getCurrentTheme());oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis},timeScale:{visible:false}})};
   if(!needsOsc&&oscChart.current){try{oscChart.current.remove()}catch{}oscChart.current=undefined;}
   for(const cfg of active){
     if(!chart.current)continue;
     if(['EMA','SMA','HMA','ATR','RSI','ADX','CCI','OBV','MFI','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Ichimoku Cloud'].includes(cfg.kind))continue;
     if(cfg.kind==='Market Structure'){const ms=marketStructure(data,cfg.period||3);const latest=ms.slice(-6);for(const x of latest){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.type.includes('H')?'#ef4444':'#3b82f6'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle||0,priceLineVisible:true,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
     if(cfg.kind==='Fair Value Gaps'){const zones=fairValueGaps(data);for(const z of zones.slice(-8)){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#3b82f666':'#ef444466'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,s);}}continue;}
     if(cfg.kind==='Dynamic Support/Resistance'){const levels=dynamicSupportResistance(data,cfg.period||5).slice(-10);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':'#ef4444'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??2,priceLineVisible:false,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
     if(cfg.kind==='Liquidity Sweeps'){const sweeps=liquiditySweeps(data,cfg.period||5).slice(-12);for(const x of sweeps){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='sell-side'?'#3b82f6':'#f59e0b'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||2)),lineStyle:cfg.lineStyle??0,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
     if(cfg.kind==='Order Blocks'){const zones=orderBlocks(data,cfg.period||5).slice(-8);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const z of zones){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#38bdf8':'#fb7185'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??1,priceLineVisible:false,lastValueVisible:false});s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,s);}}continue;}
     if(cfg.kind==='CPR' || cfg.kind==='Key Levels' || cfg.kind==='Opening Range' || cfg.kind==='Weekly Levels' || cfg.kind==='Swing Levels' || cfg.kind==='Gap Levels'){
       const levels=cfg.kind==='CPR'?cpr(data):cfg.kind==='Key Levels'?indianKeyLevels(data):cfg.kind==='Opening Range'?openingRange(data,cfg.period||15):cfg.kind==='Swing Levels'?swingLevels(data,cfg.period||3):gapLevels(data);
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label.includes('CPR')?2:1,lineStyle: x.label.includes('GAP')?1:2,priceLineVisible:false,lastValueVisible:true});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}
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
       for(const x of levels){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label==='P'||x.label==='TC'||x.label==='BC'?2:1,lineStyle:2,priceLineVisible:false,lastValueVisible:true});ss.setData([{time:(x.time||start) as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,ss);} continue;
     }
     if(cfg.kind==='Gap Zones'){
       const zones=gapZones(data); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones){for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#3b82f699':'#ef444499',lineWidth:2,lineStyle:1,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,ss);}}
       continue;
     }
     if(['BOS / CHOCH','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'].includes(cfg.kind)){
       const ev=priceActionEvents(data); const structure=cfg.kind==='BOS / CHOCH'?bosChoch(data,cfg.period||3):[]; let all:any[]=cfg.kind==='BOS / CHOCH'?structure:ev.filter(x=>{if(cfg.kind==='Rejection Candles')return x.label.startsWith('REJECTION');if(cfg.kind==='Inside Bar Breakout')return x.label.startsWith('INSIDE');if(cfg.kind==='Engulfing Patterns')return x.label.startsWith('ENGULF');if(cfg.kind==='Pin Bars')return x.label.startsWith('PIN');return false;});
       if(cfg.kind==='NR7 Volatility Contraction') all=nr7(data);
       if(cfg.kind==='Breakout / Retest' || cfg.kind==='Failed Breakout'){const sw=dynamicSupportResistance(data,cfg.period||5);for(let i=1;i<data.length;i++){const prev=data[i-1],cur=data[i],t=Math.floor(new Date(cur.timestamp).getTime()/1000);for(const lv of sw.slice(-12)){if(prev.close<=lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'BREAK ↑',side:'bullish'});if(prev.close>=lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'BREAK ↓',side:'bearish'});if(cfg.kind==='Failed Breakout'){if(prev.high>lv.price&&prev.close<lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'FAILED ↓',side:'bearish'});if(prev.low<lv.price&&prev.close>lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'FAILED ↑',side:'bullish'});}}}}
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of all.slice(-30)){ chartMarkers.push({indicatorId:cfg.id,time:x.time as Time,position:x.side==='bullish'?'belowBar':'aboveBar',color:cfg.color||(x.side==='bullish'?'#3b82f6':'#ef4444'),shape:x.side==='bullish'?'arrowUp':'arrowDown',text:x.label}); }
       continue;
     }
     if(cfg.kind==='FVG + Mitigation' || cfg.kind==='Order Blocks + Mitigation'){
       const zones=cfg.kind==='FVG + Mitigation'?fairValueGaps(data):orderBlocks(data,cfg.period||5); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones.slice(-10)){let mitigated=false;const zi=data.findIndex(x=>Math.floor(new Date(x.timestamp).getTime()/1000)===z.time);for(let i=Math.max(0,zi);i<data.length;i++){if(data[i].low<=z.upper&&data[i].high>=z.lower){mitigated=true;break;}}const alpha=mitigated?'44':'99';for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||`#94a3b8${alpha}`,lineWidth:mitigated?1:2,lineStyle:mitigated?2:0,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,ss);}} continue;
     }
     if(cfg.kind==='VWAP Deviation Bands'){
       const bands=vwapDeviationBands(data,cfg.multiplier||1,cfg.source||'hlc3');for(const key of ['middle','upper','lower'] as const){const ss=line(chart.current,key==='middle'?(cfg.color||'#c084fc'):(key==='upper'?(cfg.upperColor||cfg.color||'#a78bfa'):(cfg.lowerColor||cfg.color||'#a78bfa')),key==='middle'?(cfg.lineWidth||2):Math.max(1,(cfg.lineWidth||2)-1),cfg.lineStyle||0);ss.setData(bands.map(x=>({time:x.time as Time,value:x[key]})) as any);registerIndicatorSeries(cfg.id,ss);}continue;
     }
     if(cfg.kind==='Anchored VWAP'){const ss=line(chart.current,cfg.color||'#f97316',cfg.lineWidth||2,cfg.lineStyle||0);ss.setData(anchoredVwap(data,cfg.period||5,cfg.source||'hlc3') as any);registerIndicatorSeries(cfg.id,ss);continue;}
     if(['Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff'].includes(cfg.kind)){
       const result=advancedIndicatorModel(data,cfg.kind,cfg);
       const lineColors=[cfg.color||'#38bdf8',cfg.upperColor||'#a78bfa',cfg.lowerColor||'#f59e0b','#3b82f6','#e879f9'];
       Object.entries(result.lines).forEach(([name,pts],idx)=>{
         const ss=line(chart.current,lineColors[idx%lineColors.length],cfg.lineWidth||2,cfg.lineStyle||0);
         ss.applyOptions({title:`${cfg.kind} · ${name}`}); ss.setData(pts.map(x=>({time:x.time as Time,value:x.value})) as any); registerIndicatorSeries(cfg.id,ss);
       });
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of result.zones.slice(-20)){
         const col=z.side==='bull'?'#3b82f6':z.side==='bear'?'#ef4444':'#60a5fa';
         const outline=[{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower}];
         const ss=line(chart.current,`${col}99`,1,1); ss.setData(outline as any); registerIndicatorSeries(cfg.id,ss);
       }
       for(const m of result.markers.slice(-40)){
         chartMarkers.push({indicatorId:cfg.id,time:m.time as Time,position:m.side==='bull'?'belowBar':'aboveBar',color:m.side==='bull'?'#3b82f6':m.side==='bear'?'#ef4444':'#f59e0b',shape:m.side==='bull'?'arrowUp':m.side==='bear'?'arrowDown':'circle',text:`${cfg.kind} · ${m.label}`});
       }
       continue;
     }
     if(cfg.kind==='TradingCore V Price Action'){
       const result=tradingCoreVPriceAction(data,cfg.period||5,cfg.multiplier||2,cfg.lookback||200);
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of result.levels.slice(0,12)){
         const col=x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa';
         const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:x.score>=.8?2:1,lineStyle:x.score>=.8?0:2,priceLineVisible:false,lastValueVisible:true,title:`${x.label} · ${Math.round(x.score*100)}%`});
         ss.setData([{time:start,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,ss);
       }
       for(const z of result.zones){
         const col=z.kind==='Demand'?'#3b82f6':'#ef4444';
         const st=Math.max(Number(z.startTime),Number(start));
         const outline=[{time:st as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:st as Time,value:z.upper},{time:st as Time,value:z.lower}];
         const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:z.score>=.8?2:1,lineStyle:z.mitigated?2:1,priceLineVisible:false,lastValueVisible:false,title:`${z.kind} · ${Math.round(z.score*100)}%`});
         ss.setData(outline as any);registerIndicatorSeries(cfg.id,ss);
       }
       continue;
     }
     if(cfg.kind==='Pivot Points'){const pv=classicPivots(data).length?classicPivots(data):pivots(data),start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of pv){const s=chart.current.addSeries(LineSeries,{color:cfg.color||'#f59e0b',lineWidth:cfg.lineWidth||1,lineStyle:cfg.lineStyle??2,priceLineVisible:true,lastValueVisible:true});s.setData([{time:start,value:x.value},{time:end,value:x.value}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
   }
   const markerGroups=new Map<string,any[]>(); for(const marker of chartMarkers){const id=String(marker.indicatorId||'');if(!id)continue;const arr=markerGroups.get(id)||[];arr.push(marker);markerGroups.set(id,arr);} markerDataByIndicator.current=markerGroups; setChartMarkers(chartMarkers.map(({indicatorId:_id,...marker})=>marker)); applyIndicatorAppearanceOnly();
 };
 const renderOI=(oi:OIChartAnalytics|null)=>{
   oiLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}}); oiLines.current=[];
   if(!showOI||!oi||!candle.current)return;
   const fmtOi=(n:number)=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:Math.round(n).toString();
   for(const level of oi.levels.slice(0,6)){
     const color=level.side==='resistance'?'#ef4444':'#3b82f6';
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
     const currentSpot=latestTick.current?.ltp||chain.spot||candles.current[candles.current.length-1]?.close||0;
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
     if(d.lifecycle!=='active'||!d.visible) continue;
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
     else if(d.kind==='priceRange'&&p.length>=2){const [a,b]=p;add([{time:a.time,price:a.price},{time:b.time,price:a.price},{time:b.time,price:b.price}],{color:'#3b82f6',lineWidth:2,lineStyle:0});}
     else if(d.kind==='dateRange'&&p.length>=2){const y=(lo+hi)/2;add([{time:p[0].time,price:y},{time:p[1].time,price:y}],{color:'#a78bfa',lineWidth:2,lineStyle:2});}
     else if((d.kind==='brush'||d.kind==='highlighter')&&p.length>=2)add(p,{color:d.kind==='brush'?'#f97316':'#facc15',lineWidth:d.kind==='brush'?3:6,lineStyle:0});
     else if(d.kind==='longPosition'&&p.length>=2){const [a,b]=p, risk=Math.abs(a.price-b.price);add([{time:a.time,price:a.price},{time:last,price:a.price}],{color:'#38bdf8',lineWidth:2,lineStyle:0});add([{time:a.time,price:a.price+risk*2},{time:last,price:a.price+risk*2}],{color:'#3b82f6',lineWidth:1,lineStyle:2});add([{time:a.time,price:a.price-risk},{time:last,price:a.price-risk}],{color:'#ef4444',lineWidth:1,lineStyle:2});}
     else if(d.kind==='shortPosition'&&p.length>=2){const [a,b]=p, risk=Math.abs(a.price-b.price);add([{time:a.time,price:a.price},{time:last,price:a.price}],{color:'#38bdf8',lineWidth:2,lineStyle:0});add([{time:a.time,price:a.price-risk*2},{time:last,price:a.price-risk*2}],{color:'#3b82f6',lineWidth:1,lineStyle:2});add([{time:a.time,price:a.price+risk},{time:last,price:a.price+risk}],{color:'#ef4444',lineWidth:1,lineStyle:2});}
     else if(d.kind==='measure'&&p.length>=2){const [a,b]=p;add([a,b],{color:'#f59e0b',lineWidth:2,lineStyle:2});}
     else if(d.kind==='text'&&p.length>=1){add([{time:p[0].time,price:p[0].price},{time:Math.min(last,p[0].time+Math.max(1,(last-first)*.02)),price:p[0].price}],{color:'#e5e7eb',lineWidth:2,lineStyle:0});}
   }
 };
 const commitDrawing=(tool:DrawingTool,points:DrawingPoint[],label?:string)=>{
   if(tool==='none'||tool==='crosshair'||!points.length)return;
   const definition=getCoreDrawingTool(tool as any);
   if(!definition||!definition.uiReady||!validateDrawingPoints(tool as any,points))return;
   let drawingId:string;
   try {
     drawingId=drawingApi.current.createDataDrawing(points,{kind:tool as Exclude<DrawingTool,'none'>,owner:'user',label});
   } catch { return; }
   const stored=drawingApi.current.getDrawingById(drawingId); if(!stored)return;
   drawings.current=drawingStore.current.list() as Drawing[];
   publishDrawing('drawing.created',stored);
   drawingPoints.current=[];setDrawingTool('none');drawingToolRef.current='none';
   saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings();
 };
 const clearDrawings=()=>{const count=drawingStore.current.clear('user');drawings.current=drawingStore.current.list() as Drawing[];drawingPoints.current=[];saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});if(count)coreEventBus.emit('drawing.cleared',{timestamp:Date.now(),owner:'user'});renderDrawings();};
 const selectDrawingTool=(tool:DrawingTool)=>{setDrawingTool(tool);drawingToolRef.current=tool;drawingPoints.current=[];setShowDrawingMenu(false);};
 useChartUiEvents({chart,chartIndex,timeframe,brokerId,instrumentKey:resolvedInstrumentKey,handlers:{setTimeframe:(tf)=>{if(intervals[tf])setTimeframe(tf)},toggleOI:()=>setShowOI(v=>!v),toggleDepth:()=>setShowDepth(v=>!v),toggleVolume:()=>setShowVolume(v=>!v),toggleLevels:()=>setShowLevels(v=>!v),openIndicators:()=>{setShowIndicatorMenu(true);setShowPredictionMenu(false)},togglePredictions:()=>{setShowPredictionMenu(v=>!v);setShowIndicatorMenu(false);setShowDrawingMenu(false)},toggleDrawings:()=>{setShowDrawingMenu(v=>!v);setShowIndicatorMenu(false);setShowPredictionMenu(false)},setChartType:(type)=>setChartType(type),setDrawingTool:(tool)=>{selectDrawingTool(tool as DrawingTool)},clearDrawings,undoDrawing:()=>{const before=drawingStore.current.list();if(drawingStore.current.undo()){drawings.current=drawingStore.current.list() as Drawing[];const removed=before[before.length-1];if(removed)coreEventBus.emit('drawing.deleted',{id:removed.id,owner:removed.owner,timestamp:Date.now()});saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings()}},redoDrawing:()=>{if(drawingStore.current.redo()){drawings.current=drawingStore.current.list() as Drawing[];saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings()}}}});
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
   const palette=['#38bdf8','#a78bfa','#f59e0b','#3b82f6','#ef4444','#ec4899','#2563eb','#f97316','#8b5cf6','#60a5fa','#06b6d4','#e879f9','#fb7185','#60a5fa','#60a5fa','#c084fc','#fbbf24','#60a5fa','#f472b6','#67e8f9','#fdba74','#93c5fd','#818cf8','#f0abfc','#60a5fa','#f87171','#93c5fd','#d8b4fe'];
   const styles=[0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0];
   const localId=(id:string)=>id==='production-xgboost-direction'?'xgb-direction':id==='production-lstm-sequence'?'lstm-sequence':id==='production-transformer'?'transformer-attention':id;
   let localFallback:Record<string,any>={};
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
     if(plotted&&chart.current){try{chart.current.timeScale().applyOptions({rightOffset:8});}catch{}}
     return plotted;
   };
   // Render dataset-shared native fallbacks first; the hosted ML service can
   // replace them when a trained artifact is available, without leaving the
   // chart blank. Both compute and network work are deduplicated by dataset key.
   try{
     localFallback=await chartPredictionCoordinator.runLocal(chartDatasetKey,dataRevisionRef.current,data,resolvedInstrumentKey,timeframe,ids,localId);
     if(job!==predictionJob.current)return;
     plot(null);
   }catch{}
   const production=await chartPredictionCoordinator.runProduction(chartDatasetKey,dataRevisionRef.current,data,resolvedInstrumentKey,timeframe,ids);
   if(production&&job===predictionJob.current)plot(production);
 }; const publish=(data:HistoricalCandle[],spot:number,immediate=false)=>{
   const revision=dataRevisionRef.current;
   const run=()=>{
     analyticsTimer.current=null;
     void chartComputeCoordinator.runAnalytics(chartDatasetKey,revision,data,spot).then(a=>{
       if(!lifecycle.current.isAlive()||revision!==dataRevisionRef.current||data!==candles.current)return;
       analytics.current=a;
       onAnalytics?.(a);
       window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:a}));
     });
   };
   if(immediate){if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}run();return;}
   if(analyticsTimer.current)return;
   analyticsTimer.current=setTimeout(run,200);
 };
 useEffect(()=>{if(candles.current.length&&chart.current)renderDrawings();},[selectedDrawingId]);
 useEffect(()=>{if(!host.current)return;const generation=lifecycle.current.begin();let dead=false;setError('');historyPaintedRef.current=false;let c=chart.current;
 if(!c){c=createChart(host.current,{autoSize:true,layout:(()=>{const p=getThemePalette(getCurrentTheme());return {background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:10};})(),grid:(()=>{const p=getThemePalette(getCurrentTheme());return {vertLines:{color:p.grid},horzLines:{color:p.grid}};})(),crosshair:{mode:crosshairVisible?0:2},rightPriceScale:(()=>{const p=getThemePalette(getCurrentTheme());return {borderColor:p.axis,scaleMargins:{top:.08,bottom:.2}};})(),timeScale:(()=>{const p=getThemePalette(getCurrentTheme());return {borderColor:p.axis,timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:3};})(),watermark:(()=>{const p=getThemePalette(getCurrentTheme());return {visible:true,fontSize:28,horzAlign:'center',vertAlign:'center',color:p.text+'12',text:'TRADINGCORE'};})()});chart.current=c;candle.current=c.addSeries(CandlestickSeries,candleSeriesOptions(candleAppearance) as any);closeLine.current=c.addSeries(LineSeries,{color:'#38bdf8',lineWidth:2,priceLineVisible:false,lastValueVisible:true,visible:chartType==='line'});volume.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});volume.current.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});}else{c.applyOptions({autoSize:true,crosshair:{mode:crosshairVisible?0:2}});closeLine.current?.applyOptions({visible:chartType==='line'});}
 rendererController.attach({chart:c,candle:candle.current!,closeLine:closeLine.current!,volume:volume.current!}, chartDatasetKey, chartId.current);
 // CoreSpirit's chart-output projector is required by the chart lifecycle
 // itself, not only when the user opens CoreSpirit.  Instantiate it before any
 // history/realtime work so a missing projector can never abort chart setup.
 if (!coreSpiritOutput.current) {
   coreSpiritOutput.current = new CoreSpiritChartOutputController(c, candle.current!, host.current!);
 } else {
   coreSpiritOutput.current.setHost(host.current!);
   coreSpiritOutput.current.setCandleSeries(candle.current!);
 }
 const applyChartTheme=()=>{
   if(!chart.current)return;
   const p=getThemePalette(getCurrentTheme());
   try{chart.current.applyOptions({layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis},timeScale:{borderColor:p.axis},watermark:{color:p.text+'12'}} as any);oscChart.current?.applyOptions({layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis}} as any);}catch{}
 };
 window.addEventListener('tradingcore:theme-change',applyChartTheme);

 rendererController.setChartType(chartType);
 coreSpiritOutput.current?.reset();

 const coordinateAdapter=()=>({
   timeToX:(time:number)=>Number((c.timeScale() as any).timeToCoordinate?.(time as any)),
   priceToY:(price:number)=>Number((candle.current as any)?.priceToCoordinate?.(price)),
   xToTime:(x:number)=>{const v=(c.timeScale() as any).coordinateToTime?.(x);return v==null?null:Number(v);},
   yToPrice:(y:number)=>{const v=(candle.current as any)?.coordinateToPrice?.(y);return v==null?null:Number(v);},
 });
 const onPointerDown=(event:PointerEvent)=>{
   coreSpiritChartRegistry.activate(chartId.current);
   chartDataPlane.requestWarmHistory(visibleLogicalRangeRef.current ? Math.max(1, Math.abs(Number(visibleLogicalRangeRef.current.to) - Number(visibleLogicalRangeRef.current.from))) : undefined);
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
   if(!param?.point||!candle.current)return;
   const rawTime=(c.timeScale() as any).coordinateToTime?.(param.point.x);
   const rawPrice=(candle.current as any).coordinateToPrice?.(param.point.y);
   if(rawTime==null||rawPrice==null||!Number.isFinite(Number(rawPrice)))return;
   if(tool==='none'){
     const clickedTime=Number(rawTime);
     let barIndex=-1; let distance=Number.POSITIVE_INFINITY;
     candles.current.forEach((bar:any,index:number)=>{const t=Math.floor(Date.parse(bar.timestamp)/1000); const d=Math.abs(t-clickedTime); if(d<distance){distance=d;barIndex=index;}});
     if(barIndex>=0) window.dispatchEvent(new CustomEvent('TRADINGCORE_CORESPIRIT_DEBUG_BAR',{detail:{chartIndex,symbol:resolvedInstrumentKey,timeframe,barIndex,time:clickedTime,price:Number(rawPrice)}}));
     return;
   }
   if(tool==='crosshair')return;
   const rawPoint={time:Number(rawTime),price:Number(rawPrice)};
   const snapCandidates=candles.current.slice(-250).flatMap((b:any)=>{const t=Math.floor(Date.parse(b.timestamp)/1000);return [{time:t,price:Number(b.open),kind:'ohlc' as const},{time:t,price:Number(b.high),kind:'ohlc' as const},{time:t,price:Number(b.low),kind:'ohlc' as const},{time:t,price:Number(b.close),kind:'ohlc' as const}].filter(x=>Number.isFinite(x.price));});
   const point=snapDataPoint(rawPoint,snapCandidates,coordinateAdapter(),10);
   if(['horizontal','horizontalRay','vertical'].includes(tool)){commitDrawing(tool,[point]);return;}
   if(tool==='text'){const label=window.prompt('Chart text','Text')||'';if(label)commitDrawing(tool,[point],label);return;}
   drawingPoints.current=[...drawingPoints.current,point];
   const needed=['parallelChannel','pitchfork','fibExtension'].includes(tool)?3:2;
   if(drawingPoints.current.length>=needed)commitDrawing(tool,drawingPoints.current);
 }; c.subscribeClick(onChartClick);
 const resizeObserver=typeof ResizeObserver!=='undefined'&&host.current?new ResizeObserver(()=>{if(!dead&&lifecycle.current.isCurrent(generation)){try{const r=host.current!.getBoundingClientRect();rendererController.resize(r.width,r.height);}catch{}}}):undefined;
 resizeObserver?.observe(host.current);
 let historyReady=false;
 let previousLogicalRange:any=null;
 let ignoreRangeEvents=0;
 let firstDatasetPainted=false;
 const initialVisibleBars:Record<string,number>={'1m':1125,'3m':375,'5m':225,'15m':75,'30m':45,'1H':36,'1D':30};
 const applySnapshot=(event:any)=>{
   if(dead||!lifecycle.current.isCurrent(generation))return;
   const snapshot=event?.snapshot as ChartDataPlaneSnapshot|undefined;
   if(!snapshot)return;
   latestTick.current=snapshot.latestTick;
   historyReady=snapshot.historyReady;
   setHistoryLoading(snapshot.historyLoading||snapshot.olderHistoryLoading);
   if(event.type==='status'){
     if(event.status==='loading')publishChartLifecycle('loading');
     if(event.status==='error'&&!snapshot.candles.length){
       setError(`History unavailable for ${resolvedInstrumentKey} · ${intervals[timeframe]} · ${event.error||'Historical candles unavailable'}`);
       publishChartLifecycle('error');
     }
   }
   const data=snapshot.candles;
   if(!data.length)return;
   const structuralChange=snapshot.revision!==dataRevisionRef.current || candles.current!==data;
   candles.current=data;
   if(event.type==='tick'){
     const live=data[data.length-1];
     if(live)chartUpdateScheduler.current.scheduleLatest('realtime-bar',()=>{
       const renderStarted=performance.now();
       rendererController.applyRealtimeBar(live,candleAppearanceRef.current,false);
       chartPerformanceTelemetry.recordRendererUpdate(chartMarketKey(brokerId,resolvedInstrumentKey),performance.now()-renderStarted);
     });
     if(live)calculationEngine.current.updateTick(live,data.length-1,Boolean(event.bucketChanged));
     if(!event.bucketChanged || !snapshot.historyReady)return;
   }
   if(!structuralChange && event.type==='snapshot')return;
   dataRevisionRef.current=snapshot.revision;
   setError('');
   if(event.type==='tick'){
     const hasLegacyIndicator=indicators.some(x=>x.enabled&&!isIncrementalIndicatorSupported(x.kind));
     if(hasLegacyIndicator)renderStudies(data,true);
     requestIndicatorWorker(data,undefined,'incremental',event.bucketChanged?'append':'replace');
     renderDrawings();
     publish(data,Number(latestTick.current?.ltp)||Number(data[data.length-1]?.close)||0,true);
     void renderPredictionOverlay(data);
     if(oiAnalytics.current&&Number.isFinite(Number(latestTick.current?.ltp))){
       const p=Number(latestTick.current!.ltp);const current=oiAnalytics.current;const tolerance=Math.max(analytics.current?.atr||0,1)*.18;
       const walls=current.walls.map(w=>({...w,state:w.side==='PUT'?(p<w.strike-tolerance?'MITIGATED':Math.abs(p-w.strike)<=tolerance?'TESTING':'ACTIVE'):(p>w.strike+tolerance?'MITIGATED':Math.abs(p-w.strike)<=tolerance?'TESTING':'ACTIVE')}));
       const levels=current.levels.map(l=>({...l,state:l.side==='support'?(p<l.strike-tolerance?'MITIGATED':Math.abs(p-l.strike)<=tolerance?'TESTING':'ACTIVE'):(p>l.strike+tolerance?'MITIGATED':Math.abs(p-l.strike)<=tolerance?'TESTING':'ACTIVE')}));
       const changed=walls.some((w,i)=>w.state!==current.walls[i]?.state)||levels.some((l,i)=>l.state!==current.levels[i]?.state);
       oiAnalytics.current={...current,spot:p,walls,levels};
       if(changed)renderOI(oiAnalytics.current);
     }
     return;
   }
   const paintStarted=performance.now();
   calculationEngine.current.reset(data,resolvedInstrumentKey,timeframe);
   rendererController.setHistory(data,candleAppearanceRef.current,false);
   try{renderStudies(data);requestIndicatorWorker(data);}catch(indicatorError){console.warn('[TradingCore] Shared indicator render skipped invalid data:',indicatorError);}
   renderDrawings();
   publish(data,Number(latestTick.current?.ltp)||Number(data[data.length-1]?.close)||0,true);
   void renderPredictionOverlay(data);
   if(event.reason==='cache')coreEventBus.emit('chart.telemetry',{chartId:chartId.current,symbol:resolvedInstrumentKey,timeframe,metric:'history_cache_hit',value:1,timestamp:Date.now()});
   if(!firstDatasetPainted){
     firstDatasetPainted=true; historyPaintedRef.current=true;
     coreEventBus.emit('chart.telemetry',{chartId:chartId.current,symbol:resolvedInstrumentKey,timeframe,metric:'history_to_paint_ms',value:Math.round(performance.now()-paintStarted),timestamp:Date.now()});
     coreEventBus.emit('chart.telemetry',{chartId:chartId.current,symbol:resolvedInstrumentKey,timeframe,metric:'initial_candle_count',value:data.length,timestamp:Date.now()});
     const visibleBars=Math.min(data.length,initialVisibleBars[timeframe]||60);
     if(visibleBars>1){ignoreRangeEvents=3;try{c.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-visibleBars-.5),to:data.length-.5+8});}catch{try{c.timeScale().fitContent();}catch{}}}
     else{try{c.timeScale().fitContent();}catch{}}
     previousLogicalRange=c.timeScale().getVisibleLogicalRange?.()||null; visibleLogicalRangeRef.current=previousLogicalRange;
     if(coreSpiritChartRegistry.getActive()?.chartId===chartId.current) window.setTimeout(()=>chartDataPlane.requestWarmHistory(Math.max(1,Math.abs(Number(visibleLogicalRangeRef.current?.to ?? 0)-Number(visibleLogicalRangeRef.current?.from ?? 0)))),900);
   } else if(event.reason==='older-history'){
     const added=Math.max(0,Number(event.olderAdded)||0);
     const prior=previousLogicalRange;
     const shifted=prior&&added?{from:Number(prior.from)+added,to:Number(prior.to)+added}:prior;
     ignoreRangeEvents=3;
     if(shifted&&c.timeScale().setVisibleLogicalRange){try{c.timeScale().setVisibleLogicalRange(shifted);}catch{}}
     previousLogicalRange=shifted;
     visibleLogicalRangeRef.current=shifted;
     requestIndicatorWorker(data,shifted,'snapshot','append');
   }
   publishChartLifecycle('ready');
 };
 const loadOlderHistory=async(visibleBars?:number)=>{try{await chartDataPlane.loadOlderHistory('visible',visibleBars?{visibleBars}:undefined);}catch(error){console.warn('[TradingCore] Older shared history unavailable:',error);}};
 const onVisibleLogicalRangeChange=(range:any)=>{
   if(!range)return;
   const normalizedRange={from:Number(range.from),to:Number(range.to)};
   visibleLogicalRangeRef.current=normalizedRange;
   applyIndicatorAppearanceOnly();
   requestIndicatorWorker(candles.current,normalizedRange,'snapshot','replace');
   if(ignoreRangeEvents>0){ignoreRangeEvents-=1;previousLogicalRange=normalizedRange;return;}
   const movingBackward=previousLogicalRange&&Number(range.from)<Number(previousLogicalRange.from)-2;
   previousLogicalRange=normalizedRange;
   const visibleBars=Math.max(1,Math.abs(Number(range.to)-Number(range.from)));
   if(historyReady&&movingBackward&&shouldLoadOlderHistory(normalizedRange,candles.current.length,timeframe))void loadOlderHistory(Math.min(candles.current.length,visibleBars));
 };
 c.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
 publishChartLifecycle('loading');
 const stopDataPlane=chartDataPlane.subscribe(applySnapshot);
 return()=>{try{c.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}stopDataPlane();publishChartLifecycle('disposed');lifecycle.current.invalidate();if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}try{resizeObserver?.disconnect()}catch{} window.removeEventListener('tradingcore:theme-change',applyChartTheme); chartUpdateScheduler.current.cancel();try{c.unsubscribeClick(onChartClick)}catch{} try{host.current?.removeEventListener('pointerdown',onPointerDown);host.current?.removeEventListener('pointermove',onPointerMove);host.current?.removeEventListener('pointerup',onPointerUp);host.current?.removeEventListener('pointercancel',onPointerUp)}catch{} try{markerPlugin.current?.detach?.()}catch{}markerPlugin.current=null;workerSeriesMap.current.clear();indicatorSeriesMap.current.clear();markerDataByIndicator.current.clear();predictionLines.current=[];predictionJob.current++;drawingSeries.current=[];drawingPoints.current=[];};
 },[resolvedInstrumentKey,timeframe,brokerId,chartDataPlane,chartDatasetKey]);
 useEffect(()=>()=>{try{oscChart.current?.remove()}catch{}coreSpiritOutput.current?.dispose();coreSpiritOutput.current=undefined;rendererController.detach();chart.current=undefined;oscChart.current=undefined;candle.current=undefined;closeLine.current=undefined;volume.current=undefined;indicatorSeries.current=[];indicatorSeriesMap.current.clear();markerDataByIndicator.current.clear();indicatorFillMap.current.forEach(handles=>handles.forEach(h=>{try{h.remove()}catch{}}));indicatorFillMap.current.clear();oscSeries.current=[];markerPlugin.current=null;},[]);
 const indicatorComputeKey=useMemo(()=>indicators.map(x=>buildIndicatorComputationSignature(x as unknown as Record<string,unknown>)).join('|'),[indicators]);
 const indicatorAppearanceKey=useMemo(()=>indicators.map(x=>JSON.stringify(buildIndicatorAppearanceSnapshot(x as unknown as Record<string,unknown>,{timeframe,visibleBars:appearanceVisibleBars()}))).join('|'),[indicators,timeframe,candles.current.length,visibleLogicalRangeRef.current?.from,visibleLogicalRangeRef.current?.to]);
 useEffect(()=>{if(candles.current.length&&chart.current){try{renderStudies(candles.current);requestIndicatorWorker(candles.current);}catch(indicatorError){console.warn('[TradingCore] Indicator update skipped invalid values:',indicatorError);}void renderPredictionOverlay(candles.current);}},[indicatorComputeKey,predictionModelIds.join('|')]);
 useEffect(()=>{if(candles.current.length&&chart.current)applyIndicatorAppearanceOnly();},[indicatorAppearanceKey]);
 useEffect(()=>{if(!candle.current||!showLevels||!analytics.current)return;const levels=[...analytics.current.support.slice(0,6),...analytics.current.resistance.slice(0,6)];const lines=levels.map(x=>{const broken=x.state==='BROKEN';const base=x.side==='support'?'#3b82f6':'#ef4444';return candle.current!.createPriceLine({price:x.price,color:broken?'#64748b':base,lineWidth:broken?1:Math.max(1,Math.min(3,Math.round((x.strength||.5)*3))),lineStyle:broken?2:0,axisLabelVisible:true,title:`${broken?'BROKEN · ':''}${x.side==='support'?'S':'R'}${x.strength!=null?` · ${Math.round(x.strength*100)}%`:''}`});});return()=>lines.forEach(x=>candle.current?.removePriceLine(x));},[showLevels]);
 useEffect(()=>{renderOI(oiAnalytics.current);},[showOI]);
 useEffect(()=>{if(!showOI)return;let dead=false; void refreshOI(); const id=window.setInterval(()=>{if(!dead)void refreshOI();},15000); return()=>{dead=true;window.clearInterval(id);};},[resolvedInstrumentKey,showOI,brokerId]);
 useEffect(()=>{rendererController.setVolumeVisible(showVolume);},[showVolume,rendererController]);
 const addIndicatorFromChart=(kind:IndicatorConfig['kind'])=>{
   const lib=INDICATOR_LIBRARY.find(x=>x.kind===kind); if(!lib)return;
   const schemaPatch=getIndicatorDefaultPatch({kind} as unknown as Record<string, unknown>,kind);
   const next=[...indicators,{id:`${kind.toLowerCase().replace(/\W/g,'-')}-${Date.now()}`,kind,enabled:true,...lib.defaults,...schemaPatch}];
   setIndicators(next); saveIndicators(next); setShowIndicatorMenu(false);
 };
 const patchIndicator=(id:string, patch:Partial<IndicatorConfig>)=>{const next=indicators.map(x=>x.id===id?{...x,...patch}:x);setIndicators(next);saveIndicators(next);};
 const removeIndicator=(id:string)=>{const next=indicators.filter(x=>x.id!==id);setIndicators(next);saveIndicators(next);if(editingIndicator===id)setEditingIndicator(null);};
 const automationSignals=automations.map(a=>({automation:a,signal:markerForAutomation(a,candles.current)})).filter(x=>x.signal) as any[]; const automationLines=useRef<any[]>([]);
 const viewingIndicator=indicators.find(x=>x.id===viewingIndicatorCode);
 useEffect(()=>{if(!candle.current)return;automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[];automationSignals.forEach(({automation,signal}:any)=>{const line=candle.current!.createPriceLine({price:candles.current[candles.current.length-1]?.close||0,color:signal.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:`AUTO · ${automation.name}`});automationLines.current.push(line);});return()=>{automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[]}},[automations]);
 return <div className="flex min-h-0 flex-1 flex-col">{!showEmbeddedDrawingToolbar&&(showPredictionMenu||showIndicatorMenu||showDrawingMenu)&&<div className="relative z-[10000]"><div className="absolute left-2 top-1 max-h-[72vh] w-[min(390px,calc(100vw-28px))] overflow-y-auto rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl" onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>{showPredictionMenu&&<><div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-2 pb-2"><b className="flex-1 text-[10px] uppercase tracking-widest text-[var(--tco-text-2)]">Select AI prediction models</b><button onClick={()=>setShowPredictionMenu(false)} className="text-[var(--tco-code-muted)]">✕</button></div><div className="flex gap-2 p-2"><input value={predictionQuery} onChange={e=>setPredictionQuery(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Search models…" className="min-w-0 flex-1 rounded border border-[var(--tco-control)] bg-[var(--tco-code-bg)] px-2 py-1.5 text-[10px] text-white"/><button onClick={()=>{const ids=PREDICTION_MODELS.map(m=>m.id);setPredictionModelIds(ids);savePredictionModelIds(ids)}} className="rounded border border-[var(--tco-control)] px-2 text-[9px] text-[var(--tco-text-2)]">All</button><button onClick={()=>{setPredictionModelIds([]);savePredictionModelIds([])}} className="rounded border border-[var(--tco-control)] px-2 text-[9px] text-[var(--tco-text-2)]">Clear</button></div><div className="max-h-[55vh] overflow-y-auto">{PREDICTION_MODELS.filter(m=>!predictionQuery.trim()||`${m.name} ${m.purpose} ${m.algorithm}`.toLowerCase().includes(predictionQuery.trim().toLowerCase())).map(m=>{const checked=predictionModelIds.includes(m.id);return <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-[#151b27]"><input type="checkbox" checked={checked} onChange={()=>{const next=checked?predictionModelIds.filter(x=>x!==m.id):[...predictionModelIds,m.id];setPredictionModelIds(next);savePredictionModelIds(next)}}/><span className="min-w-0 flex-1"><span className="block text-[10px] text-white">{m.name} <small className="text-[var(--tco-dim)]">{m.execution==='server'?'SERVER':'LOCAL'}</small></span><span className="block text-[9px] text-[var(--tco-code-muted)]">{m.purpose} · {m.algorithm}</span><span className="block text-[8px] leading-3 text-[var(--tco-dim)]">{m.description}</span></span></label>})}</div><div className="border-t border-[var(--tco-border)] px-2 pt-2 text-[8px] text-[var(--tco-dim)]">{predictionModelIds.length} selected · up to 39 plotted</div></>}{showIndicatorMenu&&<><div className="flex items-center border-b border-[var(--tco-border)] px-2 pb-2"><b className="flex-1 text-[10px] uppercase tracking-widest text-[var(--tco-text-2)]">Indicators</b><button onClick={()=>setShowIndicatorMenu(false)} className="text-[var(--tco-code-muted)]">✕</button></div><div className="p-2 text-[9px] text-[var(--tco-dim)]">Active indicators</div>{indicators.filter(x=>x.enabled).map(x=><div key={x.id} className="border-b border-[var(--tco-border)] last:border-0"><div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-white"><span className="flex-1">{x.kind}</span><button title="Indicator settings" onClick={()=>setEditingIndicator(editingIndicator===x.id?null:x.id)} className={`inline-flex h-6 w-6 items-center justify-center rounded ${editingIndicator===x.id?'bg-[#3b82f6]/10 text-[#60a5fa]':'text-[var(--tco-code-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}><Settings2 className="h-3.5 w-3.5"/></button><button title="View indicator code" onClick={()=>setViewingIndicatorCode(x.id)} className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--tco-code-muted)] hover:bg-[var(--tco-hover)] hover:text-white"><Code2 className="h-3.5 w-3.5"/></button><button onClick={()=>patchIndicator(x.id,{enabled:false})} className="text-[var(--tco-code-muted)]">Hide</button><button onClick={()=>removeIndicator(x.id)} className="text-[#ef4444]">Remove</button></div>{editingIndicator===x.id&&<div className="border-t border-[var(--tco-border)] px-2 py-2"><IndicatorSettingsPanel item={x} compact onChange={patch=>patchIndicator(x.id,patch)} onOpenSource={()=>setViewingIndicatorCode(x.id)}/></div>}</div>)}<div className="grid grid-cols-2 gap-1 border-t border-[var(--tco-border)] p-2">{INDICATOR_LIBRARY.map(lib=><button key={lib.kind} onClick={()=>addIndicatorFromChart(lib.kind)} className="rounded border border-[var(--tco-control)] px-2 py-1.5 text-left text-[9px] text-[var(--tco-text-2)] hover:bg-[#151b27]">{lib.kind}</button>)}</div></>}{showDrawingMenu&&<><div className="flex items-center border-b border-[var(--tco-border)] px-2 pb-2"><b className="flex-1 text-[10px] uppercase tracking-widest text-[var(--tco-text-2)]">Drawing tools</b><button onClick={()=>setShowDrawingMenu(false)} className="text-[var(--tco-code-muted)]">✕</button></div><div className="grid grid-cols-2 gap-1 p-2">{CORE_DRAWING_TOOLS.map(({kind:tool,label})=><button key={tool} onClick={()=>selectDrawingTool(tool)} className="rounded border border-[var(--tco-control)] px-2 py-1.5 text-left text-[9px] text-[var(--tco-text-2)] hover:bg-[#151b27]">{label}</button>)}</div></>}</div></div>}{showEmbeddedDrawingToolbar && <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--tco-border)] pb-2 mb-2"><span className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)] mr-1">Chart</span>{Object.keys(intervals).map(v=><button key={v} onClick={()=>setTimeframe(v)} className={`px-2 py-1 rounded border text-[10px] font-mono ${timeframe===v?'border-[#3b82f6]/60 bg-[#3b82f6]/10 text-[#3b82f6]':'border-[var(--tco-border)] text-[var(--tco-muted)]'}`}>{v}</button>)}<span className="mx-1 h-4 w-px bg-[var(--tco-border)]"/><div className="relative"><button onClick={()=>{setShowCandleSettings(v=>!v);setShowIndicatorMenu(false);setShowPredictionMenu(false);setShowDrawingMenu(false)}} className={`toolbar-pill ${showCandleSettings?'toolbar-pill-active':''}`}><Settings2 className="mr-1 inline h-3 w-3"/>Style</button>{showCandleSettings&&<div onClick={e=>e.stopPropagation()} className="absolute left-0 top-8 z-[10000] w-[340px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-3 shadow-2xl"><div className="mb-3 flex items-center gap-2 border-b border-[var(--tco-border)] pb-2"><div className="flex-1"><div className="text-[10px] font-semibold text-white">Candle appearance</div><div className="text-[8px] text-[var(--tco-dim)]">Saved per broker + symbol</div></div><button onClick={()=>setShowCandleSettings(false)} className="text-[var(--tco-dim)] hover:text-white">✕</button></div><div className="grid grid-cols-2 gap-2 text-[8px] text-[var(--tco-code-muted)]"><label>Up body<input type="color" value={candleAppearance.upBody} onChange={e=>setCandleAppearance(v=>({...v,upBody:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Down body<input type="color" value={candleAppearance.downBody} onChange={e=>setCandleAppearance(v=>({...v,downBody:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Up border<input type="color" value={candleAppearance.upBorder} onChange={e=>setCandleAppearance(v=>({...v,upBorder:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Down border<input type="color" value={candleAppearance.downBorder} onChange={e=>setCandleAppearance(v=>({...v,downBorder:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Up wick<input type="color" value={candleAppearance.upWick} onChange={e=>setCandleAppearance(v=>({...v,upWick:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Down wick<input type="color" value={candleAppearance.downWick} onChange={e=>setCandleAppearance(v=>({...v,downWick:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Up volume<input type="color" value={candleAppearance.volumeUp} onChange={e=>setCandleAppearance(v=>({...v,volumeUp:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label><label>Down volume<input type="color" value={candleAppearance.volumeDown} onChange={e=>setCandleAppearance(v=>({...v,volumeDown:e.target.value}))} className="mt-1 h-8 w-full cursor-pointer rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-0.5"/></label></div><div className="mt-3 grid grid-cols-2 gap-2 text-[8px] text-[var(--tco-text-2)]"><label className="flex items-center gap-2 rounded border border-[var(--tco-border)] px-2 py-2"><input type="checkbox" checked={candleAppearance.borderVisible} onChange={e=>setCandleAppearance(v=>({...v,borderVisible:e.target.checked}))}/>Show borders</label><label className="flex items-center gap-2 rounded border border-[var(--tco-border)] px-2 py-2"><input type="checkbox" checked={candleAppearance.wickVisible} onChange={e=>setCandleAppearance(v=>({...v,wickVisible:e.target.checked}))}/>Show wicks</label></div><div className="mt-3 flex gap-2"><button onClick={()=>setCandleAppearance(DEFAULT_CANDLE_APPEARANCE)} className="flex-1 rounded border border-[var(--tco-control)] px-2 py-1.5 text-[8px] text-[var(--tco-code-muted)] hover:text-white"><RotateCcw className="mr-1 inline h-3 w-3"/>Reset candles</button><button onClick={()=>setShowCandleSettings(false)} className="rounded border border-[#3b82f6]/40 bg-[var(--tco-surface-2)] px-3 py-1.5 text-[8px] text-[#93c5fd]">Done</button></div></div>}</div><span className="mx-1 h-4 w-px bg-[var(--tco-border)]"/><div className="relative"><button onClick={()=>{setShowIndicatorMenu(x=>!x);setEditingIndicator(null)}} className="toolbar-pill">Indicators {indicators.filter(x=>x.enabled).length}</button>{showIndicatorMenu&&<div className="absolute left-0 top-8 z-50 w-[360px] max-w-[calc(100vw-24px)] max-h-[560px] overflow-y-auto rounded-xl border border-[#2a3040] bg-[var(--tco-surface-2)] p-2 shadow-2xl"><div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Chart indicators · schema-driven settings</div><div className="mb-2 space-y-1.5">{indicators.filter(x=>x.enabled).map(x=>{const lib=INDICATOR_LIBRARY.find(l=>l.kind===x.kind);const edit=editingIndicator===x.id;return <div key={x.id} className="rounded-lg border border-[var(--tco-border)] bg-[var(--tco-code-bg)]"><div className="flex items-center gap-2 px-2 py-2"><button onClick={()=>patchIndicator(x.id,{enabled:false})} className="text-[#3b82f6]" title="Hide"><Eye className="h-3.5 w-3.5"/></button><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold text-[var(--tco-text-2)]">{x.kind}</div><div className="text-[8px] text-[var(--tco-dim)]">{lib?.overlay?'Overlay':'Pane'} · {x.source||'close'} · {x.lineWidth||2}px</div></div><button onClick={()=>setEditingIndicator(edit?null:x.id)} className={`rounded-md p-1.5 ${edit?'bg-[#3b82f6]/10 text-[#3b82f6]':'text-[var(--tco-dim)] hover:text-white'}`} title="Settings"><Settings2 className="h-3.5 w-3.5"/></button><button onClick={()=>removeIndicator(x.id)} className="rounded-md p-1.5 text-[var(--tco-dim)] hover:text-[#ef4444]" title="Remove"><Trash2 className="h-3.5 w-3.5"/></button></div>{edit&&<div className="border-t border-[var(--tco-border)] px-2.5 py-2.5"><IndicatorSettingsPanel item={x} compact onChange={patch=>patchIndicator(x.id,patch)} onOpenSource={()=>setViewingIndicatorCode(x.id)} onReset={()=>patchIndicator(x.id,getIndicatorDefaultPatch(x as Record<string, unknown>,x.kind) as Partial<IndicatorConfig>)} /></div>}</div>})}</div><div className="border-t border-[var(--tco-border)] pt-2"><div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Add indicator</div><div className="grid grid-cols-2 gap-1">{INDICATOR_LIBRARY.map(lib=><button key={lib.kind} onClick={()=>addIndicatorFromChart(lib.kind)} className="rounded-md border border-[var(--tco-border)] px-2 py-1.5 text-left text-[9px] text-[var(--tco-text-2)] hover:border-[#3b82f6]/40 hover:bg-[#3b82f6]/5"><span className="font-semibold">{lib.kind}</span><span className="block text-[8px] text-[var(--tco-dim)]">{lib.overlay?'Overlay':'Pane'}</span></button>)}</div></div></div>}</div><div className="relative"><button onClick={()=>{setShowPredictionMenu(v=>!v);setShowIndicatorMenu(false);setShowDrawingMenu(false)}} className={`toolbar-pill ${predictionModelIds.length?'toolbar-pill-active':''}`}>AI {predictionModelIds.length}</button>{showPredictionMenu&&<div onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="absolute left-0 top-full z-[10000] mt-1 w-[360px] max-w-[calc(100vw-20px)] rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl" style={{maxHeight:'min(72vh,620px)',overflowY:'scroll',overscrollBehavior:'contain',WebkitOverflowScrolling:'touch'}}><div className="sticky top-0 z-10 bg-[var(--tco-surface-2)] pb-2"><div className="flex items-center gap-2 px-2 pb-2"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)] flex-1">Prediction overlays · {predictionModelIds.length} selected · max 39 plotted</div><button onClick={()=>{setPredictionModelIds([]);savePredictionModelIds([])}} className="text-[8px] text-[var(--tco-dim)] hover:text-white">Clear</button></div><div className="flex gap-1.5 px-1"><div className="flex flex-1 items-center gap-1.5 rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] px-2"><Search className="h-3 w-3 text-[var(--tco-dim)]"/><input value={predictionQuery} onChange={e=>setPredictionQuery(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Search model…" className="w-full bg-transparent py-1.5 text-[9px] text-white outline-none"/><button onClick={()=>setPredictionQuery('')} className="text-[var(--tco-dim)]"><X className="h-3 w-3"/></button></div><button onClick={()=>{const ids=PREDICTION_MODELS.map(m=>m.id);setPredictionModelIds(ids);savePredictionModelIds(ids)}} className="rounded border border-[var(--tco-border)] px-2 text-[8px] text-[var(--tco-code-muted)]">All</button></div></div><div className="px-1 pt-1">{PREDICTION_MODELS.filter(m=>!predictionQuery.trim()||`${m.name} ${m.purpose} ${m.algorithm}`.toLowerCase().includes(predictionQuery.trim().toLowerCase())).map(m=>{const checked=predictionModelIds.includes(m.id);return <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded px-2 py-2 ${checked?'bg-[var(--tco-surface-2)]/60':'hover:bg-[var(--tco-hover)]'}`}><input type="checkbox" checked={checked} onChange={()=>{const next=checked?predictionModelIds.filter(x=>x!==m.id):[...predictionModelIds,m.id];setPredictionModelIds(next);savePredictionModelIds(next)}} className="mt-0.5"/><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[9px] text-white"><span>{m.name}</span><span className={`rounded border px-1 py-0.5 text-[7px] ${m.execution==='server'?'border-[#38bdf8]/30 text-[#38bdf8]':'border-[var(--tco-control)] text-[var(--tco-dim)]'}`}>{m.execution==='server'?'SERVER':'LOCAL'}</span>{checked&&<Check className="h-3 w-3 text-[#3b82f6]"/>}</span><span className="block text-[8px] leading-3 text-[var(--tco-dim)]">{m.purpose} · {m.algorithm.toUpperCase()}</span><span className="mt-0.5 block text-[8px] leading-3 text-[var(--tco-slate)]">{m.description}</span></span></label>})}{!PREDICTION_MODELS.some(m=>!predictionQuery.trim()||`${m.name} ${m.purpose} ${m.algorithm}`.toLowerCase().includes(predictionQuery.trim().toLowerCase()))&&<div className="px-3 py-6 text-center text-[9px] text-[var(--tco-dim)]">No prediction model matches this search.</div>}</div><div className="sticky bottom-0 mt-2 border-t border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-2 pt-2 text-[8px] leading-3 text-[var(--tco-dim)]">SERVER models use trained artifacts when ML_SERVICE_URL is configured; LOCAL models are browser-native research proxies.</div></div>}</div><div className="relative"><button onClick={()=>setShowDrawingMenu(v=>!v)} className={`toolbar-pill ${drawingTool!=='none'?'toolbar-pill-active':''}`}><Pencil className="mr-1 inline h-3 w-3"/>Draw</button>{showDrawingMenu&&<div className="absolute left-0 top-full z-[10000] mt-1 w-48 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)] p-2 shadow-2xl"><div className="px-2 pb-1.5 text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Drawing tools</div>{CORE_DRAWING_TOOLS.map(({kind:tool,label})=><button key={tool} onClick={()=>selectDrawingTool(tool)} className="block w-full rounded px-2 py-1.5 text-left text-[9px] text-[var(--tco-text-2)] hover:bg-[var(--tco-hover)]">{label}</button>)}<button onClick={clearDrawings} className="mt-1 block w-full rounded border-t border-[var(--tco-border)] px-2 py-1.5 pt-2 text-left text-[9px] text-[#ef4444]">Clear drawings</button></div>}</div><button onClick={()=>setShowLevels(x=>!x)} className={`toolbar-pill ${showLevels?'toolbar-pill-active':''}`}>Levels</button><button onClick={()=>setShowOI(x=>!x)} className={`toolbar-pill ${showOI?'toolbar-pill-active':''}`}>OI</button><button onClick={()=>setShowDepth(x=>!x)} className={`toolbar-pill ${showDepth?'toolbar-pill-active':''}`}>L2</button><button onClick={()=>setShowVolume(x=>!x)} className={`toolbar-pill ${showVolume?'toolbar-pill-active-blue':''}`}>Volume</button><span className="ml-auto text-[9px] font-mono text-[var(--tco-dim)]">{indicators.filter(x=>x.enabled).length} indicators · {automations.filter(x=>x.enabled).length} automations</span></div>} <ChartDepthPanel brokerId={brokerId} instrumentKey={resolvedInstrumentKey} visible={showDepth} /><div className="flex items-center justify-between px-1 pb-2 text-[10px] font-mono"><span className="text-[var(--tco-dim)]">Normalized broker candles · native indicator engine</span><span className="text-[#3b82f6]">● LIVE ENGINE</span>{showOI&&oiAnalytics.current&&<span className="ml-2 text-[#a78bfa]">OI · PCR {oiAnalytics.current.pcr.toFixed(2)} · FLIP {oiAnalytics.current.flip?.strike??'—'}</span>}</div>{error?<div className="flex-1 min-h-[360px] items-center justify-center flex rounded-xl border border-[#ef4444]/20 bg-[var(--tco-surface)] text-xs text-[#ef4444]">{error}</div>:<><div className="relative min-h-[430px] flex-1 rounded-xl overflow-hidden border border-[var(--tco-border)]">
  {showEmbeddedDrawingToolbar && <ChartToolbar activeTool={drawingTool} onSelectTool={(tool) => selectDrawingTool(tool as DrawingTool)} onUndo={() => { const before=drawingStore.current.list(); if(drawingStore.current.undo()){ drawings.current=drawingStore.current.list() as Drawing[]; const removed=before[before.length-1]; if(removed)coreEventBus.emit('drawing.deleted',{id:removed.id,owner:removed.owner,timestamp:Date.now()}); saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth}); renderDrawings(); } }} onClear={clearDrawings} />}
  <div className="absolute right-1 top-2 z-30 flex w-10 flex-col items-center gap-1 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 p-1 shadow-2xl backdrop-blur">
    <button title="CoreSpirit Editor" onClick={openCoreSpirit} className={`flex h-8 w-8 items-center justify-center rounded ${coreSpiritOpen?'bg-[#3b82f6]/20 text-[#93c5fd]':'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}><Code2 size={15}/></button>
  </div>
  {coreSpiritOpen && <div className="absolute right-12 top-2 z-50 w-[min(520px,calc(100% - 70px))] overflow-hidden rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-blue)] shadow-2xl">
    <div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-3 py-2"><div className="flex-1"><div className="text-[10px] font-mono font-bold text-white">CoreSpirit Editor</div><div className="text-[8px] text-[var(--tco-dim)]">{resolvedInstrumentKey} · {timeframe}</div></div><button onClick={()=>setCoreSpiritOpen(false)} className="text-[var(--tco-dim)] hover:text-white">×</button></div>
    <textarea value={coreSpiritSource} onChange={e=>{setCoreSpiritSource(e.target.value);setCoreSpiritStatus('Editing')}} spellCheck={false} className="h-[300px] w-full resize-none bg-[var(--tco-code-bg-deep)] p-3 font-mono text-[11px] leading-5 text-[var(--tco-code-text)] outline-none" />
    <div className="flex items-center gap-2 border-t border-[var(--tco-border)] px-3 py-2"><button onClick={compileCoreSpirit} className="inline-flex items-center gap-1 rounded border border-[var(--tco-control)] px-2 py-1 text-[9px] text-[var(--tco-text-2)]"><Play size={11}/> Compile</button><button onClick={deployCoreSpirit} className="inline-flex items-center gap-1 rounded border border-[#3b82f6]/40 bg-[var(--tco-surface-2)] px-2 py-1 text-[9px] text-[#93c5fd]"><Zap size={11}/> Deploy to chart</button><span className="ml-auto text-[8px] text-[var(--tco-dim)]">{coreSpiritStatus}</span></div>
    {coreSpiritDiagnostics.length>0 && <div className="max-h-24 overflow-auto border-t border-[var(--tco-border)] px-3 py-2 text-[8px] font-mono text-[#f59e0b]">{coreSpiritDiagnostics.map((d,i)=><div key={i}>{d}</div>)}</div>}
  </div>}{historyLoading&&<div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2"><div className="flex items-center gap-2 rounded-full border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 px-3 py-1.5 font-mono text-[9px] text-[var(--tco-text-2)] shadow-xl backdrop-blur"><span className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--tco-slate)] border-t-[#3b82f6]"/>Loading more history…</div></div>}
</div>{oscillatorKinds(indicators)&&<div ref={oscHost} className="mt-2 h-32 rounded-xl overflow-hidden border border-[var(--tco-border)]"/>}</>}{viewingIndicator&&<IndicatorCodeViewer item={viewingIndicator} onClose={()=>setViewingIndicatorCode(null)}/>}</div>;
});
