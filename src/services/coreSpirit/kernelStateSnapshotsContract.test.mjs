import assert from 'node:assert/strict';
import { CoreSpiritKernelSnapshotStore } from './kernelStateSnapshots.ts';

const store = new CoreSpiritKernelSnapshotStore(8);
const base = {
  nodeId:'ema:close',
  revision:1,
  inputDependencies:['close'],
  barIndex:99,
  nextBarIndex:100,
  modelVersion:'core-model-v1',
  kernelType:'ema',
  kernelVersion:1,
  parametersSignature:'ema:period=14',
  dataRevision:'market-revision-10',
};
const clone = state => ({...state});
const copyFrom = (target, source) => Object.assign(target, source);
const expected = {
  modelVersion:base.modelVersion,
  kernelType:base.kernelType,
  kernelVersion:base.kernelVersion,
  parametersSignature:base.parametersSignature,
  dataRevision:base.dataRevision,
  nextBarIndex:base.nextBarIndex,
  inputDependencies:base.inputDependencies,
};

store.capture(base, {value:42}, clone);
assert.equal(store.at(base.nodeId, base.barIndex), undefined,
  'bar-index-only lookup must not expose an unvalidated checkpoint');
assert.equal(store.at(base.nodeId, base.barIndex, expected)?.state.value, 42,
  'full identity lookup may return a compatible checkpoint');
assert.equal(store.at(base.nodeId, base.barIndex, {...expected, inputDependencies:['high']}), undefined,
  'checkpoint lookup must reject a changed dependency chain');
const target = {};
assert.equal(store.restore(target, base.nodeId, base.modelVersion, ['close'], 99, copyFrom),
  false, 'restore without an explicit full identity must fail closed');
assert.equal(store.restore(target, base.nodeId, base.modelVersion, ['close'], 99, copyFrom, expected), true);
assert.deepEqual(target, {value:42});

const incompatible = {...base, revision:2, parametersSignature:'ema:period=21'};
store.capture(incompatible, {value:84}, clone);
const targetForOldConfig = {};
assert.equal(store.restoreAt(
  targetForOldConfig, base.nodeId, base.modelVersion, ['close'], 99, copyFrom, expected,
), true, 'history lookup must find a compatible older checkpoint instead of stopping at a newer incompatible one');
assert.deepEqual(targetForOldConfig, {value:42});

for (const [field, value] of [
  ['kernelVersion', 2],
  ['parametersSignature', 'ema:period=34'],
  ['dataRevision', 'market-revision-11'],
  ['nextBarIndex', 101],
  ['modelVersion', 'core-model-v2'],
]) {
  const invalidTarget = {};
  assert.equal(store.restoreAt(
    invalidTarget, base.nodeId, base.modelVersion, ['close'], 99, copyFrom, {...expected, [field]:value},
  ), false, 'snapshot identity mismatch must reject ' + field);
}
assert.equal(store.restoreAt(
  {}, base.nodeId, base.modelVersion, ['high'], 99, copyFrom, expected,
), false, 'changed input dependency chain must reject restore');
console.log('CORESPIRIT_KERNEL_SNAPSHOT_IDENTITY_CONTRACT_OK');
