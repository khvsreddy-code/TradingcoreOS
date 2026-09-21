import { HistoricalCandle } from '../brokers/BrokerAdapter';

/**
 * TradingCore Pine-compatible execution contract.
 *
 * TradingView's Pine runtime is proprietary and cannot be embedded/reimplemented
 * by copying TradingView's engine. Instead, TradingCore indicators use the same
 * bar-by-bar execution semantics: inputs are immutable per calculation, series
 * are evaluated chronologically, and signals only use data available at the bar.
 * This small adapter is the common contract for native indicators and future
 * CoreSpirit/Pine source support.
 */
export type PineSeries<T = number> = Array<T | null>;
export type PineContext = {
  bars: HistoricalCandle[];
  barIndex: number;
  isFirst: boolean;
  isLast: boolean;
};

export const pine = {
  nz(value: number | null | undefined, replacement = 0) {
    return Number.isFinite(value as number) ? value as number : replacement;
  },
  math: {
    max: Math.max,
    min: Math.min,
    abs: Math.abs,
    sqrt: Math.sqrt,
    pow: Math.pow,
  },
  ta: {
    highest(values: number[], length: number, index: number) {
      const start = Math.max(0, index - length + 1);
      return Math.max(...values.slice(start, index + 1));
    },
    lowest(values: number[], length: number, index: number) {
      const start = Math.max(0, index - length + 1);
      return Math.min(...values.slice(start, index + 1));
    },
  },
};

export function runPineBars<T>(bars: HistoricalCandle[], callback: (ctx: PineContext) => T): T[] {
  return bars.map((_, barIndex) => callback({
    bars,
    barIndex,
    isFirst: barIndex === 0,
    isLast: barIndex === bars.length - 1,
  }));
}
