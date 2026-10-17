/** Stable replay contract: immutable dataset + validated executable artifact. */
export const CORE_SPIRIT_REPLAY_VERSION = 1 as const;

export interface ReplayDatasetIdentity {
  datasetId: string;
  symbol: string;
  timeframe: string;
  startTimestamp: number;
  endTimestamp: number;
  rowCount: number;
}
export interface ReplayChecksums {
  artifact: string;
  outputs: string;
  state: string;
  trace: string;
}
export interface ReplayBarResult {
  barIndex: number;
  timestamp: number;
  outputChecksum: string;
  stateChecksum: string;
  traceChecksum: string;
}
export interface CoreSpiritReplayResult {
  version: typeof CORE_SPIRIT_REPLAY_VERSION;
  dataset: ReplayDatasetIdentity;
  programChecksum: string;
  checksums: ReplayChecksums;
  bars: readonly ReplayBarResult[];
}

export type ReplayParityField =
  | 'version'
  | 'dataset.datasetId'
  | 'dataset.symbol'
  | 'dataset.timeframe'
  | 'dataset.startTimestamp'
  | 'dataset.endTimestamp'
  | 'dataset.rowCount'
  | 'programChecksum'
  | 'checksums.artifact'
  | 'checksums.outputs'
  | 'checksums.state'
  | 'checksums.trace'
  | 'bars.length'
  | 'barIndex'
  | 'timestamp'
  | 'outputChecksum'
  | 'stateChecksum'
  | 'traceChecksum';

export interface ReplayParityMismatch {
  field: ReplayParityField;
  barIndex?: number;
  reference: string | number;
  candidate: string | number;
}

export interface CoreSpiritExecutionParityReport {
  passed: boolean;
  referenceProgramChecksum: string;
  candidateProgramChecksum: string;
  referenceDatasetId: string;
  candidateDatasetId: string;
  comparedBars: number;
  mismatchCount: number;
  /** Bounded diagnostics; mismatchCount still reports the full total. */
  mismatches: readonly ReplayParityMismatch[];
}

/**
 * Compare two executions captured under the same normalized bar-close contract.
 * The inputs can represent historical replay and a recorded live/paper run.
 * This verifies provenance alignment and pinpoints the first divergent bar;
 * it intentionally does not assume that different datasets or programs are comparable.
 */
export function compareCoreSpiritExecutionParity(
  reference: CoreSpiritReplayResult,
  candidate: CoreSpiritReplayResult,
  maxReportedMismatches = 100,
): CoreSpiritExecutionParityReport {
  if (!Number.isInteger(maxReportedMismatches) || maxReportedMismatches < 1 || maxReportedMismatches > 1000) {
    throw new Error('maxReportedMismatches must be an integer between 1 and 1000.');
  }

  const mismatches: ReplayParityMismatch[] = [];
  let mismatchCount = 0;
  const add = (
    field: ReplayParityField,
    a: string | number,
    b: string | number,
    barIndex?: number,
  ) => {
    if (a === b) return;
    mismatchCount += 1;
    if (mismatches.length < maxReportedMismatches) {
      mismatches.push(Object.freeze({ field, reference: a, candidate: b, ...(barIndex === undefined ? {} : { barIndex }) }));
    }
  };

  add('version', reference.version, candidate.version);
  add('dataset.datasetId', reference.dataset.datasetId, candidate.dataset.datasetId);
  add('dataset.symbol', reference.dataset.symbol, candidate.dataset.symbol);
  add('dataset.timeframe', reference.dataset.timeframe, candidate.dataset.timeframe);
  add('dataset.startTimestamp', reference.dataset.startTimestamp, candidate.dataset.startTimestamp);
  add('dataset.endTimestamp', reference.dataset.endTimestamp, candidate.dataset.endTimestamp);
  add('dataset.rowCount', reference.dataset.rowCount, candidate.dataset.rowCount);
  add('programChecksum', reference.programChecksum, candidate.programChecksum);
  add('checksums.artifact', reference.checksums.artifact, candidate.checksums.artifact);
  add('checksums.outputs', reference.checksums.outputs, candidate.checksums.outputs);
  add('checksums.state', reference.checksums.state, candidate.checksums.state);
  add('checksums.trace', reference.checksums.trace, candidate.checksums.trace);
  add('bars.length', reference.bars.length, candidate.bars.length);

  const length = Math.max(reference.bars.length, candidate.bars.length);
  for (let index = 0; index < length; index += 1) {
    const a = reference.bars[index];
    const b = candidate.bars[index];
    if (!a || !b) {
      // bars.length already diagnoses the structural difference.
      continue;
    }
    add('barIndex', a.barIndex, b.barIndex, index);
    add('timestamp', a.timestamp, b.timestamp, index);
    add('outputChecksum', a.outputChecksum, b.outputChecksum, index);
    add('stateChecksum', a.stateChecksum, b.stateChecksum, index);
    add('traceChecksum', a.traceChecksum, b.traceChecksum, index);
  }

  return Object.freeze({
    passed: mismatchCount === 0,
    referenceProgramChecksum: reference.programChecksum,
    candidateProgramChecksum: candidate.programChecksum,
    referenceDatasetId: reference.dataset.datasetId,
    candidateDatasetId: candidate.dataset.datasetId,
    comparedBars: Math.min(reference.bars.length, candidate.bars.length),
    mismatchCount,
    mismatches: Object.freeze(mismatches),
  });
}

export function replayIsDeterministic(a: CoreSpiritReplayResult, b: CoreSpiritReplayResult): boolean {
  return compareCoreSpiritExecutionParity(a, b).passed;
}
