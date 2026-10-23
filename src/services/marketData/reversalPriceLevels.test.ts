import assert from 'node:assert/strict';
import { reversalPriceLevels } from './indicatorEngine';

const candle = (timestamp: string, open: number, high: number, low: number, close: number) => ({
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1_000,
});

// Prior session: H=120, L=90, C=100. P=(120+90+100)/3=103.333...
const history = [
  candle('2026-10-22T09:15:00+05:30', 100, 110, 95, 105),
  candle('2026-10-22T09:20:00+05:30', 105, 120, 90, 100),
  candle('2026-10-23T09:15:00+05:30', 98, 101, 97, 99),
  candle('2026-10-23T09:20:00+05:30', 99, 104, 96, 100),
];

const levels = reversalPriceLevels(history);
assert.equal(levels.length, 5, 'emits two resistance levels, pivot, and two support levels');
assert.deepEqual(levels.map(level => level.label), [
  'Reversal Price R2',
  'Reversal Price R1',
  'Trend Decide Price',
  'Reversal Price S1',
  'Reversal Price S2',
]);
assert.deepEqual(levels.map(level => level.side), [
  'resistance', 'resistance', 'neutral', 'support', 'support',
]);
const expected = [133.3333333333, 116.6666666667, 103.3333333333, 86.6666666667, 73.3333333333];
levels.forEach((level, index) => assert.ok(Math.abs(level.price - expected[index]!) < 1e-8, `level ${level.label} formula`));

const currentDayStart = Math.floor(new Date('2026-10-23T09:15:00+05:30').getTime() / 1000);
assert.ok(levels.every(level => level.time === currentDayStart), 'levels anchor from the first candle of the current session');

// Current-session ticks/bars must not move levels sourced from the completed prior session.
const laterHistory = [
  ...history,
  candle('2026-10-23T09:25:00+05:30', 100, 140, 85, 135),
];
assert.deepEqual(reversalPriceLevels(laterHistory).map(level => level.price), levels.map(level => level.price));
assert.deepEqual(reversalPriceLevels(history.slice(0, 2)), [], 'one session is insufficient to calculate prior-session levels');

console.log('reversal price levels tests passed');
