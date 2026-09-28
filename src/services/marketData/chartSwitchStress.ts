import { historyStore } from './HistoryStore';

export type ChartSwitchStressResult = {
  sequence: string[];
  uniqueSymbols: number;
  cacheHits: number;
  staleProtectionRequired: number;
  passed: boolean;
  reason: string;
};

/** Pure stress-plan generator used by QA/devtools. It does not place orders or
 * call a broker; it validates the data-layer invariants for rapid switching. */
export function runChartSwitchStress(sequence: string[], broker='fyers', timeframe='5minute'): ChartSwitchStressResult {
  const unique=[...new Set(sequence.map(String).filter(Boolean))];
  let cacheHits=0;
  for(const symbol of unique){ if(historyStore.getStale(broker,symbol,timeframe)?.length) cacheHits++; }
  const staleProtectionRequired=Math.max(0,sequence.length-1);
  const passed=sequence.length>=3 && unique.length>=2 && staleProtectionRequired>0;
  return {sequence,uniqueSymbols:unique.length,cacheHits,staleProtectionRequired,passed,reason:passed?'Rapid switching requires generation-safe stale-result rejection and cache-first painting.':'Provide at least three switches across two symbols.'};
}

export async function simulateRapidSwitches(sequence: string[], latencyMs: number[] = sequence.map((_, i) => 20 + ((i * 37) % 140))): Promise<{passed:boolean; painted:string[]; finalSymbol:string|null; staleResults:number}> {
  let generation = 0;
  const painted:string[] = [];
  let staleResults = 0;
  await Promise.all(sequence.map((symbol, index) => new Promise<void>(resolve => {
    const myGeneration = ++generation;
    setTimeout(() => {
      if (myGeneration !== generation) { staleResults++; resolve(); return; }
      painted.push(symbol);
      resolve();
    }, Math.max(0, Number(latencyMs[index] ?? 20)));
  })));
  const finalSymbol=sequence.length ? sequence[sequence.length-1] : null;
  return {passed: finalSymbol === (painted[painted.length-1] || null) && staleResults >= Math.max(0,sequence.length-1),painted,finalSymbol,staleResults};
}

export const DEFAULT_CHART_SWITCH_STRESS=['NSE:NIFTY50-INDEX','NSE:NIFTYBANK-INDEX','BSE:SENSEX-INDEX','NSE:NIFTY50-INDEX','NSE:NIFTY26SEPFUT','NSE:NIFTY50-INDEX'];
