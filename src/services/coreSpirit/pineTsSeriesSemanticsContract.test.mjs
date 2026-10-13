import assert from 'node:assert/strict';
import { CoreSpiritSeriesEngine } from './seriesEngine.ts';

const bars = [
  { timestamp: '2026-10-13T09:15:00.000Z', open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { timestamp: '2026-10-13T09:20:00.000Z', open: 11, high: 13, low: 10, close: 12, volume: 120 },
  { timestamp: '2026-10-13T09:25:00.000Z', open: 12, high: 14, low: 11, close: 13, volume: 140 },
];
const engine = new CoreSpiritSeriesEngine();
engine.reset(bars);
engine.beginBar(2, bars[2], true, 7);

// Like the series-access model documented by PineTS, storage remains chronological
// while script-facing indexing is relative to the current bar.
assert.equal(engine.value('close', 0), 13, 'offset 0 must be the current bar');
assert.equal(engine.value('close', 1), 12, 'offset 1 must be the previous bar');
assert.equal(engine.value('close', 2), 11, 'offset 2 must address two bars ago');
assert.equal(engine.value('close', 3), null, 'out-of-range history must not read future/uninitialized data');
assert.deepEqual(engine.window('close', 3), [13, 12, 11], 'windows are returned current-first');
assert.throws(() => engine.value('close', -1), /future indexing is not allowed/, 'negative offsets must fail closed');

const confirmed = engine.getRevision();
assert.equal(confirmed.barIndex, 2);
assert.equal(confirmed.confirmed, true);
assert.equal(confirmed.revision, 7);

// A new live tick revises the same bar; it must not move the series cursor forward.
const developing = { ...bars[2], close: 13.5, high: 14.5 };
engine.replaceCurrent(developing);
engine.beginBar(2, developing, false, 8);
assert.equal(engine.length, 3, 'revising the open candle must not append a fourth bar');
assert.equal(engine.value('close', 0), 13.5, 'offset 0 must reflect the revised open candle');
assert.equal(engine.value('close', 1), 12, 'prior confirmed history must remain stable');
assert.equal(engine.getRevision().confirmed, false, 'developing/live bar status must be explicit');
assert.equal(engine.getRevision().revision, 8);

console.log('CoreSpirit PineTS-informed series semantics: OK');
