import type { HistoricalCandle } from './brokers/BrokerAdapter';
import type { PredictionResult } from './predictionEngine';
import {
  isAutomationExecutionEnabled,
  isAutomationLive,
  type CoreSpiritAutomationLifecycleRecord,
  type CoreSpiritAutomationLifecycleState,
} from './coreSpirit/automationLifecycle';

export type AutomationSignal = 'BUY_CE'|'BUY_PE'|'SELL_CE'|'SELL_PE'|'LONG'|'SHORT'|'ALERT';

export type AutomationExecutionMode = 'live'|'paper'|'historical'|'replay'|'backtest';

export interface AutomationContext {
  symbol:string;
  price:number;
  timeframe?:string;
  /** Exchange timezone for session/run-budget accounting; the host owns this value. */
  exchangeTimezone?:string;
  candles:HistoricalCandle[];
  /** Preferred zero-copy input from the canonical market-data plane. */
  columns?:Readonly<{time:ArrayLike<number>;open:ArrayLike<number>;high:ArrayLike<number>;low:ArrayLike<number>;close:ArrayLike<number>;volume:ArrayLike<number>;length:number}>;
  prediction?:PredictionResult;
  vwap?:number;
  oi?:number;
  pcr?:number;
  timestamp?:number;
  /** The active bar can revise until the feed explicitly confirms its close. */
  barConfirmed?:boolean;
  /** Canonical bar identity prevents a confirmed crossover from firing twice on revision/reconnect. */
  barIndex?:number;
  barRevision?:number;
  eventId?:string;
  /** Only the live host is eligible to forward an order intent to the execution gateway. */
  executionMode?:AutomationExecutionMode;
  /** Exchange-local trading date (for example Asia/Kolkata's YYYY-MM-DD). */
  sessionDate?:string;
}

export interface AutomationCondition {
  field:string;
  operator:'>'|'<'|'>='|'<='|'='|'crosses_above'|'crosses_below';
  value:number|string;
}
export interface AutomationAction {
  type:'SIGNAL'|'NOTIFY'|'ORDER_TICKET'|'PLACE_ORDER';
  signal?:AutomationSignal;
  payload?:Record<string,unknown>;
}
export interface AutomationRule {
  id:string;
  name:string;
  enabled:boolean;
  mode:'Paper'|'Live'|'Off';
  lifecycle:CoreSpiritAutomationLifecycleState;
  logic:'ALL'|'ANY';
  conditions:AutomationCondition[];
  actions:AutomationAction[];
  cooldownSeconds:number;
  maxRunsPerDay:number;
  allowOrderExecution:boolean;
  requireConfirmation:boolean;
  lastRunAt?:number;
  /** In-memory durable state must be serialized with the rule by its host. */
  runTimestamps?:number[];
  lastRunBarKey?:string;
  updatedAt?:number;
  lifecycleHistory?:CoreSpiritAutomationLifecycleRecord[];
}

export interface AutomationConditionResult extends AutomationCondition {
  actual:number|null;
  previousActual:number|null;
  passed:boolean;
  error?:string;
}
export interface AutomationEvaluation {
  triggered:boolean;
  results:AutomationConditionResult[];
  actions:AutomationAction[];
  blockedActions:AutomationAction[];
  reason:string;
  runTimestamps?:number[];
  lastRunAt?:number;
  lastRunBarKey?:string;
  featureValues:Readonly<Record<string,number|null>>;
}

const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;

function emaSeries(values:ArrayLike<number>,period:number):number[] {
  if(!values.length)return [];
  const k=2/(period+1);
  const out=new Array<number>(values.length);
  out[0]=values[0]!;
  for(let i=1;i<values.length;i++)out[i]=values[i]!*k+out[i-1]!*(1-k);
  return out;
}

function rsiSeries(values:ArrayLike<number>,period=14):number[] {
  const out=new Array<number>(values.length).fill(Number.NaN);
  if(values.length<=period)return out;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){
    const delta=values[i]!-values[i-1]!;
    if(delta>0)gain+=delta;else loss-=delta;
  }
  gain/=period;loss/=period;
  const calculate=()=>loss===0?(gain===0?50:100):100-(100/(1+gain/loss));
  out[period]=calculate();
  for(let i=period+1;i<values.length;i++){
    const delta=values[i]!-values[i-1]!;
    gain=(gain*(period-1)+Math.max(0,delta))/period;
    loss=(loss*(period-1)+Math.max(0,-delta))/period;
    out[i]=calculate();
  }
  return out;
}

function safeFinite(value:unknown):number|undefined {
  if(value===null||value===undefined||value==='')return undefined;
  const numeric=Number(value);
  return Number.isFinite(numeric)?numeric:undefined;
}

function marketDayKey(timestampMs:number,context:AutomationContext,useSuppliedSessionDate=false):string {
  if(useSuppliedSessionDate && context.sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(context.sessionDate)) return context.sessionDate;
  const formatDate=(timezone:string)=> {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestampMs));
    const values:Record<string,string>={};
    for(const part of parts)if(part.type!=='literal')values[part.type]=part.value;
    return values.year+'-'+values.month+'-'+values.day;
  };
  try { return formatDate(String(context.exchangeTimezone||'Asia/Kolkata')); }
  catch { return formatDate('Asia/Kolkata'); }
}
function timestampMs(value:unknown):number|undefined {
  if(value===null||value===undefined||value==='')return undefined;
  const numeric=typeof value==='number'?value:Number(value);
  if(Number.isFinite(numeric))return numeric>1e12?numeric:numeric*1000;
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?parsed:undefined;
}
/** Build one shared current/previous feature frame per evaluation rather than recalculating each condition. */
function buildAutomationFeatureFrame(context:AutomationContext):{
  current:Map<string,number|undefined>;
  previous:Map<string,number|undefined>;
} {
  const candles=Array.isArray(context.candles)?context.candles:[];
  const columns=context.columns;
  const count=columns
    ? Math.max(0,Math.min(columns.length,columns.close.length,columns.high.length,columns.low.length,columns.volume.length))
    : candles.length;
  // Preferred columnar input borrows canonical ArrayLike views rather than remapping
  // the chart tape into OHLCV objects for each rule/condition evaluation.
  const closes:ArrayLike<number>=columns?.close ?? candles.map(candle=>Number(candle.close));
  const highs:ArrayLike<number>=columns?.high ?? candles.map(candle=>Number(candle.high));
  const lows:ArrayLike<number>=columns?.low ?? candles.map(candle=>Number(candle.low));
  const volumes:ArrayLike<number>=columns?.volume ?? candles.map(candle=>Number(candle.volume??0));
  for(let i=0;i<count;i++){
    const volume=Number(volumes[i]);
    if(!Number.isFinite(Number(closes[i]))||!Number.isFinite(Number(highs[i]))||
       !Number.isFinite(Number(lows[i]))||!Number.isFinite(volume)||volume<0){
      return {current:new Map(),previous:new Map()};
    }
  }
  if(count===0)return {current:new Map(),previous:new Map()};
  const ema9=emaSeries(closes,9),ema21=emaSeries(closes,21),rsi14=rsiSeries(closes,14);
  const readAt=(index:number,isCurrent:boolean):Map<string,number|undefined>=>{
    const values=new Map<string,number|undefined>();
    if(index<0||index>=count)return values;
    const candle=candles[index];
    const close=Number(closes[index]);
    // A confirmed close is authoritative for confirmed-bar decisions; never let an
    // LTP snapshot replace its close after the bar has been finalized.
    const price=isCurrent?(context.barConfirmed===true?close:(safeFinite(context.price)??close)):close;
    const e9=ema9[index],e21=ema21[index];
    values.set('price',price);
    values.set('prediction_confidence',safeFinite(context.prediction?.confidence));
    values.set('prediction_bullish',safeFinite(context.prediction?.bullishProbability));
    values.set('prediction_bearish',safeFinite(context.prediction?.bearishProbability));
    values.set('pcr',safeFinite(context.pcr));
    values.set('oi',safeFinite(context.oi));
    const vwap=safeFinite(context.vwap);
    values.set('vwap_distance_pct',vwap!==undefined&&vwap!==0?((price/vwap)-1)*100:undefined);
    values.set('ema9',Number.isFinite(e9)?e9:undefined);
    values.set('ema21',Number.isFinite(e21)?e21:undefined);
    values.set('ema_spread_pct',Number.isFinite(e9)&&Number.isFinite(e21)&&e21!==0?((e9/e21)-1)*100:undefined);
    values.set('rsi14',Number.isFinite(rsi14[index])?rsi14[index]:undefined);
    if(index>=20){
      let volumeSum=0,priorHigh=Number.NEGATIVE_INFINITY,priorLow=Number.POSITIVE_INFINITY;
      for(let j=index-20;j<index;j++){
        volumeSum+=Number(volumes[j]);
        priorHigh=Math.max(priorHigh,Number(highs[j]));
        priorLow=Math.min(priorLow,Number(lows[j]));
      }
      const averageVolume=volumeSum/20;
      values.set('volume_ratio',averageVolume>0?Number(volumes[index])/averageVolume:undefined);
      values.set('range_breakout_up',price>priorHigh?1:0);
      values.set('range_breakout_down',price<priorLow?1:0);
    }else{
      values.set('volume_ratio',undefined);
      values.set('range_breakout_up',undefined);
      values.set('range_breakout_down',undefined);
    }
    values.set('volume',safeFinite(volumes[index]));
    return values;
  };
  return {current:readAt(count-1,true),previous:readAt(count-2,false)};
}
function compare(actual:number,threshold:number,operator:AutomationCondition['operator']):boolean {
  switch(operator){
    case '>':return actual>threshold;
    case '<':return actual<threshold;
    case '>=':return actual>=threshold;
    case '<=':return actual<=threshold;
    case '=':return Math.abs(actual-threshold)<1e-9;
    default:return false;
  }
}

export function evaluateAutomation(rule:AutomationRule,context:AutomationContext,now=Date.now()):AutomationEvaluation {
  const frame=buildAutomationFeatureFrame(context);
  const featureValues=Object.fromEntries([...frame.current.entries()].map(([name,value])=>[name,value??null]));
  const noAction=(reason:string,results:AutomationConditionResult[]=[]):AutomationEvaluation=>({
    triggered:false,results,actions:[],blockedActions:[],reason,featureValues,
  });
  if(!isAutomationExecutionEnabled(rule.lifecycle))return noAction('lifecycle:'+rule.lifecycle);
  if(!rule.enabled||rule.mode==='Off')return noAction('disabled');
  if(!Array.isArray(rule.conditions)||rule.conditions.length===0)return noAction('no_conditions');
  if(!Number.isFinite(now)||now<=0)return noAction('invalid_evaluation_time');

  const cooldownMs=Math.max(0,Number(rule.cooldownSeconds)||0)*1000;
  if(Number.isFinite(rule.lastRunAt)&&rule.lastRunAt!>0&&now-rule.lastRunAt!<cooldownMs)return noAction('cooldown');

  const dayKey=marketDayKey(now,context,true);
  // The supplied sessionDate belongs to this evaluation only. Bucket saved timestamps
  // by their own exchange-local date to prevent prior-session runs consuming today's budget.
  const runTimestamps=(Array.isArray(rule.runTimestamps)?rule.runTimestamps:[])
    .filter(value=>Number.isFinite(value)&&value>0&&marketDayKey(value,context,false)===dayKey);
  if(runTimestamps.length>=Math.max(0,Math.floor(Number(rule.maxRunsPerDay)||0)))return noAction('max_runs_per_day');

  const currentBarIndex=Number.isInteger(context.barIndex)?context.barIndex:(context.columns?.length??context.candles.length)-1;
  const lastCandle=context.candles.at(-1);
  const rawBarTimestamp=lastCandle?.timestamp??context.columns?.time?.[currentBarIndex]??context.timestamp;
  const canonicalBarTimestamp=timestampMs(rawBarTimestamp);
  const barKey=[context.symbol,String(context.timeframe||''),currentBarIndex,canonicalBarTimestamp??String(rawBarTimestamp??'unknown')].join('|');
  // Ignore packet IDs and bar revisions: a single confirmed candle must not submit twice.
  if(rule.lastRunBarKey&&rule.lastRunBarKey===barKey)return noAction('duplicate_bar_event');

  const results:AutomationConditionResult[]=rule.conditions.map(condition=>{
    const actualValue=frame.current.get(condition.field);
    const previousValue=frame.previous.get(condition.field);
    const actual=actualValue!==undefined&&Number.isFinite(actualValue)?actualValue:null;
    const previousActual=previousValue!==undefined&&Number.isFinite(previousValue)?previousValue:null;
    const threshold=safeFinite(condition.value);
    if(actual===null)return {...condition,actual,previousActual,passed:false,error:'unknown_or_unavailable_field'};
    if(threshold===undefined)return {...condition,actual,previousActual,passed:false,error:'condition_value_must_be_finite_number'};
    if(condition.operator==='crosses_above'||condition.operator==='crosses_below'){
      if(context.barConfirmed!==true)return {...condition,actual,previousActual,passed:false,error:'confirmed_bar_required'};
      if(previousActual===null)return {...condition,actual,previousActual,passed:false,error:'previous_bar_value_unavailable'};
      const passed=condition.operator==='crosses_above'
        ?previousActual<=threshold&&actual>threshold
        :previousActual>=threshold&&actual<threshold;
      return {...condition,actual,previousActual,passed};
    }
    return {...condition,actual,previousActual,passed:compare(actual,threshold,condition.operator)};
  });

  const matched=rule.logic==='ALL'?results.every(result=>result.passed):results.some(result=>result.passed);
  if(!matched)return noAction(results.some(result=>result.error==='confirmed_bar_required')?'confirmed_bar_required':'conditions_not_met',results);

  // A real order intent is only exposed by an explicitly live, armed execution context.
  // Paper/history/replay can still emit signals/notifications but cannot request a broker order.
  const canSubmitLiveOrder=rule.mode==='Live'&&isAutomationLive(rule.lifecycle)
    &&rule.allowOrderExecution&&!rule.requireConfirmation&&context.executionMode==='live'
    &&context.barConfirmed===true;
  const actions:AutomationAction[]=[];
  const blockedActions:AutomationAction[]=[];
  for(const action of rule.actions){
    if(action.type==='PLACE_ORDER'&&!canSubmitLiveOrder){blockedActions.push(action);continue;}
    actions.push(action);
  }
  const nextRuns=[...runTimestamps,now].slice(-500);
  // The evaluator owns the guard state so a host can persist it atomically with the rule after this accepted run.
  rule.runTimestamps=nextRuns;
  rule.lastRunAt=now;
  rule.lastRunBarKey=barKey;
  return {
    triggered:true,results,actions,blockedActions,
    reason:blockedActions.length?(context.barConfirmed!==true?'matched_order_action_blocked_unconfirmed_bar':'matched_order_action_blocked_by_execution_boundary'):'matched',
    runTimestamps:nextRuns,lastRunAt:now,lastRunBarKey:barKey,featureValues,
  };
}

export const automationPresets:AutomationRule[]=[
 {id:'simple-price-alert',name:'Simple Price Alert',enabled:false,mode:'Paper',lifecycle:'CREATED',logic:'ALL',cooldownSeconds:60,maxRunsPerDay:20,allowOrderExecution:false,requireConfirmation:true,conditions:[{field:'price',operator:'>=',value:0}],actions:[{type:'NOTIFY',payload:{message:'Price condition matched.'}}]},
 {id:'ema-trend-alert',name:'EMA 9 / 21 Trend Alert',enabled:false,mode:'Paper',lifecycle:'CREATED',logic:'ALL',cooldownSeconds:300,maxRunsPerDay:10,allowOrderExecution:false,requireConfirmation:true,conditions:[{field:'ema_spread_pct',operator:'>',value:0}],actions:[{type:'SIGNAL',signal:'LONG'},{type:'NOTIFY',payload:{message:'EMA trend condition matched.'}}]},
 {id:'rsi-overbought',name:'RSI 14 Overbought Alert',enabled:false,mode:'Paper',lifecycle:'CREATED',logic:'ALL',cooldownSeconds:300,maxRunsPerDay:10,allowOrderExecution:false,requireConfirmation:true,conditions:[{field:'rsi14',operator:'>=',value:70}],actions:[{type:'NOTIFY',payload:{message:'RSI reached overbought zone.'}}]},
 {id:'breakout-alert',name:'Range Breakout Alert',enabled:false,mode:'Paper',lifecycle:'CREATED',logic:'ANY',cooldownSeconds:300,maxRunsPerDay:10,allowOrderExecution:false,requireConfirmation:true,conditions:[{field:'range_breakout_up',operator:'=',value:1},{field:'range_breakout_down',operator:'=',value:1}],actions:[{type:'SIGNAL',signal:'ALERT'},{type:'NOTIFY',payload:{message:'20-bar range breakout detected.'}}]},
];
export function starterPredictionRule():AutomationRule{return {id:'prediction-breakout',name:'NIFTY Prediction Breakout',enabled:false,mode:'Paper',lifecycle:'CREATED',logic:'ALL',cooldownSeconds:300,maxRunsPerDay:5,allowOrderExecution:false,requireConfirmation:true,conditions:[{field:'prediction_bullish',operator:'>=',value:.75},{field:'prediction_confidence',operator:'>=',value:.7}],actions:[{type:'SIGNAL',signal:'BUY_CE'},{type:'ORDER_TICKET',payload:{targetPct:.8,stopLossPct:.4,trailingStop:true}},{type:'NOTIFY',payload:{message:'Prediction breakout conditions matched.'}}]};}
