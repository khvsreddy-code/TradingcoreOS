import type { CoreSpiritAlignedPoint, CoreSpiritDataSnapshot, CoreSpiritIntrabar, CoreSpiritIntrabarSeries } from './types';

export type CoreSpiritIntrabarCalendar = Readonly<{
  /** Expected lower-timeframe bar opens in [startTimestamp, endTimestamp), in milliseconds. */
  expectedTimestamps: (startTimestamp: number, endTimestamp: number, lowerTimeframeMs: number) => readonly number[];
}>;

export type CoreSpiritTimeframeAlignmentOptions = Readonly<{
  /** Higher-timeframe alignment defaults to confirmed data in alignTimeframeSnapshots. */
  confirmedOnly?: boolean;
  /** Needed to prove lower-timeframe completeness. Without it, completeness is false. */
  lowerTimeframeMs?: number;
  /** Exchange calendar excludes holidays, overnight closures and scheduled breaks. */
  calendar?: CoreSpiritIntrabarCalendar;
}>;

function confirmed(snapshot: CoreSpiritDataSnapshot): boolean {
  if (snapshot.confirmationPhase) return snapshot.confirmationPhase === 'confirmed';
  return snapshot.state === 'confirmed' || snapshot.state === 'historical';
}

function compareRevision(a: CoreSpiritDataSnapshot, b: CoreSpiritDataSnapshot): number {
  const ar = a.dataRevision ?? a.revision;
  const br = b.dataRevision ?? b.revision;
  if (typeof ar === 'number' && typeof br === 'number') return ar - br;
  return String(ar ?? '').localeCompare(String(br ?? ''));
}

function canonicalTimeline(
  snapshots: readonly CoreSpiritDataSnapshot[],
  confirmedOnly: boolean,
): CoreSpiritDataSnapshot[] {
  const ordered = snapshots
    .filter(snapshot => snapshot.timestamp != null && Number.isFinite(Number(snapshot.timestamp)))
    .slice()
    .sort((a, b) => {
      const timestamp = Number(a.timestamp) - Number(b.timestamp);
      if (timestamp !== 0) return timestamp;
      const revision = compareRevision(a, b);
      if (revision !== 0) return revision;
      // Conflicting payloads with the same revision still have a deterministic
      // tie-break; data providers should never issue such duplicates.
      return JSON.stringify([a.value, a.source, a.state, a.confirmationPhase])
        .localeCompare(JSON.stringify([b.value, b.source, b.state, b.confirmationPhase]));
    });

  // Choose the latest revision at each timestamp BEFORE applying confirmation
  // policy. This prevents an old confirmed sample from resurfacing when a newer
  // revision explicitly marks that same candle as developing.
  const latestAtTimestamp: CoreSpiritDataSnapshot[] = [];
  for (const candidate of ordered) {
    const previous = latestAtTimestamp.at(-1);
    if (previous && Number(previous.timestamp) === Number(candidate.timestamp)) latestAtTimestamp[latestAtTimestamp.length - 1] = candidate;
    else latestAtTimestamp.push(candidate);
  }
  return confirmedOnly ? latestAtTimestamp.filter(confirmed) : latestAtTimestamp;
}

/** Last-value carry-forward alignment. Never selects a future snapshot or invents a prehistory value. */
export function alignSnapshots(
  targetTimes: number[],
  snapshots: CoreSpiritDataSnapshot[],
  options: { confirmedOnly?: boolean } = {},
): CoreSpiritAlignedPoint[] {
  const ordered = canonicalTimeline(snapshots, options.confirmedOnly === true);
  return targetTimes.map(timestamp => {
    if (!Number.isFinite(timestamp)) return { timestamp, value:null, state:'historical' as const };
    let lo = 0, hi = ordered.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (Number(ordered[mid]!.timestamp) <= timestamp) lo = mid + 1;
      else hi = mid;
    }
    const current = lo > 0 ? ordered[lo - 1] : undefined;
    if (!current) return { timestamp, value:null, state:'historical' as const };
    return {
      timestamp,
      value:current.value,
      state:current.confirmationPhase === 'developing' ? 'developing' as const : current.state ?? 'historical' as const,
      source:current.source,
    };
  });
}

/**
 * Group lower-timeframe bars inside parent intervals. Completeness is evidence
 * based: without a child interval/calendar we do not claim completeness merely
 * because the last observed bar happens to precede the parent close.
 */
export function groupIntrabars(
  parentBars: Array<{ timestamp: number; endTimestamp?: number }>,
  intrabars: CoreSpiritIntrabar[],
  parentDurationMs: number,
  options: Pick<CoreSpiritTimeframeAlignmentOptions, 'lowerTimeframeMs' | 'calendar'> = {},
): CoreSpiritIntrabarSeries[] {
  if (!Number.isFinite(parentDurationMs) || parentDurationMs <= 0) throw new Error('parentDurationMs must be a positive finite number');
  const ordered = [...intrabars].filter(point => Number.isFinite(point.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const childMs = options.lowerTimeframeMs;
  if (childMs != null && (!Number.isFinite(childMs) || childMs <= 0)) throw new Error('lowerTimeframeMs must be a positive finite number');

  return parentBars.map(parent => {
    const end = parent.endTimestamp ?? parent.timestamp + parentDurationMs;
    const points = ordered.filter(point => point.timestamp >= parent.timestamp && point.timestamp < end);
    let complete = false;
    if (childMs != null) {
      const expected = options.calendar
        ? [...options.calendar.expectedTimestamps(parent.timestamp, end, childMs)]
        : Array.from(
            { length: Math.max(0, Math.ceil((end - parent.timestamp) / childMs)) },
            (_, index) => parent.timestamp + index * childMs,
          ).filter(timestamp => timestamp < end);
      if (options.calendar && expected.length === 0) {
        // A calendar-confirmed holiday/session closure has no expected bars.
        complete = points.length === 0;
      } else {
        const present = new Set(points.map(point => point.timestamp));
        complete = expected.length > 0 && expected.every(timestamp => present.has(timestamp));
      }
    }
    return {
      parentTimestamp: parent.timestamp,
      timeframe: String(parentDurationMs) + 'ms',
      points,
      complete,
      source: 'aligned-ltf',
    };
  });
}

/** Higher-timeframe values are confirmed-only by default. Developing data requires explicit opt-in. */
export function alignTimeframeSnapshots(
  targetTimes: number[],
  snapshots: CoreSpiritDataSnapshot[],
  options: { confirmedOnly?: boolean } = {},
): CoreSpiritAlignedPoint[] {
  return alignSnapshots(targetTimes, snapshots, { confirmedOnly: options.confirmedOnly !== false });
}
