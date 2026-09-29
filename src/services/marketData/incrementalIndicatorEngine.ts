import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { IndicatorConfig, IndicatorKind } from './indicatorEngine';
import { EMAState, ATRState, RollingMean, RollingVariance, RollingMinMax, RollingSum, RollingAbsoluteDeviation, WMAState, VWAPSessionState, sourceValue, WilderState } from './incrementalIndicatorKernel';

export type IncrementalMode = 'seed' | 'replace' | 'append';
export type IncrementalPatch = { id: string; kind: IndicatorKind; data: any[]; mode: 'full' | 'update'; };
export type IncrementalEvaluation = { results: IncrementalPatch[]; ready: boolean; resetRequired?: boolean; processedBars: number; updateCost: string; };

type RsiState = { period:number; gain:WilderState; loss:WilderState; previousSource:number|null; currentSource:number|null; value:number|null };
type FlowState = { period:number; positive:RollingSum; negative:RollingSum; previousSource:number|null; currentSource:number|null; currentPositive:number; currentNegative:number };
type ObvState = { previousSource:number|null; currentSource:number|null; currentContribution:number; value:number };
type AdxState = { period:number; atr:WilderState; plus:WilderState; minus:WilderState; dx:WilderState; previousHigh:number|null; previousLow:number|null; previousClose:number|null; currentHigh:number|null; currentLow:number|null; currentClose:number|null; currentTR:number; currentPlus:number; currentMinus:number; value:number|null };
type CciState = { mean:RollingMean; deviation:RollingAbsoluteDeviation };
type SupertrendState = { atr:ATRState; finalUpper:number; finalLower:number; trend:1|-1; index:number; previousFinalUpper:number; previousFinalLower:number; previousTrend:1|-1; value:number|null };
type BollingerState = { mean:RollingMean; variance:RollingVariance };
type StochasticState = { high:RollingMinMax; low:RollingMinMax; kSmoother:RollingMean; d:EMAState };
type IchimokuState = { conversionHigh:RollingMinMax; conversionLow:RollingMinMax; baseHigh:RollingMinMax; baseLow:RollingMinMax; spanBHigh:RollingMinMax; spanBLow:RollingMinMax };
type HmaState = { half:WMAState; full:WMAState; raw:WMAState };
type AdvancedState = any;


const standardIncrementalKinds = new Set<IndicatorKind>([
  'EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Supertrend','Ichimoku Cloud',
]);
const advancedIncrementalKinds = new Set<IndicatorKind>([
  'Adaptive Ehlers','Fractional EMA Kalman Filter','Trend Pressure','Trend Target Ribbon','Trinity','Neural Weight Oscillator',
]);
export const INCREMENTAL_INDICATOR_KINDS = new Set<IndicatorKind>([...standardIncrementalKinds, ...advancedIncrementalKinds]);
export const isIncrementalIndicatorSupported = (kind: IndicatorKind) => INCREMENTAL_INDICATOR_KINDS.has(kind);

function configSignature(configs: IndicatorConfig[]) {
  return JSON.stringify(configs.filter(x=>x.enabled&&isIncrementalIndicatorSupported(x.kind)).map(x=>({
    id:x.id,kind:x.kind,period:x.period,fast:x.fast,slow:x.slow,signal:x.signal,multiplier:x.multiplier,smooth:x.smooth,displacement:x.displacement,source:x.source,
  })));
}
function timestamp(c:HistoricalCandle){return Math.floor(new Date(c.timestamp).getTime()/1000);}
function point(c:HistoricalCandle,value:number|null){return value==null?null:{time:timestamp(c),value};}

function rsiUpdate(s:RsiState, src:number, mode:'append'|'replace') {
  if(s.currentSource==null){s.currentSource=src;return null;}
  const previous=mode==='replace'?(s.previousSource??s.currentSource):s.currentSource;
  const delta=src-previous,gain=Math.max(delta,0),loss=Math.max(-delta,0);const g=s.gain.updateWilder(gain,mode),l=s.loss.updateWilder(loss,mode);
  if(mode==='append')s.previousSource=s.currentSource;s.currentSource=src;if(g==null||l==null)return null;s.value=l===0?(g===0?50:100):100-(100/(1+g/l));return s.value;
}

function flowUpdate(s:FlowState, src:number, volume:number, mode:'append'|'replace') {
  if(s.currentSource==null){s.currentSource=src;return null;}
  const previous=mode==='replace'?(s.previousSource??s.currentSource):s.currentSource;
  const delta=src-previous,flow=src*Math.max(0,Number(volume)||0),pos=delta>0?flow:0,neg=delta<0?flow:0;s.positive.update(pos,mode);s.negative.update(neg,mode);s.currentPositive=pos;s.currentNegative=neg;
  if(mode==='append')s.previousSource=s.currentSource;s.currentSource=src;if(s.positive.size!==s.period)return null;const p=s.positive.sumValue(),n=s.negative.sumValue();return n===0?(p===0?50:100):100-(100/(1+p/n));
}

function obvUpdate(s:ObvState, src:number, volume:number, mode:'append'|'replace') {
  if(s.currentSource==null){s.currentSource=src;s.currentContribution=0;return s.value;}
  const previous=mode==='replace'?(s.previousSource??s.currentSource):s.currentSource,sign=src>previous?1:src<previous?-1:0,contribution=sign*Math.max(0,Number(volume)||0);
  if(mode==='replace')s.value+=contribution-s.currentContribution;else{s.value+=contribution;s.previousSource=s.currentSource;}s.currentSource=src;s.currentContribution=contribution;return s.value;
}

function adxUpdate(s:AdxState,c:HistoricalCandle,mode:'append'|'replace') {
  if(s.currentClose==null){s.currentHigh=c.high;s.currentLow=c.low;s.currentClose=c.close;const a=s.atr.updateWilder(c.high-c.low,mode),p=s.plus.updateWilder(0,mode),m=s.minus.updateWilder(0,mode);const out=s.dx.updateWilder(0,mode);s.value=out;return out;}
  const priorH=mode==='replace'?(s.previousHigh??s.currentHigh):s.currentHigh,priorL=mode==='replace'?(s.previousLow??s.currentLow):s.currentLow,priorC=mode==='replace'?(s.previousClose??s.currentClose):s.currentClose;
  const tr=Math.max(c.high-c.low,Math.abs(c.high-priorC!),Math.abs(c.low-priorC!)),up=c.high-priorH!,down=priorL!-c.low,plus=up>down&&up>0?up:0,minus=down>up&&down>0?down:0;
  const a=s.atr.updateWilder(tr,mode),p=s.plus.updateWilder(plus,mode),m=s.minus.updateWilder(minus,mode);
  if(mode==='append'){s.previousHigh=s.currentHigh;s.previousLow=s.currentLow;s.previousClose=s.currentClose;s.currentHigh=c.high;s.currentLow=c.low;s.currentClose=c.close;}else{s.currentHigh=c.high;s.currentLow=c.low;s.currentClose=c.close;}
  s.currentTR=tr;s.currentPlus=plus;s.currentMinus=minus;const pi=a!=null&&a!==0&&p!=null?100*p/a:null,mi=a!=null&&a!==0&&m!=null?100*m/a:null,dx=pi==null||mi==null?0:((pi+mi)===0?0:100*Math.abs(pi-mi)/(pi+mi));const out=s.dx.updateWilder(dx,mode);s.value=out;return out;
}

export class IncrementalIndicatorRuntime {
  private signature='';
  private configs:IndicatorConfig[]=[];
  private states=new Map<string,any>();
  private outputs=new Map<string,any[]>();
  private lastTimestamp:string|null=null;
  private barCount=0;
  private previousCandle:HistoricalCandle|null=null;

  private stateFor(cfg:IndicatorConfig) {
    const existing=this.states.get(cfg.id);if(existing)return existing;
    const p=Math.max(1,Math.floor(cfg.period||20)),source=cfg.source||(cfg.kind==='VWAP'?'hlc3':'close');let state:any;
    switch(cfg.kind){
      case 'EMA': state=new EMAState(p);break;
      case 'SMA': state=new RollingMean(p);break;
      case 'HMA': state={half:new WMAState(Math.max(1,Math.floor(p/2))),full:new WMAState(p),raw:new WMAState(Math.max(1,Math.floor(Math.sqrt(p))))} as HmaState;break;
      case 'VWAP': state=new VWAPSessionState();break;
      case 'Bollinger Bands': state={mean:new RollingMean(p),variance:new RollingVariance(p)} as BollingerState;break;
      case 'Keltner Channels': state={mid:new EMAState(p),atr:new ATRState(p)};break;
      case 'Donchian Channels': state={high:new RollingMinMax(p),low:new RollingMinMax(p)};break;
      case 'RSI': state={period:p,gain:new WilderState(p),loss:new WilderState(p),previousSource:null,currentSource:null,value:null} as RsiState;break;
      case 'MACD': state={fast:new EMAState(Math.max(2,Math.floor(cfg.fast||12))),slow:new EMAState(Math.max(3,Math.floor(cfg.slow||26))),signal:new EMAState(Math.max(2,Math.floor(cfg.signal||9)))};break;
      case 'ATR': state=new ATRState(p);break;
      case 'ADX': state={period:p,atr:new WilderState(p),plus:new WilderState(p),minus:new WilderState(p),dx:new WilderState(p),previousHigh:null,previousLow:null,previousClose:null,currentHigh:null,currentLow:null,currentClose:null,currentTR:0,currentPlus:0,currentMinus:0,value:null} as AdxState;break;
      case 'Stochastic': state={high:new RollingMinMax(p),low:new RollingMinMax(p),kSmoother:new RollingMean(Math.max(1,Math.floor(cfg.smooth||3))),d:new EMAState(Math.max(1,Math.floor(cfg.signal||3)))} as StochasticState;break;
      case 'CCI': state={mean:new RollingMean(p),deviation:new RollingAbsoluteDeviation(p)} as CciState;break;
      case 'OBV': state={previousSource:null,currentSource:null,currentContribution:0,value:0} as ObvState;break;
      case 'MFI': state={period:p,positive:new RollingSum(p),negative:new RollingSum(p),previousSource:null,currentSource:null,currentPositive:0,currentNegative:0} as FlowState;break;
      case 'Supertrend': state={atr:new ATRState(p),finalUpper:0,finalLower:0,trend:1,index:0,previousFinalUpper:0,previousFinalLower:0,previousTrend:1,value:null} as SupertrendState;break;
      case 'Ichimoku Cloud': state={conversionHigh:new RollingMinMax(p),conversionLow:new RollingMinMax(p),baseHigh:new RollingMinMax(Math.max(3,Math.floor(cfg.slow||26))),baseLow:new RollingMinMax(Math.max(3,Math.floor(cfg.slow||26))),spanBHigh:new RollingMinMax(52),spanBLow:new RollingMinMax(52)} as IchimokuState;break;
      default: state=this.advancedState(cfg,p);
    }
    void source;this.states.set(cfg.id,state);return state;
  }

  private advancedState(cfg:IndicatorConfig,p:number):AdvancedState{
    if(cfg.kind==='Trend Target Ribbon')return {fast:new EMAState(p),mid:new EMAState(Math.max(2,Math.round(p*1.8))),slow:new EMAState(Math.max(2,Math.round(p*2.7))),atr:new ATRState(p)};
    if(cfg.kind==='Trinity')return {rsi:{period:p,gain:new WilderState(p),loss:new WilderState(p),previousSource:null,currentSource:null,value:null} as RsiState,adx:{period:p,atr:new WilderState(p),plus:new WilderState(p),minus:new WilderState(p),dx:new WilderState(p),previousHigh:null,previousLow:null,previousClose:null,currentHigh:null,currentLow:null,currentClose:null,currentTR:0,currentPlus:0,currentMinus:0,value:null} as AdxState,volume:new RollingVariance(p)};
    if(cfg.kind==='Neural Weight Oscillator')return {delta:new RollingVariance(p),volume:new RollingVariance(p),previousSource:null};
    if(cfg.kind==='Trend Pressure')return {momentum:new RollingVariance(p),volume:new RollingVariance(p),previousSource:null};
    if(cfg.kind==='Fractional EMA Kalman Filter')return {atr:new ATRState(p),xhat:null,err:1,previousXhat:null,previousErr:1};
    return {ema:new EMAState(p),atr:new ATRState(p),adaptive:null,previousAdaptive:null};
  }

  private clear(){this.states.clear();this.outputs.clear();this.lastTimestamp=null;this.barCount=0;this.previousCandle=null;}

  seed(candles:HistoricalCandle[],configs:IndicatorConfig[]):IncrementalEvaluation{
    this.clear();this.signature=configSignature(configs);this.configs=configs.filter(x=>x.enabled&&isIncrementalIndicatorSupported(x.kind));for(const cfg of this.configs)this.outputs.set(cfg.id,[]);
    for(const candle of candles){this.step(candle,'append',true);this.previousCandle=candle;this.lastTimestamp=candle.timestamp;this.barCount+=1;}
    this.lastTimestamp=candles.at(-1)?.timestamp||null;
    return {results:this.configs.map(cfg=>({id:cfg.id,kind:cfg.kind,data:this.outputs.get(cfg.id)||[],mode:'full'})),ready:true,processedBars:candles.length,updateCost:'full linear seed'};
  }

  update(candle:HistoricalCandle,mode:'replace'|'append',configs:IndicatorConfig[]):IncrementalEvaluation{
    if(configSignature(configs)!==this.signature||!this.configs.length)return {results:[],ready:false,resetRequired:true,processedBars:0,updateCost:'configuration changed'};
    if(mode==='replace' && this.lastTimestamp!==candle.timestamp)return {results:[],ready:false,resetRequired:true,processedBars:0,updateCost:'forming-bar identity changed'};
    if(mode==='append' && this.lastTimestamp && new Date(candle.timestamp).getTime()<=new Date(this.lastTimestamp).getTime())return {results:[],ready:false,resetRequired:true,processedBars:0,updateCost:'non-monotonic append'};
    const results:IncrementalPatch[]=[];
    for(const cfg of this.configs){const next=this.calculate(cfg,candle,mode);const data=next==null?[]:[next];results.push({id:cfg.id,kind:cfg.kind,data,mode:'update'});}
    this.lastTimestamp=candle.timestamp;if(mode==='append'){this.barCount+=1;this.previousCandle=candle;}return {results,ready:true,processedBars:mode==='append'?1:0,updateCost:mode==='append'?'O(nodes) append':'O(nodes) replace'};
  }

  private step(c:HistoricalCandle,mode:'append'|'replace',seeding=false){for(const cfg of this.configs)this.calculate(cfg,c,mode,seeding);}

  private pushOutput(id:string,value:any,mode:'append'|'replace'){if(value==null)return null;const out=this.outputs.get(id)||[];if(mode==='append')out.push(value);else if(out.length)out[out.length-1]=value;else out.push(value);this.outputs.set(id,out);return value;}

  private calculate(cfg:IndicatorConfig,c:HistoricalCandle,mode:'append'|'replace',seeding=false):any{
    const src=sourceValue(c,cfg.source||(cfg.kind==='VWAP'?'hlc3':'close')),p=Math.max(1,Math.floor(cfg.period||20)),s=this.stateFor(cfg);let out:any=null;
    switch(cfg.kind){
      case 'EMA': out=point(c,s.update(src,mode));break;
      case 'SMA': out=point(c,s.update(src,mode).value);break;
      case 'HMA': {const a=s.half.update(src,mode),b=s.full.update(src,mode),raw=a!=null&&b!=null?2*a-b:null,h=s.raw.update(raw??NaN,mode);out=point(c,h);break;}
      case 'VWAP': out=point(c,s.update(c.timestamp,src,c.volume||0,c.close,mode));break;
      case 'Bollinger Bands': {s.mean.update(src,mode);s.variance.update(src,mode);const m=s.mean.value(),sd=s.variance.value();out=m==null||sd==null?null:{time:timestamp(c),middle:m,upper:m+(cfg.multiplier||2)*sd,lower:m-(cfg.multiplier||2)*sd};break;}
      case 'Keltner Channels': {const m=s.mid.update(src,mode),a=s.atr.update(c.high,c.low,c.close,mode);out=m==null||a==null?null:{time:timestamp(c),middle:m,upper:m+(cfg.multiplier||2)*a,lower:m-(cfg.multiplier||2)*a};break;}
      case 'Donchian Channels': {const hi=s.high.update(c.high,mode).max,lo=s.low.update(c.low,mode).min;out=hi==null||lo==null?null:{time:timestamp(c),middle:(hi+lo)/2,upper:hi,lower:lo};break;}
      case 'RSI': out=point(c,rsiUpdate(s,src,mode));break;
      case 'MACD': {const f=s.fast.update(src,mode),sl=s.slow.update(src,mode),m=f!=null&&sl!=null?f-sl:null,sg=m==null?null:s.signal.update(m,mode);out=m!=null&&sg!=null?{time:timestamp(c),macd:m,signal:sg,histogram:m-sg}:null;break;}
      case 'ATR': out=point(c,s.update(c.high,c.low,c.close,mode));break;
      case 'ADX': out=point(c,adxUpdate(s,c,mode));break;
      case 'Stochastic': {const hi=s.high.update(c.high,mode).max,lo=s.low.update(c.low,mode).min,raw=hi==null||lo==null?null:(hi===lo?50:100*(src-lo)/(hi-lo)),k=s.kSmoother.update(raw??NaN,mode).value,d=k==null?null:s.d.update(k,mode);out=k!=null&&d!=null?{time:timestamp(c),k,d}:null;break;}
      case 'CCI': {s.mean.update(src,mode);s.deviation.update(src,mode);const m=s.mean.value(),dev=s.deviation.value(m);if(m!=null&&dev!=null)out=point(c,dev===0?0:(src-m)/(0.015*dev));break;}
      case 'OBV': out=point(c,obvUpdate(s,src,c.volume||0,mode));break;
      case 'MFI': out=point(c,flowUpdate(s,src,c.volume||0,mode));break;
      case 'Supertrend': out=this.supertrend(s,c,mode,p,cfg.multiplier||3);break;
      case 'Ichimoku Cloud': {s.conversionHigh.update(c.high,mode);s.conversionLow.update(c.low,mode);s.baseHigh.update(c.high,mode);s.baseLow.update(c.low,mode);s.spanBHigh.update(c.high,mode);s.spanBLow.update(c.low,mode);const hi9=s.conversionHigh.max(),lo9=s.conversionLow.min(),hi26=s.baseHigh.max(),lo26=s.baseLow.min(),hi52=s.spanBHigh.max(),lo52=s.spanBLow.min();if([hi9,lo9,hi26,lo26].every(v=>v!=null)){const ten=(hi9!+lo9!)/2,kij=(hi26!+lo26!)/2,spanA=(ten+kij)/2,spanB=hi52!=null&&lo52!=null?(hi52+lo52)/2:spanA;out={time:timestamp(c),tenkan:ten,kijun:kij,spanA,spanB};}break;}
      default: out=this.advanced(cfg,s,c,src,mode);
    }
    this.pushOutput(cfg.id,out,mode);
    if(seeding)return out; return out;
  }

  private supertrend(s:SupertrendState,c:HistoricalCandle,mode:'append'|'replace',period:number,multiplier:number){const a=s.atr.update(c.high,c.low,c.close,mode);if(a==null)return null;const previousClose=this.previousCandle?.close??c.close;
    if(mode==='replace'){s.finalUpper=s.previousFinalUpper;s.finalLower=s.previousFinalLower;s.trend=s.previousTrend;}
    const mid=(c.high+c.low)/2,upper=mid+multiplier*a,lower=mid-multiplier*a;
    if(s.index===0){s.finalUpper=upper;s.finalLower=lower;}else{s.previousFinalUpper=s.finalUpper;s.previousFinalLower=s.finalLower;s.previousTrend=s.trend;s.finalUpper=upper<s.finalUpper||previousClose>s.finalUpper?upper:s.finalUpper;s.finalLower=lower>s.finalLower||previousClose<s.finalLower?lower:s.finalLower;if(s.trend===-1&&c.close>s.previousFinalUpper)s.trend=1;else if(s.trend===1&&c.close<s.previousFinalLower)s.trend=-1;}
    if(mode==='append')s.index+=1;s.value=s.trend===1?s.finalLower:s.finalUpper;return {time:timestamp(c),value:s.value,direction:s.trend};
  }

  private advanced(cfg:IndicatorConfig,s:AdvancedState,c:HistoricalCandle,src:number,mode:'append'|'replace'){
    const p=Math.max(3,Math.floor(cfg.period||20)),mult=cfg.multiplier||2;
    if(cfg.kind==='Adaptive Ehlers'){const atrv=s.atr.update(c.high,c.low,c.close,mode),atrScale=atrv||Math.max(1,src*.001);if(mode==='replace'&&s.previousAdaptive!=null)s.adaptive=s.previousAdaptive;const previous=s.adaptive??src,volr=Math.abs(src-(this.previousCandle?.close??src))/atrScale,a=Math.max(.05,Math.min(.7,(2/(p+1))*(1+volr)));if(mode==='append')s.previousAdaptive=previous;s.adaptive=previous+a*(src-previous);return this.barCount>=p-1?point(c,s.adaptive):null;}
    if(cfg.kind==='Fractional EMA Kalman Filter'){const atrv=s.atr.update(c.high,c.low,c.close,mode)||src*.005;if(mode==='replace'){s.xhat=s.previousXhat;s.err=s.previousErr;}if(s.xhat==null)s.xhat=src; if(mode==='append'){s.previousXhat=s.xhat;s.previousErr=s.err;}const q=atrv**2,r=atrv**2*.5,pred=s.err+q,k=pred/(pred+r);s.xhat=s.xhat+k*(src-s.xhat);s.err=(1-k)*pred;return this.barCount>=p-1?point(c,s.xhat):null;}
    if(cfg.kind==='Trend Pressure'){const prev=s.previousSource??src,mom=src-prev;if(mode==='append')s.previousSource=src;const z=s.momentum.update(mom,mode).value,v=s.volume.update(Math.max(0,c.volume||0),mode).value;if(z==null||v==null)return null;const zm=(mom-(s.momentum.mean()??0))/(z||1),zv=(Math.max(0,c.volume||0)-(s.volume.mean()??0))/(v||1);return point(c,Math.tanh(.7*zm+.3*zv));}
    if(cfg.kind==='Trend Target Ribbon'){const f=s.fast.update(src,mode),m=s.mid.update(src,mode),sl=s.slow.update(src,mode),a=s.atr.update(c.high,c.low,c.close,mode);return f!=null&&m!=null&&sl!=null&&a!=null?{time:timestamp(c),fast:f,mid:m,slow:sl,'Target+':sl+mult*a,'Target-':sl-mult*a}:null;}
    if(cfg.kind==='Neural Weight Oscillator'){const prev=s.previousSource??src,d=src-prev;if(mode==='append')s.previousSource=src;const z1=s.delta.update(d,mode).value,z2=s.volume.update(Math.max(0,c.volume||0),mode).value;if(z1==null||z2==null)return null;const a=(d-(s.delta.mean()??0))/(z1||1),b=(Math.max(0,c.volume||0)-(s.volume.mean()??0))/(z2||1);return point(c,Math.tanh(.65*a+.35*b));}
    if(cfg.kind==='Trinity'){const r=rsiUpdate(s.rsi,src,mode),ad=adxUpdate(s.adx,c,mode),v=s.volume.update(Math.max(0,c.volume||0),mode).value;if(this.barCount<p*2-1||r==null||ad==null||v==null)return null;return point(c,((r-50)/50)*.45+(ad/100)*.35+Math.tanh((Math.max(0,c.volume||0)-(s.volume.mean()??0))/(v||1))*.2);}
    return null;
  }

  fullResults(){return this.configs.map(cfg=>({id:cfg.id,kind:cfg.kind,data:this.outputs.get(cfg.id)||[],mode:'full' as const}));}
}
