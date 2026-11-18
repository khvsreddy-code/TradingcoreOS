import assert from 'node:assert/strict';
import type { OHLCV } from '../vendor/vela/src/core/model/ohlcv.ts';
import { buildKagiSeries, buildLineBreakSeries, buildPointFigureSeries, buildRenkoSeries } from '../vendor/vela/src/core/price-styles/synthetic.ts';
import { chartType } from '../vendor/vela/src/chart-types/registry.ts';
import { rendererLayers } from '../vendor/vela/src/renderers/native/layers.ts';
import { registerBuiltinChartTypes } from '../vendor/vela/src/chart-types/builtins.ts';
registerBuiltinChartTypes();
const closes=[100,130,100,70,95,120,90,60,85];
const bars:OHLCV[]=closes.map((close,i)=>({time:1_700_000_000_000+i*60_000,open:i?closes[i-1]!:close,high:Math.max(close,i?closes[i-1]!:close)+2,low:Math.min(close,i?closes[i-1]!:close)-2,close,volume:100+i}));
const renko=buildRenkoSeries(bars,10,2);
assert.ok(renko.length>4,'Renko can emit multiple synthetic bricks for one source bar');
assert.ok(renko.every(x=>Math.abs(x.close-x.open)===10),'Renko brick body equals configured box size');
assert.ok(renko.some((x,i)=>i>0&&x.direction!==renko[i-1]!.direction),'Renko uses the two-box reversal rule');
const lineBreak=buildLineBreakSeries(bars,3);
const intrabarBars:OHLCV[]=[
  {time:1_700_100_000_000,open:100,high:100,low:100,close:100,volume:10},
  {time:1_700_100_060_000,open:100,high:130,low:70,close:100,volume:20},
];
assert.equal(buildRenkoSeries(intrabarBars,10,2).length,0,'close-only remains the safe default when the bar closes at its open');
assert.ok(buildRenkoSeries(intrabarBars,10,2,{sourceMode:'ohlc',intrabarPath:'ohlc'}).length>0,'explicit OHLC mode consumes intrabar high/low excursions');
assert.ok(buildRenkoSeries(intrabarBars,10,2,{sourceMode:'ohlc',intrabarPath:'olhc'}).length>0,'alternate deterministic OHLC path is supported');
assert.ok(buildPointFigureSeries(intrabarBars,10,3,{sourceMode:'ohlc'}).length>0,'Point & Figure can use an explicit OHLC path');
assert.ok(buildKagiSeries(intrabarBars,10,{sourceMode:'ohlc'}).length>1,'Kagi consumes explicit intrabar swings');
assert.ok(buildLineBreakSeries(intrabarBars,1,{sourceMode:'ohlc'}).length>0,'Line Break consumes explicit intrabar breakouts');
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
// Every native synthetic style must publish a historical snapshot, react to a new
// forming/history bar, pause while hidden, and republish the current state on resume.
const testHost = (current: { bars: OHLCV[]; pushes: unknown[] }) => ({
 symbol: 'NIFTY', timeframe: '1', live: true,
 bars: () => current.bars,
 data: {} as never,
 pushData: (data: unknown) => current.pushes.push(data),
 pushPending: (_ranges: ReadonlyArray<readonly [number, number]>) => {},
});
for (const id of ['renko','kagi','linebreak','pointfigure'] as const) {
 const engine = chartType(id)!.dataEngine!();
 const state = { bars: [...bars], pushes: [] as unknown[] };
 engine.start(testHost(state));
 assert.equal(state.pushes.length,1,id+' must publish its historical build on start');
 assert.equal((state.pushes[0] as {sourceBarCount:number}).sourceBarCount,bars.length,id+' history output must align to its source bar count');
 const appended = {time:bars.at(-1)!.time+60_000,open:bars.at(-1)!.close,high:bars.at(-1)!.close+22,low:bars.at(-1)!.close-17,close:bars.at(-1)!.close+15,volume:999};
 state.bars = [...state.bars,appended];
 engine.onBars?.();
 assert.equal(state.pushes.length,2,id+' must publish when bars append or update in realtime');
 assert.equal((state.pushes.at(-1) as {sourceBarCount:number}).sourceBarCount,bars.length+1,id+' realtime output must include the appended bar');
 engine.suspend();
 engine.onBars?.();
 assert.equal(state.pushes.length,2,id+' must suppress renderer pushes while suspended');
 engine.resume();
 assert.equal(state.pushes.length,3,id+' must restore its current data when resumed');
 engine.onSettings?.({boxSize:5,reversalBoxes:2,lineCount:2,reversal:5});
 assert.equal(state.pushes.length,4,id+' must rebuild from canonical history when settings change');
 engine.stop();
 engine.onBars?.();
 assert.equal(state.pushes.length,4,id+' must release its host and stop publishing after teardown');
}
console.log('VELA_SYNTHETIC_PRICE_STYLES_CONTRACT_OK');
