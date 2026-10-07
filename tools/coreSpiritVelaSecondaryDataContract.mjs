import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/CoreSpiritVelaEngine.ts', import.meta.url), 'utf8');

assert.match(source, /context\.maxStalenessMs/);
assert.match(source, /context\.alignment==='exact'/);
assert.match(source, /context\.alignment==='last-confirmed'/);
assert.match(source, /context\.alignment==='nearest-confirmed'/);
assert.match(source, /context\.alignment==='developing'/);
assert.match(source, /state:confirmed\?'confirmed':'developing'/);
assert.match(source, /const\s+latestBars\s*=\s*req\.getBars\s*\?/);
assert.match(source, /latestBars\[latestBars\.length-1\]/);
assert.match(source, /loadSecondaryData = async \(force=false\)/);
assert.match(source, /secondaryRefreshPromise/);
assert.match(source, /Secondary market data unavailable/);
assert.match(source, /Secondary market data refresh failed/);

console.log('CORESPIRIT_VELA_SECONDARY_DATA_P0_OK');

assert.match(source, /secondaryFailed = new Set/);
assert.match(source, /secondaryDegraded=secondaryFailed\.size>0/);
assert.match(source, /safeOutputs = \(outputs: CoreSpiritObject\[\]\)/);
assert.match(source, /output\.kind !== 'signal' && output\.kind !== 'orderIntent'/);
assert.match(source, /context\.alignment==='nearest-confirmed'/);
