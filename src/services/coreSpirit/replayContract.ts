/** Stable replay contract: immutable dataset + validated executable artifact. */
export const CORE_SPIRIT_REPLAY_VERSION = 1 as const;
export interface ReplayDatasetIdentity { datasetId: string; symbol: string; timeframe: string; startTimestamp: number; endTimestamp: number; rowCount: number; }
export interface ReplayChecksums { artifact: string; outputs: string; state: string; trace: string; }
export interface ReplayBarResult { barIndex: number; timestamp: number; outputChecksum: string; stateChecksum: string; traceChecksum: string; }
export interface CoreSpiritReplayResult { version: typeof CORE_SPIRIT_REPLAY_VERSION; dataset: ReplayDatasetIdentity; programChecksum: string; checksums: ReplayChecksums; bars: readonly ReplayBarResult[]; }
export function replayIsDeterministic(a: CoreSpiritReplayResult, b: CoreSpiritReplayResult): boolean {
  if (a.programChecksum !== b.programChecksum || a.checksums.outputs !== b.checksums.outputs || a.checksums.state !== b.checksums.state || a.checksums.trace !== b.checksums.trace || a.bars.length !== b.bars.length) return false;
  return a.bars.every((bar, i) => { const other = b.bars[i]; return bar.barIndex === other.barIndex && bar.timestamp === other.timestamp && bar.outputChecksum === other.outputChecksum && bar.stateChecksum === other.stateChecksum && bar.traceChecksum === other.traceChecksum; });
}
