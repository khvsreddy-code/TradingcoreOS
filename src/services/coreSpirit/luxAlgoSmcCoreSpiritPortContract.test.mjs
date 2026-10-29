import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline.ts';
import { requireCoreSpiritOutputs } from './boundaryValidation.ts';
import { toCoreSpiritWorkerTransportValue } from './workerTransport.ts';

const source = CORESPIRIT_LUXALGO_SMC_SOURCE;
const compiled = compileCoreSpirit(source, 'luxalgo-smc-port-contract', { layer: 'script' });
const compileErrors = compiled.diagnostics.filter(item => item.severity === 'error');
assert.deepEqual(compileErrors, [], 'the converted SMC source must compile without diagnostics');
assert.ok(compiled.artifact, 'the converted SMC source must produce an executable artifact');
assert.ok(compiled.ir, 'the converted SMC source must produce executable IR');

function candle(index, open, high, low, close) {
  return {
    timestamp: new Date((1_700_000_000 + index * 300) * 1000).toISOString(),
    open, high, low, close, volume: 1000 + index,
  };
}

const stateProbeSource = `
indicator("Persistent State Probe") {
    overlay: true
}
let bias: state<number> = 0
if close > 100 {
    bias := 1
}
if close < 90 and bias > 0 {
    label("State CHoCH", "below", "#089981", "#FFFFFF", 10, "pill")
}
`;
const stateProbeRun = executeCoreSpirit(stateProbeSource, [
  candle(0, 104, 106, 103, 105),
  candle(1, 90, 91, 88, 89),
], 'persistent-state-initializer');
assert.ok(stateProbeRun.outputs.some(item => item.kind === 'label' && item.text === 'State CHoCH'),
  'typed state initializer must not overwrite the state updated on the previous bar');
const bars = [];
for (let i = 0; i < 140; i += 1) {
  let base;
  if (i < 25) base = 100 + Math.sin(i * 0.7) * 2;
  else if (i < 35) base = 111 + Math.sin((i - 26) * 0.7);
  else if (i < 52) base = 96 + Math.sin((i - 36) * 0.6);
  else base = 107 + Math.sin((i - 53) * 0.6);
  const open = base - 0.2;
  const close = base + 0.2;
  bars.push(candle(i, open, Math.max(open, close) + 0.5, Math.min(open, close) - 0.5, close));
}
bars[25] = candle(25, 108, 113, 107.5, 112); // bullish imbalance, still below the later confirmed swing high
bars[35] = candle(35, 82, 83, 78, 80); // confirmed swing low; later break exercises bearish structure output
bars[52] = candle(52, 102, 107, 101.5, 106); // bullish retracement before the confirmed pivot
bars[55] = candle(55, 112, 115, 111.5, 114); // pivot high dominates the prior 50 bars and confirms at bar 105
bars[75] = candle(75, 64, 67, 62, 63); // confirmed swing low after sufficient left/right history
bars[115] = candle(115, 116.4, 122, 116.2, 120); // bullish break of confirmed swing high establishes bullish bias
bars[135] = candle(135, 58, 61, 56, 58); // breaks confirmed swing low against bullish bias, producing CHoCH

const execution = executeCoreSpirit(source, bars, 'luxalgo-smc-port-runtime');
assert.deepEqual(execution.diagnostics, [], 'converted SMC execution must not emit runtime diagnostics');

const outputs = execution.outputs;
// Diagnostic probes run only if the acceptance assertion fails. They report the exact
// bars where swing pivots/breaks fire and the retained swing level/bias at bars 124/134.
const structureProbe = outputs.some(item => item.kind === 'label' && /CHoCH/.test(item.text))
  ? []
  : executeCoreSpirit(source + `
if swingPivotLowConfirmed == true { label("DEBUG_LOW_PIVOT", "below", "#00FF00", "#000000", 8, "pill") }
if swingBullBreak == true { label("DEBUG_BULL_BREAK", "below", "#00FF00", "#000000", 8, "pill") }
if swingBearBreak == true { label("DEBUG_BEAR_BREAK", "above", "#FF0000", "#FFFFFF", 8, "pill") }
if bar_index == 124 { labelAt(time[0], swingPivotLow, "DEBUG_LOW_124", "below", "#00FF00", "#000000", 8, "pill", "600") }
if close < 65 {
  if swingPivotLow < 65 { label("DEBUG_PIVOT_LT_65", "below", "#00FF00", "#000000", 8, "pill") }
  if swingPivotLow >= 65 { label("DEBUG_PIVOT_GE_65", "below", "#00FF00", "#000000", 8, "pill") }
  if close[1] >= swingPivotLow { label("DEBUG_PREV_CLOSE_GE_PIVOT", "below", "#00FF00", "#000000", 8, "pill") }
  if close[1] < swingPivotLow { label("DEBUG_PREV_CLOSE_LT_PIVOT", "below", "#00FF00", "#000000", 8, "pill") }
  if swingLowBroken == true { label("DEBUG_LOW_BROKEN", "below", "#00FF00", "#000000", 8, "pill") }
  if swingLowBroken == false { label("DEBUG_LOW_OPEN", "below", "#00FF00", "#000000", 8, "pill") }
  if swingBearBreak == true { label("DEBUG_BEAR_BREAK_TRUE", "above", "#FF0000", "#FFFFFF", 8, "pill") }
  if swingBearBreak == false { label("DEBUG_BEAR_BREAK_FALSE", "above", "#FF0000", "#FFFFFF", 8, "pill") }
  if swingBias > 0 { label("DEBUG_SWING_BIAS_BULL", "below", "#00FF00", "#000000", 8, "pill") }
  if swingBias < 0 { label("DEBUG_SWING_BIAS_BEAR", "below", "#00FF00", "#000000", 8, "pill") }
}
`, bars, 'luxalgo-smc-port-runtime-diagnostic').outputs
  .filter(item => item.kind === 'label' && /DEBUG_/.test(item.text))
  .map(item => ({ text: item.text, time: item.time, price: item.price, barIndex: item.metadata?.barIndex }));
// Incremental execution exposes proxy-backed compatibility views and extension
// metadata can contain callbacks. The worker transport must turn these into
// clone-safe data instead of failing DedicatedWorkerGlobalScope.postMessage.
const transportProbe = toCoreSpiritWorkerTransportValue({
  outputs,
  state: {
    seriesState: new Proxy({ swing: [1, 2, 3] }, {}),
    localSeries: new Proxy({ enabled: [true, false] }, {}),
    callback: () => 'host-only',
    nested: { render: () => undefined, value: 7 },
  },
  diagnostics: [],
});
assert.doesNotThrow(() => structuredClone(transportProbe),
  'sanitized CoreSpirit execution payloads must be structured-cloneable');
assert.equal(transportProbe.state.callback, undefined,
  'worker transport must strip executable callbacks from runtime snapshots');
assert.deepEqual(transportProbe.state.seriesState, { swing: [1, 2, 3] },
  'proxy-backed runtime views must be copied into plain data records');
// The real SMC run emits rectangles/zones whose coordinates are left/right/top/bottom,
// not a top-level time. Every valid output must pass the same worker boundary used in production.
assert.equal(requireCoreSpiritOutputs(outputs).length, outputs.length,
  'the SMC worker output payload must accept valid series, labels, and time-independent zone coordinates');
assert.equal(requireCoreSpiritOutputs([
  { kind: 'zone', left: 1, right: 2, top: 10, bottom: 9 },
  { kind: 'zone', left: 0, right: Number.POSITIVE_INFINITY, top: 10, bottom: 9, domain: 'viewport' },
  { kind: 'line', start: { time: 1, price: 9 }, end: { time: 2, price: 10 } },
  { kind: 'table', id: 'table-1', position: 'topRight', row: 0, column: 0, text: 'SMC' },
]).length, 4, 'zone, line, and table outputs must validate according to their own coordinate contracts');
assert.throws(() => requireCoreSpiritOutputs([
  { kind: 'zone', left: 1, right: 2, top: 10, bottom: Number.NaN },
]), /Invalid CoreSpirit worker output payload/,
  'malformed geometry must still be rejected at the worker boundary');
assert.ok(!outputs.some(item => item.kind === 'series'),
  'the SMC port must not paint rolling extrema as continuous plots across every candle');
const structureLines = outputs.filter(item => item.kind === 'line');
assert.ok(structureLines.length > 0, 'structure breaks must produce anchored Vela line drawings');
assert.ok(structureLines.every(item => item.start.time <= item.end.time && item.start.price === item.end.price),
  'BOS/CHoCH structure lines must use chart-time anchors and a stable horizontal price level');
assert.ok(outputs.some(item => item.kind === 'label' && /BOS/.test(item.text)), 'structure breaks must produce BOS chart labels');
assert.ok(structureLines.length < bars.length / 3,
  'structure drawings should be emitted on break transitions, not on every bar after the break');
assert.ok(outputs.some(item => item.kind === 'label' && /CHoCH/.test(item.text)), 'a break against the retained structure bias must produce a CHoCH label; labels=' + JSON.stringify(outputs.filter(item => item.kind === 'label').map(item => ({text:item.text,time:item.time,price:item.price,barIndex:item.metadata?.barIndex}))) + '; debug=' + JSON.stringify(structureProbe));
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#00FF68'), 'bullish fair-value gaps must produce green chart zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#FF0008'), 'bearish fair-value gaps must produce red chart zones');
const fvgZones = outputs.filter(item => item.kind === 'zone' && (item.style?.fillColor === '#00FF68' || item.style?.fillColor === '#FF0008'));
assert.ok(fvgZones.length > 0, 'edge-triggered FVG transitions must keep real imbalance zones');
assert.ok(fvgZones.every(item => item.right > item.left), 'FVGs must be forward-projected zones rather than zero-width rectangles');

console.log('CORESPIRIT_LUXALGO_SMC_PORT_COMPILE_AND_CHART_OUTPUT_OK');
