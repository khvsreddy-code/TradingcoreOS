import assert from 'node:assert/strict';
import type { OHLCV } from '../vendor/vela/src/core/model/ohlcv.ts';
import { buildKagiSeries, buildLineBreakSeries, buildPointFigureSeries, buildRenkoSeries } from '../vendor/vela/src/core/price-styles/synthetic.ts';
import { chartType } from '../vendor/vela/src/chart-types/registry.ts';
import { rendererLayers } from '../vendor/vela/src/renderers/native/layers.ts';
import '../vendor/vela/src/chart-types/builtins.ts';
const closes=[100,130,100,70,95,120,90,60,85];
const bars:OHLCV[]=closes.map((close,i)=>({time:1_700_000_000_000+i*60_000,open:i?closes[i-1]!:close,high:Math.max(close,i?closes[i-1]!:close)+2,low:Math.min(close,i?closes[i-1]!:close)-2,close,volume:100+i}));
const renko=buildRenkoSeries(bars,10,2);
assert.ok(renko.length>4,'Renko can emit multiple synthetic bricks for one source bar');
assert.ok(renko.every(x=>Math.abs(x.close-x.open)===10),'Renko brick body equals configured box size');
assert.ok(renko.some((x,i)=>i>0&&x.direction!==renko[i-1]!.direction),'Renko uses the two-box reversal rule');
const lineBreak=buildLineBreakSeries(bars,3);
assert.ok(lineBreak.length>2,'N-Line Break produces accepted lines on close breakouts');
assert.ok(lineBreak.every(x=>x.open!==x.close),'Line Break retains the open-close range');
const kagi=buildKagiSeries(bars,10);
assert.ok(kagi.length>3,'Kagi preserves extreme points and retracement turns');
assert.ok(kagi.some((x,i)=>i>0&&x.direction!==kagi[i-1]!.direction),'Kagi turns at the configured reversal');
const pnf=buildPointFigureSeries(bars,10,3);
assert.ok(pnf.length>=2,'Point & Figure creates multiple columns');
assert.ok(pnf.some((x,i)=>i>0&&x.direction!==pnf[i-1]!.direction),'Point & Figure uses configured reversal boxes');
assert.ok(pnf.every(x=>x.prices.length>0),'Point & Figure columns have price marks');
for(const id of ['renko','kagi','linebreak','pointfigure']){
 assert.ok(chartType(id),id+' must be exposed in the chart type registry');
 assert.equal(chartType(id)?.basePainting,'none',id+' must replace the underlying candle rendering');
 assert.equal(typeof chartType(id)?.dataEngine,'function',id+' must own its history/realtime/replay data engine');
 assert.ok(rendererLayers().some(x=>x.id===id),id+' must render as a native Vela layer');
}
console.log('VELA_SYNTHETIC_PRICE_STYLES_CONTRACT_OK');
