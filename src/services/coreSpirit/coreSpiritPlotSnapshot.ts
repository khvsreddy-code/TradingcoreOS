export type CoreSpiritPlotSnapshotPoint = Readonly<{ time: number; value: number | null }>;
export type CoreSpiritPlotSeriesPoint = Readonly<{ time: number; value?: number }>;
export type CoreSpiritPlotSeriesSink = { setData(points: readonly CoreSpiritPlotSeriesPoint[]): void; update(point: CoreSpiritPlotSeriesPoint): void };

function validPoint(point: CoreSpiritPlotSnapshotPoint): boolean {
  return Number.isFinite(point.time) && (point.value == null || Number.isFinite(point.value));
}

function asSeriesPoint(point: CoreSpiritPlotSnapshotPoint): CoreSpiritPlotSeriesPoint {
  return point.value == null ? { time: point.time } : { time: point.time, value: point.value };
}

function samePoint(left: { time: number; value?: number | null }, right: CoreSpiritPlotSnapshotPoint): boolean {
  const leftValue = left.value == null ? null : left.value;
  const rightValue = right.value == null ? null : right.value;
  return left.time === right.time && Object.is(leftValue, rightValue);
}

/**
 * Apply one plot snapshot without letting stale values survive an empty/invalid replacement.
 * Incremental updates are accepted only when the complete stable prefix matches; historical
 * corrections fall back to setData(). The current/forming bar is always replaced before append.
 */
export function applyCoreSpiritPlotSnapshot(
  series: CoreSpiritPlotSeriesSink,
  points: readonly CoreSpiritPlotSnapshotPoint[],
  current: readonly { time: number; value?: number | null }[],
): void {
  const valid = points.filter(validPoint);
  if (points.length === 0 || valid.length === 0) {
    // setData([]) is intentional even before the first successful population:
    // the caller must commit the empty snapshot, not keep an uncommitted prior frame.
    series.setData([]);
    return;
  }

  if (current.length === 0) {
    series.setData(valid.map(asSeriesPoint));
    return;
  }

  const lastInput = points[points.length - 1];
  if (!lastInput || !validPoint(lastInput)) {
    // An invalid tail cannot be interpreted as an incremental no-op: it may be a
    // malformed full replacement. Filter and replace so rejected values never leave old pixels.
    series.setData(valid.map(asSeriesPoint));
    return;
  }

  const incomingByTime = new Map<number, CoreSpiritPlotSnapshotPoint>();
  for (const point of valid) incomingByTime.set(point.time, point);
  const hasStablePrefix = (length: number): boolean => {
    if (points.length < length || valid.length < length) return false;
    for (let index = 0; index < length; index += 1) {
      const incoming = points[index];
      const existing = current[index];
      if (!incoming || !existing || !validPoint(incoming) || !samePoint(existing, incoming)) return false;
    }
    return true;
  };

  // Same length / same last timestamp: only the forming point may have changed.
  if (points.length === current.length && points[points.length - 1]?.time === current[current.length - 1]?.time &&
      hasStablePrefix(current.length - 1)) {
    series.update(asSeriesPoint(lastInput));
    return;
  }

  // Appending is safe only when every bar before the forming bar is identical and
  // the prior tail anchor remains at the same index. Replace that tail, then append.
  if (points.length > current.length && points[current.length - 1]?.time === current[current.length - 1]?.time &&
      hasStablePrefix(current.length - 1)) {
    const nextTail = points[current.length - 1];
    if (!nextTail || !validPoint(nextTail)) {
      series.setData(valid.map(asSeriesPoint));
      return;
    }
    series.update(asSeriesPoint(nextTail));
    let expectedPreviousTime = nextTail.time;
    for (let index = current.length; index < points.length; index += 1) {
      const point = points[index];
      if (!point || !validPoint(point) || point.time <= expectedPreviousTime) {
        series.setData(valid.map(asSeriesPoint));
        return;
      }
      series.update(asSeriesPoint(point));
      expectedPreviousTime = point.time;
    }
    return;
  }

  // Same-length corrections, prepends, gaps in time order, and other historical rewrites.
  series.setData(valid.map(asSeriesPoint));
}
