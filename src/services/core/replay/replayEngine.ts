import { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../event/eventBus';

export type ReplayStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type ReplayOptions = {
  sessionId: string;
  symbol: string;
  timeframe: string;
  bars: HistoricalCandle[];
  speed?: number;
};

/** Deterministic bar-by-bar replay. It never mutates the source candle array. */
export class ReplayEngine {
  private options?: ReplayOptions;
  private cursor = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private status: ReplayStatus = 'idle';
  private readonly bus: CoreEventBus;

  constructor(bus: CoreEventBus = coreEventBus) { this.bus = bus; }

  load(options: ReplayOptions): void {
    this.stop(false);
    this.options = { ...options, bars: [...options.bars], speed: Math.max(0.1, options.speed ?? 1) };
    this.cursor = 0;
    this.status = 'idle';
  }

  start(): void {
    if (!this.options || this.options.bars.length === 0) return;
    if (this.status === 'running') return;
    this.status = 'running';
    const first = this.options.bars[0];
    const last = this.options.bars[this.options.bars.length - 1];
    this.bus.emit('replay.started', {
      sessionId: this.options.sessionId, symbol: this.options.symbol, timeframe: this.options.timeframe,
      startTime: Number(first.timestamp), endTime: Number(last.timestamp),
    });
    this.scheduleNext();
  }

  pause(): void {
    if (this.status !== 'running' || !this.options) return;
    this.clearTimer();
    this.status = 'paused';
    const current = this.options.bars[Math.max(0, this.cursor - 1)];
    this.bus.emit('replay.paused', { sessionId: this.options.sessionId, cursorTime: Number(current?.timestamp ?? 0) });
  }

  stop(emitEvent = true): void {
    this.clearTimer();
    if (emitEvent && this.options) {
      const current = this.options.bars[Math.max(0, this.cursor - 1)];
      this.bus.emit('replay.stopped', { sessionId: this.options.sessionId, cursorTime: Number(current?.timestamp ?? 0) });
    }
    this.status = 'stopped';
  }

  reset(): void { this.clearTimer(); this.cursor = 0; this.status = 'idle'; }
  getStatus(): ReplayStatus { return this.status; }
  getCursor(): number { return this.cursor; }

  private scheduleNext(): void {
    if (!this.options || this.status !== 'running') return;
    if (this.cursor >= this.options.bars.length) { this.status = 'stopped'; return; }
    const bar = this.options.bars[this.cursor++];
    this.bus.emit('market.bar', { symbol: this.options.symbol, timeframe: this.options.timeframe, bar: bar as unknown as Record<string, unknown> });
    const next = this.options.bars[this.cursor];
    const sourceDelta = next && Number(next.timestamp) > Number(bar.timestamp) ? Number(next.timestamp) - Number(bar.timestamp) : 1000;
    this.timer = setTimeout(() => this.scheduleNext(), Math.max(1, sourceDelta / (this.options?.speed ?? 1)));
  }

  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
