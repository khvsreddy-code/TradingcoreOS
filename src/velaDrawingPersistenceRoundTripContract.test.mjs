import assert from 'node:assert/strict';
import { migrateVelaDrawings } from './services/core/chart/velaNativeChartKernel.ts';

const drawing = {
  id: 'roundtrip-hline',
  type: 'hline',
  paneId: 'price',
  anchors: [{ time: 1791360000000, price: 25000 }],
  style: { lineColor: '#22c55e', lineWidth: 2, lineStyle: 'dashed' },
};

const storedDocument = { version: 1, drawings: [drawing] };
const migratedOnLoad = migrateVelaDrawings(storedDocument);
assert.equal(migratedOnLoad.length, 1);
assert.equal(migratedOnLoad[0]?.id, drawing.id);

const chartStatePayload = { version: 1, drawings: migratedOnLoad };
const migratedAfterChartState = migrateVelaDrawings(chartStatePayload);
assert.deepEqual(migratedAfterChartState, migratedOnLoad);

const invalidPayload = migrateVelaDrawings({
  version: 1,
  drawings: [{ id: 'bad', type: 'hline', paneId: 'price', anchors: [{ time: 'not-a-number', price: 25000 }], style: {} }],
});
assert.equal(invalidPayload.length, 0);

console.log('VELA_DRAWING_PERSISTENCE_ROUNDTRIP_OK');
