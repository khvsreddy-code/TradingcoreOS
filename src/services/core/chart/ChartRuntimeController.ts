import { createVelaNativeChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from './velaNativeChartKernel';
import { ChartUpdateScheduler } from './chartUpdateScheduler';
import { RealtimeCalculationEngine } from '../calculation/realtimeCalculationEngine';
import { ChartLifecycle } from './chartLifecycle';
import { createChartDataController } from './controllers/ChartDataController';
import { createChartIndicatorController } from './controllers/ChartIndicatorController';
import { createChartDrawingController } from './controllers/ChartDrawingController';
import { createChartPredictionController } from './controllers/ChartPredictionController';
import { createChartRealtimeController } from './controllers/ChartRealtimeController';
import { createChartCoreSpiritController } from './controllers/ChartCoreSpiritController';
import { createChartAnalyticsController } from './ChartAnalyticsController';
import { createChartInteractionController } from './ChartInteractionController';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';
import { candleSeriesOptions, type CandleAppearance } from './candleAppearance';
import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import { CHART_TIMEFRAME_INTERVALS, shouldLoadOlderHistory } from '../../marketData/chartDataPlane';
import type { ChartDataPlane, ChartDataPlaneSnapshot } from '../../marketData/chartDataPlane';
import type { ChartAnalytics } from '../../marketData/levelEngine';
import type { OIChartAnalytics } from '../../marketData/oiEngine';
import type { ChartStore } from './ChartStore';
import type { CoreSpiritChartOutputController } from '../../coreSpirit/chartOutputController';
import type { CoreSpiritStore } from '../../coreSpirit/CoreSpiritStore';
import type { DrawingTool } from '../../../components/workspace/drawingTypes';
import type { ChartController } from '../../../components/workspace/chartController';
import { chartMarketKey } from '../../marketData/chartMarketStore';
import { isIncrementalIndicatorSupported } from '../../marketData/incrementalIndicatorEngine';
import { coreEventBus } from '../event/eventBus';

type Ref<T>={current:T};

export type ChartRuntimeControllerDeps={
  host:Ref<HTMLDivElement|null>;
  oscHost:Ref<HTMLDivElement|null>;
  chart:Ref<IChartApi|null>;
  oscChart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  closeLine:Ref<ISeriesApi<'Line'>|null>;
  volume:Ref<ISeriesApi<'Histogram'>|null>;
  candles:Ref<HistoricalCandle[]>;
  latestTick:Ref<NormalizedMarketTick|undefined>;
  chartId:Ref<string>;
  dataRevisionRef:Ref<number>;
  indicatorRequestSeq:Ref<number>;
  predictionJob:Ref<number>;
  predictionLines:Ref<any[]>;
  coreSpiritOutput:Ref<CoreSpiritChartOutputController|null>;
  coreSpiritRunId:Ref<number>;
  resolvedInstrumentKey:string;
  brokerId:string;
  timeframe:string;
  chartDatasetKey:string;
  chartDataPlane:ChartDataPlane;
  chartStore:ChartStore;
  coreSpiritStore:CoreSpiritStore;
  rendererController:ChartController;
  crosshairVisible:boolean;
  chartType:'candlestick'|'line';
  candleAppearance:CandleAppearance;
  drawingInitial:any[];
  indicatorsRef:Ref<any[]>;
  selectedDrawingIdRef:Ref<string|null>;
  viewStateRef:Ref<{showLevels:boolean;showVolume:boolean;showOI:boolean;showDepth:boolean}>;
  predictionIdsRef:Ref<string[]>;
  appearanceRef:Ref<CandleAppearance>;
  drawingControllerRef:Ref<any>;
  dataControllerRef:Ref<any>;
  indicatorControllerRef:Ref<any>;
  predictionControllerRef:Ref<any>;
  coreSpiritControllerRef:Ref<any>;
  realtimeControllerRef:Ref<any>;
  analyticsControllerRef:Ref<any>;
  interactionControllerRef:Ref<any>;
  drawingToolRef:Ref<DrawingTool>;
  chartIndex?:number;
  setDrawingTool:(tool:DrawingTool)=>void;
  setSelectedDrawingId:(id:string|null)=>void;
  setHistoryLoading:(value: boolean | ((previous:boolean)=>boolean))=>void;
  setError:(value:string)=>void;
  setAnalytics:(value:ChartAnalytics|null)=>void;
  setOiAnalytics:(value:OIChartAnalytics|null)=>void;
  onAnalytics?:(analytics:ChartAnalytics)=>void;
};

export function createChartRuntimeController(deps:ChartRuntimeControllerDeps){
  const {
    host,oscHost,chart,oscChart,candle,closeLine,volume,candles,latestTick,
    lifecycle,chartUpdateScheduler,calculationEngine,chartId,dataRevisionRef,
    indicatorRequestSeq,predictionJob,predictionLines,coreSpiritOutput,coreSpiritRunId,
    resolvedInstrumentKey,brokerId,timeframe,chartDatasetKey,chartDataPlane,chartStore,
    coreSpiritStore,rendererController,crosshairVisible,chartType,candleAppearance,
    drawingInitial,indicatorsRef,selectedDrawingIdRef,viewStateRef,predictionIdsRef,
    appearanceRef,drawingControllerRef,dataControllerRef,indicatorControllerRef,
    predictionControllerRef,coreSpiritControllerRef,realtimeControllerRef,
    analyticsControllerRef,interactionControllerRef,drawingToolRef,chartIndex,
    showOI,setDrawingTool,setSelectedDrawingId,setHistoryLoading,setError,setAnalytics,
    setOiAnalytics,onAnalytics,
  }=deps;

  const lifecycle:Ref<ChartLifecycle>={current:new ChartLifecycle()};
  const chartUpdateScheduler:Ref<ChartUpdateScheduler>={current:new ChartUpdateScheduler()};
  const calculationEngine:Ref<RealtimeCalculationEngine>={current:new RealtimeCalculationEngine()};

  return {
    mount():undefined|(()=>void){
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
  const chartAnalyticsController=createChartAnalyticsController({
    brokerId,
    instrumentKey:resolvedInstrumentKey,
    chartDatasetKey,
    chartDataPlane,
    chartStore,
    dataRevisionRef,
    candles,
    latestTick,
    candle,
    lifecycle,
    isOiVisible:()=>showOI,
    onAnalytics:(value)=>{setAnalytics(value);onAnalytics?.(value);},
    onOiAnalytics:setOiAnalytics,
  });
  indicatorControllerRef.current=chartIndicatorController;
  drawingControllerRef.current=chartDrawingController;
  predictionControllerRef.current=chartPredictionController;
  coreSpiritControllerRef.current=chartCoreSpiritController;
  analyticsControllerRef.current=chartAnalyticsController;

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
    onAnalyticsTick:(data,spot)=>chartAnalyticsController.publishAnalytics(data,spot,true),
    onOiTick:spot=>chartAnalyticsController.updateOiSpot(spot),
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
    chartAnalyticsController.publishAnalytics(data,Number(snapshot.latestTick?.ltp)||Number(data[data.length-1]?.close)||0,true);
    chartPredictionController.setInputs({predictionModelIds:predictionIdsRef.current,chartDatasetKey,resolvedInstrumentKey,timeframe});
    void chartPredictionController.renderPredictionOverlay(data);
    if(event.reason==='cache')coreEventBus.emit('chart.telemetry',{chartId:chartId.current,symbol:resolvedInstrumentKey,timeframe,metric:'history_cache_hit',value:1,timestamp:Date.now()});
    publishLifecycle('ready');
    if(showOI)void chartAnalyticsController.refreshOI();
    const visibleBars=Math.min(data.length,({ '1m':1125,'3m':375,'5m':225,'15m':75,'30m':45,'1H':36,'1D':30 } as Record<string,number>)[timeframe]||60);
    try{c.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-visibleBars-.5),to:data.length-.5+8});}catch{try{c.timeScale().fitContent();}catch{}}
    visibleLogicalRangeRef.current=c.timeScale().getVisibleLogicalRange?.()||null;
    chartDataController.requestWarmHistory(visibleBars);
  };

  const interactionController=createChartInteractionController({
    chart,
    candle,
    host,
    candles,
    chartStore,
    lifecycle:lifecycle.current,
    generation,
    drawingController:chartDrawingController,
    indicatorController:chartIndicatorController,
    dataController:chartDataController,
    timeframe,
    chartIndex,
    resolvedInstrumentKey,
    previousLogicalRange:{current:null},
    drawingToolRef,
    selectedDrawingIdRef,
    setSelectedDrawingId,
    rendererController,
    crosshairVisible,
    shouldLoadOlderHistory,
    onDebugBar:(detail)=>window.dispatchEvent(new CustomEvent('TRADINGCORE_CORESPIRIT_DEBUG_BAR',{detail})),
  });
  interactionControllerRef.current=interactionController;
  const stopInteraction=interactionController.attach();

  const stopData=chartDataController.subscribe(applySnapshot);
  void chartDataPlane.ensureReady().catch(()=>{});
  window.addEventListener('tradingcore:theme-change',()=>{});
  return()=>{
    dead=true;
    try{c.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}
    try{c.unsubscribeClick(onChartClick)}catch{}
    host.current?.removeEventListener('pointerdown',onPointerDown);host.current?.removeEventListener('pointermove',onPointerMove);host.current?.removeEventListener('pointerup',onPointerUp);host.current?.removeEventListener('pointercancel',onPointerUp);
    stopInteraction();stopData();chartDataController.dispose();unregisterCoreSpirit();chartCoreSpiritController.dispose();chartAnalyticsController.dispose();interactionControllerRef.current=null;realtimeControllerRef.current=null;indicatorControllerRef.current=null;drawingControllerRef.current=null;predictionControllerRef.current=null;coreSpiritControllerRef.current=null;analyticsControllerRef.current=null;
    publishLifecycle('disposed');lifecycle.current.invalidate();
    resizeObserver?.disconnect();chartUpdateScheduler.current.cancel();
  };

    },
  };
}
