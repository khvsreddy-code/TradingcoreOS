import assert from 'node:assert/strict';
import { CoreSpiritSeriesRegistry } from './seriesRegistry.ts';

const registry = new CoreSpiritSeriesRegistry();
const ema = registry.idFor('ema');
const signal = registry.idFor('signal');
assert.equal(ema, 0);
assert.equal(signal, 1);
assert.equal(registry.existingId('ema'), ema);
assert.equal(registry.nameFor(signal), 'signal');

for (let i = 0; i < 20; i += 1) registry.pushNumber(ema, i, 4);
assert.equal(registry.getNumberAt(ema, 0), 19);
assert.equal(registry.getNumberAt(ema, 1), 18);
assert.equal(registry.getNumberAt(ema, 3), 16);
assert.equal(registry.getNumberAt(ema, 4), null);
assert.deepEqual(Array.from(registry.numericSnapshot(ema)), [16, 17, 18, 19]);

registry.begin();
registry.pushNumber(ema, 20, 4);
assert.equal(registry.getNumberAt(ema, 0), 20);
registry.rollback();
assert.equal(registry.getNumberAt(ema, 0), 19);
assert.deepEqual(Array.from(registry.numericSnapshot(ema)), [16, 17, 18, 19]);

registry.begin();
registry.pushNumber(registry.idFor('newSeries'), 1, 4);
registry.rollback();
assert.equal(registry.existingId('newSeries'), 2);
assert.equal(registry.getNumberAt(2, 0), null);

const mixed = registry.idFor('mixed');
registry.pushValue(mixed, 1, 4);
registry.pushValue(mixed, 2, 4);
registry.pushValue(mixed, true, 4);
registry.pushValue(mixed, 'x', 4);
registry.pushValue(mixed, null, 4);
assert.deepEqual(registry.valueSnapshot(mixed), [2, true, 'x', null]);
assert.equal(registry.getValueAt(mixed, 0), null);
assert.equal(registry.getValueAt(mixed, 3), 2);

const view = registry.createValueCompatibilityView();
assert.deepEqual(view.mixed, [2, true, 'x', null]);

console.log('CoreSpiritSeriesRegistry contract: OK');
