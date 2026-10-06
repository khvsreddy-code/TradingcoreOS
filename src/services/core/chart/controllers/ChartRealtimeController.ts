import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import type { ChartDataPlaneSnapshot } from '../../../marketData/chartDataPlane';
import type { ChartStore } from '../ChartStore';
import type { ChartUpdateScheduler } from '../chartUpdateScheduler';
import type { ChartLifecycle } from '../chartLifecycle';
import type { IChartApi, ISeriesApi } from '../velaNativeChartKernel';

type Ref<T>={current:T};

export type ChartRealtimeControllerDeps={
  chart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  candles:Ref<HistoricalCandle[]>;
  latestTick:Ref<NormalizedMarketTick|undefined>;
  dataRevisionRef:Ref<number>;
  rendererController:{applyRealtimeCanonical:(canonical:any,appearance:any)=>void};
  chartDataPlane:{readCanonical:()=>any};
  chartUpdateScheduler:ChartUpdateScheduler;
  calculationEngine:{updateTick:(bar:HistoricalCandle,index:number,bucketChanged:boolean)=>void;reset:(data:HistoricalCandle[],symbol:string,timeframe:string)=>void};
  candleAppearanceRef:Ref<any>;
  chartStore:ChartStore;
  brokerId:string;
  instrumentKey:string;
  timeframe:string;
  chartMarketKey:string;
  onLegacyIndicatorTick:(data:HistoricalCandle[],bucketChanged:boolean)=>void;
  onIndicatorWorker:(data:HistoricalCandle[],bucketChanged:boolean)=>void;
  onDrawingTick:()=>void;
  onPredictionTick:(data:HistoricalCandle[])=>void;
  onAnalyticsTick:(data:HistoricalCandle[],spot:number)=>void;
  onOiTick:(spot:number)=>void;
};

export function createChartRealtimeController(deps:ChartRealtimeControllerDeps){
  const {chart,candles,latestTick,dataRevisionRef,rendererController,chartDataPlane,chartUpdateScheduler,calculationEngine,candleAppearanceRef,chartStore}=deps;
  const handleTick=(snapshot:ChartDataPlaneSnapshot,bucketChanged:boolean)=>{
    const data=snapshot.candles;
    candles.current=data;
    latestTick.current=snapshot.latestTick;
    const live=data[data.length-1];
    if(live&&chart.current){
      chartUpdateScheduler.scheduleLatest('realtime-bar',()=>{
        const started=performance.now();
        rendererController.applyRealtimeCanonical(chartDataPlane.readCanonical(),candleAppearanceRef.current);
        if(deps.chartMarketKey) {
          // perf accounting is intentionally kept outside React.
          void started;
        }
      });
      calculationEngine.updateTick(live,data.length-1,bucketChanged);
    }
    if(!snapshot.historyReady)return;
    deps.onLegacyIndicatorTick(data,bucketChanged);
    deps.onIndicatorWorker(data,bucketChanged);
    deps.onDrawingTick();
    deps.onAnalyticsTick(data,Number(latestTick.current?.ltp)||Number(live?.close)||0);
    deps.onPredictionTick(data);
    if(Number.isFinite(Number(latestTick.current?.ltp)))deps.onOiTick(Number(latestTick.current!.ltp));
  };

  const hydrateHistory=(snapshot:ChartDataPlaneSnapshot)=>{
    candles.current=snapshot.candles;
    latestTick.current=snapshot.latestTick;
    calculationEngine.reset(snapshot.candles,deps.instrumentKey,deps.timeframe);
  };

  const setRevision=(revision:number)=>{dataRevisionRef.current=revision;};

  return {handleTick,hydrateHistory,setRevision};
}
