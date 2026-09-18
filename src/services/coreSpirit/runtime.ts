import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram } from './types';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';

export type CoreSpiritRuntimeOptions = {
  symbol?: string;
  timeframe?: string;
  sourceId?: string;
  maxStepsPerBar?: number;
};

export type CoreSpiritRuntimeState = {
  barIndex: number;
  time: number;
  locals: Record<string, unknown>;
  seriesState: Record<string, number[]>;
};

export type CoreSpiritExecutionResult = {
  outputs: CoreSpiritObject[];
  state: CoreSpiritRuntimeState;
  diagnostics: string[];
};

/**
 * Stateful, chronological CoreSpirit IR executor.
 *
 * CoreSpirit owns language execution here; Core Chart only consumes output/event
 * contracts. Each bar is evaluated once, with historical offsets resolved only
 * to the current bar or earlier bars. Runtime indices are therefore checked as
 * strictly as compile-time constant indices.
 */
export class CoreSpiritRuntime {
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: Required<CoreSpiritRuntimeOptions>;
  private state: CoreSpiritRuntimeState = {
    barIndex: -1,
    time: 0,
    locals: {},
    seriesState: {},
  };

  constructor(options: CoreSpiritRuntimeOptions = {}) {
    this.options = {
      symbol: options.symbol || '',
      timeframe: options.timeframe || 'unknown',
      sourceId: options.sourceId || 'coreSpirit',
      maxStepsPerBar: options.maxStepsPerBar || 10000,
    };
  }

  reset(): void {
    this.state = { barIndex: -1, time: 0, locals: {}, seriesState: {} };
  }

  getState(): CoreSpiritRuntimeState {
    return {
      barIndex: this.state.barIndex,
      time: this.state.time,
      locals: { ...this.state.locals },
      seriesState: Object.fromEntries(Object.entries(this.state.seriesState).map(([k, v]) => [k, [...v]])),
    };
  }

  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    const compiled = this.compiler.compile(program.ast, program.id || this.options.sourceId);
    if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) {
      throw new Error(compiled.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    }
    return this.executeIr(compiled.ir, bars).outputs;
  }

  executeIr(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const outputs: CoreSpiritObject[] = [];
    const diagnostics: string[] = [];
    this.reset();

    for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
      const bar = bars[barIndex];
      const time = this.toEpoch(bar.timestamp);
      this.state.barIndex = barIndex;
      this.state.time = time;
      this.state.locals = {};

      try {
        this.executeBlock(ir.entry.instructions, bar, bars, barIndex, outputs, diagnostics);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(`bar ${barIndex}: ${message}`);
      }
    }

    return { outputs, state: this.getState(), diagnostics };
  }

  private executeBlock(
    instructions: CoreSpiritIrInstruction[],
    bar: HistoricalCandle,
    bars: HistoricalCandle[],
    barIndex: number,
    outputs: CoreSpiritObject[],
    diagnostics: string[],
  ): void {
    const values = new Map<string, unknown>();
    let pc = 0;
    let steps = 0;

    while (pc < instructions.length) {
      if (++steps > this.options.maxStepsPerBar) throw new Error('execution step limit exceeded');
      const ins = instructions[pc];
      switch (ins.op) {
        case 'const': values.set(ins.dest, ins.value); pc += 1; break;
        case 'loadSeries': values.set(ins.dest, this.loadSeries(ins.name, ins.offset, bar, bars, barIndex)); pc += 1; break;
        case 'move': values.set(ins.dest, this.state.locals[ins.source]); pc += 1; break;
        case 'setLocal': this.state.locals[ins.name] = values.get(ins.source); pc += 1; break;
        case 'unary': values.set(ins.dest, this.unary(ins.operator, values.get(ins.operand))); pc += 1; break;
        case 'binary': values.set(ins.dest, this.binary(ins.operator, values.get(ins.left), values.get(ins.right))); pc += 1; break;
        case 'call': {
          const args = ins.args.map(a => values.get(a));
          const result = this.call(ins.name, args, bar, bars, barIndex, ins.seriesArgs || []);
          values.set(ins.dest, result);
          pc += 1;
          break;
        }
        case 'index': {
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          values.set(ins.dest, ins.seriesName ? this.loadSeries(ins.seriesName, index, bar, bars, barIndex) : (index > barIndex ? null : values.get(ins.target)));
          pc += 1;
          break;
        }
        case 'jumpIfFalse': if (!this.truthy(values.get(ins.condition))) pc = ins.target; else pc += 1; break;
        case 'jump': pc = ins.target; break;
        case 'emit': this.emitIntent(ins.kind, ins.args.slice(1).map(a => values.get(a)), bar, barIndex, outputs, diagnostics); pc += 1; break;
        default: pc += 1;
      }
    }
  }

  private loadSeries(name: string, offset: number, bar: HistoricalCandle, bars: HistoricalCandle[], barIndex: number): number | null {
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`future indexing is not allowed for ${name}[${offset}]`);
    if (offset > barIndex) return null;
    const source = bars[barIndex - offset];
    if (!source) return null;
    const value = name === 'time' ? this.toEpoch(source.timestamp) : Number((source as any)[name]);
    return Number.isFinite(value) ? value : null;
  }

  private call(name: string, args: unknown[], bar: HistoricalCandle, bars: HistoricalCandle[], index: number, seriesArgs: string[]): unknown {
    const series = seriesArgs[0];
    const length = Math.max(1, Math.floor(Number(args[1] ?? 14)));
    if (name === 'sma' || name === 'highest' || name === 'lowest' || name === 'change') {
      const values = this.window(series || 'close', length, bars, index);
      if (name === 'sma') return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      if (name === 'highest') return values.length ? Math.max(...values) : null;
      if (name === 'lowest') return values.length ? Math.min(...values) : null;
      const current = values[0]; const previous = this.loadSeries(series || 'close', 1, bar, bars, index);
      return current == null || previous == null ? null : current - previous;
    }
    if (name === 'ema') {
      const key = `ema:${series || 'close'}:${length}`;
      const current = Number(args[0]);
      if (!Number.isFinite(current)) return null;
      const previous = Number(this.state.seriesState[key]?.at(-1));
      const alpha = 2 / (length + 1);
      const value = Number.isFinite(previous) ? alpha * current + (1 - alpha) * previous : current;
      this.pushState(key, value);
      return value;
    }
    if (name === 'rsi') {
      const key = `rsi:${series || 'close'}`;
      const current = Number(args[0]);
      const previous = index > 0 ? Number(this.loadSeries(series || 'close', 1, bar, bars, index)) : NaN;
      if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
      const gain = Math.max(0, current - previous);
      const loss = Math.max(0, previous - current);
      const avgGainKey = `${key}:gain:${length}`;
      const avgLossKey = `${key}:loss:${length}`;
      const pg = Number(this.state.seriesState[avgGainKey]?.at(-1));
      const pl = Number(this.state.seriesState[avgLossKey]?.at(-1));
      const avgGain = Number.isFinite(pg) ? (pg * (length - 1) + gain) / length : gain;
      const avgLoss = Number.isFinite(pl) ? (pl * (length - 1) + loss) / length : loss;
      this.pushState(avgGainKey, avgGain); this.pushState(avgLossKey, avgLoss);
      if (avgLoss === 0) return 100;
      return 100 - 100 / (1 + avgGain / avgLoss);
    }
    if (name === 'atr') {
      const key = `atr:${length}`;
      const previousClose = index > 0 ? Number(this.loadSeries('close', 1, bar, bars, index)) : Number(bar.close);
      const tr = Math.max(Number(bar.high) - Number(bar.low), Math.abs(Number(bar.high) - previousClose), Math.abs(Number(bar.low) - previousClose));
      const prev = Number(this.state.seriesState[key]?.at(-1));
      const atr = Number.isFinite(prev) ? (prev * (length - 1) + tr) / length : tr;
      this.pushState(key, atr);
      return atr;
    }
    if (name === 'vwap') {
      const key = 'vwap';
      const prev = this.state.seriesState[key] || [];
      const cumPV = Number(prev.at(-2) || 0) + ((bar.high + bar.low + bar.close) / 3) * bar.volume;
      const cumVol = Number(prev.at(-1) || 0) + bar.volume;
      this.state.seriesState[key] = [cumPV, cumVol];
      return cumVol ? cumPV / cumVol : null;
    }
    if (name === 'plot') return args[0] ?? null;
    return args[0] ?? null;
  }

  private window(name: string, length: number, bars: HistoricalCandle[], index: number): number[] {
    const out: number[] = [];
    for (let i = index; i >= Math.max(0, index - length + 1); i -= 1) {
      const v = Number(name === 'time' ? this.toEpoch(bars[i].timestamp) : (bars[i] as any)[name]);
      if (Number.isFinite(v)) out.push(v);
    }
    return out;
  }

  private emitIntent(kind: Extract<CoreSpiritIrInstruction, { op: 'emit' }>['kind'], args: unknown[], bar: HistoricalCandle, barIndex: number, outputs: CoreSpiritObject[], diagnostics: string[]): void {
    const time = this.toEpoch(bar.timestamp);
    try {
      if (kind === 'plot') {
        const value = Number(args[0]);
        outputs.push({ kind: 'series', time, value: Number.isFinite(value) ? value : null });
      } else if (kind === 'marker') {
        const price = Number(args[1] ?? args[0]);
        outputs.push({ kind: 'marker', time: Number(args[0]) || time, price, metadata: { source: this.options.sourceId, barIndex } });
      } else if (kind === 'line') {
        outputs.push({ kind: 'line', start: { time: Number(args[0]) || time, price: Number(args[1]) }, end: { time: Number(args[2]) || time, price: Number(args[3]) }, style: { source: this.options.sourceId } });
      } else if (kind === 'zone') {
        outputs.push({ kind: 'zone', left: Number(args[0]) || time, right: Number(args[1]) || time, top: Number(args[2]), bottom: Number(args[3]), state: 'active' });
      } else if (kind === 'signal') {
        const type = String(args[0] ?? 'signal');
        outputs.push({ kind: 'signal', time, type, metadata: { source: this.options.sourceId, barIndex } });
        coreEventBus.emit('script.signal', { scriptId: this.options.sourceId, time, type, metadata: { barIndex } });
      } else if (kind === 'alert') {
        coreEventBus.emit('script.alert', { scriptId: this.options.sourceId, time, payload: { args, barIndex } });
      } else if (kind === 'webhook') {
        coreEventBus.emit('script.webhook', { scriptId: this.options.sourceId, time, endpoint: typeof args[0] === 'string' ? String(args[0]) : undefined, payload: { args: typeof args[0] === 'string' ? args.slice(1) : args, barIndex } });
      }
    } catch (error) {
      diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private pushState(key: string, value: number): void {
    const arr = this.state.seriesState[key] || [];
    arr.push(value);
    if (arr.length > 256) arr.splice(0, arr.length - 256);
    this.state.seriesState[key] = arr;
  }

  private unary(operator: string, value: unknown): unknown {
    if (operator === '!') return !this.truthy(value);
    if (operator === '+') return Number(value);
    return -Number(value);
  }

  private binary(operator: string, left: unknown, right: unknown): unknown {
    if (['+', '-', '*', '/', '%', '<', '<=', '>', '>='].includes(operator) && (left == null || right == null)) return null;
    switch (operator) {
      case '+': return Number(left) + Number(right);
      case '-': return Number(left) - Number(right);
      case '*': return Number(left) * Number(right);
      case '/': return Number(right) === 0 ? null : Number(left) / Number(right);
      case '%': return Number(left) % Number(right);
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': return Number(left) < Number(right);
      case '<=': return Number(left) <= Number(right);
      case '>': return Number(left) > Number(right);
      case '>=': return Number(left) >= Number(right);
      case 'and': return this.truthy(left) && this.truthy(right);
      case 'or': return this.truthy(left) || this.truthy(right);
      default: return null;
    }
  }

  private truthy(value: unknown): boolean { return Boolean(value); }

  private toEpoch(timestamp: string): number {
    const n = Number(timestamp);
    if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : n;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  }
}

export const coreSpiritRuntime = new CoreSpiritRuntime();
