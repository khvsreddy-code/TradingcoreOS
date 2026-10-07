import { createVelaNativeChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from './velaNativeChartKernel';
import { ChartUpdateScheduler } from './chartUpdateScheduler';
import { RealtimeCalculationEngine } from '../calculation/realtimeCalculationEngine';
import { ChartLifecycle } from './chartLifecycle';
import { createChartDataController } from './controllers/ChartDataController';
import { createChartIndicatorController } from './controllers/ChartIndicatorController';
import { createChartPredictionController } from './controllers/ChartPredictionController';
import { createChartRealtimeController } from './controllers/ChartRealtimeController';
import { createChartCoreSpiritController } from './controllers/ChartCoreSpiritController';
import { createChartAnalyticsController } from './ChartAnalyticsController';
import { createChartInteractionController } from './ChartInteractionController';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';
import { candleSeriesOptions, type CandleAppearance } from './candleAppearance';
import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import { CHART_TIMEFRAME_INTERVALS } from '../../marketData/chartDataPlane';
import { shouldLoadOlderHistory } from '../../marketData/chartHistoryPolicy';
import type { ChartDataPlane, ChartDataPlaneSnapshot } from '../../marketData/chartDataPlane';
import type { ChartAnalytics } from '../../marketData/levelEngine';
import type { OIChartAnalytics } from '../../marketData/oiEngine';
import type { ChartStore } from './ChartStore';
import type { CoreSpiritChartOutputController } from '../../coreSpirit/chartOutputController';
import type { CoreSpiritStore } from '../../coreSpirit/CoreSpiritStore';
import type { DrawingTool } from '../../../components/workspace/drawingTypes';
import type { ChartController } from '../../../components/workspace/chartController';
import { chartMarketKey } from '../../marketData/chartMarketStore';
import { chartPerformanceTelemetry } from '../../marketData/chartPerformanceTelemetry';
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
  velaDrawingsInitial?:unknown[];
  indicatorsRef:Ref<any[]>;
  viewStateRef:Ref<{showLevels:boolean;showVolume:boolean;showOI:boolean;showDepth:boolean}>;
  predictionIdsRef:Ref<string[]>;
  appearanceRef:Ref<CandleAppearance>;
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
  setHistoryLoading:(value:boolean|((previous:boolean)=>boolean))=>void;
  setError:(value:string)=>void;
  setAnalytics:(value:ChartAnalytics|null)=>void;
  setOiAnalytics:(value:OIChartAnalytics|null)=>void;
  onAnalytics?:(analytics:ChartAnalytics)=>void;
};

export function createChartRuntimeController(deps:ChartRuntimeControllerDeps){
  const lifecycle:Ref<ChartLifecycle>={current:new ChartLifecycle()};
  const chartUpdateScheduler:Ref<ChartUpdateScheduler>={current:new ChartUpdateScheduler()};
  const calculationEngine=new RealtimeCalculationEngine();
  const visibleLogicalRangeRef:Ref<{from:number;to:number}|null>={current:null};

  return {
    mount():undefined|(()=>void){
      if(!deps.host.current)return;
      const generation=lifecycle.current.begin();
      let dead=false;

      const palette=getThemePalette(getCurrentTheme());
      const c=deps.chart.current||createVelaNativeChart(deps.host.current,{
        autoSize:true,
        layout:{background:{type:ColorType.Solid,color:palette.surface2},textColor:palette.muted,fontFamily:'JetBrains Mono, monospace',fontSize:10},
        grid:{vertLines:{color:palette.grid},horzLines:{color:palette.grid}},
        crosshair:{mode:deps.crosshairVisible?0:2},
        rightPriceScale:{borderColor:palette.axis,scaleMargins:{top:.08,bottom:.2}},
        timeScale:{borderColor:palette.axis,timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:3},
        watermark:{visible:true,fontSize:28,horzAlign:'center',vertAlign:'center',color:palette.text+'12',text:'TRADINGCORE'},
        drawings:true,
        velaDrawings:deps.velaDrawingsInitial ?? [],
      });
      deps.chart.current=c;

      if(!deps.candle.current)deps.candle.current=c.addSeries(CandlestickSeries,candleSeriesOptions(deps.candleAppearance) as any);
      if(!deps.closeLine.current)deps.closeLine.current=c.addSeries(LineSeries,{color:'#38bdf8',lineWidth:2,priceLineVisible:false,lastValueVisible:true,visible:deps.chartType==='line'});
      if(!deps.volume.current)deps.volume.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});
      deps.volume.current?.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
      c.applyOptions({crosshair:{mode:deps.crosshairVisible?0:2} as any});
      deps.closeLine.current?.applyOptions({visible:deps.chartType==='line'});
      deps.rendererController.attach({chart:c,candle:deps.candle.current!,closeLine:deps.closeLine.current!,volume:deps.volume.current!},deps.chartDatasetKey,deps.chartId.current);

      const chartDataController=createChartDataController({key:deps.chartDatasetKey,plane:deps.chartDataPlane,chartStore:deps.chartStore});
      const chartIndicatorController=createChartIndicatorController({
        chart:deps.chart,oscChart:deps.oscChart,oscHost:deps.oscHost,candle:deps.candle,
        oscSeries:{current:[]},candles:deps.candles,visibleLogicalRangeRef,chartDataPlane:deps.chartDataPlane,
        chartDatasetKey:deps.chartDatasetKey,dataRevisionRef:deps.dataRevisionRef,indicatorRequestSeq:deps.indicatorRequestSeq,chartId:deps.chartId,
        lifecycle,chartUpdateScheduler,indicators:deps.indicatorsRef.current,timeframe:deps.timeframe,
      });
      const chartPredictionController=createChartPredictionController({
        chart:deps.chart,candles:deps.candles,predictionLines:deps.predictionLines,predictionJob:deps.predictionJob,
        predictionModelIds:deps.predictionIdsRef.current,chartDatasetKey:deps.chartDatasetKey,dataRevisionRef:deps.dataRevisionRef,
        resolvedInstrumentKey:deps.resolvedInstrumentKey,timeframe:deps.timeframe,
      });
      const chartCoreSpiritController=createChartCoreSpiritController({
        chartId:deps.chartId.current,chart:deps.chart,candle:deps.candle,host:deps.host,candles:deps.candles,
        coreSpiritOutput:deps.coreSpiritOutput,coreSpiritRunId:deps.coreSpiritRunId,resolvedInstrumentKey:deps.resolvedInstrumentKey,
        timeframe:deps.timeframe,store:deps.coreSpiritStore,
        publishLifecycle:(state)=>coreEventBus.emit('chart.lifecycle',{chartId:deps.chartId.current,state,timestamp:Date.now()}),
      });
      const chartAnalyticsController=createChartAnalyticsController({
        brokerId:deps.brokerId,instrumentKey:deps.resolvedInstrumentKey,chartDatasetKey:deps.chartDatasetKey,
        chartDataPlane:deps.chartDataPlane,chartStore:deps.chartStore,dataRevisionRef:deps.dataRevisionRef,
        candles:deps.candles,latestTick:deps.latestTick,candle:deps.candle,lifecycle,
        isOiVisible:()=>deps.viewStateRef.current.showOI,
        onAnalytics:(value)=>{deps.setAnalytics(value);deps.onAnalytics?.(value);},
        onOiAnalytics:deps.setOiAnalytics,
      });

      deps.indicatorControllerRef.current=chartIndicatorController;
      deps.predictionControllerRef.current=chartPredictionController;
      deps.coreSpiritControllerRef.current=chartCoreSpiritController;
      deps.analyticsControllerRef.current=chartAnalyticsController;

      chartCoreSpiritController.ensureOutput();
      const unregisterCoreSpirit=chartCoreSpiritController.register();
      const publishLifecycle=(state:'ready'|'loading'|'updating'|'error'|'recovering'|'disposed')=>{
        coreEventBus.emit('chart.lifecycle',{chartId:deps.chartId.current,state,timestamp:Date.now()});
        deps.chartStore.setLifecycle(state);
      };

      const realtimeController=createChartRealtimeController({
        chart:deps.chart,candle:deps.candle,candles:deps.candles,latestTick:deps.latestTick,dataRevisionRef:deps.dataRevisionRef,
        rendererController:deps.rendererController,chartDataPlane:deps.chartDataPlane,chartUpdateScheduler:chartUpdateScheduler.current,calculationEngine,
        candleAppearanceRef:deps.appearanceRef,chartStore:deps.chartStore,brokerId:deps.brokerId,instrumentKey:deps.resolvedInstrumentKey,
        timeframe:deps.timeframe,chartMarketKey:chartMarketKey(deps.brokerId,deps.resolvedInstrumentKey),computeIntervalMs:50,
        onLegacyIndicatorTick:(data,bucketChanged)=>{
          if(deps.indicatorsRef.current.some(x=>x.enabled&&!isIncrementalIndicatorSupported(x.kind)))chartIndicatorController.renderStudies(data,true);
          void bucketChanged;
        },
        onIndicatorWorker:(data,bucketChanged)=>{chartPerformanceTelemetry.recordIndicatorIncrementalUpdate(chartMarketKey(deps.brokerId,deps.resolvedInstrumentKey));chartIndicatorController.requestIndicatorWorker(data,visibleLogicalRangeRef.current,'incremental',bucketChanged?'append':'replace');},
        onPredictionTick:(data)=>{chartPredictionController.setInputs({predictionModelIds:deps.predictionIdsRef.current,chartDatasetKey:deps.chartDatasetKey,resolvedInstrumentKey:deps.resolvedInstrumentKey,timeframe:deps.timeframe});void chartPredictionController.renderPredictionOverlay(data);},
        onAnalyticsTick:(data,spot)=>chartAnalyticsController.publishAnalytics(data,spot,true),
        onOiTick:(spot)=>chartAnalyticsController.updateOiSpot(spot),
      });
      deps.realtimeControllerRef.current=realtimeController;

      const applySnapshot=(event:any)=>{
        if(dead||!lifecycle.current.isCurrent(generation))return;
        const snapshot=event?.snapshot as ChartDataPlaneSnapshot|undefined;
        if(!snapshot)return;

        deps.latestTick.current=snapshot.latestTick;
        deps.dataRevisionRef.current=snapshot.revision;
        deps.chartStore.publishMarketSnapshot({type:event.type,snapshot,error:event.error});

        const nextHistoryLoading=Boolean(snapshot.historyLoading||snapshot.olderHistoryLoading);
        deps.setHistoryLoading(previous=>previous===nextHistoryLoading?previous:nextHistoryLoading);

        if(event.type==='status'){
          if(event.status==='loading')publishLifecycle('loading');
          if(event.status==='error'&&!snapshot.candles.length){
            deps.setError(`History unavailable for ${deps.resolvedInstrumentKey} · ${CHART_TIMEFRAME_INTERVALS[deps.timeframe]||deps.timeframe} · ${event.error||'Historical candles unavailable'}`);
            publishLifecycle('error');
          }
        }

        const canonical = deps.chartDataPlane.readCanonical();
        if(canonical.length)deps.rendererController.setHistoryFromCanonical(canonical,deps.appearanceRef.current);
        const data=snapshot.candles.length?snapshot.candles:deps.chartDataPlane.getCompatibilityCandles();
        if(!data.length){
          // A healthy live tick is enough to keep the chart visually alive while
          // historical recovery is still in flight. Seed one forming candle at
          // the Vela boundary; subsequent ticks return to the normal canonical
          // columnar path once history is available.
          if(event.type==='tick' && snapshot.latestTick){
            const seeded=deps.rendererController.seedLiveCandle?.(
              snapshot.latestTick,
              deps.appearanceRef.current,
              deps.timeframe,
              true,
            );
            if(seeded){
              deps.candles.current=[seeded];
              deps.setError('');
              realtimeController.handleTick({...snapshot,candles:[seeded]},Boolean(event.bucketChanged));
            } else {
              realtimeController.handleTick(snapshot,Boolean(event.bucketChanged));
            }
          }
          return;
        }
        deps.candles.current=data;
        deps.setError('');

        if(event.type==='tick'){
          realtimeController.handleTick({...snapshot,candles:data},Boolean(event.bucketChanged));
          return;
        }

        realtimeController.hydrateHistory({...snapshot,candles:data});
        if(!canonical.length)deps.rendererController.setHistory(data,deps.appearanceRef.current,false);
        chartIndicatorController.setInputs({indicators:deps.indicatorsRef.current,timeframe:deps.timeframe});
        try{
          chartIndicatorController.renderStudies(data);
          chartIndicatorController.requestIndicatorWorker(data);
        }catch(indicatorError){
          console.warn('[TradingCore] indicator render skipped',indicatorError);
        }
        chartAnalyticsController.publishAnalytics(data,Number(snapshot.latestTick?.ltp)||Number(data[data.length-1]?.close)||0,true);
        chartPredictionController.setInputs({predictionModelIds:deps.predictionIdsRef.current,chartDatasetKey:deps.chartDatasetKey,resolvedInstrumentKey:deps.resolvedInstrumentKey,timeframe:deps.timeframe});
        void chartPredictionController.renderPredictionOverlay(data);

        if(event.reason==='cache'){
          coreEventBus.emit('chart.telemetry',{chartId:deps.chartId.current,symbol:deps.resolvedInstrumentKey,timeframe:deps.timeframe,metric:'history_cache_hit',value:1,timestamp:Date.now()});
        }

        publishLifecycle('ready');
        if(deps.viewStateRef.current.showOI)void chartAnalyticsController.refreshOI();

        const visibleBars=Math.min(data.length,({'1m':1125,'3m':375,'5m':225,'15m':75,'30m':45,'1H':36,'1D':30} as Record<string,number>)[deps.timeframe]||60);
        try{c.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-visibleBars-.5),to:data.length-.5+8});}
        catch{try{c.timeScale().fitContent();}catch{}}
        visibleLogicalRangeRef.current=c.timeScale().getVisibleLogicalRange?.()||null;
        chartDataController.requestWarmHistory(visibleBars);
      };

      const interactionController=createChartInteractionController({
        chart:deps.chart,candle:deps.candle,host:deps.host,candles:deps.candles,chartStore:deps.chartStore,lifecycle:lifecycle.current,generation,
indicatorController:chartIndicatorController,dataController:chartDataController,timeframe:deps.timeframe,
        chartIndex:deps.chartIndex,resolvedInstrumentKey:deps.resolvedInstrumentKey,previousLogicalRange:{current:null},
        drawingToolRef:deps.drawingToolRef,
        rendererController:deps.rendererController,crosshairVisible:deps.crosshairVisible,shouldLoadOlderHistory,
        onDebugBar:(detail)=>window.dispatchEvent(new CustomEvent('TRADINGCORE_CORESPIRIT_DEBUG_BAR',{detail})),
      });
      deps.interactionControllerRef.current=interactionController;
      const stopInteraction=interactionController.attach();

      const stopData=chartDataController.subscribe(applySnapshot);
      void deps.chartDataPlane.ensureReady().catch((error)=>{
        if (!dead) console.warn('[TradingCore] history fast path unavailable', error);
      });

      return()=>{
        dead=true;
        stopInteraction();
        stopData();
        chartDataController.dispose();
        realtimeController.dispose();
        chartCoreSpiritController.dispose();
        chartAnalyticsController.dispose();
        unregisterCoreSpirit();
        deps.interactionControllerRef.current=null;
        deps.realtimeControllerRef.current=null;
        deps.indicatorControllerRef.current=null;
        deps.predictionControllerRef.current=null;
        deps.coreSpiritControllerRef.current=null;
        deps.analyticsControllerRef.current=null;
        chartUpdateScheduler.current.cancel();
        publishLifecycle('disposed');
        lifecycle.current.invalidate();
      };
    },
  };
}
