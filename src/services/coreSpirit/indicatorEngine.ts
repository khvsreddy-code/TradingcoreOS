import type { CoreSpiritMarketBar } from './marketData';
import type { IndicatorInputBinding } from '../core/data/indicatorDataPlane';
import {
  RollingSum, RollingMean, RollingVariance, RollingMinMax, RollingMedian,
  EMAState, WilderState, ATRState, WMAState, VWAPSessionState,
} from './statefulIndicatorKernel';

/**
 * Stateful CoreSpirit primitive indicators.
 *
 * Every rolling operation keeps bounded state and supports append/replace for
 * forming-bar updates. No per-bar window creation, sort, Math.max(...window) or
 * reduce over a period is allowed in this hot path.
 */
export type NativeIndicatorState = Record<string, number[]>;
export type NativeIndicatorContext = { state: NativeIndicatorState; push(key:string, value:number):void };

type NativeKernel = {
  update(value:number, mode?:'append'|'replace'):unknown;
  reset?():void;
};

type KernelEntry = {
  kernel:NativeKernel;
  lastHistoryLength:number;
  lastSignature:string;
  lastSecond:number;
  lastValue:unknown;
};

type RsiKernel = { gain:WilderState; loss:WilderState; previous:number|null; value:number|null };
type HmaKernel = { half:WMAState; full:WMAState; root:WMAState };
type PersistenceKernelState = {
  values:Float64Array; deltaSigns:Int8Array; comparisonValid:Uint8Array; comparisonSame:Uint8Array;
  period:number; cursor:number; count:number; validCount:number; comparisons:number; same:number; seen:number;
};

const kernelStores = new WeakMap<NativeIndicatorContext, Map<string, KernelEntry>>();
const kernelEpochs = new WeakMap<NativeIndicatorContext, { length:number; signature:string }>();

function historySignature(history:readonly number[]):string {
  return String(history.length) + '|' + String(Number(history[0])) + '|' + String(Number(history[1])) + '|' + String(Number(history[2]));
}

function storeFor(ctx:NativeIndicatorContext):Map<string,KernelEntry> {
  let store = kernelStores.get(ctx);
  if (!store) { store = new Map(); kernelStores.set(ctx,store); }
  return store;
}

function resetKernelsForNewHistory(ctx:NativeIndicatorContext, history:readonly number[]):void {
  const sig = historySignature(history);
  const previous = kernelEpochs.get(ctx);
  if (previous && history.length < previous.length) {
    const store = kernelStores.get(ctx);
    store?.forEach((entry) => entry.kernel.reset?.());
    store?.clear();
  }
  kernelEpochs.set(ctx,{length:history.length,signature:sig});
}

function kernelCurrent(kernel:NativeKernel, selector:string):unknown {
  if (selector === 'highest') return (kernel as RollingMinMax).max();
  if (selector === 'lowest') return (kernel as RollingMinMax).min();
  if (selector === 'variance') return (kernel as RollingVariance).variance();
  if (selector === 'normalize') return (kernel as RollingMinMax).min();
  const value = (kernel as NativeKernel & { value?: unknown }).value;
  return typeof value === 'function' ? (value as () => unknown).call(kernel) : value;
}

function seedKernel(kernel:NativeKernel, history:readonly number[], count:number):void {
  const start = Math.max(0,history.length - Math.max(1,count));
  for (let i = history.length - 1; i >= start; i -= 1) kernel.update(Number(history[i]),'append');
}

function statefulValue(
  ctx:NativeIndicatorContext,
  key:string,
  history:readonly number[],
  current:number,
  factory:()=>NativeKernel,
  seedCount:number,
  selector:string,
):unknown {
  resetKernelsForNewHistory(ctx,history);
  const store=storeFor(ctx);
  const sig=historySignature(history);
  let entry=store.get(key);
  if (!entry) {
    const kernel=factory();
    seedKernel(kernel,history,seedCount);
    entry={kernel,lastHistoryLength:history.length,lastSignature:sig,lastSecond:Number(history[1]),lastValue:kernelCurrent(kernel,selector)};
    store.set(key,entry);
    return entry.lastValue;
  }
  if (entry.lastHistoryLength===history.length && entry.lastSignature===sig) return entry.lastValue;
  const secondChanged=Number(history[1])!==entry.lastSecond;
  const mode:'append'|'replace' =
    history.length > entry.lastHistoryLength || (history.length===entry.lastHistoryLength && secondChanged)
      ? 'append' : 'replace';
  entry.kernel.update(current,mode);
  entry.lastHistoryLength=history.length;
  entry.lastSignature=sig;
  entry.lastSecond=Number(history[1]);
  entry.lastValue=kernelCurrent(entry.kernel,selector);
  return entry.lastValue;
}

class HmaKernel implements NativeKernel {
  readonly half:WMAState;
  readonly full:WMAState;
  readonly root:WMAState;
  constructor(period:number) {
    const half=Math.max(1,Math.floor(period/2));
    const root=Math.max(1,Math.floor(Math.sqrt(period)));
    this.half=new WMAState(half);
    this.full=new WMAState(period);
    this.root=new WMAState(root);
  }
  private lastValue:number|null=null;
  update(value:number,mode:'append'|'replace'='append'):number|null {
    const a=this.half.update(value,mode), b=this.full.update(value,mode);
    this.lastValue = a==null || b==null ? null : this.root.update(2*a-b,mode);
    return this.lastValue;
  }
  get value():number|null { return this.lastValue; }
  reset():void { this.half.reset(); this.full.reset(); this.root.reset(); this.lastValue=null; }
}

class PersistenceKernel implements NativeKernel {
  private readonly s:PersistenceKernelState;
  constructor(period:number) {
    const p=Math.max(1,Math.floor(period));
    this.s={values:new Float64Array(p),deltaSigns:new Int8Array(p),comparisonValid:new Uint8Array(p),comparisonSame:new Uint8Array(p),period:p,cursor:0,count:0,validCount:0,comparisons:0,same:0,seen:0};
    this.s.values.fill(Number.NaN);
  }
  private result():number|null {
    return this.s.count===this.s.period && this.s.validCount===this.s.period
      ? (this.s.comparisons ? this.s.same/this.s.comparisons : 0) : null;
  }
  update(value:number,mode:'append'|'replace'='append'):number|null {
    const v=Number(value);
    if (mode==='replace' && this.s.count>0) {
      const slot=(this.s.seen-1+this.s.period)%this.s.period;
      const previousSlot=(this.s.seen-2+this.s.period*2)%this.s.period;
      const old=this.s.values[slot]!;
      if (this.s.comparisonValid[slot]) {
        this.s.comparisons-=1;
        this.s.same-=this.s.comparisonSame[slot] ? 1 : 0;
      }
      this.s.validCount-=Number.isFinite(old) ? 1 : 0;
      const prev=Number.isFinite(previousSlot>=0 ? this.s.values[previousSlot]! : NaN) ? this.s.values[previousSlot]! : Number.NaN;
      const prevSign=this.s.seen>1 ? this.s.deltaSigns[previousSlot]! : 0;
      const sign=Number.isFinite(v)&&Number.isFinite(prev) ? Math.sign(v-prev) : 0;
      this.s.values[slot]=v;
      this.s.deltaSigns[slot]=sign;
      this.s.validCount+=Number.isFinite(v) ? 1 : 0;
      if (sign!==0 && prevSign!==0) {
        this.s.comparisonValid[slot]=1;
        this.s.comparisonSame[slot]=sign===prevSign ? 1 : 0;
        this.s.comparisons+=1;
        this.s.same+=sign===prevSign ? 1 : 0;
      } else {
        this.s.comparisonValid[slot]=0;
        this.s.comparisonSame[slot]=0;
      }
      return this.result();
    }
    const absolute=this.s.seen;
    const slot=absolute%this.s.period;
    const previousSlot=(absolute-1+this.s.period)%this.s.period;
    const previous=absolute>0 ? this.s.values[previousSlot]! : Number.NaN;
    const previousSign=absolute>0 ? this.s.deltaSigns[previousSlot]! : 0;
    if (this.s.count===this.s.period) {
      const oldStart=absolute-this.s.period;
      const removeIndex=oldStart+2;
      if (removeIndex>=0) {
        const removeSlot=removeIndex%this.s.period;
        if (this.s.comparisonValid[removeSlot]) {
          this.s.comparisons-=1;
          this.s.same-=this.s.comparisonSame[removeSlot] ? 1 : 0;
          this.s.comparisonValid[removeSlot]=0;
          this.s.comparisonSame[removeSlot]=0;
        }
      }
      const old=this.s.values[this.s.cursor]!;
      this.s.validCount-=Number.isFinite(old) ? 1 : 0;
      this.s.cursor=(this.s.cursor+1)%this.s.period;
    } else {
      this.s.count+=1;
    }
    this.s.values[slot]=v;
    this.s.validCount+=Number.isFinite(v) ? 1 : 0;
    const sign=Number.isFinite(v)&&Number.isFinite(previous) ? Math.sign(v-previous) : 0;
    this.s.deltaSigns[slot]=sign;
    if (absolute>=2 && sign!==0 && previousSign!==0) {
      this.s.comparisonValid[slot]=1;
      this.s.comparisonSame[slot]=sign===previousSign ? 1 : 0;
      this.s.comparisons+=1;
      this.s.same+=sign===previousSign ? 1 : 0;
    } else {
      this.s.comparisonValid[slot]=0;
      this.s.comparisonSame[slot]=0;
    }
    this.s.seen+=1;
    return this.result();
  }
  get value():number|null { return this.result(); }
  reset():void { this.s.values.fill(Number.NaN);this.s.deltaSigns.fill(0);this.s.comparisonValid.fill(0);this.s.comparisonSame.fill(0);this.s.cursor=0;this.s.count=0;this.s.validCount=0;this.s.comparisons=0;this.s.same=0;this.s.seen=0; }
}

function numericOrNull(value:unknown):number|null { if (value==null) return null; const n=Number(value); return Number.isFinite(n) ? n : null; }

function output(ctx:NativeIndicatorContext,key:string,value:number|null):number|null {
  if (value==null || !Number.isFinite(value)) return null;
  ctx.push(key,value);
  return value;
}

export function calculateNativeIndicator(name:string,args:unknown[],history:number[],ctx:NativeIndicatorContext,sourceName='close'):number|null {
  const period=Math.max(1,Math.floor(Number(args[1] ?? 14)));
  const current=Number(args[0]);
  if (!Number.isFinite(current)) return null;
  const values=history.length ? history : [current];
  const resultKey='result:' + name + ':' + sourceName + ':' + period;

  switch(name) {
    case 'sma':
    case 'mean':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,name + ':' + sourceName + ':' + period,values,current,()=>new RollingMean(period),period,name)));
    case 'sum':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'sum:' + sourceName + ':' + period,values,current,()=>new RollingSum(period),period,'sum')));
    case 'highest':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'highest:' + sourceName + ':' + period,values,current,()=>new RollingMinMax(period),period,'highest')));
    case 'lowest':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'lowest:' + sourceName + ':' + period,values,current,()=>new RollingMinMax(period),period,'lowest')));
    case 'stdev':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'stdev:' + sourceName + ':' + period,values,current,()=>new RollingVariance(period),period,'stdev')));
    case 'variance':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'variance:' + sourceName + ':' + period,values,current,()=>new RollingVariance(period),period,'variance')));
    case 'wma':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'wma:' + sourceName + ':' + period,values,current,()=>new WMAState(period),period,'wma')));
    case 'median':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'median:' + sourceName + ':' + period,values,current,()=>new RollingMedian(period),period,'median')));
    case 'rma':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'rma:' + sourceName + ':' + period,values,current,()=>new WilderState(period),period,'rma')));
    case 'ema':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'ema:' + sourceName + ':' + period,values,current,()=>new EMAState(period),period,'ema')));
    case 'hma':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'hma:' + sourceName + ':' + period,values,current,()=>new HmaKernel(period),period + Math.floor(Math.sqrt(period)) + 2,'hma')));
    case 'zscore': {
      const key='zscore:' + sourceName + ':' + period;
      const store=storeFor(ctx);
      const stateful=statefulValue(ctx,key,values,current,()=>new RollingVariance(period),period,'variance');
      const entry=store.get(key);
      if (!entry) return null;
      const state=entry.kernel as RollingVariance;
      const mean=state.mean();
      const sd=state.value();
      return mean==null||sd==null ? null : output(ctx,resultKey,sd===0 ? 0 : (current-mean)/sd);
    }
    case 'normalize': {
      const key='normalize:' + sourceName + ':' + period;
      const store=storeFor(ctx);
      statefulValue(ctx,key,values,current,()=>new RollingMinMax(period),period,'normalize');
      const state=store.get(key)?.kernel as RollingMinMax|undefined;
      if (!state) return null;
      const lo=state.min(),hi=state.max();
      return lo==null||hi==null ? null : output(ctx,resultKey,hi===lo ? 0 : (current-lo)/(hi-lo));
    }
    case 'persistence':
      return output(ctx,resultKey,numericOrNull(statefulValue(ctx,'persistence:' + sourceName + ':' + period,values,current,()=>new PersistenceKernel(period),period,'persistence')));
    case 'change': {
      if (values.length<=period) return null;
      const previous=Number(values[period]);
      return Number.isFinite(previous) ? output(ctx,resultKey,current-previous) : null;
    }
    case 'pctchange': {
      if (values.length<=period) return null;
      const previous=Number(values[period]);
      return Number.isFinite(previous)&&previous!==0 ? output(ctx,resultKey,current/previous-1) : null;
    }
    default:
      return null;
  }
}

type NativeAtrEntry = { state:WilderState; previousClose:number|null; lastBarSignature:string; };
const atrContexts = new WeakMap<NativeIndicatorContext, Map<string,NativeAtrEntry>>();

export function calculateNativeAtr(
  bar:Pick<CoreSpiritMarketBar,'high'|'low'> & {close?:number},
  previousClose:number|null,
  period:number,
  ctx:NativeIndicatorContext,
):number|null {
  const p=Math.max(1,Math.floor(period));
  const key='atr:' + p;
  let store=atrContexts.get(ctx);
  if(!store){store=new Map();atrContexts.set(ctx,store);}
  const high=Number(bar.high), low=Number(bar.low), close=Number((bar as {close?:number}).close);
  if(![high,low].every(Number.isFinite)) return null;
  const signature=String(high)+'|' + String(low)+'|' + String(close);
  let entry=store.get(key);
  const trWithPrevious=(pc:number|null)=>Number.isFinite(pc as number)
    ? Math.max(high-low,Math.abs(high-(pc as number)),Math.abs(low-(pc as number)))
    : high-low;
  if(!entry){
    const state=new WilderState(p);
    const tr=trWithPrevious(Number.isFinite(previousClose as number) ? previousClose : null);
    const value=state.updateWilder(tr,'append');
    entry={state,previousClose:Number.isFinite(close)?close:null,lastBarSignature:signature};
    store.set(key,entry);
    return output(ctx,'result:atr:' + p,value==null?null:Number(value));
  }
  const mode:'append'|'replace'=entry.lastBarSignature===signature?'replace':'append';
  const tr=trWithPrevious(entry.previousClose);
  const value=entry.state.updateWilder(tr,mode);
  if(mode==='append' && Number.isFinite(close)) entry.previousClose=close;
  entry.lastBarSignature=signature;
  return output(ctx,'result:atr:' + p,value==null?null:Number(value));
}

/** Stage 95 shared-data entry point: indicator kernels borrow canonical series inputs. */
export type CoreSpiritCanonicalIndicatorInput = Readonly<{
  values: Float64Array;
  timeline: Float64Array;
  revision: number;
  timelineKey: string;
}>;

export function bindCanonicalIndicatorInput(input: IndicatorInputBinding): CoreSpiritCanonicalIndicatorInput {
  return Object.freeze({ values: input.values, timeline: input.time, revision: input.revision, timelineKey: input.timelineKey });
}
