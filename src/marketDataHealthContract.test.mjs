import assert from 'node:assert/strict';import fs from 'node:fs';
const s=fs.readFileSync(new URL('./services/marketData/dataHealth.ts',import.meta.url),'utf8');
assert.match(s,/source!=='fyers'\|\|connected!==true/);assert.match(s,/isTradableFreshness:state==='live'/);assert.match(s,/ageMs!>expected\*3/);
console.log('market-data-health contract: ok');
