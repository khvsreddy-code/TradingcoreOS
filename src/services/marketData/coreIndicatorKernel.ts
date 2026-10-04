import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { RollingMean, WMAState, EMAState, WilderState, ATRState, RSIState, VWAPSessionState } from '../coreSpirit/statefulIndicatorKernel';

/** Canonical deterministic time-series math used by the native indicator layer. */
export function sma(values: number[], period: number): Array<number | null> { const state=new RollingMean(period); return values.map(value=>state.update(value).value); }
export function wma(values: Array<number | null>, period: number): Array<number | null> { const state=new WMAState(period); return values.map(value=>value==null?null:state.update(value)); }
export function ema(values: number[], period: number): Array<number | null> { const state=new EMAState(period); return values.map(value=>state.update(value)); }
export function rma(values: number[], period: number): Array<number | null> { const state=new WilderState(period); return values.map(value=>state.updateWilder(value)); }
export function trueRanges(candles: HistoricalCandle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const previousClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - previousClose), Math.abs(c.low - previousClose));
  });
}

export function atr(candles: HistoricalCandle[], period: number): Array<number | null> { const state=new ATRState(period); return candles.map(c=>state.update(c.high,c.low,c.close)); }
export function rsi(values: number[], period: number): Array<number | null> { const state=new RSIState(period); return values.map(value=>state.update(value)); }
export function sessionVwap(candles: HistoricalCandle[], source: (c: HistoricalCandle) => number, timezone = 'Asia/Kolkata') { void timezone; const state=new VWAPSessionState(); return candles.map(c=>state.update(c.timestamp,source(c),c.volume,c.close)); }