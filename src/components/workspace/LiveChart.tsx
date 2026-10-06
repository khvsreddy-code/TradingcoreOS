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
import { coreEventBus } from '../../services/core/event/eventBus';
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
import { chartMarketKey } from '../../services/marketData/chartMarketStore';
import { isIncrementalIndicatorSupported } from '../../services/marketData/incrementalIndicatorEngine';
import { getIndicators, saveIndicators, getAutomations, type AutomationConfig, type IndicatorConfig, INDICATOR_LIBRARY } from '../../services/marketData/indicatorEngine';
import type { OIChartAnalytics } from '../../services/marketData/oiEngine';
import { buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot, getIndicatorDefaultPatch } from '../../services/coreSpirit/indicatorSettingsSchema';
import { CandleAppearance, candleSeriesOptions, loadCandleAppearance, saveCandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { getCurrentTheme, getThemePalette } from '../../theme/theme';
import { getSavedPredictionModelIds, savePredictionModelIds } from '../../services/predictionEngine';
import { canonicalInstrumentKey, chartIntervals as intervals, loadChartState, chartStateKey, markerForAutomation } from '../../services/core/chart/chartRuntimeSupport';
import { createChartAnalyticsController } from '../../services/core/chart/ChartAnalyticsController';
import { createChartInteractionController } from '../../services/core/chart/ChartInteractionController';

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
  const analyticsControllerRef=useRef<ReturnType<typeof createChartAnalyticsController>|null>(null);
  const interactionControllerRef=useRef<ReturnType<typeof createChartInteractionController>|null>(null);

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