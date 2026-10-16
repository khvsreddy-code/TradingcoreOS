import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


const engine = readFileSync(new URL('../../CoreSpiritVelaEngine.ts', import.meta.url), 'utf8');
assert.match(engine, /new LatestValueAsyncScheduler<LiveTailWork>/,
  'live CoreSpirit tail calculations must use the bounded single-flight scheduler');
assert.match(engine, /liveTailScheduler\.enqueue\(\{/,
  'new market revisions must update the latest pending calculation rather than spawn another worker');
assert.match(engine, /liveTailScheduler\.clear\(\)/,
  'backfills and runtime-affecting edits must invalidate queued tail calculations');
assert.match(engine, /liveTailScheduler\.dispose\(\)/,
  'stopped chart sessions must release the scheduled work lane');
assert.doesNotMatch(engine, /void executeInWorker\(currentBars,mainContextKey,false,executionBarRange\(/,
  'notifyBars must not queue a separate full scheduling request for every forming candle');
assert.ok(engine.includes('return isolateSnapshot ? Object.freeze(normalizedBarsCache.slice()) as CoreSpiritMarketBar[] : normalizedBarsCache'),
  'the synchronous hot path can reuse the normalized cache; isolation is reserved for async compute');


assert.match(engine, /allowSameBarStale: !snapshotStillCurrent, tailTimeMs: latestTime/,
  'the most recent completed same-bar output may render while a newer snapshot is queued');
assert.match(engine, /datasetRevision < lastCommittedDatasetRevision/,
  'an older same-bar output must not mutate retained scene state after a newer revision has committed');
assert.match(engine, /barTimeMillis\(latestTail\.timestamp\) !== options\.tailTimeMs/,
  'stale outputs are never committed across a bar boundary');

console.log('CORESPIRIT_LATEST_VALUE_ASYNC_SCHEDULER_CONTRACT_OK');
