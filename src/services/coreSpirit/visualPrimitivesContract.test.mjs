import assert from 'node:assert/strict';
import {coreSpiritPlotShape,coreSpiritPlotChar,coreSpiritFillSeries} from './visualPrimitives.ts';
assert.equal(coreSpiritPlotShape('up',1,10,'triangleUp').kind,'shape');
assert.equal(coreSpiritPlotChar('entry',1,10,'▲').kind,'label');
const fill=coreSpiritFillSeries('spread',[1,2,3],[10,null,12],[8,7,9],{fillColor:'rgba(0,255,0,.2)'});
assert.equal(fill.length,2);assert.deepEqual(fill.map(x=>[x.top,x.bottom]),[[10,8],[12,9]]);
assert.throws(()=>coreSpiritFillSeries('x',[1],[1,2],[0]),/equally sized/);
console.log('CORESPIRIT_NATIVE_VISUAL_PRIMITIVES_CONTRACT_OK');