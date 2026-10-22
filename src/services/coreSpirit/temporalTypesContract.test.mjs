import assert from 'node:assert/strict';

const {
  isSeriesType,
  isStateType,
  isWindowType,
  normalizeDeclaredType,
  compatible,
} = await import('./typeSystem.ts');
const { parseCoreSpiritTemporalType, temporalAssignmentCompatible } = await import('./temporalTypes.ts');

assert.equal(normalizeDeclaredType('series<float>'), 'series<float>');
assert.equal(normalizeDeclaredType('state<float>'), 'state<float>');
assert.equal(normalizeDeclaredType('window<float>'), 'window<float>');
assert.equal(normalizeDeclaredType('confirmed<boolean>'), 'confirmed<boolean>');
assert(isSeriesType('series<price>'));
assert(isStateType('state<float>'));
assert(isWindowType('window<float>'));
assert.deepEqual(parseCoreSpiritTemporalType('developing<number>'), { container: 'developing', element: 'number', phase: 'developing' });
assert.deepEqual(parseCoreSpiritTemporalType('series<number> @confirmed'), { container: 'series', element: 'number', phase: 'confirmed' });
assert(!temporalAssignmentCompatible('series<number> @confirmed', 'series<number> @developing'),
  'a developing series must not satisfy a confirmed-data contract');
assert(!temporalAssignmentCompatible('series<number> @confirmed', 'series<number>'),
  'unqualified temporal provenance must not satisfy an explicitly confirmed contract');
assert(temporalAssignmentCompatible('series<number> @confirmed', 'series<number> @confirmed'));
assert(!temporalAssignmentCompatible('series<number> @forecast', 'series<number> @realtime'),
  'forecast values must not be assigned to realtime-observation contracts');
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
