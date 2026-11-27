import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { replayTimestampMs, validateReplayBars } from './replayValidator';

export type SimulationOrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type SimulationSide = 'buy' | 'sell';
export type IntrabarPolicy = 'stop-first' | 'target-first' | 'reject-ambiguous';
export type ExecutionDetail = 'ohlc' | 'lower-timeframe' | 'tick';

export type SimulationDataset = Readonly<{ symbol:string; timeframe:string; bars:readonly HistoricalCandle[] }>;
export type SimulationIntent = Readonly<{
  orderId:string; signalId:string; symbol:string; side:SimulationSide; type:SimulationOrderType; quantity:number;
  limitPrice?:number; stopPrice?:number; stopLossPrice?:number|null; takeProfitPrice?:number|null;
  timeInForceBars?:number; tag?:string; entryId?:string; countsTowardPyramiding?:boolean;
  ocaGroup?:string; ocaType?:'cancel'|'reduce';
}>;
export type SimulationAction =
  | Readonly<{kind:'submit'; signalTimeMs:number; sequence:number; intent:SimulationIntent; reason?:string}>
  | Readonly<{kind:'reject'; signalTimeMs:number; sequence:number; orderId:string; signalId:string; symbol:string; side?:SimulationSide; reason:string}>
  | Readonly<{kind:'modify'; signalTimeMs:number; sequence:number; orderId:string;
      updates:Partial<Pick<SimulationIntent,'quantity'|'type'|'limitPrice'|'stopPrice'|'stopLossPrice'|'takeProfitPrice'|'timeInForceBars'>>}>
  | Readonly<{kind:'cancel'; signalTimeMs:number; sequence:number; orderId:string; entryId?:string; reason?:string}>
  | Readonly<{kind:'cancel-all'; signalTimeMs:number; sequence:number; reason?:string}>
  | Readonly<{kind:'exit'; signalTimeMs:number; sequence:number; orderId:string; exitId:string; signalId:string; symbol:string; entryId?:string;
      quantity?:number; quantityPercent?:number; stopPrice?:number; limitPrice?:number; profitTicks?:number; lossTicks?:number; tickSize?:number;
      ocaGroup?:string; reason?:string}>
  | Readonly<{kind:'close'; signalTimeMs:number; sequence:number; orderId:string; signalId:string; symbol:string; entryId?:string;
      quantity?:number; quantityPercent?:number; reason?:string}>
  | Readonly<{kind:'close-all'; signalTimeMs:number; sequence:number; orderId:string; signalId:string; reason?:string}>;

export type SimulationConfig = Readonly<{
  initialCash:number; slippageBps:number; spreadBps:number; brokeragePerOrder:number;
  brokerageBps:number; exchangeFeeBps:number; taxesBps:number; maxParticipationRate:number;
  lotSize:number; maxPositionQuantity:number; maxGrossExposure:number; maxGrossExposureMultiple:number;
  allowShort:boolean; defaultTimeInForceBars:number; intrabarPolicy:IntrabarPolicy; executionDetail:ExecutionDetail;
  pyramiding:number; marginLongPercent:number; marginShortPercent:number;
}>;
export const DEFAULT_SIMULATION_CONFIG:SimulationConfig=Object.freeze({
  initialCash:100_000,slippageBps:1,spreadBps:0,brokeragePerOrder:20,brokerageBps:0,
  exchangeFeeBps:0,taxesBps:0,maxParticipationRate:0.1,lotSize:1,maxPositionQuantity:1_000,
  maxGrossExposure:1_000_000,maxGrossExposureMultiple:1,allowShort:false,defaultTimeInForceBars:5,
  intrabarPolicy:'stop-first',executionDetail:'ohlc',pyramiding:1,marginLongPercent:100,marginShortPercent:100,
});

export type SimulationLedgerEvent=Readonly<{
  eventId:string; sequence:number; timestampMs:number; barIndex:number; phase:'open'|'intrabar'|'bar-close';
  eventType:'signal'|'order_submitted'|'order_modified'|'order_cancelled'|'order_rejected'|'order_triggered'|
    'partial_fill'|'fill'|'protective_exit'|'trade_closed'|'order_expired'|'ambiguous_intrabar'|'mark';
  simulated:true; executionAuthority:'simulation-only'; strategyId:string; sourceProgramChecksum:string;
  signalId?:string; orderId?:string; symbol?:string; side?:SimulationSide;
  originalSignal?:Readonly<{id:string;timestampMs:number;reason:string}>;
  originalIntent?:SimulationIntent; currentIntent?:SimulationIntent;
  requestedQuantity?:number; filledQuantity?:number; remainingQuantity?:number; fillPrice?:number;
  notional?:number; fee?:number; costs?:Readonly<{fixedBrokerage:number;brokerage:number;exchangeFees:number;taxes:number}>;
  reason?:string; details?:Readonly<Record<string,string|number|boolean|null>>;
}>;
export type SimulationClosedTrade=Readonly<{
  tradeId:string; symbol:string; direction:'long'|'short'; quantity:number; averageEntryPrice:number; exitPrice:number;
  realizedGrossPnl:number; allocatedEntryFees:number; allocatedExitFees:number; netPnl:number;
  entryOrderId:string; exitOrderId:string; entrySignalId:string; exitSignalId:string; entryTimestampMs:number; exitTimestampMs:number; simulated:true;
}>;
export type StrategySimulationResult=Readonly<{
  simulationId:string; environment:'simulation'; executionAuthority:'simulation-only'; strategyId:string;
  sourceProgramChecksum:string; datasetIds:readonly string[]; config:SimulationConfig; assumptions:Readonly<Record<string,string|number|boolean>>;
  ledger:readonly SimulationLedgerEvent[]; closedTrades:readonly SimulationClosedTrade[];
  equityCurve:readonly Readonly<{timestampMs:number;cash:number;equity:number;grossExposure:number}>[];
  positions:readonly Readonly<{symbol:string;quantity:number;averagePrice:number;marketPrice:number|null;marketValue:number|null;unrealizedPnl:number|null;realizedNetPnl:number}>[];
  summary:Readonly<{initialCash:number;endingCash:number;endingEquity:number;netProfit:number;realizedNetPnl:number;feesPaid:number;
    fillCount:number;rejectedOrderCount:number;cancelledOrderCount:number;expiredOrderCount:number;openOrderCount:number;closedTradeCount:number;maxGrossExposure:number}>;
}>;

type WorkingOrder={original:SimulationIntent;intent:SimulationIntent;signalTimeMs:number;sequence:number;
  status:'pending'|'partially-filled'|'filled'|'cancelled'|'rejected'|'expired';filled:number;remaining:number;eligibleBars:number;
  stopTriggered:boolean;fixedFeeCharged:boolean;openedPosition:boolean;reversalAdjusted:boolean};
type Position={symbol:string;quantity:number;averagePrice:number;entryFees:number;entryOrderId:string;entrySignalId:string;entryId:string;entryCount:number;entryTimestampMs:number;realizedNetPnl:number};
type Bracket={id:string;intent:SimulationIntent;symbol:string;direction:1|-1;remaining:number;stop?:number;target?:number;
  activeAt:number;fixedFeeCharged:boolean;ocaGroup?:string;ocaType?:'cancel'|'reduce'};
type Frame={time:number;index:number;bars:Map<string,HistoricalCandle>};
type Candidate={basePrice:number;phase:'open'|'intrabar';limit?:number;isLimit:boolean};
type EventInput=Omit<SimulationLedgerEvent,'eventId'|'sequence'|'timestampMs'|'barIndex'|'phase'|'simulated'|'executionAuthority'|'strategyId'|'sourceProgramChecksum'> &
  {timestampMs?:number;barIndex?:number;phase?:'open'|'intrabar'|'bar-close'};

function rounded(n:number):number{return Math.round((n+Number.EPSILON)*1e8)/1e8;}
function finitePositive(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>0;}
function lotFloor(q:number,lot:number):number{return Math.max(0,Math.floor((q+1e-10)/lot)*lot);}
function fingerprint(text:string):string{
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function configOf(input?:Partial<SimulationConfig>):SimulationConfig{
  const c:SimulationConfig={...DEFAULT_SIMULATION_CONFIG,...(input??{})};
  const fees:[string,number][]=[['slippageBps',c.slippageBps],['spreadBps',c.spreadBps],['brokeragePerOrder',c.brokeragePerOrder],
    ['brokerageBps',c.brokerageBps],['exchangeFeeBps',c.exchangeFeeBps],['taxesBps',c.taxesBps]];
  if(!finitePositive(c.initialCash))throw new Error('initialCash must be finite and positive.');
  for(const [n,v] of fees)if(!Number.isFinite(v)||v<0)throw new Error(n+' must be finite and non-negative.');
  if(!Number.isFinite(c.maxParticipationRate)||c.maxParticipationRate<=0||c.maxParticipationRate>1)throw new Error('maxParticipationRate must be in (0, 1].');
  if(!finitePositive(c.lotSize)||!finitePositive(c.maxPositionQuantity)||!finitePositive(c.maxGrossExposure)||!finitePositive(c.maxGrossExposureMultiple))throw new Error('Lot size and risk caps must be finite and positive.');
  if(!Number.isSafeInteger(c.defaultTimeInForceBars)||c.defaultTimeInForceBars<1||c.defaultTimeInForceBars>1_000_000)throw new Error('defaultTimeInForceBars must be a positive bounded integer.');
  if(!Number.isSafeInteger(c.pyramiding)||c.pyramiding<1||c.pyramiding>100)throw new Error('pyramiding must be an integer from 1 to 100.');
  if(!Number.isFinite(c.marginLongPercent)||c.marginLongPercent<=0||c.marginLongPercent>100||!Number.isFinite(c.marginShortPercent)||c.marginShortPercent<=0||c.marginShortPercent>100)throw new Error('Long and short margin percentages must be in (0, 100].');
  if(!['stop-first','target-first','reject-ambiguous'].includes(c.intrabarPolicy))throw new Error('Invalid intrabar policy.');
  if(!['ohlc','lower-timeframe','tick'].includes(c.executionDetail))throw new Error('Invalid execution-detail mode.');
  if(c.executionDetail==='lower-timeframe')throw new Error('Lower-timeframe Bar Magnifier data is not wired; refusing to silently fall back to chart OHLC bars.');
  return Object.freeze(c);
}
function validateIntent(i:SimulationIntent,c:SimulationConfig):string|undefined{
  if(!i||typeof i!=='object')return 'Intent is not an object.';
  if(!String(i.orderId??'').trim()||!String(i.signalId??'').trim()||!String(i.symbol??'').trim())return 'Order ID, signal ID and symbol are required.';
  if(!['buy','sell'].includes(i.side)||!['market','limit','stop','stop-limit'].includes(i.type))return 'Unsupported order side or type.';
  if(!finitePositive(i.quantity)||Math.abs(i.quantity-lotFloor(i.quantity,c.lotSize))>1e-8)return 'Quantity must be positive and lot-aligned.';
  if((i.type==='limit'||i.type==='stop-limit')&&!finitePositive(i.limitPrice))return 'Limit orders require a positive limitPrice.';
  if((i.type==='stop'||i.type==='stop-limit')&&!finitePositive(i.stopPrice))return 'Stop orders require a positive stopPrice.';
  if(i.type==='stop-limit'&&i.stopPrice!=null&&i.limitPrice!=null&&(i.side==='buy'?i.limitPrice<i.stopPrice:i.limitPrice>i.stopPrice))return 'Stop-limit price must be executable at or beyond the stop in the order direction.';
  if(i.stopLossPrice!=null&&!finitePositive(i.stopLossPrice))return 'stopLossPrice must be positive when supplied.';
  if(i.takeProfitPrice!=null&&!finitePositive(i.takeProfitPrice))return 'takeProfitPrice must be positive when supplied.';
  if(i.stopLossPrice!=null&&i.takeProfitPrice!=null&&(i.side==='buy'?i.stopLossPrice>=i.takeProfitPrice:i.stopLossPrice<=i.takeProfitPrice))return 'Stop-loss and target levels conflict with order direction.';
  if(i.timeInForceBars!=null&&(!Number.isSafeInteger(i.timeInForceBars)||i.timeInForceBars<1))return 'timeInForceBars must be a positive integer.';
  if(i.entryId!=null&&(typeof i.entryId!=='string'||!i.entryId.trim()||i.entryId.length>128))return 'entryId must be a non-empty string of at most 128 characters.';
  if(i.ocaGroup!=null&&(typeof i.ocaGroup!=='string'||!i.ocaGroup.trim()||i.ocaGroup.length>128))return 'ocaGroup must be a non-empty string of at most 128 characters.';
  if(i.ocaType!=null&&!['cancel','reduce'].includes(i.ocaType))return 'Unsupported OCA behavior.';
  if(i.ocaType!=null&&!i.ocaGroup)return 'ocaType requires an ocaGroup.';
  return undefined;
}
function timelineOf(datasets:readonly SimulationDataset[]):Frame[]{
  if(!Array.isArray(datasets)||datasets.length<1||datasets.length>64)throw new Error('Simulation requires 1–64 datasets.');
  const symbols=new Set<string>(),times=new Map<number,Map<string,HistoricalCandle>>();
  for(const d of datasets){
    const symbol=String(d.symbol??'').trim();
    if(!symbol||!String(d.timeframe??'').trim()||symbols.has(symbol))throw new Error('Each dataset must have a unique symbol and explicit timeframe.');
    symbols.add(symbol);
    const v=validateReplayBars([...d.bars]);
    if(!v.valid||!v.normalizedBars.length)throw new Error('Invalid replay dataset '+symbol+': '+v.errors.join('; '));
    if(d.timeframe.length>32)throw new Error('Timeframe name is too long.');
    for(const bar of v.normalizedBars){
      const time=replayTimestampMs(bar.timestamp);let m=times.get(time);
      if(!m){m=new Map();times.set(time,m);}
      if(m.has(symbol))throw new Error('Duplicate same-symbol timestamp.');
      m.set(symbol,bar);
    }
  }
  return [...times.entries()].sort((a,b)=>a[0]-b[0]).map(([time,bars],index)=>({time,index,bars}));
}
function actionsOf(actions:readonly SimulationAction[],frames:readonly Frame[]):SimulationAction[]{
  if(!Array.isArray(actions)||actions.length>1_000_000)throw new Error('Actions must be a bounded array.');
  const minTime=frames[0]!.time, maxTime=frames[frames.length-1]!.time, sequences=new Set<string>();
  for(const a of actions){
    if(!a||!Number.isSafeInteger(a.signalTimeMs)||a.signalTimeMs<minTime||a.signalTimeMs>maxTime||!Number.isSafeInteger(a.sequence)||a.sequence<0)throw new Error('Each action needs a timestamp within the dataset and a non-negative sequence.');
    const key=a.signalTimeMs+':'+a.sequence;if(sequences.has(key))throw new Error('Action sequences must be unique at a given timestamp.');sequences.add(key);
  }
  return [...actions].sort((a,b)=>a.signalTimeMs-b.signalTimeMs||a.sequence-b.sequence);
}
function phaseDefault(type:SimulationLedgerEvent['eventType'],p?:'open'|'intrabar'|'bar-close'):'open'|'intrabar'|'bar-close'{
  return p??(['signal','order_submitted','order_modified','order_cancelled'].includes(type)?'bar-close':'intrabar');
}
function findCandidate(order:WorkingOrder,bar:HistoricalCandle,policy:IntrabarPolicy,time:number,index:number,
  record:(event:EventInput)=>void):Candidate|undefined{
  const i=order.intent,o=Number(bar.open),h=Number(bar.high),l=Number(bar.low),buy=i.side==='buy',limit=Number(i.limitPrice),stop=Number(i.stopPrice);
  if(i.type==='market')return {basePrice:o,phase:'open',isLimit:false};
  if(i.type==='limit'){
    if(buy){if(o<=limit)return {basePrice:o,phase:'open',limit,isLimit:true};if(l<=limit)return {basePrice:limit,phase:'intrabar',limit,isLimit:true};}
    else{if(o>=limit)return {basePrice:o,phase:'open',limit,isLimit:true};if(h>=limit)return {basePrice:limit,phase:'intrabar',limit,isLimit:true};}
    return undefined;
  }
  if(i.type==='stop'){
    if(buy){if(o>=stop)return {basePrice:o,phase:'open',isLimit:false};if(h>=stop)return {basePrice:stop,phase:'intrabar',isLimit:false};}
    else{if(o<=stop)return {basePrice:o,phase:'open',isLimit:false};if(l<=stop)return {basePrice:stop,phase:'intrabar',isLimit:false};}
    return undefined;
  }
  let triggeredHere=false;let triggerPhase:'open'|'intrabar'='intrabar';
  if(!order.stopTriggered){
    const atOpen=buy?o>=stop:o<=stop, intrabar=buy?h>=stop:l<=stop;
    if(!atOpen&&!intrabar)return undefined;
    order.stopTriggered=true;triggeredHere=true;triggerPhase=atOpen?'open':'intrabar';
    record({eventType:'order_triggered',orderId:i.orderId,signalId:i.signalId,symbol:i.symbol,side:i.side,originalIntent:order.original,currentIntent:i,
      reason:'Stop condition observed; limit still needs to be executable.',details:{stopPrice:stop,triggerPhase},timestampMs:time,barIndex:index,phase:triggerPhase});
  }
  const atOpen=buy?o<=limit:o>=limit, intrabar=buy?l<=limit:h>=limit;
  if(!atOpen&&!intrabar)return undefined;
  if(triggeredHere&&triggerPhase==='intrabar'&&intrabar){
    if(policy==='reject-ambiguous'){
      record({eventType:'ambiguous_intrabar',orderId:i.orderId,signalId:i.signalId,symbol:i.symbol,side:i.side,originalIntent:order.original,currentIntent:i,
        reason:'Stop and limit crossed in one OHLC bar; the order of those events is unknowable from bar data.',
        details:{policy,stopPrice:stop,limitPrice:limit},timestampMs:time,barIndex:index,phase:'intrabar'});
      return undefined;
    }
    if(policy==='target-first')return undefined;
    // Under stop-first, a stop-limit triggered inside this OHLC bar becomes
    // executable only after the stop. Never fill it at the earlier bar open.
    return {basePrice:stop,phase:'intrabar',limit,isLimit:true};
  }
  return atOpen?{basePrice:o,phase:'open',limit,isLimit:true}:{basePrice:limit,phase:'intrabar',limit,isLimit:true};
}
function executionPrice(candidate:Candidate,side:SimulationSide,c:SimulationConfig):number{
  const direction=side==='buy'?1:-1,impact=(c.spreadBps/2+c.slippageBps)/10_000;
  const price=candidate.basePrice*(1+direction*impact);
  if(!candidate.isLimit||candidate.limit==null)return price;
  return side==='buy'?Math.min(candidate.limit,Math.max(candidate.basePrice,price)):Math.max(candidate.limit,Math.min(candidate.basePrice,price));
}

/** Deterministic, portfolio-aware strategy simulator. This module has no live broker imports or execution side effects. */
export function runStrategySimulation(input:{
  strategyId:string;sourceProgramChecksum:string;datasetId:string;datasets:readonly SimulationDataset[];actions:readonly SimulationAction[];
  config?:Partial<SimulationConfig>;
}):StrategySimulationResult{
  if(!String(input.strategyId??'').trim()||! /^[a-f0-9]{64}$/.test(input.sourceProgramChecksum)||!String(input.datasetId??'').trim())throw new Error('Strategy ID, 64-character program checksum and dataset ID are required.');
  const config=configOf(input.config),frames=timelineOf(input.datasets),actions=actionsOf(input.actions,frames);
  if(config.executionDetail==='tick')for(const d of input.datasets)for(const b of d.bars){
    if(Number(b.open)!==Number(b.high)||Number(b.open)!==Number(b.low)||Number(b.open)!==Number(b.close))throw new Error('Tick mode requires one-price bars; provide actual tick data.');
  }
  const symbols=new Set(input.datasets.map(d=>d.symbol));
  const orders=new Map<string,WorkingOrder>(),positions=new Map<string,Position>(),brackets=new Map<string,Bracket>(),marks=new Map<string,number>();
  const ledger:Array<SimulationLedgerEvent&{ordinal:number}>=[],trades:SimulationClosedTrade[]=[],equityCurve:Array<{timestampMs:number;cash:number;equity:number;grossExposure:number}>=[];
  let eventOrdinal=0,actionCursor=0,cash=config.initialCash,feesPaid=0,realizedNet=0,maxGross=0;
  const record=(e:EventInput):void=>{
    const ordinal=eventOrdinal++,time=Number.isFinite(e.timestampMs)?Number(e.timestampMs):frames[0]!.time,index=Number.isSafeInteger(e.barIndex)?Number(e.barIndex):0;
    const phase=phaseDefault(e.eventType,e.phase);
    const payload={...e} as Record<string,unknown>;delete payload.timestampMs;delete payload.barIndex;delete payload.phase;
    ledger.push({eventId:'sim-event-'+String(ordinal+1).padStart(8,'0'),sequence:ordinal,timestampMs:time,barIndex:index,phase,
      simulated:true,executionAuthority:'simulation-only',strategyId:input.strategyId,sourceProgramChecksum:input.sourceProgramChecksum,
      ...(payload as Omit<SimulationLedgerEvent,'eventId'|'sequence'|'timestampMs'|'barIndex'|'phase'|'simulated'|'executionAuthority'|'strategyId'|'sourceProgramChecksum'>),ordinal});
  };
  const getPosition=(symbol:string):Position=>{
    let p=positions.get(symbol);
    if(!p){p={symbol,quantity:0,averagePrice:0,entryFees:0,entryOrderId:'',entrySignalId:'',entryId:'',entryCount:0,entryTimestampMs:0,realizedNetPnl:0};positions.set(symbol,p);}
    return p;
  };
  const gross=():number=>{let v=0;for(const p of positions.values()){const mark=marks.get(p.symbol);if(mark!=null)v+=Math.abs(p.quantity)*mark;}return v;};
  const equity=():number=>{let v=cash;for(const p of positions.values()){const mark=marks.get(p.symbol);if(mark!=null)v+=p.quantity*mark;}return v;};
  const active=(s:WorkingOrder['status'])=>s==='pending'||s==='partially-filled';
  const pruneBrackets=():void=>{
    for(const [id,b] of brackets){const p=positions.get(b.symbol);if(!p||p.quantity===0||Math.sign(p.quantity)!==b.direction)brackets.delete(id);
      else{b.remaining=Math.min(b.remaining,Math.abs(p.quantity));if(b.remaining<=1e-10)brackets.delete(id);}}
  };
  const riskQty=(intent:SimulationIntent,desired:number,price:number):number=>{
    const p=getPosition(intent.symbol),old=p.quantity,direction=intent.side==='buy'?1:-1;let max=desired;
    if(!config.allowShort&&intent.side==='sell'){if(old<=0)return 0;max=Math.min(max,old);}
    const projected=old+direction*max;
    if(Math.abs(projected)>config.maxPositionQuantity)max=Math.min(max,old*direction>=0?Math.max(0,config.maxPositionQuantity-Math.abs(old)):Math.max(0,Math.abs(old)+config.maxPositionQuantity));
    const marginPercent=intent.side==='buy'?config.marginLongPercent:config.marginShortPercent;
    const cap=Math.min(config.maxGrossExposure,Math.max(0,equity()*config.maxGrossExposureMultiple),Math.max(0,equity()*100/marginPercent));
    const prevMark=marks.get(intent.symbol)??price,withoutSymbol=Math.max(0,gross()-Math.abs(old)*prevMark),maxAbs=Math.max(0,(cap-withoutSymbol)/price);
    const newQty=old+direction*max;
    if(Math.abs(newQty)>maxAbs){const same=old===0||Math.sign(old)===direction;max=Math.min(max,same?Math.max(0,maxAbs-Math.abs(old)):Math.max(0,Math.abs(old)+maxAbs));}
    return lotFloor(Math.max(0,max),config.lotSize);
  };
  const execute=(args:{orderId:string;signalId:string;symbol:string;side:SimulationSide;qty:number;price:number;original:SimulationIntent;current:SimulationIntent;
    requestedTotal:number;remainingAfter:number;feeState:{fixedFeeCharged:boolean};time:number;barIndex:number;phase:'open'|'intrabar';protective:boolean;partial:boolean;tag?:string}):{opened:number;closed:number}=>{
    const qty=lotFloor(args.qty,config.lotSize),notional=qty*args.price;
    const fixed=args.feeState.fixedFeeCharged?0:config.brokeragePerOrder,brokerage=notional*config.brokerageBps/10_000;
    const exchange=notional*config.exchangeFeeBps/10_000,tax=notional*config.taxesBps/10_000,fee=fixed+brokerage+exchange+tax;
    args.feeState.fixedFeeCharged=true;feesPaid+=fee;cash+=args.side==='buy'?-(notional+fee):notional-fee;
    const p=getPosition(args.symbol),old=p.quantity,signed=args.side==='buy'?qty:-qty,next=old+signed;
    let opened=0,closed=0;
    if(old===0||Math.sign(old)===Math.sign(signed)){
      p.averagePrice=(Math.abs(old)*p.averagePrice+qty*args.price)/(Math.abs(old)+qty);p.entryFees+=fee;
      if(old===0)p.entryTimestampMs=args.time;
      p.entryOrderId=args.orderId;p.entrySignalId=args.signalId;p.entryId=args.current.entryId??args.current.tag??args.current.orderId;opened=qty;
      if(old===0)p.entryCount=0;
    }else{
      closed=Math.min(Math.abs(old),qty);
      const entryFee=p.entryFees*closed/Math.abs(old),exitFee=fee*closed/qty,grossPnl=(args.price-p.averagePrice)*closed*Math.sign(old);
      const netPnl=grossPnl-entryFee-exitFee;p.realizedNetPnl+=netPnl;realizedNet+=netPnl;
      trades.push(Object.freeze({tradeId:'sim-trade-'+String(trades.length+1).padStart(8,'0'),symbol:args.symbol,direction:old>0?'long':'short',
        quantity:rounded(closed),averageEntryPrice:rounded(p.averagePrice),exitPrice:rounded(args.price),realizedGrossPnl:rounded(grossPnl),
        allocatedEntryFees:rounded(entryFee),allocatedExitFees:rounded(exitFee),netPnl:rounded(netPnl),entryOrderId:p.entryOrderId,
        exitOrderId:args.orderId,entrySignalId:p.entrySignalId,exitSignalId:args.signalId,entryTimestampMs:p.entryTimestampMs,exitTimestampMs:args.time,simulated:true}));
      p.entryFees=Math.max(0,p.entryFees-entryFee);
      if(Math.abs(next)<1e-10){p.averagePrice=0;p.entryFees=0;p.entryOrderId='';p.entrySignalId='';p.entryId='';p.entryCount=0;p.entryTimestampMs=0;}
      else if(Math.sign(next)!==Math.sign(old)){opened=Math.abs(next);p.averagePrice=args.price;p.entryFees=Math.max(0,fee-exitFee);p.entryOrderId=args.orderId;p.entrySignalId=args.signalId;p.entryId=args.current.entryId??args.current.tag??args.current.orderId;p.entryCount=0;p.entryTimestampMs=args.time;}
    }
    p.quantity=Math.abs(next)<1e-10?0:next;
    record({eventType:args.protective?'protective_exit':args.partial?'partial_fill':'fill',orderId:args.orderId,signalId:args.signalId,
      symbol:args.symbol,side:args.side,originalIntent:args.original,currentIntent:args.current,requestedQuantity:args.requestedTotal,filledQuantity:qty,
      remainingQuantity:Math.max(0,args.remainingAfter),fillPrice:rounded(args.price),notional:rounded(notional),fee:rounded(fee),
      costs:Object.freeze({fixedBrokerage:rounded(fixed),brokerage:rounded(brokerage),exchangeFees:rounded(exchange),taxes:rounded(tax)}),
      details:Object.freeze({protective:args.protective,tag:args.tag??null,costAssumptions:'configured simulation costs'}),
      timestampMs:args.time,barIndex:args.barIndex,phase:args.phase});
    if(closed>0)record({eventType:'trade_closed',orderId:args.orderId,signalId:args.signalId,symbol:args.symbol,side:args.side,
      originalIntent:args.original,currentIntent:args.current,filledQuantity:rounded(closed),fillPrice:rounded(args.price),
      reason:'Weighted-average-cost position reduction.',timestampMs:args.time,barIndex:args.barIndex,phase:args.phase});
    marks.set(args.symbol,marks.get(args.symbol)??args.price);
    return {opened,closed};
  };
  const processBrackets=(frame:Frame,liquidity:Map<string,number>,newOnly:boolean):void=>{
    for(const [id,b] of [...brackets]){
      const bar=frame.bars.get(b.symbol);if(!bar||frame.time<b.activeAt)continue;
      const isNew=b.activeAt===frame.time;if(newOnly!==isNew)continue;
      const pos=positions.get(b.symbol);if(!pos||pos.quantity===0||Math.sign(pos.quantity)!==b.direction){brackets.delete(id);continue;}
      const stop=b.stop!=null&&(b.direction>0?Number(bar.low)<=b.stop:Number(bar.high)>=b.stop);
      const target=b.target!=null&&(b.direction>0?Number(bar.high)>=b.target:Number(bar.low)<=b.target);
      if(!stop&&!target)continue;
      if(stop&&target&&config.intrabarPolicy==='reject-ambiguous'){
        record({eventType:'ambiguous_intrabar',orderId:id,signalId:b.intent.signalId,symbol:b.symbol,originalIntent:b.intent,currentIntent:b.intent,
          reason:'Both stop and target were touched in one OHLC bar; sequence is not knowable from OHLC alone.',
          details:{policy:config.intrabarPolicy,stopLossPrice:b.stop??null,takeProfitPrice:b.target??null},timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
        continue;
      }
      const useStop=stop&&(!target||config.intrabarPolicy==='stop-first'),targetExit=!useStop&&target,level=useStop?b.stop!:b.target!;
      let base:number,phase:'open'|'intrabar'='intrabar';
      if(b.direction>0){if(useStop){base=Number(bar.open)<=level?Number(bar.open):level;if(Number(bar.open)<=level)phase='open';}
        else{base=Number(bar.open)>=level?Number(bar.open):level;if(Number(bar.open)>=level)phase='open';}}
      else{if(useStop){base=Number(bar.open)>=level?Number(bar.open):level;if(Number(bar.open)>=level)phase='open';}
        else{base=Number(bar.open)<=level?Number(bar.open):level;if(Number(bar.open)<=level)phase='open';}}
      const side:SimulationSide=b.direction>0?'sell':'buy';
      const candidate:Candidate={basePrice:base,phase,...(targetExit?{limit:level,isLimit:true}:{isLimit:false})};
      const price=executionPrice(candidate,side,config),available=liquidity.get(b.symbol)??0,qty=lotFloor(Math.min(b.remaining,available),config.lotSize);
      if(qty<=0)continue;
      const synthetic:SimulationIntent=Object.freeze({...b.intent,orderId:id,side,type:'market',quantity:b.remaining,
        limitPrice:undefined,stopPrice:undefined,stopLossPrice:undefined,takeProfitPrice:undefined});
      execute({orderId:id,signalId:b.intent.signalId,symbol:b.symbol,side,qty,price,original:b.intent,current:synthetic,
        requestedTotal:b.remaining,remainingAfter:Math.max(0,b.remaining-qty),feeState:b,time:frame.time,barIndex:frame.index,phase,
        protective:true,partial:qty<b.remaining,tag:targetExit?'take-profit':'stop-loss'});
      b.remaining=lotFloor(b.remaining-qty,config.lotSize);liquidity.set(b.symbol,lotFloor(available-qty,config.lotSize));
      if(b.ocaGroup){
        for(const [siblingId,sibling] of [...brackets])if(siblingId!==id&&sibling.ocaGroup===b.ocaGroup){
          if((b.ocaType??'reduce')==='cancel'){brackets.delete(siblingId);}
          else{sibling.remaining=lotFloor(Math.max(0,sibling.remaining-qty),config.lotSize);if(sibling.remaining<=1e-10)brackets.delete(siblingId);}
        }
      }
      if(b.remaining<=1e-10)brackets.delete(id);pruneBrackets();
    }
  };

  const submitSyntheticOrder=(intent:SimulationIntent,signalTimeMs:number,sequence:number,barIndex:number,reason:string):void=>{
    const original=Object.freeze({...intent}) as SimulationIntent;
    if(orders.has(original.orderId)){
      record({eventType:'order_rejected',orderId:original.orderId,signalId:original.signalId,symbol:original.symbol,side:original.side,
        originalIntent:original,currentIntent:original,reason:'Duplicate order ID within this run.',timestampMs:signalTimeMs,barIndex,phase:'bar-close'});return;
    }
    const state:WorkingOrder={original,intent:original,signalTimeMs,sequence,status:'pending',filled:0,remaining:Number(original.quantity)||0,
      eligibleBars:0,stopTriggered:false,fixedFeeCharged:false,openedPosition:false,reversalAdjusted:false};
    orders.set(original.orderId,state);
    const error=validateIntent(original,config)??(!symbols.has(original.symbol)?'No validated dataset exists for the order symbol.':undefined);
    if(error){state.status='rejected';record({eventType:'order_rejected',orderId:original.orderId,signalId:original.signalId,symbol:original.symbol,
      side:original.side,originalIntent:original,currentIntent:original,requestedQuantity:original.quantity,reason:error,
      timestampMs:signalTimeMs,barIndex,phase:'bar-close'});}
    else record({eventType:'order_submitted',orderId:original.orderId,signalId:original.signalId,symbol:original.symbol,side:original.side,
      originalIntent:original,currentIntent:original,requestedQuantity:original.quantity,reason,
      timestampMs:signalTimeMs,barIndex,phase:'bar-close'});
  };

  const processActions = (frame:Frame, inclusive:boolean):void => {
    while(actionCursor<actions.length&&(inclusive ? actions[actionCursor]!.signalTimeMs<=frame.time : actions[actionCursor]!.signalTimeMs<frame.time)){
      const action=actions[actionCursor++]!;
      const barIndex=frame.index;
      if(action.kind==='cancel-all'){
        for(const [bracketId,bracket] of [...brackets]){
          record({eventType:'order_cancelled',orderId:bracket.id,signalId:bracket.intent.signalId,symbol:bracket.symbol,
            side:bracket.intent.side,originalIntent:bracket.intent,currentIntent:bracket.intent,remainingQuantity:bracket.remaining,
            reason:action.reason??'strategy.cancel_all() removed a pending protective exit.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
          brackets.delete(bracketId);
        }
        for(const order of orders.values())if(active(order.status)){
          order.status='cancelled';record({eventType:'order_cancelled',orderId:order.intent.orderId,signalId:order.intent.signalId,
            symbol:order.intent.symbol,side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,
            remainingQuantity:order.remaining,reason:action.reason??'strategy.cancel_all()',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
        }
        brackets.clear();continue;
      }
      if(action.kind==='reject'){
        record({eventType:'signal',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,side:action.side,
          reason:'Strategy command rejected before simulation submission.',
          originalSignal:Object.freeze({id:action.signalId,timestampMs:action.signalTimeMs,reason:action.reason}),
          timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
        record({eventType:'order_rejected',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,side:action.side,
          reason:action.reason,timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
        continue;
      }
      if(action.kind==='exit'){
        const position=getPosition(action.symbol),direction=Math.sign(position.quantity) as 1|-1;
        if(!position.quantity||(action.entryId&&position.entryId!==action.entryId)){
          record({eventType:'order_rejected',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,
            reason:'strategy.exit() did not match an open position/from_entry ID.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
        }
        const requested=action.quantity!=null?Number(action.quantity):action.quantityPercent!=null
          ?Math.abs(position.quantity)*Number(action.quantityPercent)/100:Math.abs(position.quantity);
        const quantity=lotFloor(Math.min(Math.abs(position.quantity),requested),config.lotSize);
        if(!finitePositive(quantity)){
          record({eventType:'order_rejected',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,
            reason:'strategy.exit() quantity must resolve to a positive lot-aligned amount.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
        }
        let stop=action.stopPrice,target=action.limitPrice;
        if(action.profitTicks!=null)target=position.averagePrice+direction*Number(action.profitTicks)*Number(action.tickSize);
        if(action.lossTicks!=null)stop=position.averagePrice-direction*Number(action.lossTicks)*Number(action.tickSize);
        if(stop==null&&target==null){
          record({eventType:'order_rejected',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,
            reason:'strategy.exit() requires a stop, limit, profit or loss level; trailing stop modes are not modeled.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
        }
        if((stop!=null&&(!finitePositive(stop)||(direction>0?stop>=position.averagePrice:stop<=position.averagePrice)))||
           (target!=null&&(!finitePositive(target)||(direction>0?target<=position.averagePrice:target>=position.averagePrice)))){
          record({eventType:'order_rejected',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,
            reason:'strategy.exit() stop/limit levels conflict with the modeled position direction.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
        }
        const side:SimulationSide=direction>0?'sell':'buy';
        const intent:SimulationIntent=Object.freeze({orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,side,type:'market',
          quantity,entryId:action.entryId??position.entryId,tag:'strategy.exit:'+action.exitId});
        const bracketId='pine-exit:'+action.exitId;
        brackets.delete(bracketId);
        brackets.set(bracketId,{id:bracketId,intent,symbol:action.symbol,direction,remaining:quantity,stop:stop??undefined,target:target??undefined,
          activeAt:frame.time+1,fixedFeeCharged:false,ocaGroup:action.ocaGroup??('pine-exit:'+action.symbol+':'+(action.entryId??position.entryId)),
          ocaType:'reduce'});
        record({eventType:'order_submitted',orderId:action.orderId,signalId:action.signalId,symbol:action.symbol,side,
          originalIntent:intent,currentIntent:intent,requestedQuantity:quantity,
          reason:action.reason??'Pine strategy exit bracket accepted by the simulation broker.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
        continue;
      }
      if(action.kind==='close'||action.kind==='close-all'){
        const candidates=action.kind==='close'
          ?[getPosition(action.symbol)]
          :[...positions.values()].filter(position=>position.quantity!==0);
        let closeIndex=0;
        for(const position of candidates){
          if(!position.quantity||(action.kind==='close'&&action.entryId&&position.entryId!==action.entryId))continue;
          const requested=action.kind==='close'
            ?(action.quantity!=null?Number(action.quantity):action.quantityPercent!=null
              ?Math.abs(position.quantity)*Number(action.quantityPercent)/100:Math.abs(position.quantity))
            :Math.abs(position.quantity);
          const quantity=lotFloor(Math.min(Math.abs(position.quantity),requested),config.lotSize);
          if(!finitePositive(quantity))continue;
          const orderId=action.kind==='close'?action.orderId:action.orderId+':'+position.symbol+':'+closeIndex++;
          const side:SimulationSide=position.quantity>0?'sell':'buy';
          const intent:SimulationIntent=Object.freeze({orderId,signalId:action.signalId,symbol:position.symbol,side,type:'market',quantity,
            entryId:position.entryId,tag:action.kind==='close'?'strategy.close':'strategy.close_all'});
          submitSyntheticOrder(intent,action.signalTimeMs,action.sequence+closeIndex,barIndex,
            action.reason??(action.kind==='close'?'Pine strategy.close() market exit.':'Pine strategy.close_all() market exit.'));
        }
        continue;
      }
      if(action.kind==='submit'){
        const original=Object.freeze({...action.intent}) as SimulationIntent;
        record({
          eventType:'signal',orderId:original.orderId,signalId:original.signalId,symbol:original.symbol,side:original.side,
          originalIntent:original,currentIntent:original,
          originalSignal:Object.freeze({id:original.signalId,timestampMs:action.signalTimeMs,reason:action.reason??'Strategy signal'}),
          reason:action.reason??'Strategy signal captured for deterministic simulation.',
          timestampMs:action.signalTimeMs,barIndex,phase:'bar-close',
        });
        submitSyntheticOrder(original,action.signalTimeMs,action.sequence,barIndex,
          action.reason??'Simulation-only order intent accepted; no live order was submitted.');
      }else{
        if(action.kind==='cancel'&&action.entryId){
          const matches=[...orders.values()].filter(order=>active(order.status)&&
            (order.intent.entryId===action.entryId||order.intent.tag===action.entryId));
          let cancelledBracket=false;
          for(const [bracketId,bracket] of [...brackets])if(bracket.intent.tag==='strategy.exit:'+action.entryId){
            record({eventType:'order_cancelled',orderId:bracket.id,signalId:bracket.intent.signalId,symbol:bracket.symbol,
              side:bracket.intent.side,originalIntent:bracket.intent,currentIntent:bracket.intent,remainingQuantity:bracket.remaining,
              reason:action.reason??'strategy.cancel(id) removed a pending protective exit.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
            brackets.delete(bracketId);cancelledBracket=true;
          }
          if(!matches.length&&!cancelledBracket){
            record({eventType:'order_rejected',signalId:action.entryId,reason:'No pending order matched strategy.cancel(id).',
              timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
          }
          for(const state of matches){state.status='cancelled';record({eventType:'order_cancelled',orderId:state.intent.orderId,
            signalId:state.intent.signalId,symbol:state.intent.symbol,side:state.intent.side,originalIntent:state.original,
            currentIntent:state.intent,remainingQuantity:state.remaining,reason:action.reason??'strategy.cancel(id)',
            timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});}
          continue;
        }
        const state=action.kind==='modify'?orders.get(action.orderId):orders.get(action.orderId);
        if(!state||!active(state.status)){
          record({eventType:'order_rejected',orderId:action.orderId,signalId:state?.intent.signalId,symbol:state?.intent.symbol,side:state?.intent.side,
            originalIntent:state?.original,currentIntent:state?.intent,reason:'Order is not working; cancel/modify had no effect.',
            timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});continue;
        }
        if(action.kind==='cancel'){
          state.status='cancelled';record({eventType:'order_cancelled',orderId:action.orderId,signalId:state.intent.signalId,symbol:state.intent.symbol,
            side:state.intent.side,originalIntent:state.original,currentIntent:state.intent,remainingQuantity:state.remaining,
            reason:action.reason??'Cancelled before the next eligible symbol bar.',timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
        }else{
          const next=Object.freeze({...state.intent,...action.updates}) as SimulationIntent,invalid=validateIntent(next,config);
          if(invalid||next.quantity<state.filled){
            record({eventType:'order_rejected',orderId:action.orderId,signalId:state.intent.signalId,symbol:state.intent.symbol,side:state.intent.side,
              originalIntent:state.original,currentIntent:state.intent,reason:invalid??'Modified quantity is less than already-filled quantity.',
              timestampMs:action.signalTimeMs,barIndex,phase:'bar-close'});
          }else{
            const old=state.intent;state.intent=next;state.remaining=lotFloor(next.quantity-state.filled,config.lotSize);
            if(old.type!==next.type||old.stopPrice!==next.stopPrice)state.stopTriggered=false;
            record({eventType:'order_modified',orderId:action.orderId,signalId:state.intent.signalId,symbol:state.intent.symbol,side:state.intent.side,
              originalIntent:state.original,currentIntent:state.intent,requestedQuantity:next.quantity,remainingQuantity:state.remaining,
              timestampMs:action.signalTimeMs,barIndex,phase:'bar-close',reason:'Modified order becomes effective before later fills.'});
          }
        }
      }
    }
  };

  for(const frame of frames){
    const liquidity=new Map<string,number>();
    for(const [symbol,bar] of frame.bars){marks.set(symbol,Number(bar.open));liquidity.set(symbol,lotFloor(Number(bar.volume)*config.maxParticipationRate,config.lotSize));}
    processActions(frame,false);
    processBrackets(frame,liquidity,false);
    const activeOrders=[...orders.values()].filter(o=>active(o.status)&&o.signalTimeMs<frame.time&&frame.bars.has(o.intent.symbol))
      .sort((a,b)=>a.signalTimeMs-b.signalTimeMs||a.sequence-b.sequence||a.intent.orderId.localeCompare(b.intent.orderId));
    for(const order of activeOrders){
      const bar=frame.bars.get(order.intent.symbol)!;order.eligibleBars++;
      const candidate=findCandidate(order,bar,config.intrabarPolicy,frame.time,frame.index,record);
      if(!candidate){
        if(order.eligibleBars>=(order.intent.timeInForceBars??config.defaultTimeInForceBars)){
          order.status='expired';record({eventType:'order_expired',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
            side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
            reason:'Time in force elapsed without a fill.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
        }
        continue;
      }
      const price=executionPrice(candidate,order.intent.side,config),available=liquidity.get(order.intent.symbol)??0;
      let desired=lotFloor(Math.min(order.remaining,available),config.lotSize);
      if(desired<=0){
        if(order.intent.type==='market'){
          order.status='cancelled';record({eventType:'order_cancelled',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
            side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
            reason:'Market order had no available volume on its eligible bar.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
        }else if(order.eligibleBars>=(order.intent.timeInForceBars??config.defaultTimeInForceBars)){
          order.status='expired';record({eventType:'order_expired',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
            side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
            reason:'Time in force elapsed with no available volume.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
        }
        continue;
      }
      const p=getPosition(order.intent.symbol),direction=order.intent.side==='buy'?1:-1;
      // Pine strategy.entry() reverses an opposing position by first flattening it.
      // Its transaction quantity therefore includes the existing position size.
      // strategy.order() deliberately does not receive this automatic adjustment.
      if(order.intent.countsTowardPyramiding&&!order.reversalAdjusted&&p.quantity!==0&&Math.sign(p.quantity)!==direction){
        const transactionQuantity=order.intent.quantity+Math.abs(p.quantity);
        order.intent=Object.freeze({...order.intent,quantity:transactionQuantity});
        order.remaining=lotFloor(Math.max(0,transactionQuantity-order.filled),config.lotSize);
        order.reversalAdjusted=true;
        desired=lotFloor(Math.min(order.remaining,available),config.lotSize);
      }
      if(order.intent.countsTowardPyramiding&&p.quantity!==0&&Math.sign(p.quantity)===direction&&p.entryCount>=config.pyramiding&&!order.openedPosition){
        order.status='rejected';record({eventType:'order_rejected',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
          side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,reason:'strategy() pyramiding limit rejected another same-direction entry.',
          timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});continue;
      }
      const riskQty=(()=> {
        let allowed=desired;
        if(!config.allowShort&&order.intent.side==='sell'){if(p.quantity<=0)return 0;allowed=Math.min(allowed,p.quantity);}
        const projected=p.quantity+direction*allowed;
        if(Math.abs(projected)>config.maxPositionQuantity)allowed=Math.min(allowed,p.quantity*direction>=0?Math.max(0,config.maxPositionQuantity-Math.abs(p.quantity)):Math.max(0,Math.abs(p.quantity)+config.maxPositionQuantity));
        const marginPercent=order.intent.side==='buy'?config.marginLongPercent:config.marginShortPercent;
        const exposureCap=Math.min(config.maxGrossExposure,Math.max(0,equity()*config.maxGrossExposureMultiple),Math.max(0,equity()*100/marginPercent));
        const withoutSymbol=Math.max(0,gross()-Math.abs(p.quantity)*(marks.get(order.intent.symbol)??price));
        const maxAbs=Math.max(0,(exposureCap-withoutSymbol)/price),newQty=p.quantity+direction*allowed;
        if(Math.abs(newQty)>maxAbs){const same=p.quantity===0||Math.sign(p.quantity)===direction;allowed=Math.min(allowed,same?Math.max(0,maxAbs-Math.abs(p.quantity)):Math.max(0,Math.abs(p.quantity)+maxAbs));}
        return lotFloor(Math.max(0,allowed),config.lotSize);
      })();
      if(riskQty<=0){
        order.status='rejected';record({eventType:'order_rejected',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
          side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,requestedQuantity:order.remaining,remainingQuantity:order.remaining,
          reason:!config.allowShort&&order.intent.side==='sell'&&p.quantity<=0?'Short selling is disabled.':'Position/gross-exposure risk limit rejected the fill.',
          timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});continue;
      }
      const openingDirection=Math.sign(p.quantity+direction*riskQty),openingQty=p.quantity===0||Math.sign(p.quantity)===direction?riskQty:
        Math.max(0,Math.abs(p.quantity+direction*riskQty)-(Math.sign(p.quantity+direction*riskQty)===Math.sign(p.quantity)?Math.abs(p.quantity+direction*riskQty):0));
      if(openingQty>0&&((order.intent.stopLossPrice!=null&&(openingDirection>0?order.intent.stopLossPrice>=price:order.intent.stopLossPrice<=price))||
          (order.intent.takeProfitPrice!=null&&(openingDirection>0?order.intent.takeProfitPrice<=price:order.intent.takeProfitPrice>=price)))){
        order.status='rejected';record({eventType:'order_rejected',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
          side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,reason:'Protective levels are on the wrong side of the modeled entry price.',
          timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});continue;
      }
      const partial=riskQty<order.remaining;
      const positionBefore=p.quantity;
      const {opened}=execute({orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,side:order.intent.side,qty:riskQty,
        price,original:order.original,current:order.intent,requestedTotal:order.intent.quantity,
        remainingAfter:Math.max(0,order.remaining-riskQty),feeState:order,time:frame.time,barIndex:frame.index,phase:candidate.phase,
        protective:false,partial,tag:order.intent.tag});
      order.filled=rounded(order.filled+riskQty);order.remaining=lotFloor(Math.max(0,order.intent.quantity-order.filled),config.lotSize);
      order.status=order.remaining<=1e-10?'filled':'partially-filled';
      if(opened>0&&!order.openedPosition){
        const updatedPosition=getPosition(order.intent.symbol);
        if(order.intent.countsTowardPyramiding){
          if(positionBefore===0||Math.sign(positionBefore)!==Math.sign(updatedPosition.quantity))updatedPosition.entryCount=1;
          else updatedPosition.entryCount+=1;
        }
        updatedPosition.entryId=order.intent.entryId??order.intent.tag??order.intent.orderId;
        order.openedPosition=true;
      }
      if(order.intent.ocaGroup){
        for(const sibling of orders.values())if(sibling!==order&&active(sibling.status)&&sibling.intent.ocaGroup===order.intent.ocaGroup){
          if((order.intent.ocaType??'cancel')==='cancel'){
            sibling.status='cancelled';record({eventType:'order_cancelled',orderId:sibling.intent.orderId,signalId:sibling.intent.signalId,
              symbol:sibling.intent.symbol,side:sibling.intent.side,originalIntent:sibling.original,currentIntent:sibling.intent,
              remainingQuantity:sibling.remaining,reason:'OCA sibling cancelled after another group order filled.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
          }else{
            sibling.remaining=lotFloor(Math.max(0,sibling.remaining-riskQty),config.lotSize);
            sibling.intent=Object.freeze({...sibling.intent,quantity:sibling.filled+sibling.remaining});
            if(sibling.remaining<=1e-10){sibling.status='cancelled';record({eventType:'order_cancelled',orderId:sibling.intent.orderId,
              signalId:sibling.intent.signalId,symbol:sibling.intent.symbol,side:sibling.intent.side,originalIntent:sibling.original,
              currentIntent:sibling.intent,remainingQuantity:0,reason:'OCA reduce group reached zero remaining quantity.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});}
          }
        }
      }
      liquidity.set(order.intent.symbol,lotFloor(available-riskQty,config.lotSize));
      if(opened>0&&(order.intent.stopLossPrice!=null||order.intent.takeProfitPrice!=null)){
        const signed=getPosition(order.intent.symbol).quantity,directionSign=Math.sign(signed) as 1|-1,id='bracket:'+order.intent.orderId+':'+String(order.filled);
        brackets.set(id,{id,intent:order.original,symbol:order.intent.symbol,direction:directionSign,
          remaining:Math.min(opened,Math.abs(signed)),stop:order.intent.stopLossPrice??undefined,target:order.intent.takeProfitPrice??undefined,
          activeAt:candidate.phase==='open'?frame.time:frame.time+1,fixedFeeCharged:false});
      }
      if(order.remaining>1e-10&&order.intent.type==='market'){
        order.status='cancelled';record({eventType:'order_cancelled',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
          side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
          reason:'Market-order remainder was cancelled at the end of its eligible bar.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
      }else if(order.remaining>1e-10&&order.eligibleBars>=(order.intent.timeInForceBars??config.defaultTimeInForceBars)){
        order.status='expired';record({eventType:'order_expired',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
          side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
          reason:'Time in force elapsed with remainder unfilled.',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar'});
      }
    }
    processBrackets(frame,liquidity,true);pruneBrackets();
    processActions(frame,true);
    for(const [symbol,bar] of frame.bars) marks.set(symbol,Number(bar.close));
    const eq=equity(),ex=gross();maxGross=Math.max(maxGross,ex);
    equityCurve.push({timestampMs:frame.time,cash:rounded(cash),equity:rounded(eq),grossExposure:rounded(ex)});
    record({eventType:'mark',timestampMs:frame.time,barIndex:frame.index,phase:'intrabar',
      details:Object.freeze({cash:rounded(cash),equity:rounded(eq),grossExposure:rounded(ex)})});
  }

  const last=frames[frames.length-1]!;
  for(const order of orders.values())if(active(order.status)){
    order.status='expired';record({eventType:'order_expired',orderId:order.intent.orderId,signalId:order.intent.signalId,symbol:order.intent.symbol,
      side:order.intent.side,originalIntent:order.original,currentIntent:order.intent,remainingQuantity:order.remaining,
      reason:'Simulation ended with remaining unfilled quantity.',timestampMs:last.time,barIndex:last.index,phase:'intrabar'});
  }
  const currentEquity=equity();
  const positionsOut=[...positions.values()].filter(p=>Math.abs(p.quantity)>1e-10).map(p=>{
    const mark=marks.get(p.symbol),unrealized=mark==null?null:(mark-p.averagePrice)*p.quantity;
    return Object.freeze({symbol:p.symbol,quantity:rounded(p.quantity),averagePrice:rounded(p.averagePrice),
      marketPrice:mark==null?null:rounded(mark),marketValue:mark==null?null:rounded(p.quantity*mark),
      unrealizedPnl:unrealized==null?null:rounded(unrealized),realizedNetPnl:rounded(p.realizedNetPnl)});
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const allOrders=[...orders.values()];
  const orderedLedger=ledger.sort((a,b)=>a.timestampMs-b.timestampMs||
    ({open:0,intrabar:1,'bar-close':2}[a.phase]-({open:0,intrabar:1,'bar-close':2}[b.phase]))||a.ordinal-b.ordinal)
    .map((event,index)=>{const {ordinal,...rest}=event;return Object.freeze({...rest,sequence:index});});
  const dataIdentity=JSON.stringify({strategyId:input.strategyId,sourceProgramChecksum:input.sourceProgramChecksum,datasetId:input.datasetId,
    config,datasets:input.datasets.map(d=>({symbol:d.symbol,timeframe:d.timeframe,bars:d.bars})),actions});
  return Object.freeze({
    simulationId:'sim-'+fingerprint(dataIdentity),environment:'simulation',executionAuthority:'simulation-only',
    strategyId:input.strategyId,sourceProgramChecksum:input.sourceProgramChecksum,datasetIds:Object.freeze([input.datasetId]),config,
    assumptions:Object.freeze({
      fillModel:'deterministic-ohlcv-v1',
      signalTiming:'An order cannot fill until a later timeline timestamp than its signal.',
      marketGapPolicy:'Market and triggered stops use the open when it gaps beyond the trigger.',
      limitGapPolicy:'Limits receive a better open when available and never a worse price than their limit.',
      intrabarPolicy:config.intrabarPolicy,executionDetail:config.executionDetail,
      executionDetailNote:config.executionDetail==='ohlc'?'OHLC cannot reveal intrabar path; ambiguous stop/target events use the configured policy.':
        config.executionDetail==='lower-timeframe'?'Supply lower-timeframe candles to reduce but not eliminate intrabar ambiguity.':'Tick mode requires one-price bars, representing observed ticks.',
      partialFillPolicy:'A shared per-symbol bar volume budget limits fills; all fill quantities are lot-aligned.',
      accounting:'Weighted-average-cost; entry and exit fees are allocated proportionally when positions close.',
      costModel:'Configured brokerage, exchange-fee, tax, spread and slippage assumptions; these are estimates, not broker statements.',
      exposurePolicy:'Gross exposure is capped by min(maxGrossExposure, equity × maxGrossExposureMultiple).',
      liveBrokerOrdersSubmitted:false,
    }),
    ledger:Object.freeze(orderedLedger),closedTrades:Object.freeze(trades),equityCurve:Object.freeze(equityCurve.map(r=>Object.freeze(r))),
    positions:Object.freeze(positionsOut),
    summary:Object.freeze({initialCash:rounded(config.initialCash),endingCash:rounded(cash),endingEquity:rounded(currentEquity),
      netProfit:rounded(currentEquity-config.initialCash),realizedNetPnl:rounded(realizedNet),feesPaid:rounded(feesPaid),
      fillCount:orderedLedger.filter(e=>['fill','partial_fill','protective_exit'].includes(e.eventType)).length,
      rejectedOrderCount:orderedLedger.filter(e=>e.eventType==='order_rejected').length,cancelledOrderCount:allOrders.filter(o=>o.status==='cancelled').length,
      expiredOrderCount:allOrders.filter(o=>o.status==='expired').length,openOrderCount:allOrders.filter(o=>active(o.status)).length,
      closedTradeCount:trades.length,maxGrossExposure:rounded(maxGross)}),
  });
}
