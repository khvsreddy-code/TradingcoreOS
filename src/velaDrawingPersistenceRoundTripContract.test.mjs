import assert from 'node:assert/strict';
import { migrate } from '../vendor/vela/src/core/drawings/document.ts';

const drawing = {
  id: 'roundtrip-hline',
  type: 'hline',
  paneId: 'price',
  anchors: [{ time: 1791360000000, price: 25000 }],
  style: { color: '#22c55e', width: 2 },
};

const storedDocument = { version: 1, drawings: [drawing] };
const migratedOnLoad = migrate(storedDocument);
assert.equal(migratedOnLoad.drawings.length, 1);
assert.equal(migratedOnLoad.drawings[0]?.id, drawing.id);

const chartStatePayload = { version: 1, drawings: migratedOnLoad.drawings };
const migratedAfterChartState = migrate(chartStatePayload);
assert.deepEqual(migratedAfterChartState.drawings, migratedOnLoad.drawings);

const invalidPayload = migrate({
  version: 1,
  drawings: [{ id: 'bad', type: 'does-not-exist', paneId: 'price', anchors: [], style: {} }],
});
assert.equal(invalidPayload.drawings.length, 0);

console.log('VELA_DRAWING_PERSISTENCE_ROUNDTRIP_OK');
