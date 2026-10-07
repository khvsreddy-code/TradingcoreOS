import assert from 'node:assert/strict';
import { assertCumulativeProgressiveHistory, createProgressiveHistoryEmitter } from './services/core/chart/velaProgressiveHistory.ts';

const bar = (time, close) => ({ time, open: close - 1, high: close + 1, low: close - 2, close, volume: 100 });
const head = [bar(1000, 10), bar(2000, 11), bar(3000, 12)];
const expanded = [bar(-2000, 8), bar(-1000, 9), ...head];

assert.doesNotThrow(() => assertCumulativeProgressiveHistory([], head));
assert.doesNotThrow(() => assertCumulativeProgressiveHistory(head, expanded));
assert.throws(() => assertCumulativeProgressiveHistory(head, head.slice(1)), /Non-cumulative/);
assert.throws(() => assertCumulativeProgressiveHistory(head, [bar(-1000, 9), bar(1000, 10), bar(2000, 999), bar(3000, 12)]), /Non-cumulative/);
assert.throws(() => assertCumulativeProgressiveHistory(head, [bar(1000, 10), bar(3000, 12), bar(2000, 11)]), /Non-cumulative/);

const emissions = [];
const emit = createProgressiveHistoryEmitter((bars) => emissions.push(bars));
emit(head);
emit(expanded);
assert.equal(emissions.length, 2);
assert.deepEqual(emissions[1], expanded);

console.log('[vela-progressive-history] PASS');