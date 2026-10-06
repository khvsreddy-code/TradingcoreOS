import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChartLifecycle } from '../../services/core/chart/chartLifecycle';
import { ChartUpdateScheduler } from '../../services/core/chart/chartUpdateScheduler';
import { RealtimeCalculationEngine } from '../../services/core/calculation/realtimeCalculationEngine';
import { createVelaNativeChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from '../../services/core/chart/velaNativeChartKernel';
import { CoreSpiritChartOutputController } from '../../services/coreSpirit/chartOutputController';
import { CoreSpiritStore } from '../../services/coreSpirit/CoreSpiritStore';
import { createChartCoreSpiritController } from '../../services/core/chart/controllers/ChartCoreSpiritController';
import { createChartDataController } from '../../services/core/chart/controllers/ChartDataController';
import { createChartDrawingController } from '../../services/core/chart/controllers/ChartDrawingController';
import { createChartIndicatorController } from '../../services/core/chart/controllers/ChartIndicatorController';
import { createChartPredictionController } from '../../services/core/chart/controllers/ChartPredictionController';
import { createChartRealtimeController } from '../../services/core/chart/controllers/ChartRealtimeController';
import { ChartStore } from '../../services/core/chart/ChartStore';
import { normalizeCoreDrawings } from '../../services/core/drawing/coreDrawing';
import type { CoreDrawing } from '../../services/core/drawing/coreDrawing';
import { hitTestDrawings, moveDrawingHandle, snapDataPoint } from '../../services/core/drawing/drawingGeometry';
import { coreEventBus } from '../../services/core/event/eventBus';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import type { NormalizedMarketTick } from '../../types/market';
import type { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { ChartDepthPanel } from './ChartDepthPanel';
import { ChartShell } from './ChartShell';
import { ChartOverlay } from './ChartOverlay';
import { ChartToolbar } from './ChartToolbar';
import type { DrawingTool } from './drawingTypes';
import { useChartLifecycle } from './hooks/useChartLifecycle';
import { CHART_TIMEFRAME_INTERVALS, CHART_TIMEFRAME_SECONDS, chartDataPlaneKey, getChartDataPlane, shouldLoadOlderHistory, type ChartDataPlaneSnapshot } from '../../services/marketData/chartDataPlane';
import type { ChartAnalytics } from '../../services/marketData/levelEngine';
import { chartComputeCoordinator } from '../../services/marketData/chartComputeCoordinator';
import { chartMarketKey } from '../../services/marketData/chartMarketStore';
import { isIncrementalIndicatorSupported } from '../../services/marketData/incrementalIndicatorEngine';
import { getIndicators, saveIndicators, getAutomations, type AutomationConfig, type IndicatorConfig, INDICATOR_LIBRARY, series, vwap, rsi, donchian, supertrend, indianKeyLevels, cpr, bollinger } from '../../services/marketData/indicatorEngine';
import { buildOIChartAnalytics, type OIChartAnalytics, type OIWallState } from '../../services/marketData/oiEngine';
import { buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot, getIndicatorDefaultPatch } from '../../services/coreSpirit/indicatorSettingsSchema';
import { CandleAppearance, DEFAULT_CANDLE_APPEARANCE, candleSeriesOptions, loadCandleAppearance, saveCandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { getCurrentTheme, getThemePalette } from '../../theme/theme';
import { getSavedPredictionModelIds, savePredictionModelIds } from '../../services/predictionEngine';

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
 if(pipe){const exchange=pipe[1].toUpperCase(),segment=pipe[2].toUpperCase(),ticker=pipe[3];if(segment==='CM'&&!/-(EQ|BE|SM|ST)$/i.test(ticker))return \`\${exchange}:\${ticker}-EQ\`;return \`\${exchange}:\${ticker}\`;}
 if(!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return \`NSE:\${value}\`;
 if(/^NSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return \`\${value}-EQ\`;
 if(/^BSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return \`\${value}-EQ\`;
 return value;
};
const intervals=CHART_TIMEFRAME_INTERVALS;
const chartStateKey=(brokerId:string,instrumentKey:string)=>\`tradingcore:chart-state:\${brokerId}:\${encodeURIComponent(instrumentKey)}\`;
type PersistedChartState={version:2;timeframe:string;drawings:CoreDrawing[];showLevels?:boolean;showVolume?:boolean;showOI?:boolean;showDepth?:boolean};
function loadChartState(brokerId:string,instrumentKey:string):PersistedChartState{
 try{
  const raw=localStorage.getItem(chartStateKey(brokerId,instrumentKey));const x=raw?JSON.parse(raw):null;
  if(x&&typeof x==='object'){const drawings=normalizeCoreDrawings(x.drawings,'user');return{version:2,timeframe:typeof x.timeframe==='string'&&intervals[x.timeframe]?x.timeframe:'5m',drawings,showLevels:Boolean(x.showLevels),showVolume:Boolean(x.showVolume),showOI:Boolean(x.showOI),showDepth:Boolean(x.showDepth)};}
 }catch{}
 return{version:2,timeframe:'5m',drawings:[]};
}

function markerForAutomation(a:AutomationConfig,c:HistoricalCandle[]):{time:number;position:'aboveBar'|'belowBar';color:string;shape:'arrowUp'|'arrowDown';text:string}|null{
 if(!a.enabled||a.mode==='Off'||c.length<3)return null;
 const last=c[c.length-1],prev=c[c.length-2],time=Math.floor(new Date(last.timestamp).getTime()/1000);
 if(a.kind==='VWAP_RECLAIM'){const w=vwap(c,'hlc3');if(w.length<2)return null;const pv=w[w.length-2].value,cv=w[w.length-1].value;if(prev.close<=pv&&last.close>cv)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'VWAP BUY'};if(prev.close>=pv&&last.close<cv)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'VWAP SELL'};}
 if(a.kind==='EMA_CROSS'){const fast=series(c,'EMA',{id:a.id,kind:'EMA',period:a.fast||9,enabled:true}),slow=series(c,'EMA',{id:a.id,kind:'EMA',period:a.slow||21,enabled:true});if(fast.length>1&&slow.length>1){const f0=fast[fast.length-2].value,s0=slow[slow.length-2].value,f1=fast[fast.length-1].value,s1=slow[slow.length-1].value;if(f0<=s0&&f1>s1)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'EMA BUY'};if(f0>=s0&&f1<s1)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'EMA SELL'};}}
 if(a.kind==='OPENING_RANGE'){const day=new Date(last.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),today=c.filter(x=>new Date(x.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})===day),opening=today.slice(0,Math.max(1,Math.round(900/300)));if(opening.length&&today.length>opening.length){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(prev.close<=hi&&last.close>hi)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'OR BUY'};if(prev.close>=lo&&last.close<lo)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'OR SELL'};}}
 if(a.kind==='RSI_REVERSAL'){const pts=rsi(c,a.period||14);if(pts.length>=2){const r0=pts[pts.length-2].value,r1=pts[pts.length-1].value;if(r0<=30&&r1>30)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'RSI BUY'};if(r0>=70&&r1<70)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'RSI SELL'};}}
 if(a.kind==='DONCHIAN_BREAKOUT'){const ch=donchian(c,a.period||20);if(ch.length>=2){const p0=ch[ch.length-2],p1=ch[ch.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BREAKOUT BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BREAKOUT SELL'};}}
 if(a.kind==='SUPERTREND_FLIP'){const st=supertrend(c,a.period||10);if(st.length>=2){const p0=st[st.length-2],p1=st[st.length-1];if(p0.direction<0&&p1.direction>0)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'ST BUY'};if(p0.direction>0&&p1.direction<0)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'ST SELL'};}}
 if(a.kind==='PDH_PDL_SWEEP'){const lv=indianKeyLevels(c);const pdh=lv.find(x=>x.label==='PDH'),pdl=lv.find(x=>x.label==='PDL');if(pdh&&prev.high>pdh.price&&last.close<pdh.price)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'PDH SWEEP'};if(pdl&&prev.low<pdl.price&&last.close>pdl.price)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'PDL SWEEP'};}
 if(a.kind==='CPR_BREAKOUT'){const lv=cpr(c);const tc=lv.find(x=>x.label==='CPR TC'),bc=lv.find(x=>x.label==='CPR BC');if(tc&&prev.close<=tc.price&&last.close>tc.price)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'CPR BUY'};if(bc&&prev.close>=bc.price&&last.close<bc.price)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'CPR SELL'};}
 if(a.kind==='BOLLINGER_BREAKOUT'){const bb=bollinger(c,a.period||20,a.multiplier||2);if(bb.length>=2){const p0=bb[bb.length-2],p1=bb[bb.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BB BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BB SELL'};}}
 return null;
}
type Props={instrumentKey:string;brokerId?:string;onAnalytics?:(a:ChartAnalytics)=>void;levelsRequest?:number;chartIndex?:number;showEmbeddedDrawingToolbar?:boolean};
export const LiveChart = memo(function LiveChart({instrumentKey,brokerId='unknown',onAnalytics,levelsRequest,chartIndex,showEmbeddedDrawingToolbar=true}:Props){
  const resolvedInstrumentKey=canonicalInstrumentKey(brokerId,instrumentKey);
  const rendererController=useChartLifecycle();

  const host=useRef<HTMLDivElement>(null);
  const oscHost=useRef<HTMLDivElement>(null);
  const chart=useRef<IChartApi|null>(null);
  const oscChart=useRef<IChartApi|null>(null);
  const candle=useRef<ISeriesApi<'Candlestick'>|null>(null);
  const closeLine=useRef<ISeriesApi<'Line'>|null>(null);
  const volume=useRef<ISeriesApi<'Histogram'>|null>(null);
  const candles=useRef<HistoricalCandle[]>([]);
  const latestTick=useRef<NormalizedMarketTick|undefined>(undefined);
  const visibleLogicalRangeRef=useRef<{from:number;to:number}|null>(null);
  const lifecycle=useRef(new ChartLifecycle());
  const chartUpdateScheduler=useRef(new ChartUpdateScheduler());
  const calculationEngine=useRef(new RealtimeCalculationEngine());
  const chartId=useRef(\`chart-\${Math.random().toString(36).slice(2,10)}\`);
  const dataRevisionRef=useRef(0);
  const indicatorRequestSeq=useRef(0);
  const predictionJob=useRef(0);
  const predictionLines=useRef<any[]>([]);
  const coreSpiritOutput=useRef<CoreSpiritChartOutputController|null>(null);
  const coreSpiritRunId=useRef(0);
  const chartStore=useMemo(()=>new ChartStore(),[]);
  const coreSpiritStore=useMemo(()=>new CoreSpiritStore(),[]);
  const coreSpiritState=useSyncExternalStore(
    listener=>coreSpiritStore.subscribe(listener),
    ()=>coreSpiritStore.getSnapshot(),
    ()=>coreSpiritStore.getSnapshot(),
  );

  const persistedChart=useMemo(()=>loadChartState(brokerId,resolvedInstrumentKey),[brokerId,resolvedInstrumentKey]);
  const [selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null);
  const [timeframe,setTimeframe]=useState(persistedChart.timeframe);
  const [drawingTool,setDrawingTool]=useState<DrawingTool>('none');
  const [crosshairVisible,setCrosshairVisible]=useState(true);
  const [showLevels,setShowLevels]=useState(persistedChart.showLevels??false);
  const [showVolume,setShowVolume]=useState(persistedChart.showVolume??false);
  const [showOI,setShowOI]=useState(persistedChart.showOI??false);
  const [showDepth,setShowDepth]=useState(persistedChart.showDepth??false);
  const [showIndicatorMenu,setShowIndicatorMenu]=useState(false);
  const [showPredictionMenu,setShowPredictionMenu]=useState(false);
  const [showDrawingMenu,setShowDrawingMenu]=useState(false);
  const [showCandleSettings,setShowCandleSettings]=useState(false);
  const [editingIndicator,setEditingIndicator]=useState<string|null>(null);
  const [viewingIndicatorCode,setViewingIndicatorCode]=useState<string|null>(null);
  const [indicators,setIndicators]=useState<IndicatorConfig[]>(getIndicators);
  const [automations,setAutomations]=useState<AutomationConfig[]>(getAutomations);
  const [predictionModelIds,setPredictionModelIds]=useState<string[]>(getSavedPredictionModelIds());
  const [predictionQuery,setPredictionQuery]=useState('');
  const [chartType,setChartType]=useState<'candlestick'|'line'>('candlestick');
  const [error,setError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(false);
  const [candleAppearance,setCandleAppearance]=useState<CandleAppearance>(()=>loadCandleAppearance(brokerId,resolvedInstrumentKey));
  const [oiAnalytics,setOiAnalytics]=useState<OIChartAnalytics|null>(null);
  const [analytics,setAnalytics]=useState<ChartAnalytics|null>(null);
  const analyticsUiTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const oiUiTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const chartDataPlane=useMemo(()=>getChartDataPlane(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);
  const chartDatasetKey=useMemo(()=>chartDataPlaneKey(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);

  const indicatorsRef=useRef(indicators); indicatorsRef.current=indicators;
  const selectedDrawingIdRef=useRef<string|null>(null); selectedDrawingIdRef.current=selectedDrawingId;
  const viewStateRef=useRef({showLevels,showVolume,showOI,showDepth}); viewStateRef.current={showLevels,showVolume,showOI,showDepth};
  const predictionIdsRef=useRef(predictionModelIds); predictionIdsRef.current=predictionModelIds;
  const automationsRef=useRef(automations); automationsRef.current=automations;
  const appearanceRef=useRef(candleAppearance); appearanceRef.current=candleAppearance;
  const drawingControllerRef=useRef<ReturnType<typeof createChartDrawingController>|null>(null);
  const dataControllerRef=useRef<ReturnType<typeof createChartDataController>|null>(null);
  const indicatorControllerRef=useRef<ReturnType<typeof createChartIndicatorController>|null>(null);
  const predictionControllerRef=useRef<ReturnType<typeof createChartPredictionController>|null>(null);
  const coreSpiritControllerRef=useRef<ReturnType<typeof createChartCoreSpiritController>|null>(null);
  const realtimeControllerRef=useRef<ReturnType<typeof createChartRealtimeController>|null>(null);
  const drawingToolRef=useRef<DrawingTool>('none');
  const oiAnalyticsRef=useRef<OIChartAnalytics|null>(null);
  const analyticsRef=useRef<ChartAnalytics|null>(null);
  const analyticsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const applyViewState=()=>{
    try{localStorage.setItem(chartStateKey(brokerId,resolvedInstrumentKey),JSON.stringify({version:2,timeframe,drawings:drawingControllerRef.current?.getDrawings?.()||persistedChart.drawings,showLevels,showVolume,showOI,showDepth}));}catch{}
  };

  useEffect(()=>{drawingToolRef.current=drawingTool;},[drawingTool]);
  useEffect(()=>{rendererController.setChartType(chartType);},[chartType,rendererController]);
  useEffect(()=>{saveCandleAppearance(brokerId,resolvedInstrumentKey,candleAppearance);rendererController.setCandleAppearance(candleAppearance);if(candles.current.length&&volume.current){volume.current.setData(candles.current.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000),value:Number(x.volume)||0,color:volumeColor(candleAppearance,Number(x.open),Number(x.close))})));}},[candleAppearance,brokerId,resolvedInstrumentKey,rendererController]);
  useEffect(()=>{if(levelsRequest!=null)setShowLevels(true);},[levelsRequest]);
  useEffect(()=>{applyViewState();},[timeframe,showLevels,showVolume,showOI,showDepth,brokerId,resolvedInstrumentKey]);

  useEffect(()=>{
    const onCrosshair=(e:Event)=>{const d=(e as CustomEvent).detail||{};if(d.chartIndex!=null&&d.chartIndex!==chartIndex)return;setCrosshairVisible(Boolean(d.visible));try{chart.current?.applyOptions({crosshair:{mode:d.visible?0:2}} as any);}catch{}};
    window.addEventListener('TRADINGCORE_CROSSHAIR',onCrosshair);
    return()=>window.removeEventListener('TRADINGCORE_CROSSHAIR',onCrosshair);
  },[chartIndex]);

  useEffect(()=>{
    const onIndicators=(e:Event)=>setIndicators((e as CustomEvent<IndicatorConfig[]>).detail||getIndicators());
    const onAutomations=(e:Event)=>setAutomations((e as CustomEvent<AutomationConfig[]>).detail||getAutomations());
    const onPredictions=(e:Event)=>{const next=(e as CustomEvent<string[]>).detail||getSavedPredictionModelIds();setPredictionModelIds(next);};
    window.addEventListener('tradingcore:indicators',onIndicators);
    window.addEventListener('tradingcore:automations',onAutomations);
    window.addEventListener('tradingcore:prediction-models-changed',onPredictions);
    return()=>{window.removeEventListener('tradingcore:indicators',onIndicators);window.removeEventListener('tradingcore:automations',onAutomations);window.removeEventListener('tradingcore:prediction-models-changed',onPredictions);};
  },[]);

  const publishAnalytics=(data:HistoricalCandle[],spot:number,immediate=false)=>{
    const revision=dataRevisionRef.current;
    const run=()=>{analyticsTimer.current=null;void chartComputeCoordinator.runAnalytics(chartDatasetKey,revision,chartDataPlane.readCanonical(),spot,data).then(result=>{
      if(revision!==dataRevisionRef.current||data!==candles.current||!lifecycle.current.isAlive())return;
      analyticsRef.current=result;chartStore.setAnalytics(result);window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:result}));
      if(analyticsUiTimer.current==null){analyticsUiTimer.current=setTimeout(()=>{analyticsUiTimer.current=null;setAnalytics(result);onAnalytics?.(result);},250);}
    });};
    if(immediate){if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}run();return;}
    if(analyticsTimer.current)return;
    analyticsTimer.current=setTimeout(run,200);
  };

  const renderOI=(oi:OIChartAnalytics|null)=>{
    oiAnalyticsRef.current=oi; chartStore.setOiAnalytics(oi);
    if(oiUiTimer.current==null){oiUiTimer.current=setTimeout(()=>{oiUiTimer.current=null;setOiAnalytics(oi);},250);}
    if(!candle.current)return;
    try{for(const line of ((candle.current as any)._tcoOiLines||[]))candle.current.removePriceLine(line);}catch{}
    if(!showOI||!oi)return;
    const fmtOi=(n:number)=>n>=1000000?\`\${(n/1000000).toFixed(1)}M\`:n>=1000?\`\${(n/1000).toFixed(0)}K\`:Math.round(n).toString();
    const lines:any[]=[];
    for(const level of oi.levels.slice(0,6)){
      const color=level.side==='resistance'?'#ef4444':'#3b82f6';const faded=level.state==='MITIGATED';
      lines.push(candle.current.createPriceLine({price:level.strike,color:faded?\`\${color}44\`:color,lineWidth:faded?1:level.width,lineStyle:faded?2:level.state==='TESTING'?1:0,axisLabelVisible:true,lastValueVisible:true,title:\`\${level.label} · \${fmtOi(level.oi)} · Δ \${level.deltaOi>=0?'+':''}\${fmtOi(Math.abs(level.deltaOi))}\${level.distanceStrikes?\` · \${level.distanceStrikes} str\`:''}\`}));
    }
    if(oi.maxPain)lines.push(candle.current.createPriceLine({price:oi.maxPain,color:'#f59e0b',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'MAX PAIN'}));
    if(oi.flip)lines.push(candle.current.createPriceLine({price:oi.flip.strike,color:'#a78bfa',lineWidth:2,lineStyle:1,axisLabelVisible:true,title:\`OI FLIP · \${oi.flip.direction==='PUT_DOMINANT'?'PUT':'CALL'}\`}));
    try{(candle.current as any)._tcoOiLines=lines;}catch{}
  };

  const refreshOI=async()=>{
    if(!showOI)return;
    try{
      const chain=await tradingCoreRuntime.getOptionChain(resolvedInstrumentKey);
      const spot=Number(latestTick.current?.ltp)||Number(chain.spot)||Number(candles.current[candles.current.length-1]?.close)||0;
      const signature=(chain.contracts||[]).map((c:any)=>\`\${c.strike}:\${c.call?.oi||0}:\${c.call?.previousOi||0}:\${c.put?.oi||0}:\${c.put?.previousOi||0}\`).join('|');
      const current=oiAnalyticsRef.current;
      if(current&& (current as any)._signature===signature){renderOI({...current,spot,updatedAt:new Date().toISOString()});return;}
      const oi=buildOIChartAnalytics(chain,spot,analyticsRef.current?.atr||0) as OIChartAnalytics;
      (oi as any)._signature=signature;
      renderOI(oi);
      window.dispatchEvent(new CustomEvent('tradingcore:oi-analytics',{detail:oi}));
    }catch{}
  };

  useEffect(()=>{if(showOI){void refreshOI();const id=window.setInterval(()=>void refreshOI(),15000);return()=>window.clearInterval(id);}renderOI(null);return undefined;},[showOI,resolvedInstrumentKey,brokerId]);

  const addIndicatorFromChart=(kind:IndicatorConfig['kind'])=>{
    const lib=INDICATOR_LIBRARY.find(x=>x.kind===kind);if(!lib)return;
    const patch=getIndicatorDefaultPatch({kind} as unknown as Record<string,unknown>,kind);
    const next=[...indicatorsRef.current,{id:\`\${kind.toLowerCase().replace(/\W/g,'-')}-\${Date.now()}\`,kind,enabled:true,...lib.defaults,...patch}];
    setIndicators(next);saveIndicators(next);setShowIndicatorMenu(false);
  };
  const patchIndicator=(id:string,patch:Partial<IndicatorConfig>)=>{const next=indicatorsRef.current.map(x=>x.id===id?{...x,...patch}:x);setIndicators(next);saveIndicators(next);};
  const removeIndicator=(id:string)=>{const next=indicatorsRef.current.filter(x=>x.id!==id);setIndicators(next);saveIndicators(next);if(editingIndicator===id)setEditingIndicator(null);};

  const selectDrawingTool=(tool:DrawingTool)=>{drawingControllerRef.current?.selectDrawingTool(tool);setDrawingTool(tool);setShowDrawingMenu(false);};
  const clearDrawings=()=>drawingControllerRef.current?.clearDrawings();
  const undoDrawing=()=>{const controller=drawingControllerRef.current;if(!controller)return;const before=controller.getDrawings();if(controller.store.undo()){const removed=before[before.length-1];if(removed)coreEventBus.emit('drawing.deleted',{id:removed.id,owner:removed.owner,timestamp:Date.now()});controller.save();controller.renderDrawings();setSelectedDrawingId(null);}};
  const openCoreSpirit=()=>{coreSpiritStore.setOpen(true);coreSpiritControllerRef.current?.open();};
  const closeCoreSpirit=()=>coreSpiritStore.setOpen(false);
  const setCoreSpiritSource=(source:string)=>coreSpiritStore.setSource(source);
  const compileCoreSpirit=()=>{void coreSpiritControllerRef.current?.compile();};
  const deployCoreSpirit=()=>{void coreSpiritControllerRef.current?.deploy();};

  useEffect(()=>{
    indicatorControllerRef.current?.setInputs({indicators,timeframe});
    predictionControllerRef.current?.setInputs({predictionModelIds,chartDatasetKey,resolvedInstrumentKey,timeframe});
  },[indicators,timeframe,predictionModelIds,chartDatasetKey,resolvedInstrumentKey]);

  const drawingInitial=useMemo(()=>persistedChart.drawings,[persistedChart]);

  useEffect(()=>{
    if(!host.current)return;
    const generation=lifecycle.current.begin();
    let dead=false;
    const c=chart.current||createVelaNativeChart(host.current,{autoSize:true,layout:(()=>{const p=getThemePalette(getCurrentTheme());return {background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:10};})(),grid:(()=>{const p=getThemePalette(getCurrentTheme());return {vertLines:{color:p.grid},horzLines:{color:p.grid}};})(),crosshair:{mode:crosshairVisible?0:2},rightPriceScale:(()=>{const p=getThemePalette(getCurrentTheme());return {borderColor:p.axis,scaleMargins:{top:.08,bottom:.2}};})(),timeScale:(()=>{const p=getThemePalette(getCurrentTheme());return {borderColor:p.axis,timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:3};})(),watermark:(()=>{const p=getThemePalette(getCurrentTheme());return {visible:true,fontSize:28,horzAlign:'center',vertAlign:'center',color:p.text+'12',text:'TRADINGCORE'};})()});
    chart.current=c;
    if(!candle.current)candle.current=c.addSeries(CandlestickSeries,candleSeriesOptions(candleAppearance) as any);
    if(!closeLine.current)closeLine.current=c.addSeries(LineSeries,{color:'#38bdf8',lineWidth:2,priceLineVisible:false,lastValueVisible:true,visible:chartType==='line'});
    if(!volume.current)volume.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});
    volume.current?.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
    c.applyOptions({crosshair:{mode:crosshairVisible?0:2} as any});
    closeLine.current?.applyOptions({visible:chartType==='line'});
    rendererController.attach({chart:c,candle:candle.current!,closeLine:closeLine.current!,volume:volume.current!},chartDatasetKey,chartId.current);

    const chartDataController=createChartDataController({key:chartDatasetKey,plane:chartDataPlane,chartStore});
    const chartIndicatorController=createChartIndicatorController({chart,oscChart,oscHost,candle,oscSeries:{current:[]},candles,visibleLogicalRangeRef,chartDataPlane,chartDatasetKey,dataRevisionRef,indicatorRequestSeq,lifecycle,chartUpdateScheduler,indicators:indicatorsRef.current,timeframe});
    const chartDrawingController=createChartDrawingController({chart,candles,brokerId,instrumentKey:resolvedInstrumentKey,timeframe,getViewState:()=>viewStateRef.current,initialDrawings:drawingInitial,getSelectedDrawingId:()=>selectedDrawingIdRef.current,onToolChange:setDrawingTool});
    const chartPredictionController=createChartPredictionController({chart,candles,predictionLines,predictionJob,predictionModelIds:predictionIdsRef.current,chartDatasetKey,dataRevisionRef,resolvedInstrumentKey,timeframe});
    const chartCoreSpiritController=createChartCoreSpiritController({chartId:chartId.current,chart,candle,host,candles,coreSpiritOutput,coreSpiritRunId,resolvedInstrumentKey,timeframe,store:coreSpiritStore,publishLifecycle:(state)=>coreEventBus.emit('chart.lifecycle',{chartId:chartId.current,state,timestamp:Date.now()})});
    indicatorControllerRef.current=chartIndicatorController;
    drawingControllerRef.current=chartDrawingController;
    predictionControllerRef.current=chartPredictionController;
    coreSpiritControllerRef.current=chartCoreSpiritController;

    chartCoreSpiritController.ensureOutput();
    const unregisterCoreSpirit=chartCoreSpiritController.register();

    const publishLifecycle=(state:'ready'|'loading'|'updating'|'error'|'recovering'|'disposed')=>{coreEventBus.emit('chart.lifecycle',{chartId:chartId.current,state,timestamp:Date.now()});chartStore.setLifecycle(state);};

    const realtimeController=createChartRealtimeController({
      chart,candle,candles,latestTick,dataRevisionRef,rendererController,chartDataPlane,chartUpdateScheduler,calculationEngine,candleAppearanceRef:appearanceRef,chartStore,
      brokerId,instrumentKey:resolvedInstrumentKey,timeframe,chartMarketKey:chartMarketKey(brokerId,resolvedInstrumentKey),
      onLegacyIndicatorTick:(data)=>{if(indicatorsRef.current.some(x=>x.enabled&&!isIncrementalIndicatorSupported(x.kind)))chartIndicatorController.renderStudies(data,true);},
      onIndicatorWorker:(data,bucketChanged)=>chartIndicatorController.requestIndicatorWorker(data,visibleLogicalRangeRef.current,'incremental',bucketChanged?'append':'replace'),
      onDrawingTick:()=>chartDrawingController.renderDrawings(),
      onPredictionTick:data=>{chartPredictionController.setInputs({predictionModelIds:predictionIdsRef.current,chartDatasetKey,resolvedInstrumentKey,timeframe});void chartPredictionController.renderPredictionOverlay(data);},
      onAnalyticsTick:(data,spot)=>publishAnalytics(data,spot,true),
      onOiTick:spot=>{const current=oiAnalyticsRef.current;if(!current)return;const tolerance=Math.max(analyticsRef.current?.atr||0,1)*.18;const walls=current.walls.map(w=>({...w,state:(w.side==='PUT'?(spot<w.strike-tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>w.strike+tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE')) as OIWallState}));const levels=current.levels.map(l=>({...l,state:(l.side==='support'?(spot<l.strike-tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>l.strike+tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE')) as OIWallState}));const next={...current,spot,walls,levels};const changed=walls.some((w,i)=>w.state!==current.walls[i]?.state)||levels.some((l,i)=>l.state!==current.levels[i]?.state);oiAnalyticsRef.current=next;if(changed)renderOI(next);},
    });
    realtimeControllerRef.current=realtimeController;

    const applySnapshot=(event:any)=>{
      if(dead||!lifecycle.current.isCurrent(generation))return;
      const snapshot=event?.snapshot as ChartDataPlaneSnapshot|undefined;if(!snapshot)return;
      latestTick.current=snapshot.latestTick;
      chartStore.publishMarketSnapshot({type:event.type,snapshot,error:event.error});
      const nextHistoryLoading=Boolean(snapshot.historyLoading||snapshot.olderHistoryLoading);setHistoryLoading(prev=>prev===nextHistoryLoading?prev:nextHistoryLoading);
      if(event.type==='status'){
        if(event.status==='loading')publishLifecycle('loading');
        if(event.status==='error'&&!snapshot.candles.length){setError(\`History unavailable for \${resolvedInstrumentKey} · \${CHART_TIMEFRAME_INTERVALS[timeframe]||timeframe} · \${event.error||'Historical candles unavailable'}\`);publishLifecycle('error');}
      }
      const data=snapshot.candles;if(!data.length)return;
      candles.current=data;dataRevisionRef.current=snapshot.revision;setError('');
      if(event.type==='tick'){
        realtimeController.handleTick(snapshot,Boolean(event.bucketChanged));
        return;
      }
      realtimeController.hydrateHistory(snapshot);
      rendererController.setHistoryFromCanonical(chartDataPlane.readCanonical(),appearanceRef.current);
      chartIndicatorController.setInputs({indicators:indicatorsRef.current,timeframe});
      try{chartIndicatorController.renderStudies(data);chartIndicatorController.requestIndicatorWorker(data);}catch(indicatorError){console.warn('[TradingCore] indicator render skipped',indicatorError);}
      chartDrawingController.renderDrawings();
      publishAnalytics(data,Number(snapshot.latestTick?.ltp)||Number(data[data.length-1]?.close)||0,true);
      chartPredictionController.setInputs({predictionModelIds:predictionIdsRef.current,chartDatasetKey,resolvedInstrumentKey,timeframe});
      void chartPredictionController.renderPredictionOverlay(data);
      if(event.reason==='cache')coreEventBus.emit('chart.telemetry',{chartId:chartId.current,symbol:resolvedInstrumentKey,timeframe,metric:'history_cache_hit',value:1,timestamp:Date.now()});
      publishLifecycle('ready');
      if(showOI)void refreshOI();
      const visibleBars=Math.min(data.length,({ '1m':1125,'3m':375,'5m':225,'15m':75,'30m':45,'1H':36,'1D':30 } as Record<string,number>)[timeframe]||60);
      try{c.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-visibleBars-.5),to:data.length-.5+8});}catch{try{c.timeScale().fitContent();}catch{}}
      visibleLogicalRangeRef.current=c.timeScale().getVisibleLogicalRange?.()||null;
      chartDataController.requestWarmHistory(visibleBars);
    };

    const previousLogicalRange={current:null as {from:number;to:number}|null};
    let ignoreRangeEvents=3;
    const onVisibleLogicalRangeChange=(range:any)=>{
      if(!range)return;
      const normalized={from:Number(range.from),to:Number(range.to)};
      visibleLogicalRangeRef.current=normalized;chartStore.setVisibleRange(normalized);
      chartIndicatorController.applyIndicatorAppearanceOnly();
      chartIndicatorController.requestIndicatorWorker(candles.current,normalized,'snapshot','replace');
      if(ignoreRangeEvents>0){ignoreRangeEvents-=1;previousLogicalRange.current=normalized;return;}
      const movingBackward=previousLogicalRange.current&&normalized.from<previousLogicalRange.current.from-2;
      previousLogicalRange.current=normalized;
      const visibleBars=Math.max(1,Math.abs(normalized.to-normalized.from));
      if(snapshotHistoryReady()&&movingBackward&&shouldLoadOlderHistory(normalized,candles.current.length,timeframe))void chartDataController.loadOlderHistory(Math.min(candles.current.length,visibleBars));
    };
    const snapshotHistoryReady=()=>chartStore.getSnapshot().historyReady;
    c.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);

    const coordinateAdapter=()=>({timeToX:(time:number)=>Number((c.timeScale() as any).timeToCoordinate?.(time as any)),priceToY:(price:number)=>Number((candle.current as any)?.priceToCoordinate?.(price)),xToTime:(x:number)=>{const value=(c.timeScale() as any).coordinateToTime?.(x);return value==null?null:Number(value);},yToPrice:(y:number)=>{const value=(candle.current as any)?.coordinateToPrice?.(y);return value==null?null:Number(value);}});
    let drawingDrag:{id:string;index:number}|null=null;
    const onPointerDown=(event:PointerEvent)=>{
      if(drawingToolRef.current!=='none'||!candle.current)return;
      const rect=host.current?.getBoundingClientRect();if(!rect)return;
      const cursor={x:event.clientX-rect.left,y:event.clientY-rect.top};
      const hit=hitTestDrawings(chartDrawingController.getDrawings(),cursor,coordinateAdapter(),9);
      setSelectedDrawingId(hit?.drawingId||null);
      if(hit?.handle){drawingDrag={id:hit.drawingId,index:hit.handle.index};host.current?.setPointerCapture?.(event.pointerId);event.preventDefault();}
    };
    const onPointerMove=(event:PointerEvent)=>{
      if(!drawingDrag)return;
      const drawing=chartDrawingController.store.get(drawingDrag.id);if(!drawing)return;
      const rect=host.current?.getBoundingClientRect();if(!rect)return;
      const moved=moveDrawingHandle(drawing,drawingDrag.index,{x:event.clientX-rect.left,y:event.clientY-rect.top},coordinateAdapter());
      if(moved){chartDrawingController.store.update(drawingDrag.id,moved);chartDrawingController.renderDrawings();}
    };
    const onPointerUp=()=>{if(!drawingDrag)return;drawingDrag=null;chartDrawingController.save();};

    const onChartClick=(param:any)=>{
      const tool=drawingToolRef.current;if(!param?.point||!candle.current)return;
      const rawTime=(c.timeScale() as any).coordinateToTime?.(param.point.x);const rawPrice=(candle.current as any).coordinateToPrice?.(param.point.y);
      if(rawTime==null||rawPrice==null||!Number.isFinite(Number(rawPrice)))return;
      if(tool==='none'){window.dispatchEvent(new CustomEvent('TRADINGCORE_CORESPIRIT_DEBUG_BAR',{detail:{chartIndex,symbol:resolvedInstrumentKey,timeframe,barIndex:-1,time:Number(rawTime),price:Number(rawPrice)}}));return;}
      if(tool==='crosshair')return;
      const snapCandidates=candles.current.slice(-250).flatMap((b:any)=>{const t=Math.floor(Date.parse(b.timestamp)/1000);return [{time:t,price:Number(b.open),kind:'ohlc' as const},{time:t,price:Number(b.high),kind:'ohlc' as const},{time:t,price:Number(b.low),kind:'ohlc' as const},{time:t,price:Number(b.close),kind:'ohlc' as const}].filter(x=>Number.isFinite(x.price));});
      const point=snapDataPoint({time:Number(rawTime),price:Number(rawPrice)},snapCandidates,coordinateAdapter(),10);
      if(['horizontal','horizontalRay','vertical'].includes(tool)){chartDrawingController.commitDrawing(tool,[point]);return;}
      if(tool==='text'){const label=window.prompt('Chart text','Text')||'';if(label)chartDrawingController.commitDrawing(tool,[point],label);return;}
      chartDrawingController.points.push(point);
      const needed=['parallelChannel','pitchfork','fibExtension'].includes(tool)?3:2;
      if(chartDrawingController.points.length>=needed)chartDrawingController.commitDrawing(tool,chartDrawingController.points);
    };
    const resizeObserver=typeof ResizeObserver!=='undefined'&&host.current?new ResizeObserver(()=>{if(!dead&&lifecycle.current.isCurrent(generation)){try{const r=host.current!.getBoundingClientRect();rendererController.resize(r.width,r.height);}catch{}}}):undefined;
    resizeObserver?.observe(host.current);
    c.subscribeClick(onChartClick);
    host.current.addEventListener('pointerdown',onPointerDown);host.current.addEventListener('pointermove',onPointerMove);host.current.addEventListener('pointerup',onPointerUp);host.current.addEventListener('pointercancel',onPointerUp);
    publishLifecycle('loading');
    const stopData=chartDataController.subscribe(applySnapshot);
    void chartDataPlane.ensureReady().catch(()=>{});
    window.addEventListener('tradingcore:theme-change',()=>{});
    return()=>{
      dead=true;
      try{c.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}
      try{c.unsubscribeClick(onChartClick)}catch{}
      host.current?.removeEventListener('pointerdown',onPointerDown);host.current?.removeEventListener('pointermove',onPointerMove);host.current?.removeEventListener('pointerup',onPointerUp);host.current?.removeEventListener('pointercancel',onPointerUp);
      stopData();chartDataController.dispose();unregisterCoreSpirit();chartCoreSpiritController.dispose();realtimeControllerRef.current=null;indicatorControllerRef.current=null;drawingControllerRef.current=null;predictionControllerRef.current=null;coreSpiritControllerRef.current=null;
      publishLifecycle('disposed');lifecycle.current.invalidate();
      if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}
      if(analyticsUiTimer.current){clearTimeout(analyticsUiTimer.current);analyticsUiTimer.current=null;}
      if(oiUiTimer.current){clearTimeout(oiUiTimer.current);oiUiTimer.current=null;}
      resizeObserver?.disconnect();chartUpdateScheduler.current.cancel();
    };
  },[resolvedInstrumentKey,timeframe,brokerId,chartDataPlane,chartDatasetKey,drawingInitial]);

  useEffect(()=>{if(candles.current.length&&chart.current)indicatorControllerRef.current?.applyIndicatorAppearanceOnly();},[indicators,timeframe]);
  useEffect(()=>{rendererController.setVolumeVisible(showVolume);},[showVolume,rendererController]);
  useEffect(()=>{if(!chart.current||!showLevels||!analyticsRef.current)return;const c=chart.current;const candleSeries=candle.current;if(!candleSeries)return;const lines=[...analyticsRef.current.support.slice(0,6),...analyticsRef.current.resistance.slice(0,6)].map(level=>{const broken=level.state==='BROKEN';const base=level.side==='support'?'#3b82f6':'#ef4444';return candleSeries.createPriceLine({price:level.price,color:broken?'#64748b':base,lineWidth:broken?1:Math.max(1,Math.min(3,Math.round((level.strength||.5)*3))),lineStyle:broken?2:0,axisLabelVisible:true,title:\`\${broken?'BROKEN · ':''}\${level.side==='support'?'S':'R'}\${level.strength!=null?\` · \${Math.round(level.strength*100)}%\`:''}\`});});return()=>lines.forEach(line=>{try{candleSeries.removePriceLine(line)}catch{}});},[showLevels,analytics]);
  const indicatorComputeKey=useMemo(()=>indicators.map(x=>buildIndicatorComputationSignature(x as unknown as Record<string,unknown>)).join('|'),[indicators]);
  useEffect(()=>{if(!candles.current.length||!chart.current)return;const controller=indicatorControllerRef.current;if(!controller)return;controller.setInputs({indicators,timeframe});controller.renderStudies(candles.current);controller.requestIndicatorWorker(candles.current);predictionControllerRef.current?.setInputs({predictionModelIds,chartDatasetKey,resolvedInstrumentKey,timeframe});void predictionControllerRef.current?.renderPredictionOverlay(candles.current);},[indicatorComputeKey,predictionModelIds.join('|'),timeframe,resolvedInstrumentKey,chartDatasetKey]);
  const indicatorAppearanceKey=useMemo(()=>indicators.map(x=>JSON.stringify(buildIndicatorAppearanceSnapshot(x as unknown as Record<string,unknown>,{timeframe,visibleBars:candles.current.length}))).join('|'),[indicators,timeframe,candles.current.length]);
  useEffect(()=>indicatorControllerRef.current?.applyIndicatorAppearanceOnly(),[indicatorAppearanceKey]);
  useEffect(()=>{if(!candle.current)return;const lines:any[]=[];if(!automationsRef.current.length||!candles.current.length)return;for(const item of automationsRef.current){const signal=markerForAutomation(item,candles.current);if(!signal)continue;lines.push(candle.current.createPriceLine({price:candles.current[candles.current.length-1]?.close||0,color:signal.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:\`AUTO · \${item.name}\`}));}return()=>lines.forEach(line=>{try{candle.current?.removePriceLine(line)}catch{}});},[automations]);
  const viewingIndicator=indicators.find(item=>item.id===viewingIndicatorCode);
  const drawingUndo=undoDrawing;
  const drawingClear=clearDrawings;
  return <ChartShell
    hostRef={host}
    oscillatorHostRef={oscHost}
    error={error}
    historyLoading={historyLoading}
    toolbar={null}
    depthPanel={<ChartDepthPanel brokerId={brokerId} instrumentKey={resolvedInstrumentKey} visible={showDepth}/>}
    header={<div className="flex items-center justify-between px-1 pb-2 text-[10px] font-mono"><span className="text-[var(--tco-dim)]">Normalized broker candles · native indicator engine</span><span className="text-[#3b82f6]">● LIVE ENGINE</span>{showOI&&oiAnalytics&&<span className="ml-2 text-[#a78bfa]">OI · PCR {oiAnalytics.pcr.toFixed(2)} · FLIP {oiAnalytics.flip?.strike??'—'}</span>}</div>}
    overlay={<>
      {showEmbeddedDrawingToolbar&&<ChartToolbar activeTool={drawingTool} onSelectTool={tool=>selectDrawingTool(tool as DrawingTool)} onUndo={drawingUndo} onClear={drawingClear}/>}
      <ChartOverlay
        resolvedInstrumentKey={resolvedInstrumentKey}
        timeframe={timeframe}
        intervals={intervals}
        setTimeframe={value=>setTimeframe(value)}
        candleAppearance={candleAppearance}
        setCandleAppearance={next=>setCandleAppearance(next)}
        showCandleSettings={showCandleSettings}
        setShowCandleSettings={setShowCandleSettings}
        indicators={indicators}
        indicatorCount={indicators.filter(item=>item.enabled).length}
        showIndicatorMenu={showIndicatorMenu}
        setShowIndicatorMenu={setShowIndicatorMenu}
        editingIndicator={editingIndicator}
        setEditingIndicator={setEditingIndicator}
        addIndicatorFromChart={addIndicatorFromChart}
        patchIndicator={patchIndicator}
        removeIndicator={removeIndicator}
        viewingIndicator={viewingIndicator}
        setViewingIndicatorCode={setViewingIndicatorCode}
        predictionModelIds={predictionModelIds}
        predictionQuery={predictionQuery}
        setPredictionQuery={setPredictionQuery}
        showPredictionMenu={showPredictionMenu}
        setShowPredictionMenu={setShowPredictionMenu}
        savePredictionModelIds={ids=>savePredictionModelIds(ids)}
        setPredictionModelIds={ids=>{setPredictionModelIds(ids);savePredictionModelIds(ids);}}
        drawingTool={drawingTool}
        showDrawingMenu={showDrawingMenu}
        setShowDrawingMenu={setShowDrawingMenu}
        selectDrawingTool={selectDrawingTool}
        clearDrawings={clearDrawings}
        undoDrawing={undoDrawing}
        showLevels={showLevels}
        setShowLevels={setShowLevels}
        showOI={showOI}
        setShowOI={setShowOI}
        showDepth={showDepth}
        setShowDepth={setShowDepth}
        showVolume={showVolume}
        setShowVolume={setShowVolume}
        coreSpiritState={coreSpiritState}
        setCoreSpiritSource={setCoreSpiritSource}
        openCoreSpirit={openCoreSpirit}
        compileCoreSpirit={compileCoreSpirit}
        deployCoreSpirit={deployCoreSpirit}
        closeCoreSpirit={closeCoreSpirit}
        analytics={analytics}
      />
    </>}
  />;
});