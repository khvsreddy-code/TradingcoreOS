/**
 * CoreSpirit/Pine reference conformance laboratory.
 *
 * This module consumes independently captured Pine reference traces and
 * CoreSpirit traces. It does not pretend to run TradingView's Pine engine.
 * The reference adapter may ingest exported fixtures produced by a pinned
 * TradingView/Pine execution harness.
 */
export type CoreSpiritConformanceScalar = number | string | boolean | null;
export type CoreSpiritConformanceBar = Readonly<{
  barIndex: number;
  timestamp: number;
  /** Revision order allows the same forming candle to be compared across ticks. */
  revision?: number;
  phase: 'historical' | 'forming' | 'confirmed' | 'correction' | 'replay';
  series: Readonly<Record<string, CoreSpiritConformanceScalar>>;
}>;
export type CoreSpiritConformanceDataSample = Readonly<{
  id: string;
  symbol: string;
  timeframe: string;
  field: string;
  asOfTimestamp: number;
  sampleTimestamp: number;
  closeTimestamp: number;
  value: CoreSpiritConformanceScalar;
  confirmation: 'confirmed' | 'developing';
}>;
export type CoreSpiritConformanceDrawingChange = Readonly<{
  sequence: number;
  action: 'create' | 'update' | 'extend' | 'delete';
  objectId: string;
  kind: string;
  barIndex: number;
  timestamp: number;
  geometry?: Readonly<Record<string, unknown>>;
}>;
export type CoreSpiritConformanceEvent = Readonly<{
  sequence: number;
  eventId: string;
  kind: 'alert' | 'signal' | 'strategy';
  name: string;
  barIndex: number;
  timestamp: number;
  phase: 'historical' | 'forming' | 'confirmed' | 'correction' | 'replay';
  isConfirmed: boolean;
  side?: 'long' | 'short' | 'flat';
}>;
export type CoreSpiritConformanceTrace = Readonly<{
  engine: 'pine-reference' | 'corespirit';
  engineVersion: string;
  symbol: string;
  timeframe: string;
  inputChecksum: string;
  parametersChecksum: string;
  bars: readonly CoreSpiritConformanceBar[];
  dataSamples?: readonly CoreSpiritConformanceDataSample[];
  drawings?: readonly CoreSpiritConformanceDrawingChange[];
  events?: readonly CoreSpiritConformanceEvent[];
}>;

export type CoreSpiritConformanceMismatch = Readonly<{
  category: 'dataset' | 'bar-alignment' | 'series-value' | 'na-state' | 'mtf-alignment' | 'drawing-lifecycle' | 'event-timing';
  key: string;
  barIndex?: number;
  expected?: unknown;
  actual?: unknown;
  reason: string;
}>;
export type CoreSpiritConformanceResult = Readonly<{
  passed: boolean;
  comparedBars: number;
  comparedSeriesValues: number;
  comparedDataSamples: number;
  comparedDrawingChanges: number;
  comparedEvents: number;
  mismatchCount: number;
  mismatches: readonly CoreSpiritConformanceMismatch[];
}>;

const isNa = (value: unknown): boolean =>
  value == null || (typeof value === 'number' && Number.isNaN(value));

function sameNumber(left: number, right: number, tolerance: number): boolean {
  if (Object.is(left, right)) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function sameValue(left: unknown, right: unknown, tolerance: number): boolean {
  if (isNa(left) || isNa(right)) return isNa(left) && isNa(right);
  if (typeof left === 'number' && typeof right === 'number') return sameNumber(left, right, tolerance);
  return Object.is(left, right);
}

function stableKeys(value: unknown): string[] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).sort()
    : [];
}

function sameGeometry(left: unknown, right: unknown, tolerance: number): boolean {
  if (sameValue(left, right, tolerance)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameGeometry(value, right[index], tolerance));
  }
  const leftKeys = stableKeys(left), rightKeys = stableKeys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  if (!leftKeys.length) return false;
  return leftKeys.every(key => sameGeometry(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
    tolerance,
  ));
}

/**
 * Compare per-bar values, NA/initialization, higher-timeframe causal alignment,
 * drawing lifecycle operations and alert/strategy event timing.
 */
export function compareCoreSpiritConformance(
  reference: CoreSpiritConformanceTrace,
  candidate: CoreSpiritConformanceTrace,
  options: { numericTolerance?: number; maxMismatches?: number } = {},
): CoreSpiritConformanceResult {
  const tolerance = Number(options.numericTolerance ?? 1e-9);
  const maxMismatches = Number(options.maxMismatches ?? 200);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('numericTolerance must be finite and non-negative');
  if (!Number.isSafeInteger(maxMismatches) || maxMismatches < 1 || maxMismatches > 10_000) throw new Error('maxMismatches must be a positive integer no greater than 10000');
  const mismatches: CoreSpiritConformanceMismatch[] = [];
  let mismatchCount = 0;
  const add = (item: CoreSpiritConformanceMismatch) => {
    mismatchCount += 1;
    if (mismatches.length < maxMismatches) mismatches.push(item);
  };

  if (reference.engine !== 'pine-reference' || candidate.engine !== 'corespirit') {
    add({ category: 'dataset', key: 'engine', expected: 'pine-reference', actual: reference.engine, reason: 'Reference and candidate engines are mislabeled.' });
  }
  for (const key of ['symbol', 'timeframe', 'inputChecksum', 'parametersChecksum'] as const) {
    if (reference[key] !== candidate[key]) {
      add({ category: 'dataset', key, expected: reference[key], actual: candidate[key], reason: 'Reference and candidate must execute the same symbol, timeframe, inputs and parameters.' });
    }
  }

  if (reference.bars.length !== candidate.bars.length) {
    add({ category: 'bar-alignment', key: 'bars.length', expected: reference.bars.length, actual: candidate.bars.length, reason: 'Reference and candidate bar counts differ.' });
  }
  const bars = Math.min(reference.bars.length, candidate.bars.length);
  const seriesNames = [...new Set(reference.bars.flatMap(bar => Object.keys(bar.series)))].sort();
  const candidateSeriesNames = [...new Set(candidate.bars.flatMap(bar => Object.keys(bar.series)))].sort();
  for (const name of [...new Set([...seriesNames, ...candidateSeriesNames])].sort()) {
    if (!seriesNames.includes(name) || !candidateSeriesNames.includes(name)) {
      add({ category: 'series-value', key: name, expected: seriesNames.includes(name), actual: candidateSeriesNames.includes(name), reason: 'A plotted/calculated series is missing from one execution.' });
    }
  }

  let comparedSeriesValues = 0;
  for (let index = 0; index < bars; index += 1) {
    const expected = reference.bars[index]!;
    const actual = candidate.bars[index]!;
    if (expected.barIndex !== actual.barIndex || expected.timestamp !== actual.timestamp || expected.revision !== actual.revision || expected.phase !== actual.phase) {
      add({ category: 'bar-alignment', key: 'bar:' + index, barIndex: expected.barIndex, expected, actual, reason: 'Bar index, timestamp, revision or execution phase differs.' });
    }
    for (const name of seriesNames) {
      const hasExpected = Object.prototype.hasOwnProperty.call(expected.series, name);
      const hasActual = Object.prototype.hasOwnProperty.call(actual.series, name);
      if (hasExpected !== hasActual) {
        add({ category: 'series-value', key: name, barIndex: expected.barIndex, expected: hasExpected, actual: hasActual, reason: 'Series value was omitted on one bar.' });
        continue;
      }
      if (!hasExpected) continue;
      comparedSeriesValues += 1;
      const expectedValue = expected.series[name];
      const actualValue = actual.series[name];
      if (isNa(expectedValue) !== isNa(actualValue)) {
        add({ category: 'na-state', key: name, barIndex: expected.barIndex, expected: expectedValue, actual: actualValue, reason: 'Pine NA/initialization state differs from CoreSpirit.' });
      } else if (!sameValue(expectedValue, actualValue, tolerance)) {
        add({ category: 'series-value', key: name, barIndex: index, expected: expectedValue, actual: actualValue, reason: 'Numerical series value differs beyond the configured tolerance.' });
      }
    }
  }

  const expectedSamples = reference.dataSamples ?? [];
  const actualSamples = candidate.dataSamples ?? [];
  if (expectedSamples.length !== actualSamples.length) {
    add({ category: 'mtf-alignment', key: 'samples.length', expected: expectedSamples.length, actual: actualSamples.length, reason: 'Higher/lower-timeframe sample counts differ.' });
  }
  const dataCount = Math.min(expectedSamples.length, actualSamples.length);
  for (let index = 0; index < dataCount; index += 1) {
    const e = expectedSamples[index]!, a = actualSamples[index]!;
    const sameIdentity = e.id === a.id && e.symbol === a.symbol && e.timeframe === a.timeframe && e.field === a.field
      && e.asOfTimestamp === a.asOfTimestamp && e.sampleTimestamp === a.sampleTimestamp
      && e.closeTimestamp === a.closeTimestamp && e.confirmation === a.confirmation;
    if (!sameIdentity) {
      add({ category: 'mtf-alignment', key: e.id || String(index), expected: e, actual: a, reason: 'MTF symbol/timeframe alignment, source candle or confirmation phase differs.' });
    }
    if (a.closeTimestamp > a.asOfTimestamp || a.confirmation !== 'confirmed') {
      add({ category: 'mtf-alignment', key: a.id, expected: 'confirmed sample closed by as-of time', actual: a, reason: 'Candidate MTF sample introduces a developing or future-looking value.' });
    }
    if (!sameValue(e.value, a.value, tolerance)) {
      add({ category: 'mtf-alignment', key: a.id, expected: e.value, actual: a.value, reason: 'Aligned timeframe value differs.' });
    }
  }

  const expectedDrawings = [...(reference.drawings ?? [])].sort((a,b) => a.sequence - b.sequence);
  const actualDrawings = [...(candidate.drawings ?? [])].sort((a,b) => a.sequence - b.sequence);
  if (expectedDrawings.length !== actualDrawings.length) {
    add({ category: 'drawing-lifecycle', key: 'drawings.length', expected: expectedDrawings.length, actual: actualDrawings.length, reason: 'Drawing lifecycle operation counts differ.' });
  }
  const drawingCount = Math.min(expectedDrawings.length, actualDrawings.length);
  for (let index = 0; index < drawingCount; index += 1) {
    const e = expectedDrawings[index]!, a = actualDrawings[index]!;
    if (e.sequence !== a.sequence || e.action !== a.action || e.objectId !== a.objectId || e.kind !== a.kind
      || e.barIndex !== a.barIndex || e.timestamp !== a.timestamp || !sameGeometry(e.geometry, a.geometry, tolerance)) {
      add({ category: 'drawing-lifecycle', key: e.objectId || String(index), expected: e, actual: a, reason: 'Drawing create/update/extend/delete order, identity, anchor or geometry differs.' });
    }
  }

  const expectedEvents = [...(reference.events ?? [])].sort((a,b) => a.sequence - b.sequence);
  const actualEvents = [...(candidate.events ?? [])].sort((a,b) => a.sequence - b.sequence);
  if (expectedEvents.length !== actualEvents.length) {
    add({ category: 'event-timing', key: 'events.length', expected: expectedEvents.length, actual: actualEvents.length, reason: 'Alert/strategy event counts differ.' });
  }
  const eventCount = Math.min(expectedEvents.length, actualEvents.length);
  for (let index = 0; index < eventCount; index += 1) {
    const e = expectedEvents[index]!, a = actualEvents[index]!;
    if (e.sequence !== a.sequence || e.eventId !== a.eventId || e.kind !== a.kind || e.name !== a.name
      || e.barIndex !== a.barIndex || e.timestamp !== a.timestamp || e.phase !== a.phase
      || e.isConfirmed !== a.isConfirmed || e.side !== a.side) {
      add({ category: 'event-timing', key: e.eventId || String(index), expected: e, actual: a, reason: 'Alert/strategy event time, bar, phase, side or confirmation timing differs.' });
    }
    if (a.kind === 'strategy' && (!a.isConfirmed || a.phase !== 'confirmed')) {
      add({ category: 'event-timing', key: a.eventId, expected: 'confirmed strategy event', actual: a, reason: 'A candidate strategy event is not confirmed and cannot become an order trigger.' });
    }
  }

  return Object.freeze({
    passed: mismatchCount === 0,
    comparedBars: bars,
    comparedSeriesValues,
    comparedDataSamples: dataCount,
    comparedDrawingChanges: drawingCount,
    comparedEvents: eventCount,
    mismatchCount,
    mismatches: Object.freeze(mismatches),
  });
}
