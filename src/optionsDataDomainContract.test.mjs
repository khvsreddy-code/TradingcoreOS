import assert from 'node:assert/strict';import fs from 'node:fs';
const s=fs.readFileSync(new URL('./services/marketData/options/optionsDataModel.ts',import.meta.url),'utf8');
for(const field of ['underlyingId','expiry','strike','lotSize','tickSize','openInterest','previousOpenInterest','impliedVolatility','observedAt','assertOptionChainSnapshot','isOptionSnapshotFresh'])assert.ok(s.includes(field),`missing ${field}`);
assert.match(s,/black-scholes/);assert.match(s,/black-76/);assert.match(s,/does not belong to the chain underlying and expiry/);
console.log('options-data-domain contract: ok');
