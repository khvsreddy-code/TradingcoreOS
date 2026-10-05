export const API_LATENCY_BUDGET_MS = Object.freeze({
  quote: 2_500,
  depth: 2_500,
  marketStatus: 2_500,
  history: 9_000,
  order: 5_000,
  account: 4_000,
  snapshot: 8_000,
  symbolSearch: 5_000,
  predictionSync: 8_000,
  streamLease: 12_000,
} as const);

export function timeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timer]) : timer;
}

export function timeoutMessage(scope: string, timeoutMs: number): string {
  return scope + ' timed out after ' + timeoutMs + 'ms';
}
