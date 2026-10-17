import {
  compareCoreSpiritExecutionParity,
  replayIsDeterministic,
  type CoreSpiritReplayResult,
} from './replayContract.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(overrides: Partial<CoreSpiritReplayResult> = {}): CoreSpiritReplayResult {
  const base: CoreSpiritReplayResult = {
    version: 1,
    dataset: {
      datasetId: 'nifty-5m-confirmed-v1',
      symbol: 'NSE:NIFTY50-INDEX',
      timeframe: '5m',
      startTimestamp: 1_790_000_000_000,
      endTimestamp: 1_790_001_200_000,
      rowCount: 5,
    },
    programChecksum: 'program-sha-256',
    checksums: {
      artifact: 'artifact-sha-256',
      outputs: 'outputs-100',
      state: 'state-100',
      trace: 'trace-100',
    },
    bars: Array.from({ length: 5 }, (_, barIndex) => ({
      barIndex,
      timestamp: 1_790_000_000_000 + barIndex * 300_000,
      outputChecksum: `output-${barIndex}`,
      stateChecksum: `state-${barIndex}`,
      traceChecksum: `trace-${barIndex}`,
    })),
  };
  return { ...base, ...overrides };
}

const historical = fixture();
const matchingLive = fixture({
  checksums: { ...historical.checksums },
  bars: historical.bars.map(bar => ({ ...bar })),
});
const matched = compareCoreSpiritExecutionParity(historical, matchingLive);
assert(matched.passed && matched.mismatchCount === 0 && matched.comparedBars === 5,
  'equivalent historical and captured-live runs must pass the parity contract');
assert(replayIsDeterministic(historical, matchingLive),
  'the deterministic replay shortcut must use the same strict contract');

const changedBars = historical.bars.map(bar => ({ ...bar }));
changedBars[3] = { ...changedBars[3]!, outputChecksum: 'output-diverged-at-bar-3' };
const divergentLive = fixture({
  checksums: { ...historical.checksums, outputs: 'outputs-changed' },
  bars: changedBars,
});
const divergent = compareCoreSpiritExecutionParity(historical, divergentLive);
assert(!divergent.passed && divergent.mismatchCount >= 2,
  'the parity contract must catch both aggregate and per-bar output divergence');
assert(divergent.mismatches.some(item => item.field === 'outputChecksum' && item.barIndex === 3),
  'the parity report must identify the first divergent bar and field');

const truncatedLive = fixture({
  dataset: { ...historical.dataset, rowCount: 4, endTimestamp: historical.bars[3]!.timestamp },
  bars: historical.bars.slice(0, 4),
});
const truncated = compareCoreSpiritExecutionParity(historical, truncatedLive);
assert(!truncated.passed && truncated.mismatches.some(item => item.field === 'bars.length'),
  'the parity contract must reject a missing bar rather than compare misaligned tails');

const otherProgram = fixture({ programChecksum: 'different-program' });
assert(!compareCoreSpiritExecutionParity(historical, otherProgram).passed,
  'a program/compiler artifact mismatch must block a parity pass');

const bounded = compareCoreSpiritExecutionParity(historical, divergentLive, 1);
assert(bounded.mismatchCount >= 2 && bounded.mismatches.length === 1,
  'parity diagnostics must stay bounded while reporting the full mismatch count');

let invalidBoundRejected = false;
try {
  compareCoreSpiritExecutionParity(historical, matchingLive, 0);
} catch {
  invalidBoundRejected = true;
}
assert(invalidBoundRejected, 'parity diagnostics require a bounded positive mismatch limit');

console.log('CORESPIRIT_REPLAY_EXECUTION_PARITY_OK');
