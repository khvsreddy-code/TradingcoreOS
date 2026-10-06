import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../../types/market';
import type { ChartDataPlaneSnapshot } from '../../../marketData/chartDataPlane';
import type { ChartStore } from '../ChartStore';
import type { ChartUpdateScheduler } from '../chartUpdateScheduler';
import type { IChartApi, ISeriesApi } from '../velaNativeChartKernel';
import { RealtimeRateScheduler } from '../realtimeRateScheduler';
import { chartPerformanceTelemetry } from '../../../marketData/chartPerformanceTelemetry';
import { chartMarketStore } from '../../../marketData/chartMarketStore';

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
  computeIntervalMs?:number;
  onLegacyIndicatorTick:(data:HistoricalCandle[],bucketChanged:boolean)=>void;
  onIndicatorWorker:(data:HistoricalCandle[],bucketChanged:boolean)=>void;
  onDrawingTick:()=>void;
  onPredictionTick:(data:HistoricalCandle[])=>void;
  onAnalyticsTick:(data:HistoricalCandle[],spot:number)=>void;
  onOiTick:(spot:number)=>void;
};

type PendingCompute = {
  snapshot: ChartDataPlaneSnapshot;
  bucketChanged: boolean;
};

export function createChartRealtimeController(deps:ChartRealtimeControllerDeps){
  const {
    chart,candles,latestTick,dataRevisionRef,rendererController,chartDataPlane,
    chartUpdateScheduler,calculationEngine,candleAppearanceRef,chartStore,
  }=deps;

  let lastComputeSequence = 0;
  const computeScheduler = new RealtimeRateScheduler<PendingCompute>({
    intervalMs: deps.computeIntervalMs ?? 50,
    run: ({snapshot,bucketChanged}, sequence) => {
      const started = globalThis.performance?.now?.() ?? Date.now();
      const data = snapshot.candles;
      const live = data[data.length - 1];
      if (!snapshot.historyReady || !live) {
        chartPerformanceTelemetry.recordCompute(deps.chartMarketKey, 0, sequence);
        return;
      }

      calculationEngine.updateTick(live,data.length - 1,bucketChanged);
      deps.onLegacyIndicatorTick(data,bucketChanged);
      deps.onIndicatorWorker(data,bucketChanged);
      deps.onDrawingTick();
      deps.onAnalyticsTick(data,Number(latestTick.current?.ltp)||Number(live.close)||0);
      deps.onPredictionTick(data);
      if(Number.isFinite(Number(latestTick.current?.ltp)))deps.onOiTick(Number(latestTick.current!.ltp));

      chartPerformanceTelemetry.recordCompute(
        deps.chartMarketKey,
        Math.max(0,(globalThis.performance?.now?.() ?? Date.now()) - started),
        sequence,
      );
      lastComputeSequence = sequence;
    },
  });

  const handleTick=(snapshot:ChartDataPlaneSnapshot,bucketChanged:boolean)=>{
    const data=snapshot.candles;
    candles.current=data;
    latestTick.current=snapshot.latestTick;
    dataRevisionRef.current=snapshot.revision;

    if(data.length&&chart.current){
      chartUpdateScheduler.scheduleLatest('realtime-bar',()=>{
        const patchStarted=globalThis.performance?.now?.() ?? Date.now();
        chartPerformanceTelemetry.recordStage(deps.chartMarketKey,'patch',0);
        const canonical=chartDataPlane.readCanonical();
        const beforeRender=globalThis.performance?.now?.() ?? Date.now();
        rendererController.applyRealtimeCanonical(canonical,candleAppearanceRef.current);
        const afterRender=globalThis.performance?.now?.() ?? Date.now();
        chartPerformanceTelemetry.recordStage(deps.chartMarketKey,'renderer',Math.max(0,afterRender-beforeRender));
        const lastPacketAt=chartPerformanceTelemetry.getLastPacketAt(deps.chartMarketKey);
        const tickToPatch=lastPacketAt>0?Math.max(0,patchStarted-lastPacketAt):0;
        const tickToRender=lastPacketAt>0?Math.max(0,afterRender-lastPacketAt):0;
        chartPerformanceTelemetry.recordRenderUpdate(deps.chartMarketKey,tickToPatch,tickToRender,Math.max(0,afterRender-beforeRender));
      });
    }

    const marketSequence = chartMarketStore.getSequence(deps.chartMarketKey);
    computeScheduler.schedule({snapshot,bucketChanged},marketSequence);
  };

  const hydrateHistory=(snapshot:ChartDataPlaneSnapshot)=>{
    computeScheduler.cancel();
    candles.current=snapshot.candles;
    latestTick.current=snapshot.latestTick;
    dataRevisionRef.current=snapshot.revision;
    calculationEngine.reset(snapshot.candles,deps.instrumentKey,deps.timeframe);
    lastComputeSequence = 0;
  };

  const dispose=()=>computeScheduler.dispose();

  return {handleTick,hydrateHistory,setRevision:(revision:number)=>{dataRevisionRef.current=revision;},dispose};
}
