import {
  registerChartType,
  registerNativeIndicator,
  registerRendererLayer,
  type ChartTypeDefinition,
  type NativeIndicator,
  type NativeIndicatorContext,
  type NativeIndicatorDescriptor,
  type RendererLayerArgs,
  type RendererLayerDefinition,
  type SeriesDataEngine,
  type SeriesDataEngineHost,
  type InputSchema,
  type InputValue,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';

type Bar = { time:number; open:number; high:number; low:number; close:number; volume?:number };
type FlowRow = { time:number; high:number; low:number; buy:number; sell:number; delta:number; total:number; levels:Array<{price:number;buy:number;sell:number}> };
type ProfileRow = { price:number; volume:number; buy:number; sell:number; };
type LiquidityRow = { price:number; side:'bid'|'ask'; quantity:number; };

const TAU = Math.PI * 2;

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v:number,min:number,max:number):number { return Math.max(min,Math.min(max,v)); }
function visibleBars(args: RendererLayerArgs, max=220): readonly Bar[] {
  const bars = args.bars as readonly Bar[];
  if (!bars.length) return bars;
  const vr = args.coords.visibleLogicalRange();
  const from = clamp(Math.floor(vr.from) - 2, 0, bars.length - 1);
  const to = clamp(Math.ceil(vr.to) + 2, 0, bars.length);
  return bars.slice(Math.max(0, from), Math.min(to, from + max));
}
function priceY(args: RendererLayerArgs, price:number):number {
  return args.coords.priceToY(price, args.scale, args.bounds);
}
function barX(args: RendererLayerArgs, bar:Bar):number {
  return args.coords.timeToX(Number(bar.time));
}
function bodyWidth(args: RendererLayerArgs):number {
  return clamp(args.coords.bodySpacing() * 0.82, 2, 28);
}
function clearCanvas(canvas:HTMLCanvasElement,args:RendererLayerArgs):CanvasRenderingContext2D|null {
  const g=canvas.getContext('2d');
  if(!g) return null;
  g.setTransform(args.coords.dpr,0,0,args.coords.dpr,0,0);
  g.clearRect(0,0,args.coords.width,args.coords.height);
  g.globalCompositeOperation='source-over';
  return g;
}
function alpha(hex:string,a:number):string {
  const raw=String(hex||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(raw)){
    const r=parseInt(raw.slice(1,3),16),g=parseInt(raw.slice(3,5),16),b=parseInt(raw.slice(5,7),16);
    return `rgba(${r},${g},${b},${clamp(a,0,1)})`;
  }
  return raw;
}
function flowOf(bar:Bar):FlowRow {
  const high=Math.max(Number(bar.high),Number(bar.open),Number(bar.close));
  const low=Math.min(Number(bar.low),Number(bar.open),Number(bar.close));
  const total=Math.max(0,Number(bar.volume)||0);
  const span=Math.max(1e-9,high-low);
  const buy=total*clamp((Number(bar.close)-low)/span*0.5+0.25,0.02,0.98);
  const sell=Math.max(0,total-buy);
  const levels=Array.from({length:8},(_,i)=>{
    const t=(i+0.5)/8;
    const price=low+(high-low)*(1-t);
    const skew=clamp((Number(bar.close)-price)/span*0.5+0.5,0.05,0.95);
    const lvBuy=total/8*skew;
    return {price,buy:lvBuy,sell:Math.max(0,total/8-lvBuy)};
  });
  return {time:Number(bar.time),high,low,buy,sell,delta:buy-sell,total,levels};
}

function computeProfile(bars:readonly Bar[], bins=36):ProfileRow[] {
  if(!bars.length)return [];
  let lo=Infinity,hi=-Infinity;
  for(const b of bars){lo=Math.min(lo,Number(b.low));hi=Math.max(hi,Number(b.high));}
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo)return [];
  const width=(hi-lo)/bins;
  const out:ProfileRow[]=Array.from({length:bins},(_,i)=>({price:lo+width*(i+0.5),volume:0,buy:0,sell:0}));
  for(const b of bars){
    const f=flowOf(b);
    const start=Math.max(0,Math.floor((Number(b.low)-lo)/width));
    const end=Math.min(bins-1,Math.floor((Number(b.high)-lo)/width));
    const n=Math.max(1,end-start+1);
    for(let i=start;i<=end;i++){
      const row=out[i]!;
      row.volume += f.total/n;
      row.buy += f.buy/n;
      row.sell += f.sell/n;
    }
  }
  return out;
}

function createDataEngine(compute:(bars:readonly Bar[],settings:Record<string,unknown>)=>unknown):()=>SeriesDataEngine {
  return () => {
    let host:SeriesDataEngineHost|null=null;
    let settings:Record<string,unknown>={};
    const push=()=>{ if(host) host.pushData(compute(host.bars(),settings)); };
    return {
      start(next){host=next;push();},
      suspend(){},
      resume(){push();},
      stop(){host=null;},
      onViewport(){push();},
      onBars(){push();},
      onSettings(next){settings={...next};push();},
    };
  };
}

const orderflowLayer:RendererLayerDefinition={
  id:'tco-orderflow-heatmap', placement:'above-data', repaintOnCursor:false,
  create(){let canvas:HTMLCanvasElement|null=null;return{
    mount(c){canvas=c;},
    render(args){
      if(!canvas)return; const g=clearCanvas(canvas,args); if(!g)return;
      const rows=Array.isArray(args.data)?args.data as FlowRow[]: [];
      if(!rows.length)return;
      const max=Math.max(1,...rows.map(r=>Math.abs(Number(r.delta))));
      const body=bodyWidth(args);
      for(const row of rows.slice(-220)){
        const x=barX(args,row as unknown as Bar); if(!Number.isFinite(x))continue;
        const yHigh=priceY(args,Number(row.high)),yLow=priceY(args,Number(row.low));
        const span=Math.max(2,Math.abs(yLow-yHigh));
        const strength=clamp(Math.abs(row.delta)/max,0.04,1);
        const fill=row.delta>=0?alpha(args.theme.upColor,0.08+strength*0.30):alpha(args.theme.downColor,0.08+strength*0.30);
        g.fillStyle=fill;g.fillRect(x-body/2,Math.min(yHigh,yLow),body,span);
        g.fillStyle=alpha(row.delta>=0?args.theme.upColor:args.theme.downColor,0.12+strength*0.28);
        for(const lv of row.levels){
          const y=priceY(args,lv.price);
          const w=body*clamp(Math.max(lv.buy,lv.sell)/(Math.max(1,row.total/8)),0.05,1);
          g.fillRect(x-body/2,y-1,Math.max(1,w),2);
        }
      }
    },
    destroy(){canvas=null;},
  };},
};

const profileLayer:RendererLayerDefinition={
  id:'tco-market-profile', placement:'above-data', repaintOnCursor:false,
  create(){let canvas:HTMLCanvasElement|null=null;return{
    mount(c){canvas=c;},
    render(args){
      if(!canvas)return; const g=clearCanvas(canvas,args); if(!g)return;
      const data=Array.isArray(args.data)?args.data as ProfileRow[]:[];
      if(!data.length)return;
      const max=Math.max(1,...data.map(x=>x.volume));
      const width=clamp(args.coords.width*0.18,70,170);
      const x0=args.coords.width-width;
      for(const row of data){
        const y=priceY(args,row.price);
        const unit=Math.max(2,Math.abs(priceY(args,row.price)-priceY(args,row.price+(data[1]?.price-data[0]?.price||0))));
        const w=width*clamp(row.volume/max,0,1);
        const buyW=w*clamp(row.buy/Math.max(1,row.volume),0,1);
        g.fillStyle=alpha(args.theme.upColor,0.34);
        g.fillRect(x0+(w-buyW),y-unit*0.42,buyW,unit*0.84);
        g.fillStyle=alpha(args.theme.downColor,0.34);
        g.fillRect(x0,y-unit*0.42,w-buyW,unit*0.84);
      }
      g.strokeStyle=alpha(args.theme.borderColor,0.55);g.lineWidth=1;g.beginPath();g.moveTo(x0,0);g.lineTo(x0,args.coords.height);g.stroke();
    },
    destroy(){canvas=null;},
  };},
};

const liquidityLayer:RendererLayerDefinition={
  id:'tco-liquidity-heatmap', placement:'above-data', repaintOnCursor:false,
  create(){let canvas:HTMLCanvasElement|null=null;return{
    mount(c){canvas=c;},
    render(args){
      if(!canvas)return;const g=clearCanvas(canvas,args);if(!g)return;
      const data=Array.isArray(args.data)?args.data as LiquidityRow[]:[];
      if(!data.length)return;
      const max=Math.max(1,...data.map(x=>x.quantity));
      const x0=args.coords.width*0.68;
      const x1=args.coords.width-4;
      for(const row of data){
        const y=priceY(args,row.price);
        if(y<0||y>args.coords.height)continue;
        const w=(x1-x0)*clamp(row.quantity/max,0.02,1);
        g.fillStyle=alpha(row.side==='bid'?args.theme.upColor:args.theme.downColor,0.10+0.38*clamp(row.quantity/max,0,1));
        g.fillRect(x1-w,y-2,w,4);
        g.fillStyle=alpha(row.side==='bid'?args.theme.upColor:args.theme.downColor,0.55);
        g.fillRect(x1-w,y-1.5,Math.min(50,w),3);
      }
    },
    destroy(){canvas=null;},
  };},
};

registerRendererLayer(orderflowLayer);
registerRendererLayer(profileLayer);
registerRendererLayer(liquidityLayer);

function nativeDescriptor(type:string,title:string,layer:string,compute:(ctx:NativeIndicatorContext,inputs:Record<string,InputValue>)=>unknown,inputsSchema:()=>InputSchema[]=[]):NativeIndicatorDescriptor{
  return {
    type,title,shortTitle:title,paneHint:'price',overlay:true,legend:false,multiInstance:false,
    inputsSchema,defaultInputs:()=>Object.fromEntries(inputsSchema().map(x=>[x.key,x.defval])),
    create:()=>new class implements NativeIndicator{
      private ctx:NativeIndicatorContext|null=null;
      private inputs:Record<string,InputValue>={};
      private off:(()=>void)|undefined;
      start(ctx,inputs){this.ctx=ctx;this.inputs=inputs;this.recompute();if(type==='tco-liquidity-heatmap'&&ctx.live){
        this.off=tradingCoreRuntime.subscribeMarketData([ctx.symbol],event=>{
          if(event.type!=='tick'||!event.tick)return;
          const tick=event.tick as any;
          const rows=[...(Array.isArray(tick.bid)?tick.bid.map((x:any)=>({price:Number(x.price),side:'bid' as const,quantity:Number(x.quantity)||0})):[]),
                      ...(Array.isArray(tick.ask)?tick.ask.map((x:any)=>({price:Number(x.price),side:'ask' as const,quantity:Number(x.quantity)||0})):[])].filter(x=>Number.isFinite(x.price)&&x.quantity>0).slice(0,80);
          ctx.pushData(rows);
        });
      }}
      onBars(){this.recompute();}
      onViewport(){this.recompute();}
      setInputs(next){this.inputs=next;this.recompute();}
      suspend(){this.off?.();this.off=undefined;}
      resume(){this.recompute();}
      stop(){this.off?.();this.off=undefined;this.ctx=null;}
      private recompute(){const ctx=this.ctx;if(!ctx)return;ctx.pushData(compute(ctx,this.inputs));ctx.setStatus(ctx.live?'live':'idle');}
    },
  };
}

registerNativeIndicator(nativeDescriptor(
  'tco-orderflow-heatmap','Orderflow Heatmap','tco-orderflow-heatmap',
  ctx=>ctx.bars().slice(-300).map(flowOf),
));

registerNativeIndicator(nativeDescriptor(
  'tco-market-profile','Market Profile','tco-market-profile',
  (ctx,inputs)=>computeProfile(ctx.bars(),clamp(Math.floor(num(inputs.bins,36)),12,80)),
  ()=>[{key:'bins',title:'Price bins',type:'int',defval:36,min:12,max:80,step:1}],
));

registerNativeIndicator(nativeDescriptor(
  'tco-liquidity-heatmap','Liquidity Heatmap','tco-liquidity-heatmap',
  ctx=>{
    const last=ctx.bars().at(-1); if(!last)return [];
    const f=flowOf(last);
    return f.levels.flatMap(x=>[
      {price:x.price,side:'bid' as const,quantity:Math.max(0,x.buy)},
      {price:x.price,side:'ask' as const,quantity:Math.max(0,x.sell)},
    ]);
  },
));

function chartType(
  id:string,label:string,compute:(bars:readonly Bar[],settings:Record<string,unknown>)=>unknown,
  schema:()=>InputSchema[]=[],
):ChartTypeDefinition{
  return {
    id,label,basePainting:'none',
    settings:{title:label,rows:schema(),visibility:'active'},
    dataEngine:createDataEngine(compute),
  };
}

registerChartType(chartType('tco-footprint','Footprint',bars=>bars.slice(-220).map(flowOf)));
registerChartType(chartType('tco-delta','Delta',bars=>bars.slice(-260).map(flowOf),
  ()=>[{kind:'color',key:'positiveColor',label:'Positive delta',defval:'#22c55e'},{kind:'color',key:'negativeColor',label:'Negative delta',defval:'#ef4444'}],
));
registerRendererLayer({id:'tco-footprint',placement:'above-data',create(){let canvas:HTMLCanvasElement|null=null;return{
  mount(c){canvas=c;},render(args){if(!canvas)return;const g=clearCanvas(canvas,args);if(!g)return;const rows=Array.isArray(args.data)?args.data as FlowRow[]:[];const bw=bodyWidth(args);for(const row of rows.slice(-220)){const x=barX(args,row as any);const levels=row.levels;for(const lv of levels){const y=priceY(args,lv.price);const buy=lv.buy,sell=lv.sell,total=Math.max(1,buy+sell);g.fillStyle=alpha(args.theme.upColor,0.25+0.45*(buy/total));g.fillRect(x-bw/2,y-2,bw/2,4);g.fillStyle=alpha(args.theme.downColor,0.25+0.45*(sell/total));g.fillRect(x,y-2,bw/2,4);}}},destroy(){canvas=null;}};}});
registerRendererLayer({id:'tco-delta',placement:'above-data',create(){let canvas:HTMLCanvasElement|null=null;return{
  mount(c){canvas=c;},render(args){if(!canvas)return;const g=clearCanvas(canvas,args);if(!g)return;const rows=Array.isArray(args.data)?args.data as FlowRow[]:[];const bw=bodyWidth(args);for(const row of rows.slice(-260)){const x=barX(args,row as any);const yh=priceY(args,row.high),yl=priceY(args,row.low);const up=row.delta>=0;g.strokeStyle=alpha(up?args.theme.upColor:args.theme.downColor,0.85);g.lineWidth=Math.max(2,bw*0.22);g.beginPath();g.moveTo(x,(yh+yl)/2);g.lineTo(x,yl);g.stroke();const top=Math.min(priceY(args,row.open),priceY(args,row.close));const bottom=Math.max(priceY(args,row.open),priceY(args,row.close));g.fillStyle=alpha(up?args.theme.upColor:args.theme.downColor,0.65);g.fillRect(x-bw/2,top,bw,Math.max(2,bottom-top));}},destroy(){canvas=null;}};}});
function brickRows(bars:readonly Bar[],box:number){const out:Array<{time:number;open:number;close:number;high:number;low:number;up:boolean}>=[];let last:Number|number=Number.NaN;for(const b of bars){const c=Number(b.close);if(!Number.isFinite(c))continue;if(!Number.isFinite(Number(last))) {last=c;continue;} while(c-Number(last)>=box){const o=Number(last),cl=o+box;out.push({time:b.time,open:o,close:cl,high:cl,low:o,up:true});last=cl;}while(Number(last)-c>=box){const o=Number(last),cl=o-box;out.push({time:b.time,open:o,close:cl,high:o,low:cl,up:false});last=cl;}if(out.length>3000)out.splice(0,out.length-3000);}return out;}
registerChartType(chartType('tco-renko','Renko',bars=>brickRows(bars,Math.max(0.01,Math.abs(Number(bars.at(-1)?.close||1))*0.002)),
  ()=>[{kind:'number',key:'boxPercent',label:'Box %',defval:0.2,min:0.01,max:5,step:0.01}],
));
registerRendererLayer({id:'tco-renko',placement:'above-data',create(){let canvas:HTMLCanvasElement|null=null;return{
  mount(c){canvas=c;},render(args){if(!canvas)return;const g=clearCanvas(canvas,args);if(!g)return;const rows=Array.isArray(args.data)?args.data as any[]:[];const bw=bodyWidth(args)*0.9;for(const row of rows.slice(-320)){const x=barX(args,row as Bar);const top=Math.min(priceY(args,row.open),priceY(args,row.close));const bottom=Math.max(priceY(args,row.open),priceY(args,row.close));g.fillStyle=alpha(row.up?args.theme.upColor:args.theme.downColor,0.72);g.fillRect(x-bw/2,top,bw,Math.max(3,bottom-top));g.strokeStyle=alpha(args.theme.borderColor,0.8);g.strokeRect(x-bw/2,top,bw,Math.max(3,bottom-top));}},destroy(){canvas=null;}};}});
registerChartType(chartType('tco-range','Range Bars',bars=>bars.slice(-260),
  ()=>[{kind:'number',key:'minRange',label:'Minimum range',defval:0.25,min:0,max:10000,step:0.05}],
));
registerRendererLayer({id:'tco-range',placement:'above-data',create(){let canvas:HTMLCanvasElement|null=null;return{
  mount(c){canvas=c;},render(args){if(!canvas)return;const g=clearCanvas(canvas,args);if(!g)return;const rows=Array.isArray(args.data)?args.data as Bar[]:[];const bw=bodyWidth(args);for(const b of rows.slice(-260)){if(Number(b.high)-Number(b.low)<0.25)continue;const x=barX(args,b);const y1=priceY(args,b.high),y2=priceY(args,b.low);g.strokeStyle=alpha(b.close>=b.open?args.theme.upColor:args.theme.downColor,0.82);g.lineWidth=Math.max(2,bw*0.22);g.beginPath();g.moveTo(x,y1);g.lineTo(x,y2);g.stroke();}},destroy(){canvas=null;}};}});
