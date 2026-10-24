/**
 * Bounded, runtime-only checkpoints for stateful CoreSpirit execution kernels.
 *
 * A checkpoint is reusable only when both the compiled kernel configuration
 * and the input-history generation match. Bar index alone is not an identity:
 * it can survive a correction, symbol switch, parameter edit, or a different
 * implementation of the same indicator.
 */
export type CoreSpiritKernelSnapshot<TState> = Readonly<{
  nodeId: string;
  state: TState;
  /** Intrabar execution revision (diagnostic; not the historical data revision). */
  revision: number;
  inputDependencies: readonly string[];
  /** Index of the last observation represented by state, -1 for the empty baseline. */
  barIndex: number;
  /** Index that the next update to this state must consume. */
  nextBarIndex: number;
  modelVersion: string;
  kernelType: string;
  kernelVersion: string | number;
  parametersSignature: string;
  /** Monotonic input-history generation; unchanged by updates to a forming bar. */
  dataRevision: string | number;
}>;

export type CoreSpiritKernelSnapshotMetadata = Readonly<{
  nodeId: string;
  revision: number;
  inputDependencies: readonly string[];
  barIndex: number;
  nextBarIndex: number;
  modelVersion: string;
  kernelType: string;
  kernelVersion: string | number;
  parametersSignature: string;
  dataRevision: string | number;
}>;

export type CoreSpiritKernelSnapshotIdentity = Readonly<Pick<
  CoreSpiritKernelSnapshotMetadata,
  'modelVersion' | 'kernelType' | 'kernelVersion' | 'parametersSignature' | 'dataRevision' | 'nextBarIndex' | 'inputDependencies'
>>;

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== b.length) return false;
  for (const value of b) if (!left.has(value)) return false;
  return true;
}

function identityMatches<TState>(
  snapshot: CoreSpiritKernelSnapshot<TState>,
  expected?: CoreSpiritKernelSnapshotIdentity,
): boolean {
  // An index-only restore is unsafe: bar indices survive parameter edits,
  // kernel upgrades and historical corrections. Missing identity must fail closed.
  if (!expected) return false;
  return snapshot.modelVersion === expected.modelVersion &&
    snapshot.kernelType === expected.kernelType &&
    snapshot.kernelVersion === expected.kernelVersion &&
    snapshot.parametersSignature === expected.parametersSignature &&
    snapshot.dataRevision === expected.dataRevision &&
    snapshot.nextBarIndex === expected.nextBarIndex &&
    sameStringSet(snapshot.inputDependencies, expected.inputDependencies);
}

export class CoreSpiritKernelSnapshotStore<TState> {
  private readonly snapshots = new Map<string, CoreSpiritKernelSnapshot<TState>>();
  private readonly historyLimit: number;
  private readonly history = new Map<string, CoreSpiritKernelSnapshot<TState>[]>();

  constructor(historyLimit = 1) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 32) {
      throw new Error('CoreSpirit kernel snapshot history limit must be an integer between 1 and 32.');
    }
    this.historyLimit = historyLimit;
  }

  clear(): void {
    this.snapshots.clear();
    this.history.clear();
  }

  capture(
    metadata: CoreSpiritKernelSnapshotMetadata,
    state: TState,
    clone: (state: TState) => TState,
  ): CoreSpiritKernelSnapshot<TState> {
    if (!metadata.nodeId.trim()) throw new Error('CoreSpirit kernel snapshot nodeId is required.');
    if (!Number.isInteger(metadata.barIndex) || metadata.barIndex < -1) throw new Error('CoreSpirit kernel snapshot barIndex is invalid.');
    if (!Number.isSafeInteger(metadata.nextBarIndex) || metadata.nextBarIndex < 0 ||
        metadata.nextBarIndex !== metadata.barIndex + 1) {
      throw new Error('CoreSpirit kernel snapshot nextBarIndex is inconsistent with its represented bar.');
    }
    if (!Number.isInteger(metadata.revision) || metadata.revision < 0) throw new Error('CoreSpirit kernel snapshot revision is invalid.');
    if (!metadata.modelVersion.trim()) throw new Error('CoreSpirit kernel snapshot modelVersion is required.');
    if (!metadata.kernelType.trim()) throw new Error('CoreSpirit kernel snapshot kernelType is required.');
    if ((typeof metadata.kernelVersion !== 'string' && typeof metadata.kernelVersion !== 'number') ||
        String(metadata.kernelVersion).trim() === '' ||
        (typeof metadata.kernelVersion === 'number' && !Number.isSafeInteger(metadata.kernelVersion))) {
      throw new Error('CoreSpirit kernel snapshot kernelVersion is invalid.');
    }
    if (typeof metadata.parametersSignature !== 'string' || !metadata.parametersSignature.trim()) {
      throw new Error('CoreSpirit kernel snapshot parametersSignature is required.');
    }
    if ((typeof metadata.dataRevision !== 'string' && typeof metadata.dataRevision !== 'number') ||
        String(metadata.dataRevision).trim() === '' ||
        (typeof metadata.dataRevision === 'number' && !Number.isSafeInteger(metadata.dataRevision))) {
      throw new Error('CoreSpirit kernel snapshot dataRevision is invalid.');
    }
    if (!Array.isArray(metadata.inputDependencies) ||
        metadata.inputDependencies.some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error('CoreSpirit kernel snapshot inputDependencies are invalid.');
    }

    const snapshot: CoreSpiritKernelSnapshot<TState> = Object.freeze({
      ...metadata,
      state: clone(state),
      inputDependencies: Object.freeze([...metadata.inputDependencies]),
    });
    this.snapshots.set(metadata.nodeId, snapshot);

    const previous = this.history.get(metadata.nodeId) ?? [];
    const next = [snapshot, ...previous.filter((item) =>
      item.barIndex !== snapshot.barIndex ||
      item.nextBarIndex !== snapshot.nextBarIndex ||
      item.modelVersion !== snapshot.modelVersion ||
      item.dataRevision !== snapshot.dataRevision ||
      item.parametersSignature !== snapshot.parametersSignature ||
      item.kernelType !== snapshot.kernelType ||
      item.kernelVersion !== snapshot.kernelVersion ||
      item.revision !== snapshot.revision ||
      !sameStringSet(item.inputDependencies, snapshot.inputDependencies),
    )];
    this.history.set(metadata.nodeId, next.slice(0, this.historyLimit));
    return snapshot;
  }

  latest(nodeId: string): CoreSpiritKernelSnapshot<TState> | undefined {
    return this.snapshots.get(nodeId);
  }

  at(
    nodeId: string,
    barIndex: number,
    expected?: CoreSpiritKernelSnapshotIdentity,
  ): CoreSpiritKernelSnapshot<TState> | undefined {
    // A bar index alone is not a checkpoint identity. Requiring the full
    // expected identity here prevents callers from accidentally retrieving a
    // stale state after corrections, parameter edits, kernel upgrades or a
    // dependency-chain change.
    if (!expected) return undefined;
    const entries = this.history.get(nodeId);
    // Search retained history for a compatible checkpoint rather than stopping
    // at a newer incompatible entry for the same node/bar.
    return entries?.find((entry) => entry.barIndex === barIndex && identityMatches(entry, expected));
  }

  restore(
    target: TState,
    nodeId: string,
    modelVersion: string,
    inputDependencies: readonly string[],
    barIndex: number,
    copyFrom: (target: TState, source: TState) => void,
    expected?: CoreSpiritKernelSnapshotIdentity,
  ): boolean {
    const snapshot = this.snapshots.get(nodeId);
    if (!snapshot || snapshot.modelVersion !== modelVersion || snapshot.barIndex !== barIndex ||
        !sameStringSet(snapshot.inputDependencies, inputDependencies) || !identityMatches(snapshot, expected)) return false;
    try { copyFrom(target, snapshot.state); return true; }
    catch { return false; }
  }

  restoreAt(
    target: TState,
    nodeId: string,
    modelVersion: string,
    inputDependencies: readonly string[],
    barIndex: number,
    copyFrom: (target: TState, source: TState) => void,
    expected?: CoreSpiritKernelSnapshotIdentity,
  ): boolean {
    if (!expected) return false;
    const snapshot = this.at(nodeId, barIndex, expected);
    if (!snapshot || snapshot.modelVersion !== modelVersion ||
        !sameStringSet(snapshot.inputDependencies, inputDependencies)) return false;
    try { copyFrom(target, snapshot.state); return true; }
    catch { return false; }
  }

  entries(): readonly CoreSpiritKernelSnapshot<TState>[] {
    return Object.freeze([...this.snapshots.values()]);
  }

  get size(): number {
    return this.snapshots.size;
  }
}
