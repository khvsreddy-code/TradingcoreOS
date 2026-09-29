/** Canonical lifecycle protocol shared by historical, replay, and realtime hosts. */
export type CoreSpiritExecutionPhase = 'idle' | 'historical' | 'realtime-evaluating' | 'realtime-rolled-back' | 'realtime-committed' | 'replay';

export interface CoreSpiritExecutionIdentity {
  runId: string;
  programChecksum?: string;
  datasetId?: string;
}

export interface CoreSpiritBarLifecycle {
  phase: CoreSpiritExecutionPhase;
  barIndex: number;
  timestamp: number;
  revision: number;
  confirmed: boolean;
}

export const CORE_SPIRIT_LIFECYCLE_RULES = Object.freeze({
  historicalBarsAreConfirmed: true,
  replayBarsAreConfirmed: true,
  realtimeStartsUnconfirmed: true,
  realtimeRevisionRequiresRollbackOfPriorRevision: true,
  commitCreatesConfirmedState: true,
  rollbackDoesNotAdvanceConfirmedHistory: true,
});
