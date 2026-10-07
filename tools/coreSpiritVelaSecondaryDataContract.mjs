import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/CoreSpiritVelaEngine.ts', import.meta.url), 'utf8');

assert.match(source, /function timeframeDurationMs\(timeframe: string\)/);
assert.match(source, /state:confirmed \? 'confirmed' : 'developing'/, 'secondary bars must preserve developing/confirmed temporal semantics');
assert.match(source, /const loadSecondaryData = async \(force = false\)/, 'secondary data needs an explicit refresh path');
assert.match(source, /if \(!force && secondaryRefreshPromise\) return secondaryRefreshPromise/);
assert.match(source, /if \(!force && now - secondaryLastRefreshAt < 1500\) return/);
assert.match(source, /req\.mode === 'live'/, 'live CoreSpirit must refresh secondary dependencies');
assert.match(source, /Secondary market data refresh failed/, 'secondary failures must be surfaced as warnings instead of being silently swallowed');
assert.match(source, /loadSecondaryData\(true\)/, 'initial/recompute paths must support a forced secondary-data refresh');

console.log('CORESPIRIT_VELA_SECONDARY_DATA_CONTRACT_OK');
