import assert from 'node:assert/strict';
import {
  alignSnapshots,
  alignTimeframeSnapshots,
  groupIntrabars,
} from './timeframeAlignment.ts';
import {
  alignHigherTimeframeSnapshot,
  synchronizeMarketSnapshots,
  validateSynchronizedSnapshot,
} from './multiSymbolTimeframe.ts';

const snapshots = [
  { symbol:'ALPHA', timeframe:'5m', timestamp:3000, value:30, source:'feed', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'1m', timestamp:1000, value:11, source:'feed', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'5m', timestamp:1000, value:10, source:'feed', state:'historical', revision:1 },
  // A later revision of the same candle marks it developing. The old confirmed
  // revision must not reappear when the timeline is filtered for confirmations.
  { symbol:'ALPHA', timeframe:'5m', timestamp:3000, value:33, source:'feed', state:'developing', revision:2, confirmationPhase:'developing' },
  { symbol:'ALPHA', timeframe:'5m', timestamp:2000, value:20, source:'feed', state:'confirmed', revision:1 },
];

const confirmedAligned = alignTimeframeSnapshots([500, 1300, 1800, 3300, 3500], snapshots);
assert.equal(confirmedAligned[0]?.value, null, 'alignment must not invent a value before the first confirmed observation');
assert.equal(confirmedAligned[1]?.value, 10, 'a 5m candle becomes available only at its close boundary');
assert.equal(confirmedAligned[2]?.value, 10, 'carry-forward uses only the last eligible confirmed observation');
assert.equal(confirmedAligned[3]?.value, 20, 'a developing revision must not resurrect an older confirmed revision at the same timestamp');
assert.equal(confirmedAligned[4]?.value, 20);
assert.deepEqual(
  alignTimeframeSnapshots([500, 1300, 1800, 3300, 3500], [...snapshots].reverse()),
  confirmedAligned,
  'batch order and delivery order must not change canonical aligned values',
);

const includesDeveloping = alignSnapshots([3000], snapshots, { confirmedOnly:false });
assert.equal(includesDeveloping[0]?.value, 33, 'explicit non-confirmed alignment may inspect the latest developing revision');

const closeBoundedSamples = [
  {symbol:'ALPHA',timeframe:'1D',timestamp:1000,closeTimestamp:1200,value:10,source:'calendar',state:'confirmed',confirmationPhase:'confirmed',revision:1},
  {symbol:'ALPHA',timeframe:'1D',timestamp:2000,closeTimestamp:4000,value:40,source:'calendar',state:'confirmed',confirmationPhase:'confirmed',revision:1},
];
assert.deepEqual(
  alignTimeframeSnapshots([1500,2500,4500], closeBoundedSamples).map(point=>point.value),
  [10,10,40],
  'a dataset-finalized higher-timeframe candle must remain unavailable before its canonical close boundary',
);
const explicitDevelopingClose = alignSnapshots([2500], closeBoundedSamples, {confirmedOnly:false})[0];
assert.equal(explicitDevelopingClose?.value,40);
assert.equal(explicitDevelopingClose?.state,'developing',
  'an explicitly developing value must be labeled developing before its close timestamp');
assert.deepEqual(
  alignTimeframeSnapshots([2500], [
    {...closeBoundedSamples[0], timestamp:2000, closeTimestamp:1000, value:999},
  ]).map(point=>point.value),
  [null],
  'a close boundary earlier than the candle open is malformed and must be rejected',
);

const reverseTargets = alignTimeframeSnapshots([3500, 1300, 500], snapshots);
assert.deepEqual(reverseTargets.map(point => point.value), [20, 10, null],
  'arbitrary target order must not change each target timestamp’s canonical answer');

const developingSnapshot = {
  symbol:'ALPHA', timeframe:'1D', timestamp:10_000, value:77,
  source:'feed', state:'developing', revision:9, confirmationPhase:'developing',
};
assert.equal(validateSynchronizedSnapshot(developingSnapshot, {
  asOfTimestamp:11_000, alignment:'exact', executionMode:'historical', maxStalenessMs:undefined,
}), null, 'historical exact alignment must reject developing higher-timeframe values');
assert.equal(validateSynchronizedSnapshot(developingSnapshot, {
  asOfTimestamp:11_000, alignment:'developing', executionMode:'realtime', maxStalenessMs:undefined,
})?.value, 77, 'explicit realtime developing alignment may use the forming value');
assert.equal(alignHigherTimeframeSnapshot(developingSnapshot, 11_000), null,
  'higher-timeframe developing values are excluded by default');
assert.equal(validateSynchronizedSnapshot({
  symbol:'ALPHA', timeframe:'1D', timestamp:10_000, value:77, source:'feed',
}, {
  asOfTimestamp:11_000, alignment:'last-confirmed', executionMode:'historical', maxStalenessMs:undefined,
}), null, 'unlabelled samples fail closed in confirmed-only historical mode');
assert.equal(validateSynchronizedSnapshot({
  symbol:'ALPHA', timeframe:'1m', timestamp:10_000, closeTimestamp:10_950,
  value:77, source:'feed', state:'confirmed', confirmationPhase:'confirmed', revision:1,
}, {
  asOfTimestamp:11_000, alignment:'last-confirmed', executionMode:'historical', maxStalenessMs:10_000,
}), null, 'maxStalenessMs must be compared in milliseconds when timestamps use epoch seconds');
assert.equal(validateSynchronizedSnapshot({
  symbol:'ALPHA', timeframe:'1D', timestamp:10_000, closeTimestamp:10_950,
  value:77, source:'feed', state:'confirmed', confirmationPhase:'confirmed', revision:1,
}, {
  asOfTimestamp:11_000, alignment:'last-confirmed', executionMode:'historical', maxStalenessMs:100_000,
})?.value, 77, 'staleness must be measured from the true close boundary, not the older bar-open timestamp');
const mislabeledDeveloping = {
  symbol:'ALPHA', timeframe:'1D', timestamp:10_000, closeTimestamp:20_000,
  value:88, source:'feed', state:'confirmed', confirmationPhase:'confirmed', revision:2,
};
assert.equal(validateSynchronizedSnapshot(mislabeledDeveloping, {
  asOfTimestamp:11_000, alignment:'developing', executionMode:'historical', maxStalenessMs:undefined,
}), null, 'historical mode rejects not-yet-closed candles even when alignment says developing');
const realtimeDeveloping = validateSynchronizedSnapshot(mislabeledDeveloping, {
  asOfTimestamp:11_000, alignment:'developing', executionMode:'realtime', maxStalenessMs:undefined,
});
assert.equal(realtimeDeveloping?.state, 'developing');
assert.equal(realtimeDeveloping?.confirmationPhase, 'developing',
  'an explicitly realtime developing read must normalize inconsistent provider labels');

const synchronized = synchronizeMarketSnapshots([
  { symbol:'ALPHA', timeframe:'1m', timestamp:1000, value:1, source:'a', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'5m', timestamp:900, value:5, source:'a', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'1m', timestamp:2000, value:2, source:'a', state:'confirmed', revision:2 },
], {
  asOfTimestamp:3000, alignment:'last-confirmed', executionMode:'historical',
});
assert.equal(synchronized.size, 2, 'same symbol on different timeframes must have distinct canonical identities');
assert.equal(synchronized.get('ALPHA::1m')?.value, 2);

// The newest revision at a candle timestamp is authoritative even when it
// invalidates that candle for historical use. Never resurrect the older
// confirmed revision after filtering the newer developing revision.
const synchronizedRevisionFence = synchronizeMarketSnapshots([
  {symbol:'ALPHA',timeframe:'5m',timestamp:2000,value:20,source:'feed',state:'confirmed',confirmationPhase:'confirmed',revision:1,dataRevision:'alpha-5m-r1'},
  {symbol:'ALPHA',timeframe:'5m',timestamp:3000,value:30,source:'feed',state:'confirmed',confirmationPhase:'confirmed',revision:1,dataRevision:'alpha-5m-r1'},
  {symbol:'ALPHA',timeframe:'5m',timestamp:3000,value:33,source:'feed',state:'developing',confirmationPhase:'developing',revision:2,dataRevision:'alpha-5m-r2'},
], {
  asOfTimestamp:4000, alignment:'last-confirmed', executionMode:'historical',
});
assert.equal(synchronizedRevisionFence.get('ALPHA::5m')?.timestamp, 2000,
  'a newer developing revision must fence off older confirmed revisions of the same candle');
assert.equal(synchronizedRevisionFence.get('ALPHA::5m')?.value, 20,
  'synchronization must fall back only to an earlier candle, never an earlier revision of the same candle');

const parent = [{ timestamp:0, endTimestamp:300_000 }];
const fullIntrabars = [0,60_000,120_000,180_000,240_000].map(timestamp => ({ timestamp }));
assert.equal(groupIntrabars(parent, fullIntrabars, 300_000, { lowerTimeframeMs:60_000 })[0]?.complete, true,
  'a regular parent interval is complete when every expected lower-timeframe bar is present');
assert.equal(groupIntrabars(parent, fullIntrabars.filter(point => point.timestamp !== 120_000), 300_000, { lowerTimeframeMs:60_000 })[0]?.complete, false,
  'a missing lower-timeframe bar must make completeness false');

const holidayStart = 300_000;
const calendar = {
  expectedTimestamps(start, end, interval) {
    if (start === holidayStart) return []; // Exchange holiday / closed session.
    const times = [];
    for (let time=start; time<end; time+=interval) times.push(time);
    return times;
  },
};
assert.equal(groupIntrabars([{ timestamp:holidayStart, endTimestamp:holidayStart+300_000 }], [], 300_000, {
  lowerTimeframeMs:60_000, calendar,
})[0]?.complete, true, 'a calendar-confirmed closed session has no expected intrabars and is not falsely incomplete');

// Timeframe aliases must share one canonical identity. Otherwise a provider
// returning "5" and another returning "5m" can create duplicate data streams
// and make the selected value depend on arrival order.
const aliasSnapshots = [
  {symbol:'ALPHA', timeframe:'5', timestamp:10_000, closeTimestamp:10_300, value:50,
    source:'provider-a', state:'confirmed', confirmationPhase:'confirmed', revision:1},
  {symbol:' alpha ', timeframe:'5m', timestamp:10_000, closeTimestamp:10_300, value:55,
    source:'provider-b', state:'confirmed', confirmationPhase:'confirmed', revision:2},
];
const aliasSync = synchronizeMarketSnapshots(aliasSnapshots, {
  asOfTimestamp:10_500, alignment:'last-confirmed', executionMode:'historical',
});
assert.equal(aliasSync.size, 1, 'equivalent timeframe spellings must collapse to one canonical symbol/timeframe identity');
assert.equal(aliasSync.get('ALPHA::5m')?.value, 55,
  'the highest revision wins regardless of timeframe alias or input order');
assert.deepEqual(
  [...synchronizeMarketSnapshots([...aliasSnapshots].reverse(), {
    asOfTimestamp:10_500, alignment:'last-confirmed', executionMode:'historical',
  }).entries()].map(([key, snapshot])=>[key,snapshot.value]),
  [...aliasSync.entries()].map(([key, snapshot])=>[key,snapshot.value]),
  'canonical identity selection must be independent of provider arrival order',
);

console.log('CORESPIRIT_TIMEFRAME_TEMPORAL_ALIGNMENT_CONTRACT_OK');
