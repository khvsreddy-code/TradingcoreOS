import assert from 'node:assert/strict';

const {
  isSeriesType,
  isStateType,
  isWindowType,
  normalizeDeclaredType,
  compatible,
} = await import('./typeSystem.ts');
const { parseCoreSpiritTemporalType } = await import('./temporalTypes.ts');

assert.equal(normalizeDeclaredType('series<float>'), 'series<float>');
assert.equal(normalizeDeclaredType('state<float>'), 'state<float>');
assert.equal(normalizeDeclaredType('window<float>'), 'window<float>');
assert.equal(normalizeDeclaredType('confirmed<boolean>'), 'confirmed<boolean>');
assert(isSeriesType('series<price>'));
assert(isStateType('state<float>'));
assert(isWindowType('window<float>'));
assert.deepEqual(parseCoreSpiritTemporalType('developing<number>'), { container: 'developing', element: 'number', phase: 'developing' });
assert(compatible('state<float>', 'state<number>'));
assert(!compatible('state<float>', 'series<float>'));

const { CoreSpiritStateStore } = await import('./stateStore.ts');
const stateStore = new CoreSpiritStateStore();
stateStore.beginRealtimeTransaction();
stateStore.setState('stop', 100);
assert.equal(stateStore.getState('stop'), 100);
stateStore.setState('stop', 110);
stateStore.rollbackRealtimeTransaction();
assert.equal(stateStore.getState('stop'), null, 'transaction rollback must restore state<T> before the transaction');
stateStore.beginRealtimeTransaction();
stateStore.setState('stop', 125);
stateStore.commitRealtimeTransaction();
assert.equal(stateStore.getState('stop'), 125);

console.log('TCO_CORESPIRIT_BRANCH12_TEMPORAL_STATE_ROLLBACK_OK');
