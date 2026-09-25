/**
 * Realtime transaction contract — Stage 45.
 * Confirmed state is immutable during a developing-bar transaction.
 */

export type CoreSpiritTransactionPhase = 'idle' | 'open' | 'rolledBack' | 'committed';

export interface CoreSpiritTransactionSnapshot<State = unknown> {
  runId: string;
  barIndex: number;
  timestamp: number;
  revision: number;
  confirmedBarIndex: number;
  phase: CoreSpiritTransactionPhase;
  state: State;
  checksum: string;
}

export interface CoreSpiritTransactionRecord {
  runId: string;
  barIndex: number;
  revision: number;
  beginChecksum: string;
  revisionChecksums: readonly string[];
  committedChecksum?: string;
  rollbackCount: number;
  committed: boolean;
}

export class CoreSpiritRealtimeTransaction<State> {
  private phase: CoreSpiritTransactionPhase = 'idle';
  private snapshot?: CoreSpiritTransactionSnapshot<State>;
  private readonly revisionChecksums: string[] = [];
  private rollbackCount = 0;

  begin(snapshot: CoreSpiritTransactionSnapshot<State>): void {
    if (this.phase === 'open') throw new Error('realtime transaction already open');
    this.snapshot = cloneSnapshot(snapshot);
    this.phase = 'open';
    this.revisionChecksums.length = 0;
    this.rollbackCount = 0;
  }

  recordRevision(checksum: string): number {
    if (this.phase !== 'open') throw new Error('realtime revision requires an open transaction');
    this.revisionChecksums.push(checksum);
    return this.revisionChecksums.length - 1;
  }

  rollback(): CoreSpiritTransactionSnapshot<State> {
    if (this.phase !== 'open') throw new Error('rollback requires an open transaction');
    this.rollbackCount += 1;
    this.phase = 'rolledBack';
    const restored = cloneSnapshot(this.snapshot!);
    this.phase = 'open';
    return restored;
  }

  commit(committedChecksum: string): CoreSpiritTransactionRecord {
    if (this.phase !== 'open') throw new Error('commit requires an open transaction');
    this.phase = 'committed';
    return {
      runId: this.snapshot!.runId,
      barIndex: this.snapshot!.barIndex,
      revision: this.snapshot!.revision,
      beginChecksum: this.snapshot!.checksum,
      revisionChecksums: [...this.revisionChecksums],
      committedChecksum,
      rollbackCount: this.rollbackCount,
      committed: true,
    };
  }

  getPhase(): CoreSpiritTransactionPhase { return this.phase; }

  getSnapshot(): CoreSpiritTransactionSnapshot<State> | undefined {
    return this.snapshot ? cloneSnapshot(this.snapshot) : undefined;
  }
}

function cloneSnapshot<State>(snapshot: CoreSpiritTransactionSnapshot<State>): CoreSpiritTransactionSnapshot<State> {
  return { ...snapshot, state: cloneValue(snapshot.state) };
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
