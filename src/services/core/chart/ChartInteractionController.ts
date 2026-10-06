import { hitTestDrawings, moveDrawingHandle, snapDataPoint } from '../drawing/drawingGeometry';
import type { CoreDrawingStore } from '../drawing/coreDrawingStore';
import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { DrawingTool } from '../../../components/workspace/drawingTypes';
import type { IChartApi, ISeriesApi } from './velaNativeChartKernel';
import type { ChartLifecycle } from './chartLifecycle';
import type { ChartStore } from './ChartStore';
import type { ChartDataController } from './controllers/ChartDataController';

type Ref<T>={current:T};

export type ChartInteractionControllerDeps={
  chart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  host:Ref<HTMLDivElement|null>;
  candles:Ref<HistoricalCandle[]>;
  chartStore:ChartStore;
  lifecycle:ChartLifecycle;
  generation:number;
  drawingController:any;
  indicatorController:any;
  dataController:{loadOlderHistory:(visibleBars?:number)=>Promise<unknown>};
  timeframe:string;
  chartIndex?:number;
  resolvedInstrumentKey:string;
  previousLogicalRange:Ref<{from:number;to:number}|null>;
  drawingToolRef:Ref<DrawingTool>;
  selectedDrawingIdRef:Ref<string|null>;
  setSelectedDrawingId:(id:string|null)=>void;
  setDrawingTool?:(tool:DrawingTool)=>void;
  rendererController:{resize:(width:number,height:number)=>void};
  crosshairVisible:boolean;
  onDebugBar?:(detail:unknown)=>void;
  shouldLoadOlderHistory:(range:{from:number;to:number},length:number,timeframe:string)=>boolean;
};

export function createChartInteractionController(deps:ChartInteractionControllerDeps){
  let drawingDrag:{id:string;index:number}|null=null;
  let ignoreRangeEvents=3;

  const coordinateAdapter=()=>({
    timeToX:(time:number)=>Number((deps.chart.current?.timeScale() as any)?.timeToCoordinate?.(time as any)),
    priceToY:(price:number)=>Number((deps.candle.current as any)?.priceToCoordinate?.(price)),
    xToTime:(x:number)=>{const value=(deps.chart.current?.timeScale() as any)?.coordinateToTime?.(x);return value==null?null:Number(value);},
    yToPrice:(y:number)=>{const value=(deps.candle.current as any)?.coordinateToPrice?.(y);return value==null?null:Number(value);},
  });

  const onVisibleLogicalRangeChange=(range:any)=>{
    if(!range)return;
    const normalized={from:Number(range.from),to:Number(range.to)};
    deps.chartStore.setVisibleRange(normalized);
    deps.indicatorController.applyIndicatorAppearanceOnly();
    deps.indicatorController.requestIndicatorWorker(deps.candles.current,normalized,'snapshot','replace');
    if(ignoreRangeEvents>0){ignoreRangeEvents-=1;deps.previousLogicalRange.current=normalized;return;}
    const previous=deps.previousLogicalRange.current;
    const movingBackward=!!previous&&normalized.from<previous.from-2;
    deps.previousLogicalRange.current=normalized;
    const visibleBars=Math.max(1,Math.abs(normalized.to-normalized.from));
    if(deps.chartStore.getSnapshot().historyReady&&movingBackward&&deps.shouldLoadOlderHistory(normalized,deps.candles.current.length,deps.timeframe)){
      void deps.dataController.loadOlderHistory(Math.min(deps.candles.current.length,visibleBars));
    }
  };

  const onPointerDown=(event:PointerEvent)=>{
    if(deps.drawingToolRef.current!=='none'||!deps.candle.current)return;
    const rect=deps.host.current?.getBoundingClientRect();if(!rect)return;
    const cursor={x:event.clientX-rect.left,y:event.clientY-rect.top};
    const hit=hitTestDrawings(deps.drawingController.getDrawings(),cursor,coordinateAdapter(),9);
    deps.setSelectedDrawingId(hit?.drawingId||null);
    if(hit?.handle){
      drawingDrag={id:hit.drawingId,index:hit.handle.index};
      deps.host.current?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  };

  const onPointerMove=(event:PointerEvent)=>{
    if(!drawingDrag)return;
    const drawing=deps.drawingController.store.get(drawingDrag.id);
    if(!drawing)return;
    const rect=deps.host.current?.getBoundingClientRect();if(!rect)return;
    const moved=moveDrawingHandle(
      drawing,
      drawingDrag.index,
      {x:event.clientX-rect.left,y:event.clientY-rect.top},
      coordinateAdapter(),
    );
    if(moved){
      deps.drawingController.store.update(drawingDrag.id,moved);
      deps.drawingController.renderDrawings();
    }
  };

  const onPointerUp=()=>{
    if(!drawingDrag)return;
    drawingDrag=null;
    deps.drawingController.save();
  };

  const onChartClick=(param:any)=>{
    const tool=deps.drawingToolRef.current;
    if(!param?.point||!deps.candle.current)return;
    const timeScale=deps.chart.current?.timeScale() as any;
    const rawTime=timeScale?.coordinateToTime?.(param.point.x);
    const rawPrice=(deps.candle.current as any)?.coordinateToPrice?.(param.point.y);
    if(rawTime==null||rawPrice==null||!Number.isFinite(Number(rawPrice)))return;
    if(tool==='none'){
      deps.onDebugBar?.({chartIndex:deps.chartIndex,symbol:deps.resolvedInstrumentKey,timeframe:deps.timeframe,barIndex:-1,time:Number(rawTime),price:Number(rawPrice)});
      return;
    }
    if(tool==='crosshair')return;
    const snapCandidates=deps.candles.current.slice(-250).flatMap((b:any)=>{
      const t=Math.floor(Date.parse(b.timestamp)/1000);
      return [
        {time:t,price:Number(b.open),kind:'ohlc' as const},
        {time:t,price:Number(b.high),kind:'ohlc' as const},
        {time:t,price:Number(b.low),kind:'ohlc' as const},
        {time:t,price:Number(b.close),kind:'ohlc' as const},
      ].filter(x=>Number.isFinite(x.price));
    });
    const point=snapDataPoint(
      {time:Number(rawTime),price:Number(rawPrice)},
      snapCandidates,
      coordinateAdapter(),
      10,
    );
    if(['horizontal','horizontalRay','vertical'].includes(tool)){
      deps.drawingController.commitDrawing(tool,[point]);
      return;
    }
    if(tool==='text'){
      const label=window.prompt('Chart text','Text')||'';
      if(label)deps.drawingController.commitDrawing(tool,[point],label);
      return;
    }
    deps.drawingController.points.push(point);
    const needed=['parallelChannel','pitchfork','fibExtension'].includes(tool)?3:2;
    if(deps.drawingController.points.length>=needed)deps.drawingController.commitDrawing(tool,deps.drawingController.points);
  };

  const resizeObserver=typeof ResizeObserver!=='undefined'&&deps.host.current
    ? new ResizeObserver(()=>{
        if(!deps.lifecycle.isCurrent(deps.generation))return;
        try{
          const r=deps.host.current!.getBoundingClientRect();
          deps.rendererController.resize(r.width,r.height);
        }catch{}
      })
    : undefined;

  const attach=()=>{
    const chart=deps.chart.current;
    const host=deps.host.current;
    if(!chart||!host)return ()=>undefined;
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
    chart.subscribeClick(onChartClick);
    host.addEventListener('pointerdown',onPointerDown);
    host.addEventListener('pointermove',onPointerMove);
    host.addEventListener('pointerup',onPointerUp);
    host.addEventListener('pointercancel',onPointerUp);
    resizeObserver?.observe(host);
    return ()=>{
      try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}
      try{chart.unsubscribeClick(onChartClick)}catch{}
      host.removeEventListener('pointerdown',onPointerDown);
      host.removeEventListener('pointermove',onPointerMove);
      host.removeEventListener('pointerup',onPointerUp);
      host.removeEventListener('pointercancel',onPointerUp);
      resizeObserver?.disconnect();
    };
  };

  return {attach,onVisibleLogicalRangeChange};
}
