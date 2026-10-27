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
for (let i = 0; i < 70; i += 1) {
  let base;
  if (i < 25) base = 100 + Math.sin(i * 0.7) * 2;
  else if (i < 35) base = 111 + Math.sin((i - 26) * 0.7);
  else if (i < 52) base = 96 + Math.sin((i - 36) * 0.6);
  else base = 107 + Math.sin((i - 53) * 0.6);
  const open = base - 0.2;
  const close = base + 0.2;
  bars.push(candle(i, open, Math.max(open, close) + 0.5, Math.min(open, close) - 0.5, close));
}
bars[25] = candle(25, 108, 113, 107.5, 112); // bullish imbalance and upward structure break
bars[35] = candle(35, 100, 101, 94.5, 96);  // bearish imbalance and downward structure break
bars[52] = candle(52, 102, 107, 101.5, 106); // bullish reversal through the prior range
bars[60] = candle(60, 113, 122, 112.5, 120); // post-warmup bullish swing break and bullish FVG
bars[65] = candle(65, 89.5, 90, 88, 89); // post-warmup bearish break, CHoCH, and bearish FVG

const execution = executeCoreSpirit(source, bars, 'luxalgo-smc-port-runtime');
assert.deepEqual(execution.diagnostics, [], 'converted SMC execution must not emit runtime diagnostics');

const outputs = execution.outputs;
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
assert.ok(outputs.some(item => item.kind === 'label' && /CHoCH/.test(item.text)), 'a break against the retained structure bias must produce a CHoCH label');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#00FF68'), 'bullish fair-value gaps must produce green chart zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#FF0008'), 'bearish fair-value gaps must produce red chart zones');

console.log('CORESPIRIT_LUXALGO_SMC_PORT_COMPILE_AND_CHART_OUTPUT_OK');
