import assert from 'node:assert/strict';
import { CoreSpiritFusedSeriesCursor } from './seriesVector.ts';

const cursor = new CoreSpiritFusedSeriesCursor([
  { name: 'ema', length: 3 },
  { name: 'change', length: 1 },
  { name: 'normalize', length: 3 },
]);

cursor.update(100, 0);
cursor.update(101, 1);
cursor.update(102, 2);

const checkpoint = cursor.clone();
const firstTick = cursor.update(105, 3).slice();

const replay = checkpoint.clone();
const replayTick = replay.update(105, 3).slice();

assert.deepEqual([...replayTick], [...firstTick]);

const nextTick = cursor.update(106, 4).slice();
const replayNext = replay.update(106, 4).slice();
assert.deepEqual([...replayNext], [...nextTick]);

console.log('CORESPIRIT_REALTIME_FUSED_CURSOR_ROLLBACK_NUMERIC_OK');
