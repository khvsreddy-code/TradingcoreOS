export type TradingCoreMetricSnapshot = Readonly<{
  requests: number;
  errors: number;
  rateLimited: number;
  durations: number[];
}>;

const state = {
  requests: 0,
  errors: 0,
  rateLimited: 0,
  durations: [] as number[],
};

export function recordRequest(status: number, durationMs: number): void {
  state.requests += 1;
  if (status >= 500) state.errors += 1;
  if (status === 429) state.rateLimited += 1;
  state.durations.push(Math.max(0, durationMs));
  if (state.durations.length > 512) state.durations.splice(0, state.durations.length - 512);
}

export function getRequestMetrics(): TradingCoreMetricSnapshot {
  return Object.freeze({
    requests: state.requests,
    errors: state.errors,
    rateLimited: state.rateLimited,
    durations: [...state.durations],
  });
}
