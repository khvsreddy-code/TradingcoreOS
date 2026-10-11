import assert from 'node:assert/strict';
import {
  coreSpiritMarketFrameArrayFacade,
  coreSpiritMarketFrameFromColumns,
} from './marketData.ts';

const time=new Float64Array([1767225600,1767225660]);
const open=new Float64Array([1,1.5]);
const high=new Float64Array([2,2.5]);
const low=new Float64Array([0.5,1.2]);
const close=new Float64Array([1.5,2]);
const volume=new Float64Array([10,20]);
const frame=coreSpiritMarketFrameFromColumns({time,open,high,low,close,volume,length:2,timeUnit:'seconds'});
let active=frame;
const bars=coreSpiritMarketFrameArrayFacade(()=>active);

assert.equal(Array.isArray(bars),true,'legacy runtime facade must remain Array-compatible');
assert.equal(bars.length,2);
assert.equal(bars[0]?.close,1.5);
assert.equal(bars.at(-1)?.volume,20);
assert.deepEqual(bars.map(bar=>bar.close),[1.5,2]);
assert.equal(bars[0]?.timestamp,'2026-01-01T00:00:00.000Z');

const oldSnapshot=bars[0]!;
close[0]=1.75;
assert.equal(bars[0]?.close,1.75,'new reads must observe updated numeric columns');
assert.equal(oldSnapshot.close,1.5,'a bar already handed to legacy VM must remain a stable snapshot');
assert.equal(frame.close.buffer,close.buffer,'wrapping frame columns must not copy their backing buffer');
console.log('CORESPIRIT_MARKET_FRAME_FACADE_OK');
