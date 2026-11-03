import { Profiler, memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { IChartApi, ISeriesApi } from '../../services/core/chart/velaNativeChartKernel';
import type { CoreSpiritChartOutputController } from '../../services/coreSpirit/chartOutputController';
import { CoreSpiritStore } from '../../services/coreSpirit/CoreSpiritStore';
import type { createChartCoreSpiritController } from '../../services/core/chart/controllers/ChartCoreSpiritController';
import type { createChartDataController } from '../../services/core/chart/controllers/ChartDataController';
import type { createChartIndicatorController } from '../../services/core/chart/controllers/ChartIndicatorController';
import type { createChartPredictionController } from '../../services/core/chart/controllers/ChartPredictionController';
import type { createChartRealtimeController } from '../../services/core/chart/controllers/ChartRealtimeController';
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
import { INDICATOR_LIBRARY, type IndicatorConfig } from '../../services/marketData/indicatorEngine';
import { getIndicators, saveIndicators, getAutomations, type AutomationConfig } from '../../services/workspace/workspaceState';
import { buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot, getIndicatorDefaultPatch } from '../../services/coreSpirit/indicatorSettingsSchema';
import { CandleAppearance, loadCandleAppearance, saveCandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { getSavedPredictionModelIds, savePredictionModelIds } from '../../services/predictionEngine';
import { canonicalInstrumentKey, chartIntervals as intervals, loadChartState, chartStateKey, markerForAutomation } from '../../services/core/chart/chartRuntimeSupport';
import type { createChartAnalyticsController } from '../../services/core/chart/ChartAnalyticsController';
import type { createChartInteractionController } from '../../services/core/chart/ChartInteractionController';
import { createChartRuntimeController } from '../../services/core/chart/ChartRuntimeController';
import { chartPerformanceTelemetry } from '../../services/marketData/chartPerformanceTelemetry';
import { classifyMarketDataHealth } from '../../services/marketData/dataHealth';
import { getWorkspaceAppearance, subscribeWorkspaceAppearance } from '../../theme/workspaceAppearance';
import { CoreSpiritChartAssistant } from './CoreSpiritChartAssistant';

type Props={instrumentKey:string;brokerId?:string;onAnalytics?:(a:ChartAnalytics)=>void;levelsRequest?:number;chartIndex?:number;showEmbeddedDrawingToolbar?:boolean};

const VELA_LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'he', label: 'Hebrew' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ms', label: 'Malay' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ru', label: 'Russian' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)' },
  { value: 'zh-Hant', label: 'Chinese (Traditional)' },
] as const;

function loadSavedChartLocale(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem('tradingcore:vela-locale:v1');
    return saved && VELA_LOCALES.some((locale) => locale.value === saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}
export const LiveChart = memo(function LiveChart({instrumentKey,brokerId='unknown',onAnalytics,levelsRequest,chartIndex,showEmbeddedDrawingToolbar=false}:Props){
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
  const chartId=useRef(`chart-${Math.random().toString(36).slice(2,10)}`);
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
  const [chartLocale,setChartLocale]=useState<string>(loadSavedChartLocale);
  const [error,setError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(false);
  const [marketHealth,setMarketHealth]=useState(()=>classifyMarketDataHealth({}));
  const [candleAppearance,setCandleAppearance]=useState<CandleAppearance>(()=>loadCandleAppearance(brokerId,resolvedInstrumentKey));
  const [oiAnalytics,setOiAnalytics]=useState<OIChartAnalytics|null>(null);
  const [analytics,setAnalytics]=useState<ChartAnalytics|null>(null);

  useEffect(()=>{const refresh=()=>{const tick=latestTick.current;setMarketHealth(classifyMarketDataHealth({source:tick?.source,lastUpdateAt:tick?.brokerTimestamp??tick?.timestamp??tick?.lastTradeTimestamp,receivedAt:tick?.receivedAtEpoch??tick?.receivedAt,providerConnected:tick?.source==='fyers'||tick?.source==='upstox'?true:undefined,expectedIntervalMs:5_000}));};refresh();const timer=window.setInterval(refresh,1_000);return()=>window.clearInterval(timer);},[resolvedInstrumentKey]);

  const chartDataPlane=useMemo(()=>getChartDataPlane(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);
  const chartDatasetKey=useMemo(()=>chartDataPlaneKey(brokerId,resolvedInstrumentKey,timeframe),[brokerId,resolvedInstrumentKey,timeframe]);
  const chartStore=useMemo(()=>acquireChartStore(chartDatasetKey),[chartDatasetKey]);

  const indicatorsRef=useRef(indicators); indicatorsRef.current=indicators;
  const viewStateRef=useRef({showLevels,showVolume,showOI,showDepth}); viewStateRef.current={showLevels,showVolume,showOI,showDepth};
  const predictionIdsRef=useRef(predictionModelIds); predictionIdsRef.current=predictionModelIds;
  const automationsRef=useRef(automations); automationsRef.current=automations;
  const appearanceRef=useRef(candleAppearance); appearanceRef.current=candleAppearance;
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
    try{localStorage.setItem(chartStateKey(brokerId,resolvedInstrumentKey),JSON.stringify({version:2,timeframe,
        velaDrawings:chart.current?.drawings?.all?.() ?? persistedChart.velaDrawings ?? [],
        showLevels,showVolume,showOI,showDepth}));}catch{}
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
    const off=chart.current?.onDrawingChange?.(()=>applyViewState());
    return off;
  },[resolvedInstrumentKey]);

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
    const next=[...indicatorsRef.current,{id:`${kind.toLowerCase().replace(/\W/g,'-')}-${Date.now()}`,kind,enabled:true,...lib.defaults,...patch}];
    setIndicators(next);saveIndicators(next);setShowIndicatorMenu(false);
  };
  const patchIndicator=(id:string,patch:Partial<IndicatorConfig>)=>{const next=indicatorsRef.current.map(x=>x.id===id?{...x,...patch}:x);setIndicators(next);saveIndicators(next);};
  const removeIndicator=(id:string)=>{const next=indicatorsRef.current.filter(x=>x.id!==id);setIndicators(next);saveIndicators(next);if(editingIndicator===id)setEditingIndicator(null);};

  const velaDrawingAliases:Record<string,string> = {
    horizontal:'hline',horizontalRay:'hray',vertical:'vline',parallelChannel:'parallelchannel',
    rectangle:'box',ellipse:'ellipse',fib:'fibretracement',fibExtension:'fibextension',
    pitchfork:'pitchfork',arrow:'arrow',priceRange:'datepricerange',dateRange:'datepricerange',
    brush:'freehand',highlighter:'highlighter',text:'text',longPosition:'position',shortPosition:'position',
  };
  const selectDrawingTool=(tool:DrawingTool)=>{
    const velaType=velaDrawingAliases[tool];
    if(velaType && chart.current?.drawings?.supported) chart.current.drawings.setTool(velaType as any);
    setDrawingTool(tool);
    setShowDrawingMenu(false);
  };
  const clearDrawings=()=>{
    if(!chart.current?.drawings?.supported)return;
    chart.current.drawings.all().forEach(d=>chart.current!.drawings.remove(d.id));
    applyViewState();
  };
  const undoDrawing=()=>{
    if(!chart.current?.drawings?.supported)return;
    chart.current.drawings.undo();
    applyViewState();
  };
  const openCoreSpirit=()=>{coreSpiritStore.setOpen(true);coreSpiritControllerRef.current?.open();};
  const closeCoreSpirit=()=>coreSpiritStore.setOpen(false);
  const setCoreSpiritSource=(source:string)=>coreSpiritStore.setSource(source);
  const compileCoreSpirit=()=>{void coreSpiritControllerRef.current?.compile();};
  const deployCoreSpirit=()=>{void coreSpiritControllerRef.current?.deploy();};

  useEffect(()=>{
    indicatorControllerRef.current?.setInputs({indicators,timeframe});
    predictionControllerRef.current?.setInputs({predictionModelIds,chartDatasetKey,resolvedInstrumentKey,timeframe});
  },[indicators,timeframe,predictionModelIds,chartDatasetKey,resolvedInstrumentKey]);


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
      indicatorsRef,
      viewStateRef,
      predictionIdsRef,
      appearanceRef,
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
      velaDrawingsInitial:persistedChart.velaDrawings ?? [],
      setHistoryLoading,
      setError,
      setAnalytics,
      setOiAnalytics,
      onAnalytics,
    });
    runtimeControllerRef.current=runtime;
    return runtime.mount();
  },[resolvedInstrumentKey,timeframe,brokerId,chartDataPlane,chartDatasetKey,persistedChart.velaDrawings]);

  // Apply the saved language after both native chart surfaces mount. The preference is
  // shared by the main and oscillator charts and never triggers an indicator recompute.
  useEffect(()=>{
    try { window.localStorage.setItem('tradingcore:vela-locale:v1',chartLocale); } catch {}
    const primaryChart=chart.current;
    const oscillatorChart=oscChart.current;
    if(primaryChart)void primaryChart.setLocale(chartLocale).catch(()=>{});
    if(oscillatorChart)void oscillatorChart.setLocale(chartLocale).catch(()=>{});
  },[chartLocale,chartDatasetKey]);

  useEffect(()=>{if(candles.current.length&&chart.current)indicatorControllerRef.current?.applyIndicatorAppearanceOnly();},[indicators,timeframe]);
  useEffect(()=>{rendererController.setVolumeVisible(showVolume);},[showVolume,rendererController]);
  useEffect(()=>{
    if(!chart.current||!showLevels||!analyticsRef.current)return;
    const c=chart.current;
    const candleSeries=candle.current;
    if(!candleSeries)return;
    const lines=[...analyticsRef.current.support.slice(0,6),...analyticsRef.current.resistance.slice(0,6)].map(level=>{
      const broken=level.state==='BROKEN';
      const base=level.side==='support'?'#3b82f6':'#ef4444';
      const title=`${broken?'BROKEN · ':''}${level.side==='support'?'S':'R'}${level.strength!=null?` · ${Math.round(level.strength*100)}%`:''}`;
      return candleSeries.createPriceLine({
        price:level.price,
        color:broken?'#64748b':base,
        lineWidth:broken?1:Math.max(1,Math.min(3,Math.round((level.strength||.5)*3))),
        lineStyle:broken?2:0,
        axisLabelVisible:true,
        title,
      });
    });
    return ()=>lines.forEach(line=>{try{candleSeries.removePriceLine(line)}catch{}});
  },[showLevels,analytics]);
  const indicatorComputeKey=useMemo(()=>indicators.map(x=>buildIndicatorComputationSignature(x as unknown as Record<string,unknown>)).join('|'),[indicators]);
  useEffect(()=>{if(!candles.current.length||!chart.current)return;const controller=indicatorControllerRef.current;if(!controller)return;controller.setInputs({indicators,timeframe});controller.renderStudies(candles.current);controller.requestIndicatorWorker(candles.current);predictionControllerRef.current?.setInputs({predictionModelIds,chartDatasetKey,resolvedInstrumentKey,timeframe});void predictionControllerRef.current?.renderPredictionOverlay(candles.current);},[indicatorComputeKey,predictionModelIds.join('|'),timeframe,resolvedInstrumentKey,chartDatasetKey]);
  const indicatorAppearanceKey=useMemo(()=>indicators.map(x=>JSON.stringify(buildIndicatorAppearanceSnapshot(x as unknown as Record<string,unknown>,{timeframe,visibleBars:candles.current.length}))).join('|'),[indicators,timeframe,candles.current.length]);
  useEffect(()=>indicatorControllerRef.current?.applyIndicatorAppearanceOnly(),[indicatorAppearanceKey]);
  useEffect(()=>{if(!candle.current)return;const lines:any[]=[];if(!automationsRef.current.length||!candles.current.length)return;for(const item of automationsRef.current){const signal=markerForAutomation(item,candles.current);if(!signal)continue;lines.push(candle.current.createPriceLine({price:candles.current[candles.current.length-1]?.close||0,color:signal.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:`AUTO · ${item.name}`}));}return()=>lines.forEach(line=>{try{candle.current?.removePriceLine(line)}catch{}});},[automations]);
  const viewingIndicator=indicators.find(item=>item.id===viewingIndicatorCode);
  useEffect(()=>()=>releaseChartStore(chartDatasetKey),[chartDatasetKey]);
  const drawingUndo=undoDrawing;
  const drawingClear=clearDrawings;
  const chartUi=<ChartShell
    hostRef={host}
    oscillatorHostRef={oscHost}
    error={error}
    historyLoading={historyLoading}
    toolbar={null}
    depthPanel={<ChartDepthPanel brokerId={brokerId} instrumentKey={resolvedInstrumentKey} visible={showDepth}/>}
    header={<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 pb-2 text-[10px] font-mono"><span className="text-[var(--tco-dim)]">Normalized broker candles · native indicator engine</span><span className="text-[#3b82f6]">● LIVE ENGINE</span><span className={marketHealth.state === "live" ? "text-emerald-400" : marketHealth.state === "stale" || marketHealth.state === "disconnected" ? "text-rose-400" : marketHealth.state === "delayed" ? "text-amber-400" : "text-[var(--tco-dim)]"} title={marketHealth.reason}>● DATA {marketHealth.label} · {marketHealth.source.toUpperCase()}</span><label className="ml-auto flex items-center gap-1.5 text-[var(--tco-dim)]">LANGUAGE<select aria-label="Chart language" value={chartLocale} onChange={event=>setChartLocale(event.target.value)} className="rounded border border-[var(--tco-control)] bg-[var(--tco-surface-2)] px-2 py-1 text-[var(--tco-text)] outline-none focus:border-[var(--tco-accent)]">{VELA_LOCALES.map(locale=><option key={locale.value} value={locale.value}>{locale.label}</option>)}</select></label>{showOI&&oiAnalytics&&<span className="ml-2 text-[#a78bfa]">OI · PCR {oiAnalytics.pcr.toFixed(2)} · FLIP {oiAnalytics.flip?.strike??'—'}</span>}</div>}
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
  // Apply workspace canvas changes in-place so changing colors does not remount
  // the chart, lose its viewport, or reset user drawings. Vela's renderer preserves
  // the gradient independently from the solid contrast/axis theme color.
  useEffect(() => {
    const applyAppearance = (appearance: ReturnType<typeof getWorkspaceAppearance>) => {
      const layout = {
        background: appearance.chartBackgroundStart,
        backgroundGradient: appearance.chartBackgroundMode === 'gradient'
          ? { from: appearance.chartBackgroundStart, to: appearance.chartBackgroundEnd, angle: appearance.chartGradientAngle }
          : undefined,
      };
      chart.current?.applyOptions({ layout });
      oscChart.current?.applyOptions({ layout });
    };
    applyAppearance(getWorkspaceAppearance());
    return subscribeWorkspaceAppearance(applyAppearance);
  }, []);

  return <Profiler id={'tco-chart-' + chartDatasetKey} onRender={() => chartPerformanceTelemetry.recordReactCommit(chartDatasetKey)}>{chartUi}<CoreSpiritChartAssistant context={{
    symbol: resolvedInstrumentKey,
    timeframe,
    lastPrice: typeof latestTick.current?.ltp === 'number' && Number.isFinite(latestTick.current.ltp)
      ? latestTick.current.ltp
      : (candles.current[candles.current.length - 1]?.close ?? null),
    candleCount: candles.current.length,
    recentBars: candles.current.slice(-12).map((bar: any) => ({
      time: String(bar.timestamp ?? bar.time ?? ''),
      open: typeof bar.open === 'number' && Number.isFinite(bar.open) ? bar.open : null,
      high: typeof bar.high === 'number' && Number.isFinite(bar.high) ? bar.high : null,
      low: typeof bar.low === 'number' && Number.isFinite(bar.low) ? bar.low : null,
      close: typeof bar.close === 'number' && Number.isFinite(bar.close) ? bar.close : null,
      volume: typeof bar.volume === 'number' && Number.isFinite(bar.volume) ? bar.volume : null,
    })),
    activeIndicators: indicators.filter(item => item.enabled).map((item: any) => String(item.name ?? item.label ?? item.id ?? 'Indicator')).slice(0, 12),
    analytics: analytics ? {
      bias: analytics.bias,
      vwap: analytics.vwap,
      atr: analytics.atr,
      previousHigh: analytics.previousHigh,
      previousLow: analytics.previousLow,
      support: analytics.support.slice(0, 5).map(level => ({ price: level.price, state: level.state })),
      resistance: analytics.resistance.slice(0, 5).map(level => ({ price: level.price, state: level.state })),
    } : null,
  }} /></Profiler>;
});