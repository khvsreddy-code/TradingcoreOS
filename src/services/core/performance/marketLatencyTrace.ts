/**
 * Low-overhead tick -> compute -> patch -> paint tracing.
 *
 * No sink means the hot path executes the work directly. With a sink installed,
 * only one sequence in the configured sample interval is recorded. Sink failures
 * are swallowed: diagnostics must never become a trading/runtime dependency.
 */
export type MarketLatencyStage = 'feed' | 'canonical' | 'compute' | 'patch' | 'paint';

export type MarketLatencySample = Readonly<{
  timelineKey: string;
  sequence: number;
  stage: MarketLatencyStage;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}>;

export type MarketLatencySink = (sample: MarketLatencySample) => void;

function traceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class MarketLatencyTrace {
  private sink: MarketLatencySink | undefined;
  private sampleEvery = 16;

  setSink(sink: MarketLatencySink | undefined): void {
    this.sink = sink;
  }

  setSampleEvery(value: number): void {
    this.sampleEvery = Number.isFinite(value) ? Math.max(1, Math.min(1_000, Math.floor(value))) : 16;
  }

  shouldSample(sequence: number): boolean {
    return Number.isSafeInteger(sequence) && sequence >= 0 && sequence % this.sampleEvery === 0;
  }

  record(timelineKey: string, sequence: number, stage: MarketLatencyStage, startedAt: number, endedAt: number): void {
    const sink = this.sink;
    if (!sink || !this.shouldSample(sequence)) return;
    const key = String(timelineKey || '').trim();
    const start = Number(startedAt);
    const end = Number(endedAt);
    if (!key || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
    try {
      sink(Object.freeze({ timelineKey: key, sequence, stage, startedAt: start, endedAt: end, durationMs: end - start }));
    } catch {
      // Observability is best-effort and must never block the data path.
    }
  }

  measure<T>(timelineKey: string, sequence: number, stage: MarketLatencyStage, work: () => T): T {
    if (!this.sink || !this.shouldSample(sequence)) return work();
    const startedAt = traceNow();
    try {
      return work();
    } finally {
      this.record(timelineKey, sequence, stage, startedAt, traceNow());
    }
  }

  measureAsync<T>(timelineKey: string, sequence: number, stage: MarketLatencyStage, work: () => Promise<T>): Promise<T> {
    if (!this.sink || !this.shouldSample(sequence)) return work();
    const startedAt = traceNow();
    let result: Promise<T>;
    try {
      result = work();
    } catch (error) {
      this.record(timelineKey, sequence, stage, startedAt, traceNow());
      throw error;
    }
    return result.then(
      value => { this.record(timelineKey, sequence, stage, startedAt, traceNow()); return value; },
      error => { this.record(timelineKey, sequence, stage, startedAt, traceNow()); throw error; },
    );
  }
}

export const marketLatencyTrace = new MarketLatencyTrace();
