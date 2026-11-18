/**
 * Native, price-coordinate synthetic chart types. These transforms never mutate the
 * canonical OHLCV tape: history, live corrections and replay use the same chart-type
 * engine lifecycle and native Vela layer renderer.
 */
import type { OHLCV } from '../model/ohlcv';
import { msg } from '../i18n/message';
import { registerChartType, type SeriesDataEngine, type SeriesDataEngineHost } from '../../chart-types/registry';
import { registerRendererLayer, type RendererLayerArgs } from '../../renderers/native/layers';

export interface SyntheticBrick {
  logical:number; time:number; open:number; high:number; low:number; close:number; direction:1|-1;
}
export interface SyntheticKagiPoint {
  logical:number; time:number; price:number; direction:1|-1; thick:boolean;
}
export interface SyntheticPointFigureColumn {
  logical:number; direction:1|-1; prices:readonly number[];
}
export type SyntheticSourceMode = 'close' | 'ohlc';
export type SyntheticIntrabarPath = 'ohlc' | 'olhc';
export interface SyntheticBuildOptions {
  /** Close-only avoids assuming an intrabar path; OHLC mode uses the selected deterministic path. */
  sourceMode?: SyntheticSourceMode;
  /** `ohlc` = open→high→low→close; `olhc` = open→low→high→close. */
  intrabarPath?: SyntheticIntrabarPath;
}
export interface SyntheticPriceData {
  style:'renko'|'linebreak'|'kagi'|'pointfigure';
  bricks?:readonly SyntheticBrick[];
  path?:readonly SyntheticKagiPoint[];
  columns?:readonly SyntheticPointFigureColumn[];
  sourceBarCount:number;
}
const positive=(value:unknown,fallback:number):number=>{
  const n=Number(value);return Number.isFinite(n)&&n>0?n:fallback;
};
function sourcePrices(bar:OHLCV,options:SyntheticBuildOptions={}):number[]{
  if(options.sourceMode!=='ohlc')return Number.isFinite(Number(bar.close))?[Number(bar.close)]:[];
  const sequence=options.intrabarPath==='olhc'?[bar.open,bar.low,bar.high,bar.close]:[bar.open,bar.high,bar.low,bar.close];
  const out:number[]=[];
  for(const raw of sequence){const value=Number(raw);if(Number.isFinite(value)&&out[out.length-1]!==value)out.push(value);}
  return out;
}
function sampleLogical(index:number,step:number,count:number):number{
  return count<=1?index:index-0.42+((step+1)/(count+1))*0.84;
}

/** Distribute multiple synthetic outputs from one source bar across its horizontal slot. */
function spreadBarPositions<T extends {logical:number}>(items:Array<T&{sourceIndex:number}>):T[]{
  const groups=new Map<number,Array<T&{sourceIndex:number}>>();
  for(const item of items){const group=groups.get(item.sourceIndex)??[];group.push(item);groups.set(item.sourceIndex,group);}
  const out:T[]=[];
  for(const [index,group] of groups)group.forEach((item,j)=>{
    out.push({...item,logical:index-0.42+((j+0.5)/group.length)*0.84});
  });
  return out;
}

/** Renko supports close-only (safe default) or explicit OHLC-path sampling. */
export function buildRenkoSeries(bars:readonly OHLCV[],boxSize=10,reversalBoxes=2,options:SyntheticBuildOptions={}):SyntheticBrick[]{
  const box=positive(boxSize,10),reversal=Math.max(2,Math.min(10,Math.floor(reversalBoxes)||2));
  if(bars.length<2||!Number.isFinite(Number(bars[0]!.close)))return [];
  let lastClose=Number(bars[0]!.close),direction:0|1|-1=0;
  const out:Array<SyntheticBrick&{sourceIndex:number}>=[];
  for(let i=1;i<bars.length;i++){
    const bar=bars[i]!,prices=sourcePrices(bar,options);
    for(const price of prices){
      const add=(open:number,close:number,dir:1|-1)=>{
        out.push({logical:i,sourceIndex:i,time:bar.time,open,high:Math.max(open,close),low:Math.min(open,close),close,direction:dir});
        lastClose=close;
      };
      if(direction===0){
        while(price>=lastClose+box){add(lastClose,lastClose+box,1);direction=1;}
        while(price<=lastClose-box){add(lastClose,lastClose-box,-1);direction=-1;}
      }else if(direction===1){
        if(price<=lastClose-reversal*box){add(lastClose-(reversal-1)*box,lastClose-reversal*box,-1);direction=-1;}
        else while(price>=lastClose+box)add(lastClose,lastClose+box,1);
        while(direction===-1&&price<=lastClose-box)add(lastClose,lastClose-box,-1);
      }else{
        if(price>=lastClose+reversal*box){add(lastClose+(reversal-1)*box,lastClose+reversal*box,1);direction=1;}
        else while(price<=lastClose-box)add(lastClose,lastClose-box,-1);
        while(direction===1&&price>=lastClose+box)add(lastClose,lastClose+box,1);
      }
    }
  }
  return spreadBarPositions(out);
}

/** A new N-Line Break candle closes outside the most recent N accepted line closes. */
export function buildLineBreakSeries(bars:readonly OHLCV[],lineCount=3,options:SyntheticBuildOptions={}):SyntheticBrick[]{
  const count=Math.max(1,Math.min(20,Math.floor(lineCount)||3));
  if(bars.length<2||!Number.isFinite(Number(bars[0]!.close)))return [];
  let previous=Number(bars[0]!.close);
  const lines:Array<SyntheticBrick&{sourceIndex:number}>=[];
  for(let i=1;i<bars.length;i++){
    const bar=bars[i]!;
    for(const close of sourcePrices(bar,options)){
      let direction:1|-1|null=null;
      if(lines.length<count)direction=close>previous?1:close<previous?-1:null;
      else{
        const recent=lines.slice(-count);
        if(close>Math.max(...recent.map(x=>x.high)))direction=1;
        else if(close<Math.min(...recent.map(x=>x.low)))direction=-1;
      }
      if(direction==null)continue;
      lines.push({logical:i,sourceIndex:i,time:bar.time,open:previous,high:Math.max(previous,close),low:Math.min(previous,close),close,direction});
      previous=close;
    }
  }
  return spreadBarPositions(lines);
}

/** Kagi retains swing extrema; a direction change requires the configured retracement. */
export function buildKagiSeries(bars:readonly OHLCV[],reversal=10,options:SyntheticBuildOptions={}):SyntheticKagiPoint[]{
  const threshold=positive(reversal,10);
  if(!bars.length||!Number.isFinite(Number(bars[0]!.close)))return [];
  const first=Number(bars[0]!.close);
  const points:SyntheticKagiPoint[]=[{logical:0,time:bars[0]!.time,price:first,direction:1,thick:false}];
  let direction:0|1|-1=0,extreme=first,extremeLogical=0,extremeTime=bars[0]!.time,priorHigh=first,priorLow=first;
  for(let i=1;i<bars.length;i++){
    const bar=bars[i]!,prices=sourcePrices(bar,options);
    for(let j=0;j<prices.length;j++){
      const price=prices[j]!,logical=sampleLogical(i,j,prices.length);
      if(direction===0){
        if(price>=extreme+threshold)direction=1;
        else if(price<=extreme-threshold)direction=-1;
        else continue;
        extreme=price;extremeLogical=logical;extremeTime=bar.time;
        points.push({logical,time:bar.time,price,direction,thick:false});
      }else if(direction===1){
        if(price>extreme){
          extreme=price;extremeLogical=logical;extremeTime=bar.time;
          points.push({logical,time:bar.time,price,direction:1,thick:price>priorHigh});
        }else if(extreme-price>=threshold){
          priorHigh=extreme;
          const last=points[points.length-1];
          if(last?.logical!==extremeLogical||last?.price!==extreme)points.push({logical:extremeLogical,time:extremeTime,price:extreme,direction:1,thick:true});
          direction=-1;extreme=price;extremeLogical=logical;extremeTime=bar.time;
          points.push({logical,time:bar.time,price,direction:-1,thick:price<priorLow});
        }
      }else if(price<extreme){
        extreme=price;extremeLogical=logical;extremeTime=bar.time;
        points.push({logical,time:bar.time,price,direction:-1,thick:price<priorLow});
      }else if(price-extreme>=threshold){
        priorLow=extreme;
        const last=points[points.length-1];
        if(last?.logical!==extremeLogical||last?.price!==extreme)points.push({logical:extremeLogical,time:extremeTime,price:extreme,direction:-1,thick:true});
        direction=1;extreme=price;extremeLogical=logical;extremeTime=bar.time;
        points.push({logical,time:bar.time,price,direction:1,thick:price>priorHigh});
      }
    }
  }
  return points;
}

/** Point & Figure supports explicit OHLC path sampling while defaulting to close-only. */
export function buildPointFigureSeries(bars:readonly OHLCV[],boxSize=10,reversalBoxes=3,options:SyntheticBuildOptions={}):SyntheticPointFigureColumn[]{
  const box=positive(boxSize,10),reversal=Math.max(2,Math.min(20,Math.floor(reversalBoxes)||3));
  if(bars.length<2||!Number.isFinite(Number(bars[0]!.close)))return [];
  let lastBox=Math.floor(Number(bars[0]!.close)/box),direction:0|1|-1=0;
  const columns:Array<{logical:number;sourceIndex:number;direction:1|-1;prices:number[]}>=[];
  let current:{logical:number;sourceIndex:number;direction:1|-1;prices:number[]}|null=null;
  const add=(i:number,dir:1|-1,b:number,startNew:boolean)=>{
    if(startNew||!current||current.direction!==dir){current={logical:i,sourceIndex:i,direction:dir,prices:[]};columns.push(current);}
    current.prices.push(b*box);
  };
  for(let i=1;i<bars.length;i++){
    for(const price of sourcePrices(bars[i]!,options)){
      const target=Math.floor(price/box);
      if(direction===0){
        if(target>lastBox){direction=1;for(let b=lastBox+1;b<=target;b++)add(i,1,b,false);lastBox=target;}
        else if(target<lastBox){direction=-1;for(let b=lastBox-1;b>=target;b--)add(i,-1,b,false);lastBox=target;}
      }else if(direction===1){
        if(target>lastBox){for(let b=lastBox+1;b<=target;b++)add(i,1,b,false);lastBox=target;}
        else if(lastBox-target>=reversal){direction=-1;for(let b=lastBox-1;b>=target;b--)add(i,-1,b,columns[columns.length-1]?.direction!==-1);lastBox=target;}
      }else if(target<lastBox){for(let b=lastBox-1;b>=target;b--)add(i,-1,b,false);lastBox=target;}
      else if(target-lastBox>=reversal){direction=1;for(let b=lastBox+1;b<=target;b++)add(i,1,b,columns[columns.length-1]?.direction!==1);lastBox=target;}
    }
  }
  return spreadBarPositions(columns);
}

function readSetting(v:Record<string,unknown>,key:string,fallback:number):number{const n=Number(v[key]);return Number.isFinite(n)?n:fallback;}
function buildOptions(settings:Record<string,unknown>):SyntheticBuildOptions{
  return {
    sourceMode:settings.sourceMode==='ohlc'?'ohlc':'close',
    intrabarPath:settings.intrabarPath==='olhc'?'olhc':'ohlc',
  };
}
function buildData(style:SyntheticPriceData['style'],bars:readonly OHLCV[],settings:Record<string,unknown>):SyntheticPriceData{
  const options=buildOptions(settings);
  if(style==='renko')return{style,bricks:buildRenkoSeries(bars,readSetting(settings,'boxSize',10),readSetting(settings,'reversalBoxes',2),options),sourceBarCount:bars.length};
  if(style==='linebreak')return{style,bricks:buildLineBreakSeries(bars,readSetting(settings,'lineCount',3),options),sourceBarCount:bars.length};
  if(style==='kagi')return{style,path:buildKagiSeries(bars,readSetting(settings,'reversal',10),options),sourceBarCount:bars.length};
  return{style,columns:buildPointFigureSeries(bars,readSetting(settings,'boxSize',10),readSetting(settings,'reversalBoxes',3),options),sourceBarCount:bars.length};
}

class SyntheticEngine implements SeriesDataEngine{
  private host:SeriesDataEngineHost|null=null;private settings:Record<string,unknown>={};private active=false;
  constructor(private readonly style:SyntheticPriceData['style']){}
  start(host:SeriesDataEngineHost){this.host=host;this.active=true;this.publish();}
  onBars(){this.publish();}
  onSettings(values:Record<string,unknown>){this.settings={...values};this.publish();}
  suspend(){this.active=false;}
  resume(){this.active=true;this.publish();}
  stop(){this.active=false;this.host=null;}
  private publish(){if(this.active&&this.host)this.host.pushData(buildData(this.style,this.host.bars(),this.settings));}
}
function paintBricks(ctx:CanvasRenderingContext2D,args:RendererLayerArgs,bricks:readonly SyntheticBrick[]){
  const width=Math.max(2,Math.min(24,args.coords.bodySpacing()*0.76));
  for(const brick of bricks){
    const x=args.coords.logicalToX(brick.logical),y1=args.coords.priceToY(brick.high,args.scale,args.bounds),y2=args.coords.priceToY(brick.low,args.scale,args.bounds);
    if(![x,y1,y2].every(Number.isFinite))continue;
    const top=Math.min(y1,y2),height=Math.max(1/args.coords.dpr,Math.abs(y2-y1)),color=brick.direction>0?args.theme.upColor:args.theme.downColor;
    ctx.globalAlpha=0.86;ctx.fillStyle=color;ctx.fillRect(x-width/2,top,width,height);ctx.globalAlpha=1;
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(x-width/2+0.5,top+0.5,Math.max(0,width-1),Math.max(0,height-1));
  }
}
function paintKagi(ctx:CanvasRenderingContext2D,args:RendererLayerArgs,points:readonly SyntheticKagiPoint[]){
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,x1=args.coords.logicalToX(a.logical),y1=args.coords.priceToY(a.price,args.scale,args.bounds);
    const x2=args.coords.logicalToX(b.logical),y2=args.coords.priceToY(b.price,args.scale,args.bounds);
    if(![x1,y1,x2,y2].every(Number.isFinite))continue;
    ctx.beginPath();ctx.strokeStyle=b.direction>0?args.theme.upColor:args.theme.downColor;ctx.lineWidth=b.thick?3.5:2;
    ctx.lineJoin='miter';ctx.lineCap='square';ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }
}
function paintPointFigure(ctx:CanvasRenderingContext2D,args:RendererLayerArgs,columns:readonly SyntheticPointFigureColumn[]){
  const pitch=Math.max(5,Math.min(18,args.coords.bodySpacing()*0.85)),size=Math.max(8,Math.min(18,pitch*0.9));
  ctx.font=`600 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
  for(const column of columns){
    const x=args.coords.logicalToX(column.logical);if(!Number.isFinite(x))continue;
    for(const price of column.prices){
      const y=args.coords.priceToY(price,args.scale,args.bounds);if(!Number.isFinite(y))continue;
      const color=column.direction>0?args.theme.upColor:args.theme.downColor;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,size/8);
      if(column.direction>0){const r=size*0.38;ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.stroke();}
      else{ctx.beginPath();ctx.arc(x,y,size*0.36,0,Math.PI*2);ctx.stroke();}
    }
  }
}
function registerLayer(style:SyntheticPriceData['style']){
  registerRendererLayer({id:style,create:()=>{
    let canvas:HTMLCanvasElement|null=null;
    return{
      mount(next){canvas=next;},
      render(args){
        if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
        const dpr=Math.max(1,args.coords.dpr||1);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);
        if(args.priceStyle!==style)return;const data=args.data as SyntheticPriceData|undefined;if(!data||data.style!==style)return;
        ctx.save();
        if(style==='renko'||style==='linebreak')paintBricks(ctx,args,data.bricks??[]);
        else if(style==='kagi')paintKagi(ctx,args,data.path??[]);
        else paintPointFigure(ctx,args,data.columns??[]);
        ctx.restore();
      },
      destroy(){canvas=null;},
    };
  }});
}
const sourceRows=[
  {kind:'select' as const,key:'sourceMode',label:msg('chart.synthetic.sourceMode','Price source'),options:[['close','Close only'],['ohlc','OHLC path']] as const,defval:'close'},
  {kind:'select' as const,key:'intrabarPath',label:msg('chart.synthetic.intrabarPath','Intrabar path'),options:[['ohlc','Open → High → Low → Close'],['olhc','Open → Low → High → Close']] as const,defval:'ohlc',when:{key:'sourceMode',equals:'ohlc'}},
];
const boxRows=[
  {kind:'number' as const,key:'boxSize',label:msg('chart.synthetic.boxSize','Box size'),defval:10,min:0.01,max:100000,step:0.25},
  {kind:'number' as const,key:'reversalBoxes',label:msg('chart.synthetic.reversalBoxes','Reversal boxes'),defval:2,min:2,max:10,step:1},
  ...sourceRows,
];

export function registerSyntheticPriceStyles():void{
  registerLayer('renko');registerLayer('linebreak');registerLayer('kagi');registerLayer('pointfigure');
  registerChartType({id:'renko',label:msg('chart.priceStyle.renko','Renko'),basePainting:'none',dataEngine:()=>new SyntheticEngine('renko'),
    settings:{title:msg('chart.synthetic.renko.settings','Renko'),rows:boxRows},supports:facts=>facts.ohlc!==false});
  registerChartType({id:'linebreak',label:msg('chart.priceStyle.lineBreak','Line Break'),basePainting:'none',dataEngine:()=>new SyntheticEngine('linebreak'),
    settings:{title:msg('chart.synthetic.linebreak.settings','Line Break'),rows:[{kind:'number',key:'lineCount',label:msg('chart.synthetic.lineCount','Lines to break'),defval:3,min:1,max:20,step:1},...sourceRows]},supports:facts=>facts.ohlc!==false});
  registerChartType({id:'kagi',label:msg('chart.priceStyle.kagi','Kagi'),basePainting:'none',dataEngine:()=>new SyntheticEngine('kagi'),
    settings:{title:msg('chart.synthetic.kagi.settings','Kagi'),rows:[{kind:'number',key:'reversal',label:msg('chart.synthetic.reversal','Reversal amount'),defval:10,min:0.01,max:100000,step:0.25},...sourceRows]},supports:facts=>facts.ohlc!==false});
  registerChartType({id:'pointfigure',label:msg('chart.priceStyle.pointFigure','Point & Figure'),basePainting:'none',dataEngine:()=>new SyntheticEngine('pointfigure'),
    settings:{title:msg('chart.synthetic.pointfigure.settings','Point & Figure'),rows:boxRows},supports:facts=>facts.ohlc!==false});
}
