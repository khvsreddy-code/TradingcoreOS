import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { CoreDrawing, normalizeCoreDrawings } from '../../drawing/coreDrawing';
import { CoreDrawingStore } from '../../drawing/coreDrawingStore';
import { CoreDrawingApi } from '../../drawing/drawingApi';
import { coreEventBus } from '../../event/eventBus';
import { CORE_DRAWING_TOOLS, getCoreDrawingTool, validateDrawingPoints } from '../../drawing/drawingTools';
import { ColorType, LineSeries, type IChartApi, type ISeriesApi, type Time } from '../velaNativeChartKernel';
import { hitTestDrawings, moveDrawingHandle, snapDataPoint } from '../../drawing/drawingGeometry';

type Ref<T>={current:T};
type DrawingTool = CoreDrawing['kind']|'none'|'crosshair';
type DrawingPoint={time:number;price:number};
type Drawing=CoreDrawing;

const line=(chart:IChartApi,color:string,width=1,lineStyle:0|1|2=0)=>chart.addSeries(LineSeries,{color,lineWidth:width,lineStyle,priceLineVisible:false,lastValueVisible:true});

export type ChartDrawingControllerDeps={
  chart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  candles:Ref<HistoricalCandle[]>;
  host:Ref<HTMLDivElement|null>;
  brokerId:string;
  instrumentKey:string;
  timeframe:string;
  showLevels:boolean;
  showVolume:boolean;
  showOI:boolean;
  showDepth:boolean;
  initialDrawings:Drawing[];
  getSelectedDrawingId:()=>string|null;
  setDrawingTool:(tool:DrawingTool)=>void;
};

export function createChartDrawingController(deps:ChartDrawingControllerDeps){
  const {chart,candle,candles,host,brokerId,instrumentKey,timeframe,getSelectedDrawingId,setDrawingTool}=deps;
  const drawingStore=new CoreDrawingStore(normalizeCoreDrawings(deps.initialDrawings,'user'));
  const drawingApi=new CoreDrawingApi(drawingStore,coreEventBus);
  const drawingPoints:DrawingPoint[]=[];
  const drawingSeries:ISeriesApi<'Line'>[]=[];
  const drawingDrag:Ref<{id:string;index:number}|null>={current:null};
  let drawingTool:DrawingTool='none';
  const drawings=()=>drawingStore.list() as Drawing[];
  const save=()=>{
    try{
      localStorage.setItem(`tradingcore:chart-state:${brokerId}:${encodeURIComponent(instrumentKey)}`,JSON.stringify({
        version:2,timeframe,drawings:drawings(),showLevels:deps.showLevels,showVolume:deps.showVolume,showOI:deps.showOI,showDepth:deps.showDepth
      }));
    }catch{}
  };
  const publishDrawing=(event:'drawing.created'|'drawing.updated',drawing:CoreDrawing)=>coreEventBus.emit(event,{id:drawing.id,owner:drawing.owner,drawing:drawing as unknown as Record<string,unknown>,timestamp:Date.now()});
  
  const renderDrawings=const renderDrawings=()=>{
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
   };;
  const commitDrawing=const commitDrawing=(tool:DrawingTool,points:DrawingPoint[],label?:string)=>{
     if(tool==='none'||tool==='crosshair'||!points.length)return;
     const definition=getCoreDrawingTool(tool as any);
     if(!definition||!definition.uiReady||!validateDrawingPoints(tool as any,points))return;
     let drawingId:string;
     try {
       drawingId=drawingApi.current.createDataDrawing(points,{kind:tool as Exclude<DrawingTool,'none'|'crosshair'>,owner:'user',label});
     } catch { return; }
     const stored=drawingApi.current.getDrawingById(drawingId); if(!stored)return;
     drawings.current=drawingStore.current.list() as Drawing[];
     publishDrawing('drawing.created',stored);
     drawingPoints.current=[];setDrawingTool('none');drawingToolRef.current='none';
     saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});renderDrawings();
   };;
  const clearDrawings=const clearDrawings=()=>{const count=drawingStore.current.clear('user');drawings.current=drawingStore.current.list() as Drawing[];drawingPoints.current=[];saveChartState(brokerId,resolvedInstrumentKey,{version:2,timeframe,drawings:drawings.current,showLevels,showVolume,showOI,showDepth});if(count)coreEventBus.emit('drawing.cleared',{timestamp:Date.now(),owner:'user'});renderDrawings();};;
  const selectDrawingTool=const selectDrawingTool=(tool:DrawingTool)=>{setDrawingTool(tool);drawingToolRef.current=tool;drawingPoints.current=[];setShowDrawingMenu(false);};;

  return {
    store:drawingStore,
    api:drawingApi,
    drag:drawingDrag,
    points:drawingPoints,
    getDrawings:drawings,
    renderDrawings,
    commitDrawing,
    clearDrawings,
    selectDrawingTool,
    save,
    hitTestDrawings,
    moveDrawingHandle,
    snapDataPoint,
    getTool:()=>drawingTool,
  };
}
