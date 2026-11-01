import assert from 'node:assert/strict';
import { resolveInvestinyAssetMapping } from './server/marketData/investinyMapping.ts';

const instrument = { instrumentId: 'NSE:NIFTY50-INDEX', fyersSymbol: 'NSE:NIFTY50-INDEX' };
assert.deepEqual(
  resolveInvestinyAssetMapping({ 'NSE:NIFTY50-INDEX': { investingId: 999260 } }, instrument),
  { investingId: 999260, matchedBy: 'instrumentId' },
  'the exact canonical instrument key resolves its explicitly configured asset ID',
);
assert.deepEqual(
  resolveInvestinyAssetMapping({ 'NSE:NIFTY50-INDEX': { id: '999260', fyersSymbol: 'NSE:NIFTY50-INDEX', exchange: 'NSE' } }, instrument),
  { investingId: 999260, matchedBy: 'instrumentId' },
  'optional asset identity metadata must agree with the canonical symbol',
);
assert.equal(
  resolveInvestinyAssetMapping({ 'NSE:NIFTY50-INDEX': { id: 999260, fyersSymbol: 'NSE:NIFTYBANK-INDEX' } }, instrument),
  null,
  'a declared FYERS symbol mismatch must be rejected',
);
assert.equal(
  resolveInvestinyAssetMapping({ 'NSE:NIFTY50-INDEX': { id: 999260, instrument_id: 'NSE:NIFTYBANK-INDEX' } }, instrument),
  null,
  'a declared canonical instrument mismatch must be rejected',
);
assert.equal(
  resolveInvestinyAssetMapping({ 'NSE:NIFTY50-INDEX': { id: 999260, exchange: 'BSE' } }, instrument),
  null,
  'a declared exchange mismatch must be rejected',
);
for (const bad of [undefined, null, {}, {id:0}, {id:-2}, {id:1.5}, {id:'bad'}, {id:Number.MAX_SAFE_INTEGER+1}]) {
  assert.equal(resolveInvestinyAssetMapping({'NSE:NIFTY50-INDEX':bad}, instrument), null,
    'missing, malformed or unsafe Investing.com IDs must not be guessed');
}
assert.equal(resolveInvestinyAssetMapping({NIFTY:{id:999260}}, instrument), null,
  'fuzzy ticker aliases are not accepted as asset mappings');
console.log('INVESTINY_EXACT_ASSET_MAPPING_CONTRACT_OK');
