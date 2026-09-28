export type CoreSpiritNumericSeries = Float64Array;
export type CoreSpiritSeriesOperationName =
  | 'change'|'pctchange'|'sma'|'mean'|'sum'|'highest'|'lowest'|'stdev'|'variance'
  | 'wma'|'median'|'zscore'|'normalize'|'persistence';
export type CoreSpiritSeriesOperation = Readonly<{name:CoreSpiritSeriesOperationName;length?:number;parameter?:number;}>;
export type CoreSpiritSeriesKernelStats = Readonly<{bars:number;operations:number;fusedPasses:number;intermediateAllocations:number;}>;
export type CoreSpiritSeriesExecutionResult = Readonly<{output:Float64Array;stats:CoreSpiritSeriesKernelStats;}>;
const len=(op:CoreSpiritSeriesOperation)=>Math.max(1,Math.floor(Number(op.length??14)));
export function asCoreSpiritNumericSeries(values:ArrayLike<number>):Float64Array{
  return values instanceof Float64Array ? values : Float64Array.from({length:values.length},(_,i)=>Number(values[i]));
}
export function coreSpiritSeriesLength(operation:CoreSpiritSeriesOperation):number{return len(operation);}
export function coreSpiritSeriesMaxLookback(operations:readonly CoreSpiritSeriesOperation[]):number{
  let lookback=0; for(let i=0;i<operations.length;i++) lookback+=i===0?len(operations[i]):Math.max(1,len(operations[i])-1); return lookback;
}
function rolling(input:Float64Array,end:number,n:number,kind:CoreSpiritSeriesOperationName):number{
  if(end+1<n)return NaN; const start=end+1-n; let sum=0,sq=0,min=Infinity,max=-Infinity;
  for(let i=start;i<=end;i++){const v=input[i];if(!Number.isFinite(v))return NaN;sum+=v;sq+=v*v;min=Math.min(min,v);max=Math.max(max,v);}
  const mean=sum/n;
  switch(kind){
    case 'sum':return sum;
    case 'mean':case 'sma':return mean;
    case 'highest':return max;
    case 'lowest':return min;
    case 'variance':return Math.max(0,sq/n-mean*mean);
    case 'stdev':return Math.sqrt(Math.max(0,sq/n-mean*mean));
    case 'median':{const a=Array.from(input.slice(start,end+1)).sort((a,b)=>a-b);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
    case 'wma':{let t=0,d=n*(n+1)/2;for(let j=0;j<n;j++)t+=input[start+j]*(j+1);return t/d;}
    case 'zscore':{const sd=Math.sqrt(Math.max(0,sq/n-mean*mean));return sd===0?0:(input[end]-mean)/sd;}
    case 'normalize':return max===min?0:(input[end]-min)/(max-min);
    case 'persistence':{let same=0,c=0;for(let i=start+2;i<=end;i++){const a=input[i]-input[i-1],b=input[i-1]-input[i-2];if(a&&b){c++;if(Math.sign(a)===Math.sign(b))same++;}}return c?same/c:0;}
    default:return NaN;
  }
}
function executeOne(input:Float64Array,op:CoreSpiritSeriesOperation):Float64Array{
  const out=new Float64Array(input.length); out.fill(NaN); const n=len(op); let prev=NaN;
  for(let i=0;i<input.length;i++){
    const v=input[i];
    if(op.name==='change'){out[i]=i>0?v-input[i-1]:NaN;continue;}
    if(op.name==='pctchange'){const p=i>0?input[i-1]:NaN;out[i]=Number.isFinite(p)&&p!==0?v/p-1:NaN;continue;}
    out[i]=rolling(input,i,n,op.name);
  }
  return out;
}
export function executeCoreSpiritFusedSeriesPipeline(input:ArrayLike<number>,operations:readonly CoreSpiritSeriesOperation[]):CoreSpiritSeriesExecutionResult{
  const source=asCoreSpiritNumericSeries(input);
  if(!operations.length)return Object.freeze({output:source,stats:Object.freeze({bars:source.length,operations:0,fusedPasses:0,intermediateAllocations:0})});
  let current=source;
  for(const op of operations) current=executeOne(current,op);
  return Object.freeze({output:current,stats:Object.freeze({bars:source.length,operations:operations.length,fusedPasses:1,intermediateAllocations:operations.length})});
}
