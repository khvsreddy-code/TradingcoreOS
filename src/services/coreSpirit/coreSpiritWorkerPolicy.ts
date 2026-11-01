/**
 * Device-aware CoreSpirit worker admission.
 *
 * Browser deviceMemory is deliberately treated as a coarse tier, not an exact
 * RAM measurement. The bar threshold is a conservative scheduling guard: it
 * serializes large snapshots rather than pretending to know their byte cost.
 */
const MAX_CONTEXTS_PER_WORKER = 8;

export const CORESPIRIT_WORKER_EXCLUSIVE_DATA_POINTS = 20_000;

export type CoreSpiritWorkerDeviceProfile = Readonly<{
  hardwareConcurrency?: number;
  deviceMemoryGiB?: number;
}>;

export type CoreSpiritWorkerResourceBudget = Readonly<{
  maxWorkers: number;
  maxContextsPerWorker: number;
  memoryTier: 'constrained' | 'standard' | 'expanded' | 'unknown';
}>;

/** Resolve a conservative worker/cache budget without depending on browser globals. */
export function resolveCoreSpiritWorkerResourceBudget(
  profile: CoreSpiritWorkerDeviceProfile = {},
  requestedMaxWorkers?: number,
): CoreSpiritWorkerResourceBudget {
  if (requestedMaxWorkers !== undefined &&
      (!Number.isSafeInteger(requestedMaxWorkers) || requestedMaxWorkers < 1)) {
    throw new Error('requestedMaxWorkers must be a positive safe integer');
  }

  const hardware = Number.isSafeInteger(profile.hardwareConcurrency) && Number(profile.hardwareConcurrency) > 0
    ? Number(profile.hardwareConcurrency)
    : 2;
  const hardwareLimit = Math.max(1, hardware - 1);
  const memory = Number.isFinite(profile.deviceMemoryGiB) && Number(profile.deviceMemoryGiB) > 0
    ? Number(profile.deviceMemoryGiB)
    : undefined;

  const memoryTier: CoreSpiritWorkerResourceBudget['memoryTier'] =
    memory === undefined ? 'unknown' : memory <= 4 ? 'constrained' : memory <= 8 ? 'standard' : 'expanded';
  const memoryWorkerLimit = memoryTier === 'constrained' ? 1
    : memoryTier === 'standard' ? 2
    : memoryTier === 'expanded' ? Math.min(4, hardwareLimit)
    : Math.min(2, hardwareLimit);
  const maxContextsPerWorker = memoryTier === 'constrained' ? 3
    : memoryTier === 'standard' ? 5
    : memoryTier === 'expanded' ? MAX_CONTEXTS_PER_WORKER
    : 4;

  return Object.freeze({
    maxWorkers: Math.max(1, Math.min(requestedMaxWorkers ?? memoryWorkerLimit, hardwareLimit, memoryWorkerLimit)),
    maxContextsPerWorker,
    memoryTier,
  });
}

export function isCoreSpiritWorkerExclusiveWorkload(dataPoints: number): boolean {
  return Number.isFinite(dataPoints) && dataPoints >= CORESPIRIT_WORKER_EXCLUSIVE_DATA_POINTS;
}

/**
 * Large snapshots drain the in-flight pool before starting and block new small
 * work until completion. This keeps history copies/state-heavy runs bounded.
 */
export function canDispatchCoreSpiritWorkerWorkload(
  requestedDataPoints: number,
  activeDataPoints: readonly number[],
  pendingDataPoints: readonly number[] = [],
  requestedQueueIndex = 0,
): boolean {
  const activeLarge = activeDataPoints.some(isCoreSpiritWorkerExclusiveWorkload);
  if (activeLarge) return false;

  // Keep the queue's existing priority order: jobs ahead of the first large
  // snapshot may drain, the large snapshot runs exclusively, and later jobs
  // cannot refill slots until that snapshot completes.
  const firstLargeIndex = pendingDataPoints.findIndex(isCoreSpiritWorkerExclusiveWorkload);
  if (firstLargeIndex >= 0) {
    if (isCoreSpiritWorkerExclusiveWorkload(requestedDataPoints)) {
      return requestedQueueIndex === firstLargeIndex && activeDataPoints.length === 0;
    }
    return requestedQueueIndex < firstLargeIndex;
  }

  if (isCoreSpiritWorkerExclusiveWorkload(requestedDataPoints)) return activeDataPoints.length === 0;
  return true;
}
