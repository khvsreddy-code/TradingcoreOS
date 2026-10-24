/**
 * Canonical candle mutation identity shared by chart consumers and CoreSpirit.
 * Revisions are monotonic within a dataset generation. Append/replace may update
 * the tail; corrections, backfills and resets must invalidate recursive state.
 */
export type CandleMutationKind = 'append' | 'replace' | 'correction' | 'backfill' | 'reset';
export type CandleInvalidationMode = 'incremental' | 'full-replay';
export type CandleDatasetChange = Readonly<{
  schemaVersion: 1;
  datasetKey: string;
  datasetGeneration: number;
  previousRevision: number;
  revision: number;
  kind: CandleMutationKind;
  dirtyRange: Readonly<{ from: number; to: number }>;
  candleCount: number;
  timestampMs?: number;
  emittedAtMs: number;
}>;
export type CandleDatasetFence = Readonly<{ datasetKey: string; datasetGeneration: number; revision?: number }>;

export function candleTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value > 1e12 ? value : value * 1000;
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Incoming rows win equal whole-second timestamps; canonical output is unique and ordered. */
export function mergeCanonicalCandleRows<T extends { timestamp: string | number }>(
  current: readonly T[], incoming: readonly T[], limit = 50_000,
): T[] {
  const bySecond = new Map<number, T>();
  for (const row of current) {
    const ms = candleTimestampMs(row?.timestamp);
    if (ms != null) bySecond.set(Math.floor(ms / 1000), row);
  }
  for (const row of incoming) {
    const ms = candleTimestampMs(row?.timestamp);
    if (ms != null) bySecond.set(Math.floor(ms / 1000), row);
  }
  const boundedLimit = Math.max(1, Math.min(50_000, Math.floor(Number(limit) || 50_000)));
  return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).slice(-boundedLimit).map(([, row]) => row);
}

export function createCandleDatasetChange(input: {
  datasetKey: string; datasetGeneration: number; previousRevision: number; revision: number;
  kind: CandleMutationKind; from: number; to: number; candleCount: number;
  timestampMs?: number; emittedAtMs?: number;
}): CandleDatasetChange {
  const datasetKey = String(input.datasetKey ?? '').trim();
  const previousRevision = Math.floor(input.previousRevision);
  const revision = Math.floor(input.revision);
  const datasetGeneration = Math.floor(input.datasetGeneration);
  const candleCount = Math.floor(input.candleCount);
  const fromValue = Number(input.from);
  const toValue = Number(input.to);
  if (!datasetKey) throw new Error('Candle mutation requires a dataset key');
  if (!Number.isSafeInteger(previousRevision) || previousRevision < 0) throw new Error('Candle mutation previous revision must be a non-negative safe integer');
  if (!Number.isSafeInteger(revision) || revision <= previousRevision) throw new Error('Candle mutation revision must advance monotonically');
  if (!Number.isSafeInteger(datasetGeneration) || datasetGeneration < 0) throw new Error('Candle mutation generation must be a non-negative safe integer');
  if (!Number.isSafeInteger(candleCount) || candleCount < 0) throw new Error('Candle mutation candle count must be a non-negative safe integer');
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue)) throw new Error('Candle mutation dirty range must be finite');
  const from = Math.max(0, Math.min(candleCount, Math.floor(fromValue)));
  const to = Math.max(from, Math.min(candleCount, Math.floor(toValue)));
  const timestampMs = input.timestampMs;
  return Object.freeze({
    schemaVersion: 1 as const, datasetKey,
    datasetGeneration,
    previousRevision, revision, kind: input.kind,
    dirtyRange: Object.freeze({ from, to }), candleCount,
    ...(Number.isFinite(timestampMs) && Number(timestampMs) > 0 ? { timestampMs: Number(timestampMs) } : {}),
    emittedAtMs: Number.isFinite(input.emittedAtMs) ? Math.max(0, Number(input.emittedAtMs)) : Date.now(),
  });
}

export function isCurrentCandleDatasetChange(change: CandleDatasetChange, fence: CandleDatasetFence): boolean {
  return change.datasetKey === fence.datasetKey
    && change.datasetGeneration === fence.datasetGeneration
    && (fence.revision == null || change.revision >= fence.revision);
}

export function invalidationModeForCandleChange(change: CandleDatasetChange): CandleInvalidationMode {
  const tailOnly = change.kind === 'append' || change.kind === 'replace';
  const touchesTail = change.dirtyRange.to === change.candleCount
    && change.dirtyRange.from >= Math.max(0, change.candleCount - 1);
  return tailOnly && touchesTail ? 'incremental' : 'full-replay';
}
