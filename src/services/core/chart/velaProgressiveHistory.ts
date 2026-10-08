import type { OHLCV } from './velaChartFacade';

function sameBar(a: OHLCV, b: OHLCV): boolean {
  return a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    (a.volume ?? undefined) === (b.volume ?? undefined);
}

/**
 * Vela progressive-history snapshots are cumulative: the previous snapshot must
 * remain an unchanged suffix of the next snapshot. This catches accidental quote
 * seeding, forming-bar mutation, duplicate/reordered timestamps, and truncation.
 */
export function assertCumulativeProgressiveHistory(previous: readonly OHLCV[], next: readonly OHLCV[]): void {
  if (next.length < previous.length) {
    throw new Error('Non-cumulative Vela history snapshot: ' + next.length + ' bars after ' + previous.length + '.');
  }
  const offset = next.length - previous.length;
  for (let i = 0; i < previous.length; i += 1) {
    const expected = previous[i]!;
    const actual = next[offset + i]!;
    if (!actual || !sameBar(expected, actual)) {
      throw new Error('Non-cumulative Vela history snapshot at suffix index ' + i + ' (previous=' + expected.time + ', next=' + (actual?.time ?? 'missing') + ').');
    }
  }
  for (let i = 1; i < next.length; i += 1) {
    if (!(next[i - 1]!.time < next[i]!.time)) {
      throw new Error('Invalid Vela history snapshot ordering at index ' + i + ': timestamps must be strictly ascending.');
    }
  }
}

export function createProgressiveHistoryEmitter(
  onBatch: (bars: OHLCV[]) => void,
): (bars: OHLCV[]) => void {
  let previous: readonly OHLCV[] = [];
  return (bars: OHLCV[]) => {
    const next = bars.slice();
    assertCumulativeProgressiveHistory(previous, next);
    onBatch(next);
    previous = next;
  };
}
