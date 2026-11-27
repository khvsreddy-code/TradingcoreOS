import { calculateCoreSpiritSimulationMetrics, type CoreSpiritBacktestMetrics } from './backtestMetrics';
import { CoreSpiritBacktestExecutionHost, type CoreSpiritHostRunResult } from './executionHost';
import type { CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritMarketDataset } from './marketData';
import {
  runStrategySimulation,
  type SimulationAction,
  type SimulationConfig,
  type SimulationDataset,
  type SimulationIntent,
  type StrategySimulationResult,
} from '../core/replay/strategySimulator';

type Primitive=string|number|boolean|null|undefined;
type PineCommandName='entry'|'order'|'exit'|'close'|'close_all'|'cancel'|'cancel_all';
type PineStrategyCommandV1=Readonly<{
  version:1;
  command:PineCommandName|string;
  programId:string;
  symbol:string;
  timeframe:string;
  barIndex:number;
  barTimestampMs:number;
  revision:number;
  sourceCallId:string;
  args:readonly unknown[];
}>;

export type CoreSpiritPineStrategySimulationInput=Readonly<{
  strategyId:string;
  sourceProgramChecksum:string;
  datasetId:string;
  datasets:readonly SimulationDataset[];
  /** CoreSpirit outputs produced by evaluating the Pine strategy program over its dataset. */
  outputs:readonly unknown[];
  /** Applied only when strategy.entry/order omit qty; declaration defaults are host supplied. */
  defaultQuantity:number;
  tickSizeBySymbol?:Readonly<Record<string,number>>;
  config?:Partial<SimulationConfig>;
}>;
export type CoreSpiritPineStrategySimulationResult=Readonly<{
  simulation:StrategySimulationResult;
  actions:readonly SimulationAction[];
  diagnostics:readonly string[];
  metrics:CoreSpiritBacktestMetrics|null;
}>;

function record(value:unknown):Record<string,unknown>|undefined{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
}
function numberAt(args:readonly unknown[],index:number):number|undefined{
  const value=args[index];
  if(value===null||value===undefined)return undefined;
  const n=Number(value);
  return Number.isFinite(n)?n:undefined;
}
function stringAt(args:readonly unknown[],index:number):string|undefined{
  const value=args[index];
  return typeof value==='string'&&value.trim()?value.trim():undefined;
}
function boolAt(args:readonly unknown[],index:number):boolean{
  return args[index]===true;
}
function isPositive(value:number|undefined):value is number{
  return value!==undefined&&Number.isFinite(value)&&value>0;
}

/** Convert VM-emitted Pine strategy commands into simulator actions only.
 * No live order-intent, execution gateway or broker adapter is imported here.
 */
export function coreSpiritPineStrategyCommandsToSimulationActions(
  outputs:readonly unknown[],
  options:Pick<CoreSpiritPineStrategySimulationInput,'defaultQuantity'|'tickSizeBySymbol'|'datasets'>,
):Readonly<{actions:readonly SimulationAction[];diagnostics:readonly string[]}>{
  if(!isPositive(options.defaultQuantity))throw new Error('defaultQuantity must be finite and positive.');
  const actions:SimulationAction[]=[],diagnostics:string[]=[],seen=new Set<string>();
  let sequence=0;
  for(const output of outputs){
    const item=record(output);
    if(item?.kind!=='event')continue;
    const metadata=record(item.metadata),command=record(metadata?.coreSpiritStrategyCommand) as PineStrategyCommandV1|undefined;
    if(!command||command.version!==1)continue;
    const eventId=String(item.id??'');
    if(!eventId)throw new Error('Strategy command output is missing its stable event ID.');
    if(seen.has(eventId))continue;
    seen.add(eventId);
    const symbol=String(command.symbol??''),signalTimeMs=Number(command.barTimestampMs),barIndex=Number(command.barIndex);
    if(!symbol||!Number.isSafeInteger(signalTimeMs)||signalTimeMs<=0||!Number.isSafeInteger(barIndex)||barIndex<0||
       !String(command.programId??'').trim()||!String(command.sourceCallId??'').trim()||!Array.isArray(command.args)){
      throw new Error('Strategy command envelope has invalid program, symbol, bar or call-site identity.');
    }
    const args=command.args,signalId=eventId,orderId=eventId,seq=sequence++;
    const reject=(reason:string,side?:'buy'|'sell')=>{
      actions.push({kind:'reject',signalTimeMs,sequence:seq,orderId,signalId,symbol,side,reason});
      diagnostics.push(command.command+': '+reason);
    };
    const quantity=numberAt(args,2);
    if(command.command==='entry'||command.command==='order'){
      const entryId=stringAt(args,0),direction=stringAt(args,1)?.toLowerCase();
      if(!entryId||!['long','short'].includes(String(direction))){reject('id and direction must be valid; direction is strategy.long or strategy.short.');continue;}
      const side=direction==='long'?'buy':'sell';
      const resolvedQuantity=quantity??options.defaultQuantity;
      if(!isPositive(resolvedQuantity)){reject('qty must be positive or the host must provide a valid declaration default.',side);continue;}
      const limit=numberAt(args,3),stop=numberAt(args,4),ocaName=stringAt(args,5);
      const ocaTypeRaw=(command.command==='entry'||command.command==='order')?(stringAt(args,6)??'none'):'none';
      if((command.command==='entry'||command.command==='order')&&ocaName&&!['none','cancel','reduce'].includes(ocaTypeRaw)){
        reject('strategy.entry/order oca_type must be strategy.oca.none, strategy.oca.cancel or strategy.oca.reduce.',side);continue;
      }
      const type=limit!==undefined&&stop!==undefined?'stop-limit':limit!==undefined?'limit':stop!==undefined?'stop':'market';
      const intent:SimulationIntent={
        orderId,signalId,symbol,side,type,quantity:resolvedQuantity,
        ...(limit!==undefined?{limitPrice:limit}:{}),...(stop!==undefined?{stopPrice:stop}:{}),
        entryId,countsTowardPyramiding:command.command==='entry',tag:entryId,
        ...(ocaName&&ocaTypeRaw!=='none'?{ocaGroup:symbol+':'+ocaName,ocaType:(ocaTypeRaw==='reduce'?'reduce':'cancel') as 'cancel'|'reduce'}:{}),
      };
      actions.push({kind:'submit',signalTimeMs,sequence:seq,intent,reason:'Pine strategy.'+command.command+'() simulation command.'});
      continue;
    }
    if(command.command==='exit'){
      const exitId=stringAt(args,0),fromEntry=stringAt(args,1);
      if(!exitId){reject('strategy.exit() requires an id.');continue;}
      const qty=numberAt(args,2),qtyPercent=numberAt(args,3),profit=numberAt(args,4),limit=numberAt(args,5),
        loss=numberAt(args,6),stop=numberAt(args,7);
      const trailPrice=numberAt(args,8),trailPoints=numberAt(args,9),trailOffset=numberAt(args,10);
      if([trailPrice,trailPoints,trailOffset].some(value=>value!==undefined)){
        reject('Trailing-stop parameters are not modeled yet; the command was rejected, not approximated.');continue;
      }
      if(qty!==undefined&&!isPositive(qty)){reject('strategy.exit() qty must be positive.');continue;}
      if(qty===undefined&&qtyPercent!==undefined&&(!Number.isFinite(qtyPercent)||qtyPercent<=0||qtyPercent>100)){
        reject('strategy.exit() qty_percent must be in (0, 100].');continue;
      }
      if(profit!==undefined&&!isPositive(profit)||loss!==undefined&&!isPositive(loss)){
        reject('strategy.exit() profit/loss tick distances must be positive.');continue;
      }
      const tickSize=options.tickSizeBySymbol?.[symbol];
      if((profit!==undefined||loss!==undefined)&&!isPositive(tickSize)){
        reject('strategy.exit() profit/loss are tick distances and require a trusted symbol tickSize.');continue;
      }
      if(stop===undefined&&limit===undefined&&profit===undefined&&loss===undefined){
        reject('strategy.exit() requires stop/limit/profit/loss; no trailing fallback is assumed.');continue;
      }
      actions.push({kind:'exit',signalTimeMs,sequence:seq,orderId,exitId,signalId,symbol,...(fromEntry?{entryId:fromEntry}:{}),
        ...(qty!==undefined?{quantity:qty}:qtyPercent!==undefined?{quantityPercent:qtyPercent}:{}),
        ...(stop!==undefined?{stopPrice:stop}:{}),...(limit!==undefined?{limitPrice:limit}:{}),
        ...(profit!==undefined?{profitTicks:profit}:{}),...(loss!==undefined?{lossTicks:loss}:{}),
        ...(tickSize!==undefined?{tickSize}:{}),
        ocaGroup:'pine-exit:'+symbol+':'+(fromEntry??'*'),
        reason:'Pine strategy.exit() stop/limit bracket.'});
      continue;
    }
    if(command.command==='close'){
      const entryId=stringAt(args,0),qty=numberAt(args,2),qtyPercent=numberAt(args,3);
      if(!entryId){reject('strategy.close() requires an entry ID.');continue;}
      if(boolAt(args,5)){reject('strategy.close(immediately=true) is not modeled; use next-eligible-bar simulation.');continue;}
      if(qty!==undefined&&!isPositive(qty)){reject('strategy.close() qty must be positive.');continue;}
      if(qty===undefined&&qtyPercent!==undefined&&(!Number.isFinite(qtyPercent)||qtyPercent<=0||qtyPercent>100)){
        reject('strategy.close() qty_percent must be in (0, 100].');continue;
      }
      actions.push({kind:'close',signalTimeMs,sequence:seq,orderId,signalId,symbol,entryId,
        ...(qty!==undefined?{quantity:qty}:qtyPercent!==undefined?{quantityPercent:qtyPercent}:{}),
        reason:'Pine strategy.close() market exit.'});
      continue;
    }
    if(command.command==='close_all'){
      if(boolAt(args,2)){reject('strategy.close_all(immediately=true) is not modeled; use next-eligible-bar simulation.');continue;}
      actions.push({kind:'close-all',signalTimeMs,sequence:seq,orderId,signalId,reason:'Pine strategy.close_all() market exit.'});
      continue;
    }
    if(command.command==='cancel'){
      const entryId=stringAt(args,0);
      if(!entryId){reject('strategy.cancel() requires an entry ID.');continue;}
      actions.push({kind:'cancel',signalTimeMs,sequence:seq,orderId,entryId,reason:'Pine strategy.cancel(id).'});
      continue;
    }
    if(command.command==='cancel_all'){
      actions.push({kind:'cancel-all',signalTimeMs,sequence:seq,reason:'Pine strategy.cancel_all().'});
      continue;
    }
    reject('Unsupported Pine strategy command "'+String(command.command)+'".');
  }
  return Object.freeze({actions:Object.freeze(actions),diagnostics:Object.freeze(diagnostics)});
}

export function runCoreSpiritPineStrategySimulation(
  input:CoreSpiritPineStrategySimulationInput,
):CoreSpiritPineStrategySimulationResult{
  if(!Array.isArray(input.outputs)||!Array.isArray(input.datasets))throw new Error('Strategy outputs and validated datasets are required.');
  const converted=coreSpiritPineStrategyCommandsToSimulationActions(input.outputs,input);
  const simulation=runStrategySimulation({
    strategyId:input.strategyId,sourceProgramChecksum:input.sourceProgramChecksum,datasetId:input.datasetId,
    datasets:input.datasets,actions:converted.actions,config:input.config,
  });
  const metrics=simulation.equityCurve.length>=2?calculateCoreSpiritSimulationMetrics(simulation):null;
  return Object.freeze({simulation,actions:converted.actions,diagnostics:converted.diagnostics,metrics});
}

export type CoreSpiritPineStrategyBacktestInput=Readonly<{
  strategyId?:string;
  runId:string;
  artifact:CoreSpiritExecutableArtifact;
  dataset:CoreSpiritMarketDataset;
  defaultQuantity:number;
  tickSizeBySymbol?:Readonly<Record<string,number>>;
  config?:Partial<SimulationConfig>;
}>;

export type CoreSpiritPineStrategyBacktestResult=CoreSpiritPineStrategySimulationResult&Readonly<{
  hostRun:CoreSpiritHostRunResult;
}>;

/** Execute the validated artifact in backtest mode, then pass only its inert
 * strategy command events into the deterministic simulator. This function has
 * no live order gateway or paper/live broker dependency.
 */
export function runCoreSpiritPineStrategyBacktest(
  input:CoreSpiritPineStrategyBacktestInput,
):CoreSpiritPineStrategyBacktestResult{
  if(!input.runId?.trim())throw new Error('A stable backtest runId is required.');
  if(!input.artifact?.ir||!input.artifact.abi?.sourceHash||!/^[a-f0-9]{64}$/i.test(input.artifact.abi.sourceHash)){
    throw new Error('A validated CoreSpirit artifact with a SHA-256 source hash is required.');
  }
  if(!input.dataset?.id||!input.dataset.symbol||!input.dataset.timeframe||!Array.isArray(input.dataset.bars)||input.dataset.bars.length<2){
    throw new Error('A validated market dataset with at least two bars is required.');
  }
  const hostRun=new CoreSpiritBacktestExecutionHost().run(input.artifact,input.dataset,input.runId,'backtest');
  const datasets:SimulationDataset[]=[{
    symbol:input.dataset.symbol,timeframe:input.dataset.timeframe,
    bars:input.dataset.bars.map(bar=>({
      timestamp:bar.timestamp,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume,
    })),
  }];
  const result=runCoreSpiritPineStrategySimulation({
    strategyId:input.strategyId??input.artifact.sourceId,
    sourceProgramChecksum:input.artifact.abi.sourceHash,
    datasetId:input.dataset.id,datasets,outputs:hostRun.outputs,
    defaultQuantity:input.defaultQuantity,tickSizeBySymbol:input.tickSizeBySymbol,config:input.config,
  });
  return Object.freeze({...result,diagnostics:Object.freeze([...hostRun.diagnostics,...result.diagnostics]),hostRun});
}
