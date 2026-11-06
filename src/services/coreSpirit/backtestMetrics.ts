/** Reproducible, fee-aware backtest metrics derived from the simulator ledger. */
export type CoreSpiritBacktestEquityPoint=Readonly<{timestampMs:number;cash:number;equity:number;grossExposure:number}>;
export type CoreSpiritBacktestTrade=Readonly<{netPnl:number;realizedGrossPnl:number;allocatedEntryFees:number;allocatedExitFees:number;quantity:number;exitTimestampMs:number}>;
export type CoreSpiritBacktestMetrics=Readonly<{
  observations:number;netProfit:number;totalReturn:number;maxDrawdown:number;maxDrawdownPct:number;
  sharpe:number|null;sortino:number|null;winRate:number;profitFactor:number|null;averageTradePnl:number|null;
  expectancy:number|null;grossProfit:number;grossLoss:number;feesPaid:number;averageGrossExposure:number;maxGrossExposure:number;
}>;
function finite(value:number,label:string):void{if(!Number.isFinite(value))throw new Error(label+' must be finite.');}
export function calculateCoreSpiritBacktestMetrics(equity:readonly CoreSpiritBacktestEquityPoint[],trades:readonly CoreSpiritBacktestTrade[],initialCapital:number,periodsPerYear=252):CoreSpiritBacktestMetrics{
  finite(initialCapital,'initialCapital');finite(periodsPerYear,'periodsPerYear');
  if(initialCapital<=0||periodsPerYear<=0||equity.length<2)throw new Error('Backtest metrics require positive capital, periodsPerYear and at least two equity observations.');
  for(let i=0;i<equity.length;i++){const p=equity[i]!;finite(p.timestampMs,'equity timestamp');finite(p.equity,'equity');finite(p.cash,'cash');finite(p.grossExposure,'gross exposure');if(p.grossExposure<0||(i>0&&p.timestampMs<=equity[i-1]!.timestampMs))throw new Error('Equity observations must be chronological with non-negative exposure.');}
  const returns:number[]=[];let peak=equity[0]!.equity,maxDrawdown=0,maxDrawdownPct=0,exposure=0,maxExposure=0;
  for(let i=0;i<equity.length;i++){const p=equity[i]!;peak=Math.max(peak,p.equity);const dd=peak-p.equity;maxDrawdown=Math.max(maxDrawdown,dd);if(peak>0)maxDrawdownPct=Math.max(maxDrawdownPct,dd/peak);exposure+=p.grossExposure;maxExposure=Math.max(maxExposure,p.grossExposure);if(i>0){const previous=equity[i-1]!.equity;if(previous>0)returns.push(p.equity/previous-1);}}
  const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0;
  const variance=returns.length>1?returns.reduce((s,r)=>s+(r-mean)**2,0)/(returns.length-1):0;
  const downside=returns.length?returns.filter(r=>r<0):[];
  const downsideDeviation=downside.length?Math.sqrt(downside.reduce((s,r)=>s+r*r,0)/returns.length):0;
  const sd=Math.sqrt(variance),sharpe=sd>0?mean/sd*Math.sqrt(periodsPerYear):null,sortino=downsideDeviation>0?mean/downsideDeviation*Math.sqrt(periodsPerYear):null;
  const winners=trades.filter(t=>t.netPnl>0),losers=trades.filter(t=>t.netPnl<0);
  const grossProfit=winners.reduce((s,t)=>s+t.netPnl,0),grossLoss=-losers.reduce((s,t)=>s+t.netPnl,0);
  const netProfit=equity[equity.length-1]!.equity-initialCapital;
  const feesPaid=trades.reduce((s,t)=>s+Math.max(0,t.allocatedEntryFees)+Math.max(0,t.allocatedExitFees),0);
  const averageTradePnl=trades.length?trades.reduce((s,t)=>s+t.netPnl,0)/trades.length:null;
  const winRate=trades.length?winners.length/trades.length:0;
  return Object.freeze({observations:equity.length,netProfit,totalReturn:netProfit/initialCapital,maxDrawdown,maxDrawdownPct,
    sharpe,sortino,winRate,profitFactor:grossLoss>0?grossProfit/grossLoss:grossProfit>0?null:0,averageTradePnl,
    expectancy:averageTradePnl,grossProfit,grossLoss,feesPaid,averageGrossExposure:exposure/equity.length,maxGrossExposure:maxExposure});
}
export function compareCoreSpiritBenchmark(strategy:readonly CoreSpiritBacktestEquityPoint[],benchmark:readonly Readonly<{timestampMs:number;equity:number}>[]):Readonly<{observations:number;strategyReturn:number;benchmarkReturn:number;excessReturn:number}>{
  if(strategy.length<2||benchmark.length<2)throw new Error('Benchmark comparison requires two equity observations per series.');
  const byTime=new Map(benchmark.map(p=>[p.timestampMs,p.equity]));
  const aligned=strategy.filter(p=>byTime.has(p.timestampMs));
  if(aligned.length<2)throw new Error('Strategy and benchmark have fewer than two exact timestamp matches.');
  const s0=aligned[0]!.equity,s1=aligned[aligned.length-1]!.equity,b0=byTime.get(aligned[0]!.timestampMs)!,b1=byTime.get(aligned[aligned.length-1]!.timestampMs)!;
  if(s0<=0||b0<=0)throw new Error('Benchmark starting equity must be positive.');
  const sr=s1/s0-1,br=b1/b0-1;
  return Object.freeze({observations:aligned.length,strategyReturn:sr,benchmarkReturn:br,excessReturn:sr-br});
}
