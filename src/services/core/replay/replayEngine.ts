import { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../event/eventBus';
import { replayTimestampMs, validateReplayBars } from './replayValidator';

export type ReplayStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type ReplayOptions = {
  sessionId: string;
  symbol: string;
  timeframe: string;
  bars: HistoricalCandle[];
  speed?: number;
};

export class ReplayEngine {
  private options?: ReplayOptions;
  private cursor = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private status: ReplayStatus = 'idle';
  private started = false;
  private readonly bus: CoreEventBus;

  constructor(bus: CoreEventBus = coreEventBus) { this.bus = bus; }

  load(options: ReplayOptions): void {
    this.stop(false);
    const validation = validateReplayBars(options.bars);
    if (!validation.valid) throw new Error(`Invalid replay data: ${validation.errors.join('; ')}`);
    this.options = { ...options, bars: validation.normalizedBars, speed: Math.max(0.1, options.speed ?? 1) };
    this.cursor = 0;
    this.status = 'idle';
    this.started = false;
  }

  start(): void {
    if (!this.options || !this.options.bars.length || this.status === 'running') return;
    if (!this.started) {
      this.started = true;
      const first = this.options.bars[0], last = this.options.bars[this.options.bars.length - 1];
      this.bus.emit('replay.started', {
        sessionId: this.options.sessionId, symbol: this.options.symbol, timeframe: this.options.timeframe,
        startTime: replayTimestampMs(first.timestamp), endTime: replayTimestampMs(last.timestamp),
      });
    }
    this.status = 'running';
    this.scheduleNext();
  }

  pause(): void {
    if (this.status !== 'running' || !this.options) return;
    this.clearTimer();
    this.status = 'paused';
    this.bus.emit('replay.paused', { sessionId: this.options.sessionId, cursorTime: this.cursorTime() });
  }

  stop(emitEvent = true): void {
    this.clearTimer();
    if (emitEvent && this.options && this.status !== 'idle') {
      this.bus.emit('replay.stopped', { sessionId: this.options.sessionId, cursorTime: this.cursorTime() });
    }
    this.status = 'stopped';
  }

  reset(): void {
    this.clearTimer();
    this.cursor = 0;
    this.status = 'idle';
    this.started = false;
  }

  step(): boolean {
    if (!this.options || this.cursor >= this.options.bars.length) {
      this.status = 'stopped';
      return false;
    }
    if (!this.started) {
      this.started = true;
      const first = this.options.bars[0], last = this.options.bars[this.options.bars.length - 1];
      this.bus.emit('replay.started', {
        sessionId: this.options.sessionId, symbol: this.options.symbol, timeframe: this.options.timeframe,
        startTime: Number(first.timestamp), endTime: Number(last.timestamp),
      });
    }
    this.status = 'paused';
    const index = this.cursor++;
    const bar = this.options.bars[index];
    this.bus.emit('market.bar', {
      symbol: this.options.symbol, timeframe: this.options.timeframe,
      bar: bar as unknown as Record<string, unknown>, source: 'replay',
    });
    this.bus.emit('replay.step', {
      sessionId: this.options.sessionId, cursorTime: replayTimestampMs(bar.timestamp), index,
    });
    if (this.cursor >= this.options.bars.length) this.status = 'stopped';
    return true;
  }

  getStatus(): ReplayStatus { return this.status; }
  getCursor(): number { return this.cursor; }
  getTotalBars(): number { return this.options?.bars.length ?? 0; }

  private scheduleNext(): void {
    if (!this.options || this.status !== 'running') return;
    const before = this.cursor;
    if (!this.step()) return;
    this.status = 'running';
    const current = this.options.bars[Math.max(0, before)];
    const next = this.options.bars[this.cursor];
    if (!next) { this.status = 'stopped'; return; }
    const nextTime = replayTimestampMs(next.timestamp);
    const currentTime = replayTimestampMs(current.timestamp);
    const delta = Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime > currentTime
      ? nextTime - currentTime : 1000;
    this.timer = setTimeout(() => this.scheduleNext(), Math.max(1, delta / (this.options?.speed ?? 1)));
  }

  private cursorTime(): number {
    return replayTimestampMs(this.options?.bars[Math.max(0, this.cursor - 1)]?.timestamp ?? 0);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export const replayEngine = new ReplayEngine();
