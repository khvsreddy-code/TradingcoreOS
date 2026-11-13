import assert from 'node:assert/strict';
import { ChartDataPlane } from './chartDataPlane';

type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Columns = {
  time: ArrayLike<number>;
  open: ArrayLike<number>;
  high: ArrayLike<number>;
  low: ArrayLike<number>;
  close: ArrayLike<number>;
  volume: ArrayLike<number>;
  timeUnit?: 'milliseconds' | 'seconds';
  source?: ArrayLike<string>;
  exchangeTime?: ArrayLike<number>;
  ingestedAt?: ArrayLike<number>;
  phase?: ArrayLike<string>;
  confirmed?: ArrayLike<boolean>;
  availableAt?: ArrayLike<number>;
  revision?: ArrayLike<number>;
  timeframe?: string;
};

type InternalPlane = {
  state: {
    candles: Candle[];
    columns?: Columns;
    compatibilityCandles: Candle[];
    compatibilityRevision: number;
    revision: number;
    historyReady: boolean;
  };
  canonicalPlane: {
    market: {
      append(row: { time: number; open: number; high: number; low: number; close: number; volume: number }): void;
    };
    read(): {
      time: Float64Array;
      open: Float64Array;
      high: Float64Array;
      low: Float64Array;
      close: Float64Array;
      volume: Float64Array;
    };
  };
  syncCanonical(): void;
  columnarSnapshot(latest?: Candle & {
    exchangeTimestamp?: string;
    ingestedAt?: string;
    timeframe?: string;
    phase?: string;
    confirmed?: boolean;
    source?: string;
    revision?: number;
  }, bucketChanged?: boolean): Columns;
  dispose(): void;
};

const PAGE_HISTORY = 10_000;
const FIVE_MINUTES_MS = 5 * 60_000;
const startMs = Date.parse('2026-10-14T03:45:00.000Z');

function makeHistory(): Candle[] {
  return Array.from({ length: PAGE_HISTORY }, (_, index) => {
    const open = 20_000 + index / 10;
    const close = open + 0.25;
    return {
      timestamp: new Date(startMs + index * FIVE_MINUTES_MS).toISOString(),
      open,
      high: close + 0.5,
      low: open - 0.5,
      close,
      volume: 1_000 + index,
    };
  });
}

function trackedArray<T>(values: T[]) {
  let numericReads = 0;
  const view = new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) numericReads += 1;
      return Reflect.get(target, property, receiver);
    },
  }) as ArrayLike<T>;
  return {
    view,
    reads: () => numericReads,
    reset: () => { numericReads = 0; },
  };
}

const plane = new ChartDataPlane('persistent-sidecar-contract', 'NSE:PERSISTENT-SIDECAR', '5m') as unknown as InternalPlane;
const history = makeHistory();
plane.state.candles = history;
plane.state.compatibilityCandles = history.slice();
plane.state.compatibilityRevision = 1;
plane.state.revision = 1;
plane.state.historyReady = true;
plane.syncCanonical();
const canonical = plane.canonicalPlane.read();
const finalTimestamp = Date.parse(history[history.length - 1]!.timestamp);

const source = trackedArray(Array<string>(PAGE_HISTORY).fill('fyers'));
const exchangeTime = trackedArray(Array.from({ length: PAGE_HISTORY }, (_, index) => startMs + index * FIVE_MINUTES_MS + 15_000));
const ingestedAt = trackedArray(Array.from({ length: PAGE_HISTORY }, (_, index) => startMs + index * FIVE_MINUTES_MS + 20_000));
const phases = Array<string>(PAGE_HISTORY).fill('confirmed');
phases[PAGE_HISTORY - 1] = 'developing';
const phase = trackedArray(phases);
const confirmations = Array<boolean>(PAGE_HISTORY).fill(true);
confirmations[PAGE_HISTORY - 1] = false;
const confirmed = trackedArray(confirmations);
const availableAt = trackedArray(Array<number>(PAGE_HISTORY).fill(Number.NaN));
const revisions = trackedArray(Array.from({ length: PAGE_HISTORY }, (_, index) => index + 1));

plane.state.columns = {
  time: canonical.time,
  open: canonical.open,
  high: canonical.high,
  low: canonical.low,
  close: canonical.close,
  volume: canonical.volume,
  timeUnit: 'seconds',
  source: source.view,
  exchangeTime: exchangeTime.view,
  ingestedAt: ingestedAt.view,
  phase: phase.view,
  confirmed: confirmed.view,
  availableAt: availableAt.view,
  revision: revisions.view,
  timeframe: '5minute',
};

const lastIndex = PAGE_HISTORY - 1;
const firstExchangeMs = finalTimestamp + 45_000;
const firstIngestedMs = finalTimestamp + 46_000;
const firstSnapshot = plane.columnarSnapshot({
  ...history[lastIndex]!,
  exchangeTimestamp: new Date(firstExchangeMs).toISOString(),
  ingestedAt: new Date(firstIngestedMs).toISOString(),
  timeframe: '5minute',
  phase: 'developing',
  confirmed: false,
  source: 'fyers',
  revision: PAGE_HISTORY + 1,
}, false);
plane.state.columns = firstSnapshot;

// The initial adoption is allowed to copy plain provider arrays once. Once the
// sidecars are persistent, later forming-bar updates must not enumerate history.
for (const tracked of [source, exchangeTime, ingestedAt, phase, confirmed, availableAt, revisions]) tracked.reset();

const secondExchangeMs = finalTimestamp + 55_000;
const secondIngestedMs = finalTimestamp + 56_000;
const secondSnapshot = plane.columnarSnapshot({
  ...history[lastIndex]!,
  exchangeTimestamp: new Date(secondExchangeMs).toISOString(),
  ingestedAt: new Date(secondIngestedMs).toISOString(),
  timeframe: '5minute',
  phase: 'developing',
  confirmed: false,
  source: 'fyers',
  revision: PAGE_HISTORY + 2,
}, false);

const steadyStateReads = [source, exchangeTime, ingestedAt, phase, confirmed, availableAt, revisions]
  .reduce((total, tracked) => total + tracked.reads(), 0);
assert.ok(
  steadyStateReads <= 8,
  `forming-bar metadata update enumerated historical sidecars (${steadyStateReads} indexed reads for ${PAGE_HISTORY} candles)`,
);
assert.notEqual(firstSnapshot.exchangeTime, secondSnapshot.exchangeTime, 'each revision must publish a new immutable sidecar view');
assert.equal(firstSnapshot.exchangeTime?.[lastIndex], firstExchangeMs, 'older snapshot must retain its exchange timestamp');
assert.equal(secondSnapshot.exchangeTime?.[lastIndex], secondExchangeMs, 'latest snapshot must expose the new exchange timestamp');
assert.equal(firstSnapshot.ingestedAt?.[lastIndex], firstIngestedMs, 'older snapshot must retain its ingestion timestamp');
assert.equal(secondSnapshot.ingestedAt?.[lastIndex], secondIngestedMs, 'latest snapshot must expose the new ingestion timestamp');
assert.equal(firstSnapshot.revision?.[lastIndex], PAGE_HISTORY + 1, 'older snapshot revision metadata must not be mutated');
assert.equal(secondSnapshot.revision?.[lastIndex], PAGE_HISTORY + 2);
assert.equal(firstSnapshot.phase?.[lastIndex], 'developing');
assert.equal(secondSnapshot.phase?.[lastIndex], 'developing');

// A bucket rollover confirms the prior forming candle and appends the new one.
// Both changes must clone each touched page only once, without changing snapshots
// already handed to consumers.
const nextTimeSeconds = canonical.time[lastIndex]! + 300;
plane.canonicalPlane.market.append({
  time: nextTimeSeconds,
  open: history[lastIndex]!.close,
  high: history[lastIndex]!.close + 1,
  low: history[lastIndex]!.close - 1,
  close: history[lastIndex]!.close + 0.5,
  volume: 500,
});
const nextTimestamp = new Date(nextTimeSeconds * 1000).toISOString();
const thirdExchangeMs = nextTimeSeconds * 1000 + 5_000;
const thirdSnapshot = plane.columnarSnapshot({
  timestamp: nextTimestamp,
  open: history[lastIndex]!.close,
  high: history[lastIndex]!.close + 1,
  low: history[lastIndex]!.close - 1,
  close: history[lastIndex]!.close + 0.5,
  volume: 500,
  exchangeTimestamp: new Date(thirdExchangeMs).toISOString(),
  ingestedAt: new Date(thirdExchangeMs + 100).toISOString(),
  timeframe: '5minute',
  phase: 'developing',
  confirmed: false,
  source: 'fyers',
  revision: PAGE_HISTORY + 3,
}, true);

assert.equal(secondSnapshot.phase?.[lastIndex], 'developing', 'previous snapshot must retain the forming phase');
assert.equal(secondSnapshot.confirmed?.[lastIndex], false, 'previous snapshot must retain its original confirmation flag');
assert.equal(thirdSnapshot.phase?.[lastIndex], 'confirmed', 'new snapshot must confirm the completed candle');
assert.equal(thirdSnapshot.confirmed?.[lastIndex], true, 'new snapshot must confirm the completed candle metadata');
assert.equal(thirdSnapshot.phase?.[PAGE_HISTORY], 'developing', 'new candle must begin in the developing phase');
assert.equal(thirdSnapshot.confirmed?.[PAGE_HISTORY], false, 'new candle must remain unconfirmed');
assert.equal(thirdSnapshot.exchangeTime?.[PAGE_HISTORY], thirdExchangeMs, 'new candle exchange time must be appended');
assert.equal(secondSnapshot.exchangeTime?.length, PAGE_HISTORY, 'prior snapshot length must remain unchanged');
assert.equal(thirdSnapshot.exchangeTime?.length, PAGE_HISTORY + 1, 'new snapshot must expose the appended candle');

plane.dispose();
console.log('CHART_DATA_PLANE_PERSISTENT_SIDECARS_CONTRACT_OK');
