/**
 * Low-overhead tick -> compute -> patch -> paint tracing.
 *
 * This is intentionally allocation-light and disabled unless a sink is attached.
 * The trace is diagnostic only: it must never become a scheduling dependency.
 */

export type MarketLatencyStage =
  | 'feed'
  | 'canonical'
  | 'compute'
  | 'patch'
  | 'paint';

export type MarketLatencySample = Readonly<{
  timelineKey: string;
  sequence: number;
  stage: MarketLatencyStage;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}>;

export type MarketLatencySink = (sample: MarketLatencySample) => void;

export class MarketLatencyTrace {
  private sink: MarketLatencySink | undefined;

  setSink(sink: MarketLatencySink | undefined): void {
    this.sink = sink;
  }

  measure<T>(
    timelineKey: string,
    sequence: number,
    stage: MarketLatencyStage,
    work: () => T,
  ): T {
    const sink = this.sink;
    if (!sink) return work();

    const startedAt = performance.now();
    try {
      return work();
    } finally {
      const endedAt = performance.now();
      sink({
        timelineKey,
        sequence,
        stage,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
      });
    }
  }
}

export const marketLatencyTrace = new MarketLatencyTrace();
