import { compileCoreSpirit } from '../../coreSpirit/coreSpiritPipeline';
import { replayCoreSpirit, type CoreSpiritReplayDataset } from '../../coreSpirit/replay';
import type { CoreSpiritIrProgram } from '../../coreSpirit/ir';
import type { CoreSpiritObject } from '../../coreSpirit/types';

export type SimulatedFill={id:string;time:number;price:number;qty:number;side:'Buy'|'Sell';reason:'entry'|'exit'|'reverse'};
export type SimulatedTrade={id:string;side:'long'|'short';qty:number;entry:SimulatedFill;exit?:SimulatedFill;pnl?:number};
export type SimulatedExecutionState={cash:number;equity:number;position:number;avgPrice:number;realizedPnl:number;unrealizedPnl:number;maxDrawdown:number;peakEquity:number;fills:SimulatedFill[];trades:SimulatedTrade[]};
export type ReplaySimulationReport={datasetId:string;sourceId:string;initialCapital:number;finalEquity:number;returnPct:number;maxDrawdown:number;winRate:number;fills:SimulatedFill[];trades:SimulatedTrade[];outputs:CoreSpiritObject[];traceCount:number;};

function finite(v:unknown,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function barTime(bar:any){const n=Number(bar.timestamp);const t=Number.isFinite(n)?(n>1e12?n:n*1000):Date.parse(String(bar.timestamp));return Number.isFinite(t)?t:0;}
function outputTime(o:CoreSpiritObject){return finite((o as any).time);}
function intentQty(intent:any,position:number){
  if(intent.sizing?.kind==='quantity')return Math.max(0,Math.floor(finite(intent.sizing.value)));
  if(intent.sizing?.kind==='all')return Math.abs(position);
  if(intent.metadata?.quantity!=null)return Math.max(0,Math.floor(finite(intent.metadata.quantity)));
  return 1;
}
function executeIntent(state:SimulatedExecutionState,intent:any,bar:any,index:number){
  const time=barTime(bar); const price=Math.max(0.000001,finite(intent.metadata?.price,bar.close)); const qty=intentQty(intent,state.position);
  if(qty<=0)return;
  const side=intent.side==='long'?'Buy':intent.side==='short'?'Sell':'Flat';
  const fill=(s:'Buy'|'Sell',q:number,reason:'entry'|'exit'|'reverse')=>{const f={id:'sim-'+index+'-'+state.fills.length,time,price,qty:q,side:s,reason};state.fills.push(f);return f;};
  if(side==='Flat'){
    if(state.position>0){const f=fill('Sell',Math.abs(state.position),'exit');const trade=state.trades.at(-1);if(trade){trade.exit=f;trade.pnl=(price-trade.entry.price)*trade.qty; }state.realizedPnl+=(price-state.avgPrice)*Math.abs(state.position);}
    else if(state.position<0){const f=fill('Buy',Math.abs(state.position),'exit');const trade=state.trades.at(-1);if(trade){trade.exit=f;trade.pnl=(trade.entry.price-price)*trade.qty;}state.realizedPnl+=(state.avgPrice-price)*Math.abs(state.position);}
    state.position=0;state.avgPrice=0;return;
  }
  const targetSide=side==='Buy'?1:-1;
  if(state.position!==0&&Math.sign(state.position)!==targetSide){
    const closeQty=Math.min(Math.abs(state.position),qty);
    const exit=fill(targetSide===1?'Buy':'Sell',closeQty,'reverse');
    const trade=state.trades.at(-1);
    if(trade){trade.exit=exit;trade.pnl=trade.side==='long'?(price-trade.entry.price)*closeQty:(trade.entry.price-price)*closeQty;}
    state.realizedPnl += (price-state.avgPrice)*closeQty*Math.sign(state.position);
    state.position += targetSide*closeQty;
    if(state.position===0)state.avgPrice=0;
    const remain=qty-closeQty;if(remain<=0)return;
    const entry=fill(targetSide===1?'Buy':'Sell',remain,'entry');
    state.position += targetSide*remain;state.avgPrice=price;state.trades.push({id:'sim-trade-'+index+'-'+state.trades.length,side:targetSide===1?'long':'short',qty:remain,entry,open:true} as any);return;
  }
  const entry=fill(side as 'Buy'|'Sell',qty,'entry');
  const oldAbs=Math.abs(state.position);const nextAbs=oldAbs+qty;
  state.avgPrice=oldAbs===0?price:(state.avgPrice*oldAbs+price*qty)/nextAbs;
  state.position += targetSide*qty;
  if(oldAbs===0)state.trades.push({id:'sim-trade-'+index+'-'+state.trades.length,side:targetSide===1?'long':'short',qty,entry,open:true} as any);
}

export function simulateReplayStrategy(ir:CoreSpiritIrProgram,dataset:CoreSpiritReplayDataset,initialCapital=100000):ReplaySimulationReport{
  const replay=replayCoreSpirit(ir,dataset,ir.sourceId);
  const state:SimulatedExecutionState={cash:initialCapital,equity:initialCapital,position:0,avgPrice:0,realizedPnl:0,unrealizedPnl:0,maxDrawdown:0,peakEquity:initialCapital,fills:[],trades:[]};
  const intents=replay.outputs.filter((o):o is any=>o.kind==='orderIntent').sort((a,b)=>outputTime(a)-outputTime(b));
  let intentCursor=0;
  for(let i=0;i<dataset.bars.length;i++){
    const bar=dataset.bars[i] as any;const time=barTime(bar);
    while(intentCursor<intents.length&&outputTime(intents[intentCursor])<=time){executeIntent(state,intents[intentCursor],bar,i);intentCursor++;}
    state.unrealizedPnl=state.position>0?(finite(bar.close)-state.avgPrice)*state.position:state.position<0?(state.avgPrice-finite(bar.close))*Math.abs(state.position):0;
    state.equity=initialCapital+state.realizedPnl+state.unrealizedPnl;state.peakEquity=Math.max(state.peakEquity,state.equity);state.maxDrawdown=Math.max(state.maxDrawdown,state.peakEquity-state.equity);
  }
  const closed=state.trades.filter(t=>t.pnl!=null);const wins=closed.filter(t=>finite(t.pnl)>0).length;
  return {datasetId:dataset.id,sourceId:ir.sourceId,initialCapital,finalEquity:state.equity,returnPct:(state.equity/initialCapital-1)*100,maxDrawdown:state.maxDrawdown,winRate:closed.length?wins/closed.length:0,fills:state.fills,trades:state.trades,outputs:replay.outputs,traceCount:replay.trace.length};
}

export function simulateReplayStrategyFromSource(source:string,dataset:CoreSpiritReplayDataset,sourceId='tco-replay-strategy',initialCapital=100000):ReplaySimulationReport{
  const compiled=compileCoreSpirit(source,sourceId);
  const error=compiled.diagnostics?.find(x=>x.severity==='error');
  if(!compiled.ir||error)throw new Error(error?.message||'CoreSpirit strategy compilation failed');
  return simulateReplayStrategy(compiled.ir,dataset,initialCapital);
}