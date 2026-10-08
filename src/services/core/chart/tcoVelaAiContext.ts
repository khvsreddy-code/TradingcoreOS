import type { WidgetContext } from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import type { CoreSpiritSignalExplanation } from '../../coreSpirit/explainability';

export type VelaAiContextPacket={
  generatedAt:number; symbol:string; timeframe:string; price:number|null; ohlc:{o:number;h:number;l:number;c:number;volume:number}|null;
  trend:'bullish'|'bearish'|'sideways'|'unknown'; trendScore:number; volatilityPct:number|null; rangePosition:number|null;
  replay:{active:boolean;playing:boolean;cursorTime:number|null;remaining:number};
  nativeIndicators:string[]; scene:{indicators:number;series:number;trades:number;lines:number;boxes:number;labels:number};
  coreSpirit?:{id:string;title:string;facts:Record<string,number|string|boolean|null>;warnings:string[]};
  riskFlags:string[];
};

function finite(v:unknown,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function parse(v:string){const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;}
function sma(values:number[],len:number){if(values.length<len)return null;const xs=values.slice(-len);return xs.reduce((a,b)=>a+b,0)/len;}
function stdev(values:number[]){if(values.length<2)return null;const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((s,x)=>s+(x-mean)*(x-mean),0)/values.length);}

export async function buildVelaAiContext(ctx:WidgetContext):Promise<VelaAiContextPacket>{
  const readout=ctx.chart.renderer.dataWindowReadout();
  const ohlc=readout?.ohlc?{o:finite(parse(readout.ohlc.o)),h:finite(parse(readout.ohlc.h)),l:finite(parse(readout.ohlc.l)),c:finite(parse(readout.ohlc.c)),volume:finite(parse(readout.ohlc.vol||''))}:null;
  const replay=ctx.chart.replay.state;
  const scene=ctx.chart.inspect();
  let closes:number[]=[];
  try{const rows=await tradingCoreRuntime.getHistoricalData(ctx.symbol,ctx.timeframe,undefined,240);closes=rows.map(x=>Number(x.close)).filter(Number.isFinite);}catch{}
  const last=closes.at(-1)??ohlc?.c??null;const ma20=last!=null?sma(closes,20):null;const ma50=last!=null?sma(closes,50):null;
  const recent=closes.slice(-20);const sd=stdev(recent);const volatilityPct=last&&sd!=null?sd/Math.abs(last)*100:null;
  const slope=closes.length>=20?(closes.at(-1)!-closes.at(-20)!)/Math.max(1,Math.abs(closes.at(-20)!)):0;
  const trendScore=(ma20!=null&&ma50!=null?clamp((last-ma50)/Math.max(1,Math.abs(ma50))*100, -100, 100):0)+clamp(slope*100, -50, 50);
  const trend=trendScore>8?'bullish':trendScore<-8?'bearish':closes.length?'sideways':'unknown';
  const rangePosition=ohlc?clamp((ohlc.c-ohlc.l)/Math.max(1e-9,ohlc.h-ohlc.l),0,1):null;
  const riskFlags:string[]=[];
  if(volatilityPct!=null&&volatilityPct>2)riskFlags.push('Elevated short-window volatility.');
  if(rangePosition!=null&&rangePosition>0.9)riskFlags.push('Price is near the bar high; avoid chasing without confirmation.');
  if(rangePosition!=null&&rangePosition<0.1)riskFlags.push('Price is near the bar low; avoid fading without confirmation.');
  if(replay.active)riskFlags.push('Replay mode is active; live execution must remain disabled.');
  const core=ctx.chart.indicators().find((x:any)=>x?.language==='corespirit'||x?.source);
  let coreSpirit:VelaAiContextPacket['coreSpirit'];
  if(core){try{const data=await core.context();const locals=(data as any)?.variables??{};const facts:Record<string,number|string|boolean|null>={};for(const [k,v] of Object.entries(locals).slice(-20)){if(v==null||typeof v==='number'||typeof v==='string'||typeof v==='boolean')facts[k]=v as any;}coreSpirit={id:core.id,title:core.title,facts,warnings:((data as any)?.warnings??[]).map((x:any)=>String(x?.message??x)).slice(-10)}}catch{}}
  return {generatedAt:Date.now(),symbol:ctx.symbol,timeframe:ctx.timeframe,price:last,ohlc,trend,trendScore,volatilityPct,rangePosition,replay,nativeIndicators:ctx.chart.presentNativeIndicators(),scene:{indicators:scene.indicators.length,series:scene.totals.series,trades:scene.totals.trades,lines:scene.totals.lines,boxes:scene.totals.boxes,labels:scene.totals.labels},coreSpirit,riskFlags};
}

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}

export function explainVelaContext(packet:VelaAiContextPacket):string{
  const trend=packet.trend==='unknown'?'Trend unavailable.':('Trend '+packet.trend+' (score '+packet.trendScore.toFixed(1)+').');
  const vol=packet.volatilityPct==null?'Volatility unavailable.':'20-bar dispersion ~'+packet.volatilityPct.toFixed(2)+'% of price.';
  const replay=packet.replay.active?'Replay cursor is '+(packet.replay.cursorTime?new Date(packet.replay.cursorTime).toLocaleString('en-IN'):'active')+'.':'Live market context.';
  const risks=packet.riskFlags.length?'Risk flags: '+packet.riskFlags.join(' '):'No heuristic risk flags triggered.';
  const spirit=packet.coreSpirit?('CoreSpirit '+packet.coreSpirit.title+' is active with '+Object.keys(packet.coreSpirit.facts).length+' scalar facts.'):'No active CoreSpirit execution context exposed.';
  return [packet.symbol+' · '+packet.timeframe,trend,vol,replay,spirit,risks].join(' ');
}

export function buildVelaAiPrompt(packet:VelaAiContextPacket):string{
  return 'Analyze this trading-chart context without inventing data. Return: market regime, evidence, key risks, invalidation, and what additional confirmation is needed. Context JSON:\n'+JSON.stringify(packet,null,2);
}