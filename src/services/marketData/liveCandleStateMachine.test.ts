import assert from 'node:assert/strict';
import { LiveCandleStateMachine } from './liveCandleStateMachine';
import type { NormalizedMarketTick } from '../../types/market';

function tick(timestamp: string, ltp: number, sequence?: number): NormalizedMarketTick {
  return {
    instrumentKey: 'NSE:LIVE-CANDLE-TEST',
    source: 'fyers',
    lastTradeTimestamp: timestamp,
    receivedAt: timestamp,
    ltp,
    sequence,
  };
}
function candle(timestamp: string, open: number, high: number, low: number, close: number) {
  return { timestamp, open, high, low, close, volume: 10 };
}

const machine = new LiveCandleStateMachine('NSE:LIVE-CANDLE-TEST', '5m');
const generation = machine.beginHistoryLoad('history');
const later = tick('2026-10-14T10:04:45.000Z', 101.5, 2);
const earlier = tick('2026-10-14T10:04:30.000Z', 102, 1);
assert.equal(machine.bufferTick(later), true);
assert.equal(machine.bufferTick(later), false, 'identical pending transport event must be deduplicated');
assert.equal(machine.bufferTick(earlier), true);
assert.deepEqual(machine.drainPendingTicks(generation - 1), [], 'superseded history generation cannot drain buffered events');
const drained = machine.drainPendingTicks(generation);
assert.deepEqual(drained.map(item => item.lastTradeTimestamp), [
  '2026-10-14T10:04:30.000Z',
  '2026-10-14T10:04:45.000Z',
], 'queued trades replay in exchange-time order');
assert.equal(machine.phase, 'ready');

const baseline = candle('2026-10-14T10:00:00.000Z', 100, 101, 99, 100);
const first = machine.transition(tick('2026-10-14T10:04:30.000Z', 102, 3), baseline, 300);
assert.equal(first.kind, 'forming-bar-update');
assert.equal(first.changed, true);
assert.equal(first.bucketChanged, false);
assert.equal(first.bar?.timestamp, baseline.timestamp);
assert.equal(first.bar?.open, 100);
assert.equal(first.bar?.high, 102);
assert.equal(first.bar?.low, 99);
assert.equal(first.bar?.close, 102);

const noChange = machine.transition(tick('2026-10-14T10:04:40.000Z', 102, 4), first.bar!, 300);
assert.equal(noChange.kind, 'duplicate');
assert.equal(noChange.changed, false, 'same-price ticks update freshness but do not commit redundant OHLC');
assert.equal(noChange.bucketChanged, false);

const outOfOrder = machine.transition(tick('2026-10-14T10:04:35.000Z', 97, 5), first.bar!, 300);
assert.equal(outOfOrder.kind, 'out-of-order');
assert.equal(outOfOrder.accepted, false);

const next = machine.transition(tick('2026-10-14T10:05:01.000Z', 103, 6), first.bar!, 300);
assert.equal(next.kind, 'new-bar');
assert.equal(next.bucketChanged, true);
assert.equal(next.bar?.timestamp, '2026-10-14T10:05:00.000Z');
assert.equal(next.bar?.open, 103);
assert.equal(next.bar?.high, 103);
assert.equal(next.bar?.low, 103);
assert.equal(next.bar?.close, 103);

const gap = machine.transition(tick('2026-10-14T10:20:01.000Z', 105, 7), next.bar!, 300);
assert.equal(gap.kind, 'session-boundary');
assert.equal(gap.bucketChanged, true);
assert.equal(gap.bar?.timestamp, '2026-10-14T10:20:00.000Z');

assert.equal(machine.transition({
  instrumentKey: 'NSE:LIVE-CANDLE-TEST',
  source: 'fyers',
  ltp: 106,
}, gap.bar!, 300).kind, 'invalid', 'missing exchange trade time cannot mutate a candle');

const superseded = machine.beginHistoryLoad('recovery');
machine.bufferTick(tick('2026-10-14T10:20:30.000Z', 106, 8));
const replacement = machine.beginHistoryLoad('history');
assert.deepEqual(machine.drainPendingTicks(superseded), [], 'a reconnect/history generation race must drop stale completion');
assert.equal(machine.drainPendingTicks(replacement).length, 1);
assert.equal(machine.phase, 'ready');

console.log('LIVE_CANDLE_STATE_MACHINE_RUNTIME_OK');
