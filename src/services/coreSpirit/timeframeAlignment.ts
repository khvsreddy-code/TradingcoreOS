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

function nominalTimeframeSeconds(value: string): number {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) return Number(raw) * 60;
  const match = /^(\d+)\s*(m|min|minute|h|hr|hour|d|day)$/i.exec(raw);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (unit === 'm' || unit === 'min' || unit === 'minute') return amount * 60;
  if (unit === 'h' || unit === 'hr' || unit === 'hour') return amount * 3600;
  return amount * 86400;
}

function closeTimestamp(snapshot: CoreSpiritDataSnapshot): number | undefined {
  if (snapshot.closeTimestamp != null) return Number(snapshot.closeTimestamp);
  if (snapshot.timestamp == null) return undefined;
  const duration = nominalTimeframeSeconds(snapshot.timeframe);
  return duration > 0 ? Number(snapshot.timestamp) + duration : undefined;
}

function confirmed(snapshot: CoreSpiritDataSnapshot): boolean {
  if (snapshot.confirmationPhase === 'developing' ||
      snapshot.state === 'developing' || snapshot.state === 'realtime') return false;
  if (snapshot.confirmationPhase === 'confirmed') {
    return snapshot.state == null || snapshot.state === 'confirmed' || snapshot.state === 'historical';
  }
  return snapshot.state === 'confirmed' || snapshot.state === 'historical';
}

function eligibleAt(snapshot: CoreSpiritDataSnapshot, targetTimestamp: number, confirmedOnly: boolean): boolean {
  if (snapshot.timestamp == null || Number(snapshot.timestamp) > targetTimestamp) return false;
  if (!confirmedOnly) return true;
  if (!confirmed(snapshot)) return false;
  const close = closeTimestamp(snapshot);
  return close != null && Number.isFinite(close) && close <= targetTimestamp;
}

function compareRevision(a: CoreSpiritDataSnapshot, b: CoreSpiritDataSnapshot): number {
  // revision is the ordered sample revision. dataRevision is primarily a cache
  // identity and may be an opaque hash/string, so it must not outrank sequence.
  if (typeof a.revision === 'number' && typeof b.revision === 'number' && a.revision !== b.revision) {
    return a.revision - b.revision;
  }
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
    .filter(snapshot =>
      snapshot.timestamp != null &&
      Number.isFinite(Number(snapshot.timestamp)) &&
      (snapshot.closeTimestamp == null ||
        (Number.isFinite(Number(snapshot.closeTimestamp)) && Number(snapshot.closeTimestamp) >= Number(snapshot.timestamp))),
    )
    .slice()
    .sort((a, b) => {
      const timestamp = Number(a.timestamp) - Number(b.timestamp);
      if (timestamp !== 0) return timestamp;
      const revision = compareRevision(a, b);
      if (revision !== 0) return revision;
      // Conflicting payloads with the same revision still have a deterministic
      // tie-break; data providers should never issue such duplicates.
      return JSON.stringify([a.value, a.source, a.state, a.confirmationPhase, a.closeTimestamp])
        .localeCompare(JSON.stringify([b.value, b.source, b.state, b.confirmationPhase, b.closeTimestamp]));
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
    const confirmedOnly = options.confirmedOnly === true;
    let index = lo - 1;
    while (index >= 0 && !eligibleAt(ordered[index]!, timestamp, confirmedOnly)) index -= 1;
    const current = index >= 0 ? ordered[index] : undefined;
    if (!current) return { timestamp, value:null, state:'historical' as const };
    const currentCloseTimestamp = closeTimestamp(current);
    const closeNotReached = currentCloseTimestamp == null || currentCloseTimestamp > timestamp;
    const isDeveloping = !confirmed(current) || closeNotReached;
    return {
      timestamp,
      value:current.value,
      state:isDeveloping ? 'developing' as const : current.state ?? 'historical' as const,
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
    if (!Number.isFinite(parent.timestamp)) throw new Error('parent bar timestamp must be finite');
    const end = parent.endTimestamp ?? parent.timestamp + parentDurationMs;
    if (!Number.isFinite(end) || end <= parent.timestamp) throw new Error('parent bar end must be finite and after its start');
    const points = ordered.filter(point => point.timestamp >= parent.timestamp && point.timestamp < end);
    let complete = false;
    if (childMs != null) {
      const expectedRaw = options.calendar
        ? [...options.calendar.expectedTimestamps(parent.timestamp, end, childMs)]
        : Array.from(
            { length: Math.floor((end - parent.timestamp) / childMs) },
            (_, index) => parent.timestamp + index * childMs,
          );
      const expected = [...expectedRaw].sort((a,b)=>a-b);
      // Without a calendar, completeness is provable only when the parent
      // interval is an exact multiple of the child interval.
      const regularGridCoversInterval = Boolean(options.calendar) || (end - parent.timestamp) % childMs === 0;
      const expectedSet = new Set(expected);
      const uniquePoints = new Set(points.map(point=>point.timestamp));
      const expectedIsValid = expected.every(timestamp =>
        Number.isFinite(timestamp) && timestamp >= parent.timestamp && timestamp < end,
      ) && expectedSet.size === expected.length;
      const observationsAreValid = uniquePoints.size === points.length &&
        points.every(point=>expectedSet.has(point.timestamp));
      if (expected.length === 0 && options.calendar && expectedIsValid) {
        // A calendar-confirmed holiday/session closure has no expected bars.
        complete = points.length === 0;
      } else {
        complete = expected.length > 0 && regularGridCoversInterval && expectedIsValid && observationsAreValid &&
          expected.every(timestamp => uniquePoints.has(timestamp));
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
