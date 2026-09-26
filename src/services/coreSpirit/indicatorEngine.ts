import type { CoreSpiritMarketBar } from './marketData';
import { emaStep, rsiFromAverages, sma, highest, lowest, trueRange } from './indicatorKernel';

/** Single deterministic primitive indicator implementation shared by CoreSpirit/runtime hosts. */
export type NativeIndicatorState = Record<string, number[]>;
export type NativeIndicatorContext = { state: NativeIndicatorState; push(key:string, value:number):void };

export function calculateNativeIndicator(name:string,args:unknown[],history:number[],ctx:NativeIndicatorContext,sourceName='close'):number|null {
  const period=Math.max(1,Math.floor(Number(args[1] ?? 14)));
  const current=Number(args[0]);
  if (!Number.isFinite(current)) return null;
  switch(name) {
    case 'sma': case 'mean': return mean(history,period);
    case 'sum': return sum(history,period);
    case 'highest': return highest(history,period);
    case 'lowest': return lowest(history,period);
    case 'stdev': return stdev(history,period);
    case 'variance': return variance(history,period);
    case 'wma': return wma(history,period);
    case 'median': return median(history,period);
    case 'rma': {
      if(history.length < period) return null;
      const key=`rma:${sourceName}:${period}`; const previous=Number(ctx.state[key]?.at(-1));
      const value=Number.isFinite(previous) ? (previous*(period-1)+current)/period : mean(history,period);
      if(value!=null) ctx.push(key,value); return value;
    }
    case 'hma': return hma(history,period);
    case 'ema': {
      if(history.length < period) return null;
      const key=`ema:${sourceName}:${period}`;
      const previousRaw=ctx.state[key]?.at(-1); const previous=previousRaw==null?null:Number(previousRaw);
      const value=emaStep(current,Number.isFinite(previous as number)?previous:null,history,period);
      if(value!=null) ctx.push(key,value); return value;
    }
    case 'rsi': {
      if(history.length < period+1) return null;
      const previous=history[1]; if(!Number.isFinite(previous)) return null;
      const gain=Math.max(0,current-previous), loss=Math.max(0,previous-current);
      const gKey=`rsi:${sourceName}:${period}:gain`, lKey=`rsi:${sourceName}:${period}:loss`;
      const pg=Number(ctx.state[gKey]?.at(-1)), pl=Number(ctx.state[lKey]?.at(-1));
      const avgGain=Number.isFinite(pg)?(pg*(period-1)+gain)/period:averageGain(history,period);
      const avgLoss=Number.isFinite(pl)?(pl*(period-1)+loss)/period:averageLoss(history,period);
      ctx.push(gKey,avgGain); ctx.push(lKey,avgLoss); return rsiFromAverages(avgGain,avgLoss);
    }
    case 'change': return history.length>period ? current-history[period] : null;
    default: return null;
  }
}

export function calculateNativeAtr(bar:Pick<CoreSpiritMarketBar,'high'|'low'>,previousClose:number|null,period:number,ctx:NativeIndicatorContext):number|null {
  const p=Math.max(1,Math.floor(period)); const tr=trueRange(Number(bar.high),Number(bar.low),previousClose); if(tr==null)return null;
  const trKey=`atr:${p}:tr`, atrKey=`atr:${p}`; ctx.push(trKey,tr); const trHistory=ctx.state[trKey]||[]; if(trHistory.length<p)return null;
  const previous=Number(ctx.state[atrKey]?.at(-1)); const value=Number.isFinite(previous)?((p-1)*previous+tr)/p:trHistory.slice(-p).reduce((a,b)=>a+b,0)/p;
  ctx.push(atrKey,value); return value;
}

function sum(history:number[],period:number):number|null { if(history.length<period)return null; return history.slice(0,period).reduce((a,b)=>a+b,0); }
function mean(history:number[],period:number):number|null { const s=sum(history,period); return s==null?null:s/period; }
function variance(history:number[],period:number):number|null { const m=mean(history,period); if(m==null)return null; return history.slice(0,period).reduce((a,b)=>a+(b-m)**2,0)/period; }
function stdev(history:number[],period:number):number|null { const v=variance(history,period); return v==null?null:Math.sqrt(v); }
function median(history:number[],period:number):number|null { if(history.length<period)return null; const a=history.slice(0,period).sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function wma(history:number[],period:number):number|null { if(history.length<period)return null; const values=history.slice(0,period).reverse(); const denom=period*(period+1)/2; return values.reduce((a,v,i)=>a+v*(i+1),0)/denom; }
function hma(history:number[],period:number):number|null {
  const half=Math.max(1,Math.floor(period/2)), root=Math.max(1,Math.floor(Math.sqrt(period)));
  const synthetic:number[]=[];
  for(let i=0;i<root && i+period<=history.length;i++) {
    const slice=history.slice(i); const a=wma(slice,half), b=wma(slice,period); if(a==null||b==null) continue; synthetic.push(2*a-b);
  }
  return wma(synthetic,root);
}
function averageGain(history:number[],period:number):number { let total=0; for(let i=0;i<period;i++)total+=Math.max(0,history[i]-history[i+1]); return total/period; }
function averageLoss(history:number[],period:number):number { let total=0; for(let i=0;i<period;i++)total+=Math.max(0,history[i+1]-history[i]); return total/period; }
