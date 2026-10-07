import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./services/core/chart/chartRuntimeSupport.ts', import.meta.url), 'utf8');
assert.match(
  source,
  /const velaDocument=migrateVelaDrawings\(\{version:1,drawings:Array\.isArray\(x\.velaDrawings\)\?x\.velaDrawings:\[\]\}\);/,
  'chart state must validate persisted Vela drawing payloads before restore',
);
assert.match(
  source,
  /velaDrawings:velaDocument\.drawings,/,
  'chart state must pass only the serialized drawing array into the Vela chart kernel',
);
console.log('VELA_DRAWING_PERSISTENCE_CONTRACT_OK');
