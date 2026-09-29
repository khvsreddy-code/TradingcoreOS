import { HistoricalCandle } from '../../brokers/BrokerAdapter';

export type ReplayValidationResult = { valid: boolean; errors: string[]; normalizedBars: HistoricalCandle[] };

/** Validates replay input before it is allowed onto the shared market-event bus. */
export function validateReplayBars(bars: HistoricalCandle[]): ReplayValidationResult {
  const errors: string[] = [];
  const normalized = (Array.isArray(bars) ? bars : []).map(b => ({...b})).sort((a,b) => Number(a.timestamp)-Number(b.timestamp));
  for(let i=0;i<normalized.length;i++) {
    const b=normalized[i];
    const ts=Date.parse(String(b.timestamp));
    const nums=[b.open,b.high,b.low,b.close,b.volume].map(Number);
    if(!Number.isFinite(ts)) errors.push(`bar ${i}: invalid timestamp`);
    if(nums.slice(0,4).some(v=>!Number.isFinite(v))) errors.push(`bar ${i}: invalid OHLC`);
    if(Number(b.high)<Number(b.low)) errors.push(`bar ${i}: high is below low`);
    if(Number(b.volume)<0) errors.push(`bar ${i}: negative volume`);
    if(i>0 && Number(normalized[i-1].timestamp)===Number(b.timestamp)) errors.push(`bar ${i}: duplicate timestamp`);
  }
  return {valid:errors.length===0,errors,normalizedBars:normalized};
}
