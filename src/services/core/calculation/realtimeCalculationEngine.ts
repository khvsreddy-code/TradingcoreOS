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
  sma20Window: number[];
  sma20Sum: number;
  lastCommittedTimestamp: string | null;
};

const finite = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const timestampMs = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v instanceof Date) return v.getTime();
  const numeric = Number(v);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(String(v)).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};
const closeOf = (b: HistoricalCandle) => Number(b.close);
const typical = (b: HistoricalCandle) => (Number(b.high) + Number(b.low) + Number(b.close)) / 3;

function trueRange(current: HistoricalCandle, previous?: HistoricalCandle): number {
  const h = Number(current.high), l = Number(current.low), pc = previous ? Number(previous.close) : Number(current.open);
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

/**
 * Stateful market calculation clock.
 *
 * The important optimization is that the developing candle is treated as a
 * preview over committed indicator state. Tick updates therefore do not run
 * an O(window) recalculation loop for EMA/RSI/ATR.
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
    for (const bar of bars) this.acceptCommittedBar(bar);
  }

  updateTick(bar: HistoricalCandle, barIndex: number, isBarClose = false): CalculationSnapshot {
    const last = this.state.bars[this.state.bars.length - 1];
    if (last && timestampMs(last.timestamp) === timestampMs(bar.timestamp)) {
      this.state.bars[this.state.bars.length - 1] = { ...bar };
      const snapshot = this.snapshot(bar, barIndex, 'tick', isBarClose);
      this.bus.emit('market.calculation', snapshot);
      if (isBarClose) {
        this.commitCurrentDevelopingBar();
        this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: bar as unknown as Record<string, unknown> });
      }
      return snapshot;
    }

    if (last) {
      this.commitCurrentDevelopingBar();
      this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: last as unknown as Record<string, unknown> });
    }
    this.startDevelopingBar(bar);
    const snapshot = this.snapshot(bar, barIndex, 'tick', isBarClose);
    this.bus.emit('market.calculation', snapshot);
    if (isBarClose) {
      this.commitCurrentDevelopingBar();
      this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: bar as unknown as Record<string, unknown> });
    }
    return snapshot;
  }

  updateBar(bar: HistoricalCandle, barIndex: number): CalculationSnapshot {
    const last = this.state.bars[this.state.bars.length - 1];
    if (!last || timestampMs(last.timestamp) !== timestampMs(bar.timestamp)) {
      if (last) this.commitCurrentDevelopingBar();
      this.startDevelopingBar(bar);
    } else {
      this.state.bars[this.state.bars.length - 1] = { ...bar };
      if (this.state.lastCommittedTimestamp === String(timestampMs(bar.timestamp))) {
        this.rebuildCommittedState();
      }
    }
    const snapshot = this.snapshot(bar, barIndex, 'bar', true);
    this.commitCurrentDevelopingBar();
    this.bus.emit('market.calculation', snapshot);
    this.bus.emit('market.bar', { symbol: this.symbol, timeframe: this.timeframe, bar: bar as unknown as Record<string, unknown> });
    return snapshot;
  }

  getLastSnapshot(): CalculationSnapshot | null {
    const b = this.state.bars[this.state.bars.length - 1];
    return b ? this.snapshot(b, this.state.bars.length - 1, 'bar', true) : null;
  }

  private startDevelopingBar(bar: HistoricalCandle): void {
    this.state.bars.push({ ...bar });
    if (this.state.bars.length > 25_000) this.state.bars.splice(0, this.state.bars.length - 25_000);
  }

  private commitCurrentDevelopingBar(): void {
    const current = this.state.bars[this.state.bars.length - 1];
    if (!current) return;
    const currentKey = String(timestampMs(current.timestamp));
    if (this.state.lastCommittedTimestamp === currentKey) return;
    const previous = this.state.bars[this.state.bars.length - 2];
    const close = finite(current.close);
    if (close == null) return;

    // EMA(20), seeded with SMA(20). This method is idempotent: a historical
    // committed candle can be observed by a first realtime tick without being
    // applied to the recursive state twice.
    if (this.state.ema20 == null) {
      if (this.state.bars.length >= 20) {
        const window = this.state.bars.slice(-20);
        this.state.ema20 = window.reduce((s, x) => s + closeOf(x), 0) / 20;
      }
    } else {
      this.state.ema20 = close * (2 / 21) + this.state.ema20 * (19 / 21);
    }

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

    this.state.sma20Window.push(close);
    this.state.sma20Sum += close;
    if (this.state.sma20Window.length > 20) this.state.sma20Sum -= this.state.sma20Window.shift()!;

    const tr = trueRange(current, previous);
    if (this.state.atr14 == null) {
      this.state.trSeed.push(tr);
      if (this.state.trSeed.length >= 14) this.state.atr14 = this.state.trSeed.slice(-14).reduce((a,b)=>a+b,0) / 14;
    } else {
      this.state.atr14 = (this.state.atr14 * 13 + tr) / 14;
    }

    const volume = Math.max(0, Number(current.volume) || 0);
    this.state.cumulativePV += typical(current) * volume;
    this.state.cumulativeVolume += volume;
    this.state.lastCommittedTimestamp = currentKey;
  }

  private snapshot(bar: HistoricalCandle, barIndex: number, mode: CalculationMode, isBarClose: boolean): CalculationSnapshot {
    const close = closeOf(bar);
    const previous = this.state.bars[this.state.bars.length - 2];
    const previousClose = previous ? closeOf(previous) : null;
    const change = previousClose == null ? null : close - previousClose;
    const changePct = previousClose == null || previousClose === 0 ? null : (change! / previousClose) * 100;

    const committed = this.state.lastCommittedTimestamp === String(timestampMs(bar.timestamp));
    const previewDeveloping = !committed;
    const ema20 = this.state.ema20 == null ? null : previewDeveloping ? this.state.ema20 + (2 / 21) * (close - this.state.ema20) : this.state.ema20;
    let rsi14: number | null = null;
    if (this.state.avgGain14 != null && this.state.avgLoss14 != null && previous) {
      const delta = close - previousClose!;
      const gain = Math.max(0, delta), loss = Math.max(0, -delta);
      const avgGain = (this.state.avgGain14 * 13 + gain) / 14;
      const avgLoss = (this.state.avgLoss14 * 13 + loss) / 14;
      rsi14 = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    } else if (committed && this.state.avgGain14 != null && this.state.avgLoss14 != null) {
      const avgLoss = this.state.avgLoss14;
      rsi14 = avgLoss === 0 ? 100 : 100 - (100 / (1 + this.state.avgGain14 / avgLoss));
    }

    const atr14 = this.state.atr14 == null ? null : previewDeveloping && previous ? (this.state.atr14 * 13 + trueRange(bar, previous)) / 14 : this.state.atr14;
    const sma20 = this.state.sma20Window.length >= 20
      ? previewDeveloping ? (this.state.sma20Sum - this.state.sma20Window[0] + close) / 20 : this.state.sma20Sum / 20
      : null;
    const currentVolume = Math.max(0, Number(bar.volume) || 0);
    const currentPv = typical(bar) * currentVolume;
    const vwapDenominator = this.state.cumulativeVolume + (previewDeveloping ? currentVolume : 0);
    const vwapNumerator = this.state.cumulativePV + (previewDeveloping ? currentPv : 0);
    const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : null;

    return {
      symbol: this.symbol,
      timeframe: this.timeframe,
      mode,
      timestamp: Math.floor(new Date(bar.timestamp).getTime()),
      barIndex,
      isBarClose,
      values: { close, change, changePct, sma20, ema20, rsi14, atr14, vwap, high: Number(bar.high), low: Number(bar.low) },
    };
  }

  private acceptCommittedBar(bar: HistoricalCandle): void {
    this.startDevelopingBar(bar);
    this.commitCurrentDevelopingBar();
  }

  /**
   * Rare correctness path for historical corrections to an already committed
   * candle. Rebuilds the compact indicator state from the retained bar window.
   */
  private rebuildCommittedState(): void {
    const retainedBars = this.state.bars.map((bar) => ({ ...bar }));
    this.state = this.emptyState();
    for (const bar of retainedBars) this.acceptCommittedBar(bar);
  }

  private emptyState(): State {
    return { bars: [], ema20: null, avgGain14: null, avgLoss14: null, atr14: null, trSeed: [], gainSeed: [], lossSeed: [], cumulativePV: 0, cumulativeVolume: 0, sma20Window: [], sma20Sum: 0, lastCommittedTimestamp: null };
  }
}
