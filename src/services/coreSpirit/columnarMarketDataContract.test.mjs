import assert from 'node:assert/strict';
import { CoreSpiritColumnarHistory, coreSpiritColumnarFromBars } from './columnarMarketData.ts';

const bars=[
  {timestamp:'2026-01-01T00:00:00.000Z',open:1,high:2,low:0.5,close:1.5,volume:10},
  {timestamp:'2026-01-01T00:01:00.000Z',open:1.5,high:2.5,low:1.2,close:2,volume:20},
];
const columns=coreSpiritColumnarFromBars(bars);
assert.equal(columns.length,2);
assert.equal(columns.close[1],2);
assert.equal(columns.volume[0],10);
const history=new CoreSpiritColumnarHistory();
history.replaceColumns(columns);
assert.equal(history.length,2);
assert.equal(history.valueAt('close',1),2);
assert.equal(history.valueAt('time',0),1767225600);
history.replaceLast({timestamp:'2026-01-01T00:01:00.000Z',open:1.5,high:2.5,low:1.2,close:2.25,volume:22});
assert.equal(history.valueAt('close',1),2.25);
history.append({timestamp:'2026-01-01T00:02:00.000Z',open:2.25,high:2.7,low:2,close:2.6,volume:15});
assert.equal(history.length,3);
history.trimTo(2);
assert.equal(history.length,2);
assert.equal(history.valueAt('close',0),2.25);
console.log('CORESPIRIT_COLUMNAR_MARKET_DATA_CONTRACT_OK');