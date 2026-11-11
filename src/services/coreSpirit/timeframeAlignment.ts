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

function timeframeIdentity(snapshot: CoreSpiritDataSnapshot): string {
  const raw = String(snapshot.timeframe ?? '').trim().toLowerCase();
  const duration = nominalTimeframeSeconds(raw);
  return duration > 0 ? 'seconds:' + duration : 'raw:' + raw;
}

function snapshotTieBreak(snapshot: CoreSpiritDataSnapshot): string {
  return JSON.stringify([
    snapshot.value, snapshot.source, snapshot.state,
    snapshot.confirmationPhase, snapshot.closeTimestamp, snapshot.dataRevision,
  ]);
}

function canonicalTimeline(
  snapshots: readonly CoreSpiritDataSnapshot[],
  confirmedOnly: boolean,
): CoreSpiritDataSnapshot[] {
  // A candle's identity includes its symbol and timeframe. A 1m and 5m candle
  // can share an open timestamp without being revisions of the same candle.
  // Canonicalize aliases such as "5" and "5m" before fencing revisions.
  const latestByCandle = new Map<string, CoreSpiritDataSnapshot>();
  for (const candidate of snapshots) {
    const timestamp = Number(candidate.timestamp);
    if (candidate.timestamp == null || !Number.isFinite(timestamp) ||
        (candidate.closeTimestamp != null &&
          (!Number.isFinite(Number(candidate.closeTimestamp)) || Number(candidate.closeTimestamp) < timestamp))) continue;
    const identity = [
      String(candidate.symbol ?? '').trim().toUpperCase(),
      timeframeIdentity(candidate),
      timestamp,
    ].join('|');
    const previous = latestByCandle.get(identity);
    if (!previous) {
      latestByCandle.set(identity, candidate);
      continue;
    }
    const revisionOrder = compareRevision(candidate, previous);
    if (revisionOrder > 0 || (revisionOrder === 0 &&
        snapshotTieBreak(candidate).localeCompare(snapshotTieBreak(previous)) > 0)) {
      latestByCandle.set(identity, candidate);
    }
  }

  // Revision fencing must happen before confirmation filtering, otherwise an
  // older confirmed revision could reappear after a newer developing update.
  // Confirmed alignments are ordered by their actual availability/close boundary;
  // non-confirmed alignments are ordered by candle open so developing values can
  // be observed from their opening timestamp.
  const ordered = [...latestByCandle.values()]
    .filter(snapshot => !confirmedOnly || confirmed(snapshot))
    .sort((a, b) => {
      const aOpen = Number(a.timestamp);
      const bOpen = Number(b.timestamp);
      if (confirmedOnly) {
        const aClose = closeTimestamp(a) ?? Number.POSITIVE_INFINITY;
        const bClose = closeTimestamp(b) ?? Number.POSITIVE_INFINITY;
        if (aClose < bClose) return -1;
        if (aClose > bClose) return 1;
        // If two intervals close together, prefer the longer timeframe: it is
        // the higher-timeframe value whose finality was just established.
        const aDuration = Number.isFinite(aClose) ? aClose - aOpen : 0;
        const bDuration = Number.isFinite(bClose) ? bClose - bOpen : 0;
        if (aDuration !== bDuration) return aDuration - bDuration;
      } else {
        if (aOpen !== bOpen) return aOpen - bOpen;
        // At one opening boundary, longer intervals sort later and win the
        // last-value selection while still retaining their developing state.
        const aClose = closeTimestamp(a) ?? Number.NEGATIVE_INFINITY;
        const bClose = closeTimestamp(b) ?? Number.NEGATIVE_INFINITY;
        if (aClose < bClose) return -1;
        if (aClose > bClose) return 1;
      }
      const symbol = String(a.symbol ?? '').localeCompare(String(b.symbol ?? ''));
      if (symbol !== 0) return symbol;
      return timeframeIdentity(a).localeCompare(timeframeIdentity(b));
    });
  return ordered;
}

/** Last-value carry-forward alignment. Never selects a future snapshot or invents a prehistory value. */
export function alignSnapshots(
  targetTimes: number[],
  snapshots: CoreSpiritDataSnapshot[],
  options: { confirmedOnly?: boolean } = {},
): CoreSpiritAlignedPoint[] {
  const confirmedOnly = options.confirmedOnly === true;
  const ordered = canonicalTimeline(snapshots, confirmedOnly);
  return targetTimes.map(timestamp => {
    if (!Number.isFinite(timestamp)) return { timestamp, value:null, state:'historical' as const };
    // The canonical timeline is ordered by candle close when confirmation is
    // required, and by candle open when developing values are explicitly allowed.
    // Binary search must use the same ordering key or mixed timeframes can leak
    // a not-yet-closed higher-timeframe value into a historical target.
    let lo = 0, hi = ordered.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const snapshot = ordered[mid]!;
      const availableAt = confirmedOnly
        ? closeTimestamp(snapshot) ?? Number.POSITIVE_INFINITY
        : Number(snapshot.timestamp);
      if (availableAt <= timestamp) lo = mid + 1;
      else hi = mid;
    }
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
