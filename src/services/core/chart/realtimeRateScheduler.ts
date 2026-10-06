import { performance } from 'node:perf_hooks';

export type RealtimeRateSchedulerStats = Readonly<{
  runs: number;
  coalesced: number;
  lastRunAt: number;
}>;

export type RealtimeRateSchedulerOptions<T> = {
  intervalMs: number;
  run: (value: T, sequence: number) => void;
};

/**
 * Compute-rate gate. The latest market state wins while a compute window is
 * open. This deliberately does not use rAF: compute cadence is independent from
 * display cadence and can be tuned for indicator/CoreSpirit needs.
 */
export class RealtimeRateScheduler<T> {
  private readonly intervalMs: number;
  private readonly run: (value: T, sequence: number) => void;
  private pending: { value: T; sequence: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRunAt = 0;
  private runs = 0;
  private coalesced = 0;
  private disposed = false;

  constructor(options: RealtimeRateSchedulerOptions<T>) {
    this.intervalMs = Math.max(0, Number(options.intervalMs) || 0);
    this.run = options.run;
  }

  schedule(value: T, sequence: number): void {
    if (this.disposed) return;
    if (this.pending) this.coalesced += 1;
    this.pending = { value, sequence };
    if (this.timer != null) return;
    this.arm();
  }

  private arm(): void {
    const now = performance.now();
    const delay = this.lastRunAt > 0 ? Math.max(0, this.intervalMs - (now - this.lastRunAt)) : 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
  }

  private flush(): void {
    if (this.disposed || !this.pending) return;
    const pending = this.pending;
    this.pending = null;
    const started = performance.now();
    this.lastRunAt = started;
    this.runs += 1;
    this.run(pending.value, pending.sequence);
    if (!this.disposed && this.pending && this.timer == null) this.arm();
  }

  getStats(): RealtimeRateSchedulerStats {
    return Object.freeze({ runs: this.runs, coalesced: this.coalesced, lastRunAt: this.lastRunAt });
  }

  cancel(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
