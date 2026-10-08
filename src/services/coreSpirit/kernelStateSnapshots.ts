/**
 * Bounded, runtime-only checkpoints for stateful CoreSpirit execution kernels.
 *
 * A snapshot is deliberately richer than a raw kernel clone: the runtime can
 * validate that the snapshot belongs to the same compiled model and that its
 * dependency surface is still compatible before restoring it for an intrabar
 * revision.
 */
export type CoreSpiritKernelSnapshot<TState> = Readonly<{
  nodeId: string;
  state: TState;
  revision: number;
  inputDependencies: readonly string[];
  barIndex: number;
  modelVersion: string;
}>;

export type CoreSpiritKernelSnapshotMetadata = Readonly<{
  nodeId: string;
  revision: number;
  inputDependencies: readonly string[];
  barIndex: number;
  modelVersion: string;
}>;

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== b.length) return false;
  for (const value of b) if (!left.has(value)) return false;
  return true;
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
    if (!Number.isInteger(metadata.revision) || metadata.revision < 0) throw new Error('CoreSpirit kernel snapshot revision is invalid.');
    if (!metadata.modelVersion.trim()) throw new Error('CoreSpirit kernel snapshot modelVersion is required.');

    const snapshot: CoreSpiritKernelSnapshot<TState> = Object.freeze({
      nodeId: metadata.nodeId,
      state: clone(state),
      revision: metadata.revision,
      inputDependencies: Object.freeze([...metadata.inputDependencies]),
      barIndex: metadata.barIndex,
      modelVersion: metadata.modelVersion,
    });
    this.snapshots.set(metadata.nodeId, snapshot);

    const previous = this.history.get(metadata.nodeId) ?? [];
    const next = [snapshot, ...previous.filter((item) => item.barIndex !== snapshot.barIndex)];
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
  ): boolean {
    const snapshot = this.snapshots.get(nodeId);
    if (!snapshot) return false;
    if (snapshot.modelVersion !== modelVersion) return false;
    if (snapshot.barIndex !== barIndex) return false;
    if (!sameStringSet(snapshot.inputDependencies, inputDependencies)) return false;
    copyFrom(target, snapshot.state);
    return true;
  }

  restoreAt(
    target: TState,
    nodeId: string,
    modelVersion: string,
    inputDependencies: readonly string[],
    barIndex: number,
    copyFrom: (target: TState, source: TState) => void,
  ): boolean {
    const snapshot = this.at(nodeId, barIndex);
    if (!snapshot) return false;
    if (snapshot.modelVersion !== modelVersion) return false;
    if (!sameStringSet(snapshot.inputDependencies, inputDependencies)) return false;
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
