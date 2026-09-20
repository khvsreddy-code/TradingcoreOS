import { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../event/eventBus';

export type CalculationMode = 'tick' | 'bar';
export type CalculationSnapshot = {
  symbol: string;
  timeframe: string;
  mode: CalculationMode;
  timestamp: number;
  barIndex: number;
  isBarClose: boolean;
  values: {
    close: number;
    change: number | null;
    changePct: number | null;
    sma20: number | null;
    ema20: number | null;
    rsi14: number | null;
    atr14: number | null;
    vwap: number | null;
    high: number;
    low: number;
  };
};

type State = {
  bars: HistoricalCandle[];
  ema20: number | null;
  avgGain14: number | null;
  avgLoss14: number | null;
  atr14: number | null;
  trSeed: number[];
  gainSeed: number[];
  lossSeed: number[];
  cumulativePV: number;
  cumulativeVolume: number;
};

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const closeOf = (b: HistoricalCandle) => Number(b.close);
const typical = (b: HistoricalCandle) => (Number(b.high) + Number(b.low) + Number(b.close)) / 3;

function trueRange(current: HistoricalCandle, previous?: HistoricalCandle): number {
  const h = Number(current.high), l = Number(current.low), pc = previous ? Number(previous.close) : Number(current.open);
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let ema = values.slice(0, period).reduce((a,b)=>a+b,0) / period;
  const alpha = 2 / (period + 1);
  for (const value of values.slice(period)) ema = value * alpha + ema * (1 - alpha);
  return ema;
}

function rsiLast(bars: HistoricalCandle[], period: number): number | null {
  if (bars.length <= period) return null;
  const start = bars.slice(-(period + 1));
  let gain = 0, loss = 0;
  for (let i=1;i<start.length;i++) {
    const delta = closeOf(start[i]) - closeOf(start[i-1]);
    gain += Math.max(0, delta); loss += Math.max(0, -delta);
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i=period+1;i<bars.length;i++) {
    const delta = closeOf(bars[i]) - closeOf(bars[i-1]);
    avgGain = (avgGain * (period - 1) + Math.max(0, delta)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

function atrLast(bars: HistoricalCandle[], period: number): number | null {
  if (bars.length < period) return null;
  const trs: number[] = [];
  for (let i=0;i<bars.length;i++) trs.push(trueRange(bars[i], bars[i-1]));
  let atr = trs.slice(0, period).reduce((a,b)=>a+b,0) / period;
  for (let i=period;i<trs.length;i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

/**
 * Stateful market calculation clock.
 *
 * Every tick can produce a calculation snapshot against the developing bar.
 * Bar-close updates use the exact same stateful engine, avoiding a separate
 * "realtime formula" that can diverge from replay/backtest semantics.
 */
export class RealtimeCalculationEngine {
  private state: State = this.emptyState();
  private symbol = '';
  private timeframe = '';

  constructor(private readonly bus: CoreEventBus = coreEventBus) {}

  reset(bars: HistoricalCandle[] = [], symbol = '', timeframe = ''): void {
    this.state = this.emptyState();
    this.symbol = symbol;
    this.timeframe = timeframe;
    for (const bar of bars) this.acceptBar(bar, false);
  }

  updateTick(bar: HistoricalCandle, barIndex: number, isBarClose = false): CalculationSnapshot {
    const previous = this.state.bars[this.state.bars.length - 1];
    const last = previous;
    // A developing bar replaces the current bar rather than advancing indicator state.
    if (last && Number(last.timestamp) === Number(bar.timestamp)) {
      this.state.bars[this.state.bars.length - 1] = { ...bar };
      const snapshot = this.snapshot(bar, barIndex, 'tick', isBarClose);
      this.bus.emit('market.calculation', snapshot);
      if (isBarClose) {
        this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: bar as unknown as Record<string, unknown> });
      }
      return snapshot;
    }
    if (last) {
      // The previous developing bar becomes the completed bar when a new bucket starts.
      this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: last as unknown as Record<string, unknown> });
    }
    this.acceptBar(bar, true);
    const snapshot = this.snapshot(bar, barIndex, 'tick', isBarClose);
    this.bus.emit('market.calculation', snapshot);
    return snapshot;
  }

  updateBar(bar: HistoricalCandle, barIndex: number): CalculationSnapshot {
    this.acceptBar(bar, true);
    const snapshot = this.snapshot(bar, barIndex, 'bar', true);
    this.bus.emit('market.calculation', snapshot);
    this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: bar as unknown as Record<string, unknown> });
    return snapshot;
  }

  getLastSnapshot(): CalculationSnapshot | null {
    const b = this.state.bars[this.state.bars.length - 1];
    return b ? this.snapshot(b, this.state.bars.length - 1, 'bar', true) : null;
  }

  private acceptBar(bar: HistoricalCandle, emitState: boolean): void {
    const previous = this.state.bars[this.state.bars.length - 1];
    const close = finite(bar.close);
    if (close == null) return;

    this.state.bars.push({ ...bar });
    const n = this.state.bars.length;

    // EMA(20), seeded with SMA(20).
    if (n >= 20) {
      if (this.state.ema20 == null) {
        const window = this.state.bars.slice(-20);
        this.state.ema20 = window.reduce((s, x) => s + closeOf(x), 0) / 20;
      } else {
        this.state.ema20 = (close * (2 / 21)) + (this.state.ema20 * (19 / 21));
      }
    }

    // RSI(14), Wilder smoothing.
    if (previous) {
      const delta = close - closeOf(previous);
      const gain = Math.max(0, delta);
      const loss = Math.max(0, -delta);
      if (this.state.avgGain14 == null || this.state.avgLoss14 == null) {
        this.state.gainSeed.push(gain);
        this.state.lossSeed.push(loss);
        if (this.state.gainSeed.length >= 14) {
          this.state.avgGain14 = this.state.gainSeed.slice(-14).reduce((a,b)=>a+b,0) / 14;
          this.state.avgLoss14 = this.state.lossSeed.slice(-14).reduce((a,b)=>a+b,0) / 14;
        }
      } else {
        this.state.avgGain14 = (this.state.avgGain14 * 13 + gain) / 14;
        this.state.avgLoss14 = (this.state.avgLoss14 * 13 + loss) / 14;
      }
    }

    // ATR(14), Wilder smoothing.
    const tr = trueRange(bar, previous);
    if (this.state.atr14 == null) {
      this.state.trSeed.push(tr);
      if (this.state.trSeed.length >= 14) {
        this.state.atr14 = this.state.trSeed.slice(-14).reduce((a,b)=>a+b,0) / 14;
      }
    } else {
      this.state.atr14 = (this.state.atr14 * 13 + tr) / 14;
    }

    const volume = Math.max(0, Number(bar.volume) || 0);
    this.state.cumulativePV += typical(bar) * volume;
    this.state.cumulativeVolume += volume;

    if (this.state.bars.length > 25000) this.state.bars.splice(0, this.state.bars.length - 25000);
    void emitState;
  }

  private snapshot(bar: HistoricalCandle, barIndex: number, mode: CalculationMode, isBarClose: boolean): CalculationSnapshot {
    const close = closeOf(bar);
    const previous = this.state.bars[this.state.bars.length - 2];
    const previousClose = previous ? closeOf(previous) : null;
    const change = previousClose == null ? null : close - previousClose;
    const changePct = previousClose == null || previousClose === 0 ? null : (change! / previousClose) * 100;
    const recent = this.state.bars.slice(-20);
    const sma20 = recent.length >= 20 ? recent.reduce((s, x) => s + closeOf(x), 0) / recent.length : null;
    // Recompute the developing-bar view from the current series so tick-by-tick
    // updates do not compound the same candle multiple times.
    const closes = this.state.bars.slice(-250).map(closeOf);
    const previewEma20 = emaLast(closes, 20);
    const previewRsi14 = rsiLast(this.state.bars, 14);
    const previewAtr14 = atrLast(this.state.bars, 14);
    return {
      symbol: this.symbol, timeframe: this.timeframe, mode,
      timestamp: Math.floor(new Date(bar.timestamp).getTime()),
      barIndex, isBarClose,
      values: {
        close, change, changePct, sma20, ema20: previewEma20 ?? this.state.ema20, rsi14: previewRsi14,
        atr14: previewAtr14 ?? this.state.atr14, vwap: this.state.cumulativeVolume > 0 ? this.state.cumulativePV / this.state.cumulativeVolume : null,
        high: Number(bar.high), low: Number(bar.low),
      },
    };
  }

  private emptyState(): State {
    return { bars: [], ema20: null, avgGain14: null, avgLoss14: null, atr14: null,
      trSeed: [], gainSeed: [], lossSeed: [], cumulativePV: 0, cumulativeVolume: 0 };
  }
}
