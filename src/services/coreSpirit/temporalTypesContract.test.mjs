import assert from 'node:assert/strict';

const {
  isSeriesType,
  isStateType,
  isWindowType,
  normalizeDeclaredType,
  compatible,
} = await import('./typeSystem.ts');
const { parseCoreSpiritTemporalType, makeCoreSpiritTemporalType, temporalAssignmentCompatible, describeTemporalType } = await import('./temporalTypes.ts');

assert.equal(normalizeDeclaredType('series<float>'), 'series<float>');
assert.equal(normalizeDeclaredType('state<float>'), 'state<float>');
assert.equal(normalizeDeclaredType('window<float>'), 'window<float>');
assert.equal(normalizeDeclaredType('confirmed<boolean>'), 'confirmed<boolean>');
assert(isSeriesType('series<price>'));
assert(isStateType('state<float>'));
assert(isWindowType('window<float>'));
assert.deepEqual(parseCoreSpiritTemporalType('developing<number>'), { container: 'developing', element: 'number', phase: 'developing' });
assert.deepEqual(parseCoreSpiritTemporalType('series<number> @confirmed'), { container: 'series', element: 'number', phase: 'confirmed' });
assert.deepEqual(parseCoreSpiritTemporalType(makeCoreSpiritTemporalType('series', 'number', 'developing')), { container: 'series', element: 'number', phase: 'developing' });
assert.equal(parseCoreSpiritTemporalType('confirmed<number> @developing'), undefined, 'contradictory phase declarations must be rejected');
assert.equal(parseCoreSpiritTemporalType('series<>'), undefined, 'empty element types must be rejected');
assert.equal(describeTemporalType('series<number> @confirmed')?.phase, 'confirmed');
assert(temporalAssignmentCompatible('series<number> @confirmed', 'series<float> @confirmed'));
assert(!temporalAssignmentCompatible('series<number> @confirmed', 'series<number> @developing'), 'developing values must not satisfy confirmed requirements');
assert(!temporalAssignmentCompatible('series<number> @forecast', 'series<number> @realtime'), 'forecast values must not satisfy realtime requirements');
assert.throws(() => makeCoreSpiritTemporalType('confirmed', 'number', 'developing'), /conflicts with phase/);
assert.throws(() => makeCoreSpiritTemporalType('series', '', 'confirmed'), /non-empty/);
assert(compatible('state<float>', 'state<number>'));
assert(!compatible('state<float>', 'series<float>'));
assert(!temporalAssignmentCompatible('series<number> @confirmed', 'series<number>'),
  'unqualified temporal provenance must not satisfy an explicitly confirmed contract');
assert(temporalAssignmentCompatible('series<number> @confirmed', 'series<number> @confirmed'));
assert(!temporalAssignmentCompatible('series<number> @confirmed', 'series<number> @developing'),
  'developing values must not satisfy a confirmed-data contract');

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
