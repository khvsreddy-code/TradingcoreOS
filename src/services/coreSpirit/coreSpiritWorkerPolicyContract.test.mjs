import assert from 'node:assert/strict';
import {
  canDispatchCoreSpiritWorkerWorkload,
  CORESPIRIT_WORKER_EXCLUSIVE_DATA_POINTS,
  isCoreSpiritWorkerExclusiveWorkload,
  resolveCoreSpiritWorkerResourceBudget,
} from './coreSpiritWorkerPolicy.ts';

const lowMemory = resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 8, deviceMemoryGiB: 4 });
assert.deepEqual(lowMemory, {
  maxWorkers: 1,
  maxContextsPerWorker: 3,
  memoryTier: 'constrained',
}, '4 GiB devices must use one worker and a small retained-context cache');

const standardMemory = resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 8, deviceMemoryGiB: 8 });
assert.deepEqual(standardMemory, {
  maxWorkers: 2,
  maxContextsPerWorker: 5,
  memoryTier: 'standard',
}, '8 GiB devices must retain the conservative two-worker ceiling');

const expandedMemory = resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 16, deviceMemoryGiB: 16 });
assert.deepEqual(expandedMemory, {
  maxWorkers: 4,
  maxContextsPerWorker: 8,
  memoryTier: 'expanded',
}, 'high-memory devices may use up to four workers while leaving a hardware thread free');

assert.equal(
  resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 2, deviceMemoryGiB: 32 }).maxWorkers,
  1,
  'a two-thread device must keep one thread free even with abundant memory',
);
assert.equal(
  resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 12 }).maxWorkers,
  2,
  'unknown device memory must fall back to the safe two-worker ceiling',
);
assert.equal(
  resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 12, deviceMemoryGiB: 32 }, 2).maxWorkers,
  2,
  'an explicit worker limit may further reduce but never exceed the memory/hardware budget',
);
assert.throws(
  () => resolveCoreSpiritWorkerResourceBudget({ hardwareConcurrency: 8, deviceMemoryGiB: 8 }, 0),
  /requestedMaxWorkers must be a positive safe integer/,
  'invalid explicit worker limits must fail closed rather than silently create an invalid pool',
);

assert.equal(CORESPIRIT_WORKER_EXCLUSIVE_DATA_POINTS, 20_000);
assert.equal(isCoreSpiritWorkerExclusiveWorkload(19_999), false);
assert.equal(isCoreSpiritWorkerExclusiveWorkload(20_000), true);
assert.equal(canDispatchCoreSpiritWorkerWorkload(2_000, [], [20_000], 1), false,
  'a large snapshot at the head of the queue must block later small work');
assert.equal(canDispatchCoreSpiritWorkerWorkload(2_000, [], [2_000, 20_000], 0), true,
  'higher-priority small work ahead of a large snapshot may drain first');
assert.equal(canDispatchCoreSpiritWorkerWorkload(2_000, [], [20_000, 2_000], 1), false,
  'lower-priority small work behind a large snapshot must wait');
assert.equal(canDispatchCoreSpiritWorkerWorkload(20_000, [], [2_000, 20_000], 1), true,
  'the large snapshot may start once all higher-priority queued work ahead of it has drained');
assert.equal(canDispatchCoreSpiritWorkerWorkload(2_000, [2_000], [2_000, 20_000], 1), false,
  'the exclusive snapshot must wait until active small jobs complete');
assert.equal(canDispatchCoreSpiritWorkerWorkload(2_000, [20_000], [2_000], 0), false,
  'small jobs must not run alongside an active large snapshot');
assert.equal(canDispatchCoreSpiritWorkerWorkload(20_000, [2_000], [20_000], 0), false,
  'a large snapshot must wait until existing small jobs complete');
assert.equal(canDispatchCoreSpiritWorkerWorkload(5_000, [2_000], [5_000, 7_000], 0), true,
  'ordinary workloads ahead of a non-exclusive job retain existing worker parallelism');

console.log('CORESPIRIT_WORKER_RESOURCE_POLICY_CONTRACT_OK');
