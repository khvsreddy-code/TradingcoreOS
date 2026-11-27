/** Reproducible, fee-aware backtest metrics derived from the simulator ledger. */
import type {StrategySimulationResult} from '../core/replay/strategySimulator';

export type CoreSpiritBacktestEquityPoint=Readonly<{timestampMs:number;cash:number;equity:number;grossExposure:number}>;
export type CoreSpiritBacktestTrade=Readonly<{
  netPnl:number;realizedGrossPnl:number;allocatedEntryFees:number;allocatedExitFees:number;quantity:number;
  entryTimestampMs?:number;exitTimestampMs:number;
}>;
export type CoreSpiritBacktestMetrics=Readonly<{
  observations:number;netProfit:number;totalReturn:number;maxDrawdown:number;maxDrawdownPct:number;
  sharpe:number|null;sortino:number|null;winRate:number;profitFactor:number|null;averageTradePnl:number|null;
  expectancy:number|null;grossProfit:number;grossLoss:number;feesPaid:number;averageGrossExposure:number;maxGrossExposure:number;
  averageWin:number|null;averageLoss:number|null;largestWin:number|null;largestLoss:number|null;
  averageTradeDurationMs:number|null;maxTradeDurationMs:number|null;maxConsecutiveWins:number;maxConsecutiveLosses:number;
}>;
function finite(value:number,label:string):void{if(!Number.isFinite(value))throw new Error(label+' must be finite.');}
export function calculateCoreSpiritBacktestMetrics(
  equity:readonly CoreSpiritBacktestEquityPoint[],trades:readonly CoreSpiritBacktestTrade[],
  initialCapital:number,periodsPerYear=252,totalFeesPaid?:number,
):CoreSpiritBacktestMetrics{
  finite(initialCapital,'initialCapital');finite(periodsPerYear,'periodsPerYear');
  if(initialCapital<=0||periodsPerYear<=0||equity.length<2)throw new Error('Backtest metrics require positive capital, periodsPerYear and at least two equity observations.');
  if(totalFeesPaid!==undefined&&(!Number.isFinite(totalFeesPaid)||totalFeesPaid<0))throw new Error('totalFeesPaid must be finite and non-negative.');
  for(let i=0;i<equity.length;i++){
    const p=equity[i]!;finite(p.timestampMs,'equity timestamp');finite(p.equity,'equity');finite(p.cash,'cash');finite(p.grossExposure,'gross exposure');
    if(p.grossExposure<0||(i>0&&p.timestampMs<=equity[i-1]!.timestampMs))throw new Error('Equity observations must be chronological with non-negative exposure.');
  }
  const orderedTrades=[...trades].sort((a,b)=>a.exitTimestampMs-b.exitTimestampMs);
  for(const trade of orderedTrades){
    finite(trade.netPnl,'trade net P&L');finite(trade.realizedGrossPnl,'trade gross P&L');
    finite(trade.allocatedEntryFees,'trade entry fees');finite(trade.allocatedExitFees,'trade exit fees');
    finite(trade.quantity,'trade quantity');finite(trade.exitTimestampMs,'trade exit timestamp');
    if(trade.allocatedEntryFees<0||trade.allocatedExitFees<0||trade.quantity<=0)throw new Error('Trade fees and quantity must be non-negative/positive.');
    if(trade.entryTimestampMs!==undefined){finite(trade.entryTimestampMs,'trade entry timestamp');
      if(trade.entryTimestampMs>trade.exitTimestampMs)throw new Error('Trade entry timestamp cannot follow its exit timestamp.');}
  }
  const returns:number[]=[];let peak=equity[0]!.equity,maxDrawdown=0,maxDrawdownPct=0,exposure=0,maxExposure=0;
  for(let i=0;i<equity.length;i++){
    const p=equity[i]!;peak=Math.max(peak,p.equity);const dd=peak-p.equity;
    maxDrawdown=Math.max(maxDrawdown,dd);if(peak>0)maxDrawdownPct=Math.max(maxDrawdownPct,dd/peak);
    exposure+=p.grossExposure;maxExposure=Math.max(maxExposure,p.grossExposure);
    if(i>0){const previous=equity[i-1]!.equity;if(previous>0)returns.push(p.equity/previous-1);}
  }
  const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0;
  const variance=returns.length>1?returns.reduce((s,r)=>s+(r-mean)**2,0)/(returns.length-1):0;
  const downside=returns.filter(r=>r<0);
  const downsideDeviation=downside.length?Math.sqrt(downside.reduce((s,r)=>s+r*r,0)/returns.length):0;
  const sd=Math.sqrt(variance),sharpe=sd>0?mean/sd*Math.sqrt(periodsPerYear):null;
  const sortino=downsideDeviation>0?mean/downsideDeviation*Math.sqrt(periodsPerYear):null;
  const winners=orderedTrades.filter(t=>t.netPnl>0),losers=orderedTrades.filter(t=>t.netPnl<0);
  // Gross profit/loss must use pre-cost realized P&L; win-rate and averages remain net-of-cost.
  const grossProfit=orderedTrades.reduce((s,t)=>s+Math.max(0,t.realizedGrossPnl),0);
  const grossLoss=orderedTrades.reduce((s,t)=>s+Math.max(0,-t.realizedGrossPnl),0);
  const netProfit=equity[equity.length-1]!.equity-initialCapital;
  const feesPaid=totalFeesPaid??orderedTrades.reduce((s,t)=>s+t.allocatedEntryFees+t.allocatedExitFees,0);
  const averageTradePnl=orderedTrades.length?orderedTrades.reduce((s,t)=>s+t.netPnl,0)/orderedTrades.length:null;
  const winRate=orderedTrades.length?winners.length/orderedTrades.length:0;
  const averageWin=winners.length?winners.reduce((s,t)=>s+t.netPnl,0)/winners.length:null;
  const averageLoss=losers.length?losers.reduce((s,t)=>s+t.netPnl,0)/losers.length:null;
  let currentWins=0,currentLosses=0,maxConsecutiveWins=0,maxConsecutiveLosses=0;
  for(const trade of orderedTrades){
    if(trade.netPnl>0){currentWins++;currentLosses=0;maxConsecutiveWins=Math.max(maxConsecutiveWins,currentWins);}
    else if(trade.netPnl<0){currentLosses++;currentWins=0;maxConsecutiveLosses=Math.max(maxConsecutiveLosses,currentLosses);}
    else{currentWins=0;currentLosses=0;}
  }
  const durations=orderedTrades.filter(t=>t.entryTimestampMs!==undefined).map(t=>t.exitTimestampMs-t.entryTimestampMs!);
  return Object.freeze({
    observations:equity.length,netProfit,totalReturn:netProfit/initialCapital,maxDrawdown,maxDrawdownPct,
    sharpe,sortino,winRate,profitFactor:grossLoss>0?grossProfit/grossLoss:grossProfit>0?null:0,averageTradePnl,
    expectancy:averageTradePnl,grossProfit,grossLoss,feesPaid,averageGrossExposure:exposure/equity.length,maxGrossExposure:maxExposure,
    averageWin,averageLoss,largestWin:winners.length?Math.max(...winners.map(t=>t.netPnl)):null,
    largestLoss:losers.length?Math.min(...losers.map(t=>t.netPnl)):null,
    averageTradeDurationMs:durations.length?durations.reduce((s,d)=>s+d,0)/durations.length:null,
    maxTradeDurationMs:durations.length?Math.max(...durations):null,maxConsecutiveWins,maxConsecutiveLosses,
  });
}
export function compareCoreSpiritBenchmark(
  strategy:readonly CoreSpiritBacktestEquityPoint[],
  benchmark:readonly Readonly<{timestampMs:number;equity:number}>[],
):Readonly<{observations:number;strategyReturn:number;benchmarkReturn:number;excessReturn:number}>{
  if(strategy.length<2||benchmark.length<2)throw new Error('Benchmark comparison requires two equity observations per series.');
  const byTime=new Map(benchmark.map(p=>[p.timestampMs,p.equity]));
  const aligned=strategy.filter(p=>byTime.has(p.timestampMs));
  if(aligned.length<2)throw new Error('Strategy and benchmark have fewer than two exact timestamp matches.');
  const s0=aligned[0]!.equity,s1=aligned[aligned.length-1]!.equity,b0=byTime.get(aligned[0]!.timestampMs)!,b1=byTime.get(aligned[aligned.length-1]!.timestampMs)!;
  if(s0<=0||b0<=0)throw new Error('Benchmark starting equity must be positive.');
  const sr=s1/s0-1,br=b1/b0-1;
  return Object.freeze({observations:aligned.length,strategyReturn:sr,benchmarkReturn:br,excessReturn:sr-br});
}
/** Direct adapter for the canonical simulation ledger; the simulator remains the only fill/accounting engine. */
export function calculateCoreSpiritSimulationMetrics(
  result:Pick<StrategySimulationResult,'equityCurve'|'closedTrades'|'summary'>,periodsPerYear=252,
):CoreSpiritBacktestMetrics{
  return calculateCoreSpiritBacktestMetrics(result.equityCurve,result.closedTrades,result.summary.initialCash,periodsPerYear,result.summary.feesPaid);
}
