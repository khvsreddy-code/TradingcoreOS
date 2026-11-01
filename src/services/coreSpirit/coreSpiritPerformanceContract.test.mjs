import assert from 'node:assert/strict';
import { CoreSpiritLaneScheduler } from './coreSpiritPerformance.ts';

const scheduler = new CoreSpiritLaneScheduler();
const events = [];

// Latest-value coalescing must be correct even when a task moves between lanes.
scheduler.schedule({ id: 'quote: NIFTY', lane: 'hot', run: () => events.push('stale-hot') });
scheduler.schedule({ id: 'quote: NIFTY', lane: 'warm', run: () => events.push('latest-warm') });
assert.equal(scheduler.pending('hot'), 0, 'superseded work must stop counting against its original lane');
assert.equal(scheduler.pending('warm'), 1, 'only the latest task may count in its destination lane');

// Scheduling from inside a task must preserve FIFO order and remain visible to
// the current flush, just as it did before the queue was made cursor-based.
scheduler.schedule({
  id: 'parent',
  lane: 'hot',
  run: () => {
    events.push('parent');
    scheduler.schedule({ id: 'child', lane: 'hot', run: () => events.push('child') });
  },
});
scheduler.schedule({ id: 'follower', lane: 'hot', run: () => events.push('follower') });
assert.equal(scheduler.flush('hot', Number.POSITIVE_INFINITY), 3,
  'a flush must skip stale entries and execute each live task exactly once');
assert.deepEqual(events, ['parent', 'follower', 'child'],
  'tasks enqueued by a running task must remain FIFO behind already queued work');
assert.equal(scheduler.pending('hot'), 0);
assert.equal(scheduler.pending('warm'), 1);
assert.equal(scheduler.flush('warm', Number.POSITIVE_INFINITY), 1);
assert.deepEqual(events, ['parent', 'follower', 'child', 'latest-warm']);
assert.equal(scheduler.pending(), 0);

// Reusing the same task object is also safe: queue-entry identity, not task
// object identity, decides which scheduled occurrence is current.
let sameObjectRuns = 0;
const sameTask = { id: 'same-object', lane: 'cold', run: () => { sameObjectRuns += 1; } };
for (let index = 0; index < 2_000; index += 1) scheduler.schedule(sameTask);
assert.equal(scheduler.pending('cold'), 1, 'a burst of keyed replacements must retain one live task');
assert.equal(scheduler.flush('cold', Number.POSITIVE_INFINITY), 1);
assert.equal(sameObjectRuns, 1, 'a reused task object must not execute once per historical queue entry');

// A zero budget still admits one task, then leaves a correct pending count.
scheduler.schedule({ id: 'budget-a', lane: 'hot', run: () => events.push('budget-a') });
scheduler.schedule({ id: 'budget-b', lane: 'hot', run: () => events.push('budget-b') });
assert.equal(scheduler.flush('hot', 0), 1);
assert.equal(scheduler.pending('hot'), 1);
assert.equal(scheduler.flush('hot', Number.POSITIVE_INFINITY), 1);
assert.equal(scheduler.pending(), 0);

scheduler.schedule({ id: 'clear-me', lane: 'warm', run: () => events.push('must-not-run') });
scheduler.clear();
assert.equal(scheduler.pending(), 0);
assert.equal(scheduler.flushAll(), 0);
assert.ok(!events.includes('must-not-run'), 'clear must discard live and stale queue entries');

// clear() may be called by an executing task (for example, when a workspace
// generation is retired). It must truncate the same array held by flush().
let afterClearRuns = 0;
scheduler.schedule({
  id: 'clear-during-flush',
  lane: 'hot',
  run: () => {
    events.push('clear-during-flush');
    scheduler.schedule({ id: 'queued-before-clear', lane: 'hot', run: () => { afterClearRuns += 1; } });
    scheduler.clear();
  },
});
scheduler.schedule({ id: 'queued-behind-clear', lane: 'hot', run: () => { afterClearRuns += 1; } });
assert.equal(scheduler.flush('hot', Number.POSITIVE_INFINITY), 1,
  'clearing from an active task must stop the current lane drain immediately');
assert.equal(afterClearRuns, 0, 'no task queued before clear may execute after clear returns');
assert.equal(scheduler.pending(), 0);
assert.equal(scheduler.flushAll(), 0);

console.log('CORESPIRIT_PERFORMANCE_SCHEDULER_CONTRACT_OK');
