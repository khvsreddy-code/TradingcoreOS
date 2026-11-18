import assert from 'node:assert/strict';
import { IncrementalIndicatorRuntime } from './services/marketData/incrementalIndicatorEngine.ts';
import { ema } from './services/marketData/coreIndicatorKernel.ts';

const period = 14;
const bars = Array.from({ length: 72 }, (_, i) => {
  const base = 22400 + Math.sin(i / 4) * 38 + i * 1.7;
  const open = base - Math.cos(i / 5) * 7;
  const close = base + Math.sin(i / 2.5) * 5;
  return {
    timestamp: new Date(Date.UTC(2026, 2, 2, 9, 15 + i)).toISOString(),
    open, high: Math.max(open, close) + 6 + (i % 4),
    low: Math.min(open, close) - 5 - (i % 3),
    close, volume: 1500 + (i * 193) % 2400,
  };
});
const configs = [
  { id:'willr',kind:'Williams %R',period,enabled:true },
  { id:'ao',kind:'Awesome Oscillator',fast:5,slow:34,enabled:true },
  { id:'roc',kind:'ROC',period:12,enabled:true },
  { id:'cmf',kind:'Chaikin Money Flow',period,enabled:true },
  { id:'volumeOsc',kind:'Volume Oscillator',fast:5,slow:20,enabled:true },
  { id:'stdev',kind:'Standard Deviation',period,enabled:true },
  { id:'chop',kind:'Choppiness Index',period,enabled:true },
  { id:'hv',kind:'Historical Volatility',period,enabled:true },
  { id:'ad',kind:'Accumulation/Distribution',enabled:true },
];
const average = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const std = xs => Math.sqrt(average(xs.map(x=>(x-average(xs))**2)));
const close = b => b.map(x=>x.close);
const volume = b => b.map(x=>x.volume);
const median = b => b.map(x=>(x.high+x.low)/2);
const trueRanges = b => b.map((x,i)=>i===0?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-b[i-1].close),Math.abs(x.low-b[i-1].close)));
const moneyFlowVolume = x => {
  const range=x.high-x.low;
  return (range===0?0:((x.close-x.low)-(x.high-x.close))/range)*x.volume;
};
const batch = (id,b) => {
  const n=b.length, last=b[n-1], start=n-period, cs=close(b), vols=volume(b);
  switch(id){
    case 'willr': {
      const window=b.slice(start);
      const hi=Math.max(...window.map(x=>x.high)),lo=Math.min(...window.map(x=>x.low));
      return hi===lo?0:-100*(hi-last.close)/(hi-lo);
    }
    case 'ao': return average(median(b).slice(-5))-average(median(b).slice(-34));
    case 'roc': {const prev=cs[n-13];return prev===0?null:(last.close-prev)/prev*100;}
    case 'cmf': {
      const window=b.slice(start), mfv=window.reduce((sum,x)=>sum+moneyFlowVolume(x),0), total=window.reduce((sum,x)=>sum+x.volume,0);
      return total===0?null:mfv/total;
    }
    case 'volumeOsc': {
      const f=ema(vols,5).at(-1),s=ema(vols,20).at(-1);
      return f==null||s==null||s===0?null:(f-s)/s*100;
    }
    case 'stdev': return std(cs.slice(-period));
    case 'chop': {
      const trs=trueRanges(b).slice(-period);
      const window=b.slice(-period),range=Math.max(...window.map(x=>x.high))-Math.min(...window.map(x=>x.low));
      return range<=0?null:Math.max(0,Math.min(100,100*Math.log10(trs.reduce((a,x)=>a+x,0)/range)/Math.log10(period)));
    }
    case 'hv': {
      const returns=[];
      for(let i=Math.max(1,n-period);i<n;i++)returns.push(Math.log(b[i].close/b[i-1].close));
      return returns.length<period?null:std(returns)*Math.sqrt(252)*100;
    }
    case 'ad': return b.reduce((sum,x)=>sum+moneyFlowVolume(x),0);
  }
  return null;
};
const runtime=new IncrementalIndicatorRuntime();
assert.equal(runtime.seed(bars,configs).ready,true);
const value=id=>runtime.fullResults().find(x=>x.id===id)?.data.at(-1)?.value;
const closeEnough=(actual,expected,label)=>{
  assert.ok(Number.isFinite(actual),label+' must produce a finite result');
  assert.ok(expected!=null&&Number.isFinite(expected),label+' reference must be finite');
  assert.ok(Math.abs(actual-expected)<1e-7*Math.max(1,Math.abs(expected)),label+' history/stream parity: '+actual+' vs '+expected);
};
const verify=(history,label)=>{
  for(const id of configs.map(x=>x.id)) closeEnough(value(id),batch(id,history),label+' '+id);
};
verify(bars,'historical seed');

const forming={...bars.at(-1),close:bars.at(-1).close+11.25,high:bars.at(-1).high+11.25,volume:bars.at(-1).volume+177};
assert.equal(runtime.update(forming,'replace',configs).ready,true);
const replaced=[...bars.slice(0,-1),forming];
verify(replaced,'forming-bar replacement');

const appended={...forming,timestamp:new Date(Date.parse(forming.timestamp)+60_000).toISOString(),open:forming.close,high:forming.close+7,low:forming.close-4,close:forming.close+3,volume:3100};
assert.equal(runtime.update(appended,'append',configs).ready,true);
verify([...replaced,appended],'new-bar append');
console.log('VELA_P1_INCREMENTAL_CATALOG_PARITY_OK');