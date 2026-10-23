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

const confirmedAligned = alignTimeframeSnapshots([500, 1000, 1500, 3000, 3500], snapshots);
assert.equal(confirmedAligned[0]?.value, null, 'alignment must not invent a value before the first confirmed observation');
assert.equal(confirmedAligned[1]?.value, 10);
assert.equal(confirmedAligned[2]?.value, 10, 'carry-forward uses only the last eligible confirmed observation');
assert.equal(confirmedAligned[3]?.value, 20, 'a developing revision must not resurrect an older confirmed revision at the same timestamp');
assert.equal(confirmedAligned[4]?.value, 20);

const includesDeveloping = alignSnapshots([3000], snapshots, { confirmedOnly:false });
assert.equal(includesDeveloping[0]?.value, 33, 'explicit non-confirmed alignment may inspect the latest developing revision');
const reverseTargets = alignTimeframeSnapshots([3500, 1000, 500], snapshots);
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

const synchronized = synchronizeMarketSnapshots([
  { symbol:'ALPHA', timeframe:'1m', timestamp:1000, value:1, source:'a', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'5m', timestamp:900, value:5, source:'a', state:'confirmed', revision:1 },
  { symbol:'ALPHA', timeframe:'1m', timestamp:2000, value:2, source:'a', state:'confirmed', revision:2 },
], {
  asOfTimestamp:3000, alignment:'last-confirmed', executionMode:'historical',
});
assert.equal(synchronized.size, 2, 'same symbol on different timeframes must have distinct canonical identities');
assert.equal(synchronized.get('ALPHA::1m')?.value, 2);

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

console.log('CORESPIRIT_TIMEFRAME_TEMPORAL_ALIGNMENT_CONTRACT_OK');
