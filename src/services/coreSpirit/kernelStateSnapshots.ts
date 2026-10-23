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
  'modelVersion' | 'kernelType' | 'kernelVersion' | 'parametersSignature' | 'dataRevision' | 'nextBarIndex'
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
  if (!expected) return true;
  return snapshot.modelVersion === expected.modelVersion &&
    snapshot.kernelType === expected.kernelType &&
    snapshot.kernelVersion === expected.kernelVersion &&
    snapshot.parametersSignature === expected.parametersSignature &&
    snapshot.dataRevision === expected.dataRevision &&
    snapshot.nextBarIndex === expected.nextBarIndex;
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
        String(metadata.kernelVersion).trim() === '') throw new Error('CoreSpirit kernel snapshot kernelVersion is required.');
    if (!metadata.parametersSignature) throw new Error('CoreSpirit kernel snapshot parametersSignature is required.');
    if (metadata.dataRevision == null || String(metadata.dataRevision).trim() === '') {
      throw new Error('CoreSpirit kernel snapshot dataRevision is required.');
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
      item.dataRevision !== snapshot.dataRevision ||
      item.parametersSignature !== snapshot.parametersSignature ||
      item.kernelType !== snapshot.kernelType ||
      item.kernelVersion !== snapshot.kernelVersion,
    )];
    this.history.set(metadata.nodeId, next.slice(0, this.historyLimit));
    return snapshot;
  }

  latest(nodeId: string): CoreSpiritKernelSnapshot<TState> | undefined {
    return this.snapshots.get(nodeId);
  }

  at(nodeId: string, barIndex: number): CoreSpiritKernelSnapshot<TState> | undefined {
    const entries = this.history.get(nodeId);
    return entries?.find((entry) => entry.barIndex === barIndex);
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
    const snapshot = this.at(nodeId, barIndex);
    if (!snapshot || snapshot.modelVersion !== modelVersion ||
        !sameStringSet(snapshot.inputDependencies, inputDependencies) || !identityMatches(snapshot, expected)) return false;
    copyFrom(target, snapshot.state);
    return true;
  }

  entries(): readonly CoreSpiritKernelSnapshot<TState>[] {
    return Object.freeze([...this.snapshots.values()]);
  }

  get size(): number {
    return this.snapshots.size;
  }
}
