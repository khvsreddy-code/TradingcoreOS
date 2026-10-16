import assert from 'node:assert/strict';
import { LatestValueAsyncScheduler } from './latestValueAsyncScheduler.ts';

const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await pause(0);
  }
}

let releaseFirst;
const firstGate = new Promise(resolve => { releaseFirst = resolve; });
const processed = [];
let active = 0;
let maxActive = 0;
const scheduler = new LatestValueAsyncScheduler(async value => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  processed.push(value);
  if (value === 1) await firstGate;
  active -= 1;
});

assert.equal(scheduler.enqueue(1), true);
await waitFor(() => scheduler.isRunning, 'first work to start');
assert.equal(scheduler.enqueue(2), true);
assert.equal(scheduler.enqueue(3), true);
assert.equal(scheduler.hasQueuedValue, true, 'only a single latest pending value is retained');
releaseFirst();
await waitFor(() => processed.length === 2 && !scheduler.isRunning, 'latest queued work to drain');
assert.deepEqual(processed, [1, 3], 'intermediate snapshot work is coalesced while the first calculation is in flight');
assert.equal(maxActive, 1, 'the scheduler never runs two async calculations concurrently');

let releaseSecond;
const secondGate = new Promise(resolve => { releaseSecond = resolve; });
const cleared = new LatestValueAsyncScheduler(async value => {
  processed.push(value);
  if (value === 4) await secondGate;
});
cleared.enqueue(4);
await waitFor(() => cleared.isRunning, 'clear scheduler first job');
cleared.enqueue(5);
cleared.clear();
releaseSecond();
await waitFor(() => !cleared.isRunning, 'cleared scheduler to settle');
assert.equal(processed.includes(5), false, 'clear removes queued stale work');

cleared.dispose();
assert.equal(cleared.enqueue(6), false);
assert.equal(cleared.isDisposed, true);

let errors = 0;
const resilient = new LatestValueAsyncScheduler(async () => { throw new Error('expected'); }, () => { errors += 1; });
resilient.enqueue(1);
await waitFor(() => errors === 1 && !resilient.isRunning, 'error observer');
assert.equal(errors, 1, 'a failed calculation does not wedge the scheduler');

console.log('CORESPIRIT_LATEST_VALUE_ASYNC_SCHEDULER_CONTRACT_OK');
