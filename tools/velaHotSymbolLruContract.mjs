import assert from 'node:assert/strict';
import { BarStore } from '../vendor/vela/src/data/BarStore.ts';

const store = new BarStore();
const bar = (time:number) => ({time,open:1,high:1,low:1,close:1});
for (let i=0;i<12;i++) {
  const symbol = `SYM${i}`;
  store.retainSymbol(symbol);
  store.merge(`tco|${symbol}|5m`, [bar(i+1)]);
}
store.retainSymbol('SYM11');
assert.ok(store.get('tco|SYM11|5m')?.length);
store.retainSymbol('SYM0');
assert.ok(store.get('tco|SYM0|5m')?.length, 'recent symbol must remain hot');
store.retainSymbol('NEW');
assert.equal(store.get('tco|SYM1|5m'), undefined, 'oldest hot symbol should be evicted');
console.log('VELA_HOT_SYMBOL_LRU_CONTRACT_OK');
