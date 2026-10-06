import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { IChartApi, ISeriesApi } from '../../services/core/chart/velaNativeChartKernel';
import { CoreSpiritChartOutputController } from '../../services/coreSpirit/chartOutputController';
import { CoreSpiritStore } from '../../services/coreSpirit/CoreSpiritStore';
import { createChartCoreSpiritController } from '../../services/core/chart/controllers/ChartCoreSpiritController';
import { createChartDataController } from '../../services/core/chart/controllers/ChartDataController';
import { createChartDrawingController } from '../../services/core/chart/controllers/ChartDrawingController';
import { createChartIndicatorController } from '../../services/core/chart/controllers/ChartIndicatorController';
import { createChartPredictionController } from '../../services/core/chart/controllers/ChartPredictionController';
import { createChartRealtimeController } from '../../services/core/chart/controllers/ChartRealtimeController';
import { acquireChartStore, releaseChartStore } from '../../services/core/chart/chartStoreRegistry';
import { coreEventBus } from '../../services/core/event/eventBus';
import { ChartDepthPanel } from './ChartDepthPanel';
import { ChartShell } from './ChartShell';
import { ChartOverlay } from './ChartOverlay';
import { ChartToolbar } from './ChartToolbar';
import type { DrawingTool } from './drawingTypes';
import type { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../types/market';
import { useChartLifecycle } from './hooks/useChartLifecycle';
import { CHART_TIMEFRAME_INTERVALS, chartDataPlaneKey, getChartDataPlane } from '../../services/marketData/chartDataPlane';
import type { ChartAnalytics } from '../../services/marketData/levelEngine';
import type { OIChartAnalytics } from '../../services/marketData/oiEngine';
import { chartMarketKey } from '../../services/marketData/chartMarketStore';
import { isIncrementalIndicatorSupported } from '../../services/marketData/incrementalIndicatorEngine';
import { getIndicators, saveIndicators, getAutomations, type AutomationConfig, type IndicatorConfig, INDICATOR_LIBRARY } from '../../services/marketData/indicatorEngine';
import { buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot, getIndicatorDefaultPatch } from '../../services/coreSpirit/indicatorSettingsSchema';
import { CandleAppearance, loadCandleAppearance, saveCandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { getSavedPredictionModelIds, savePredictionModelIds } from '../../services/predictionEngine';
import { canonicalInstrumentKey, chartIntervals as intervals, loadChartState, chartStateKey, markerForAutomation } from '../../services/core/chart/chartRuntimeSupport';
import { createChartAnalyticsController } from '../../services/core/chart/ChartAnalyticsController';
import { createChartInteractionController } from '../../services/core/chart/ChartInteractionController';
import { createChartRuntimeController } from '../../services/core/chart/ChartRuntimeController';

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
  const chartId=useRef(\`chart-\${Math.random().toString(36).slice(2,10)}\`);
  const dataRevisionRef=useRef(0);
  const indicatorRequestSeq=useRef(0);
  const predictionJob=useRef(0);
  const predictionLines=useRef<any[]>([]);
  const coreSpiritOutput=useRef<CoreSpiritChartOutputController|null>(null);
  const coreSpiritRunId=useRef(0);
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
  const chartStore=useMemo(()=>acquireChartStore(chartDatasetKey),[chartDatasetKey]);

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
  const runtimeControllerRef=useRef<ReturnType<typeof createChartRuntimeController>|null>(null);

  const applyViewState=()=>{
    try{localStorage.setItem(chartStateKey(brokerId,resolvedInstrumentKey),JSON.stringify({version:2,timeframe,drawings:drawingControllerRef.current?.getDrawings?.()||persistedChart.drawings,showLevels,showVolume,showOI,showDepth}));}catch{}
  };

  useEffect(()=>{drawingToolRef.current=drawingTool;},[drawingTool]);
  useEffect(()=>{rendererController.setChartType(chartType);},[chartType,rendererController]);
  useEffect(()=>{saveCandleAppearance(brokerId,resolvedInstrumentKey,candleAppearance);rendererController.setCandleAppearance(candleAppearance);if(candles.current.length&&volume.current){volume.current.setData(candles.current.map(x=>({time:Math.floor(Date.parse(x.timestamp)/1000),value:Number(x.volume)||0,color:volumeColor(candleAppearance,Number(x.open),Number(x.close))})));}},[candleAppearance,brokerId,resolvedInstrumentKey,rendererController]);
  useEffect(()=>{if(levelsRequest!=null)setShowLevels(true);},[levelsRequest]);
  useEffect(()=>{
    if(showOI){
      void analyticsControllerRef.current?.refreshOI();
      const id=window.setInterval(()=>void analyticsControllerRef.current?.refreshOI(),15000);
      return()=>window.clearInterval(id);
    }
    analyticsControllerRef.current?.renderOI(null);
    return undefined;
  },[showOI,resolvedInstrumentKey,brokerId]);
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
    const runtime=createChartRuntimeController({
      host,
      oscHost,
      chart,
      oscChart,
      candle,
      closeLine,
      volume,
      candles,
      latestTick,
      chartId,
      dataRevisionRef,
      indicatorRequestSeq,
      predictionJob,
      predictionLines,
      coreSpiritOutput,
      coreSpiritRunId,
      resolvedInstrumentKey,
      brokerId,
      timeframe,
      chartDatasetKey,
      chartDataPlane,
      chartStore,
      coreSpiritStore,
      rendererController,
      crosshairVisible,
      chartType,
      candleAppearance,
      drawingInitial,
      indicatorsRef,
      selectedDrawingIdRef,
      viewStateRef,
      predictionIdsRef,
      appearanceRef,
      drawingControllerRef,
      dataControllerRef,
      indicatorControllerRef,
      predictionControllerRef,
      coreSpiritControllerRef,
      realtimeControllerRef,
      analyticsControllerRef,
      interactionControllerRef,
      drawingToolRef,
      chartIndex,
      setDrawingTool,
      setSelectedDrawingId,
      setHistoryLoading,
      setError,
      setAnalytics,
      setOiAnalytics,
      onAnalytics,
    });
    runtimeControllerRef.current=runtime;
    return runtime.mount();
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
  useEffect(()=>()=>releaseChartStore(chartDatasetKey),[chartDatasetKey]);
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