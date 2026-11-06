import assert from 'node:assert/strict';
import {CoreSpiritRuntime} from './runtime.ts';
import {makeCoreSpiritProgram} from './coreSpiritPipeline.ts';
import {CoreEventBus} from '../core/event/eventBus.ts';
const source=[
  'indicator("Native plot primitives") {',
  '  overlay: true',
  '}',
  'plotshape(close > open, "Bull", "triangleUp", "belowbar", "#22c55e", 0, "B")',
  'plotchar(close > open, "Bull char", "▲", "abovebar", "#ffffff", 0)',
  'alertcondition(close > open, "Bullish", "Bullish candle")',
].join('\n');
const bus=new CoreEventBus(),alerts=[];
bus.on('script.alert',event=>alerts.push(event));
const runtime=new CoreSpiritRuntime({sourceId:'plot-parity',symbol:'NSE:NIFTY50-INDEX',timeframe:'5m',executionMode:'historical'},bus);
const outputs=runtime.execute(makeCoreSpiritProgram(source,'plot-parity'),[
  {timestamp:'2026-01-01T09:15:00Z',open:100,high:103,low:99,close:102,volume:1000},
  {timestamp:'2026-01-01T09:20:00Z',open:102,high:103,low:100,close:101,volume:1100},
]);
assert.equal(outputs.filter(x=>x.kind==='shape').length,1);
assert.equal(outputs.filter(x=>x.kind==='label'&&x.text==='▲').length,1);
assert.equal(alerts.length,1);
assert.equal(alerts[0].payload.message,'Bullish candle');
assert.equal(alerts[0].payload.frequency,'once-per-bar-close');
console.log('CORESPIRIT_PLOT_SHAPE_CHAR_ALERTCONDITION_RUNTIME_CONTRACT_OK');