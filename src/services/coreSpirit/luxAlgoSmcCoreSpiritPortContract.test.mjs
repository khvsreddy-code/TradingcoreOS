import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline.ts';

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

const execution = executeCoreSpirit(source, bars, 'luxalgo-smc-port-runtime');
assert.deepEqual(execution.diagnostics, [], 'converted SMC execution must not emit runtime diagnostics');

const outputs = execution.outputs;
assert.ok(outputs.some(item => item.kind === 'series'), 'swing-high/low plots must produce chart series');
assert.ok(outputs.some(item => item.kind === 'label' && /BOS/.test(item.text)), 'structure breaks must produce BOS chart labels');
assert.ok(outputs.some(item => item.kind === 'label' && /CHoCH/.test(item.text)), 'a break against the retained structure bias must produce a CHoCH label');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#00FF68'), 'bullish fair-value gaps must produce green chart zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#FF0008'), 'bearish fair-value gaps must produce red chart zones');

console.log('CORESPIRIT_LUXALGO_SMC_PORT_COMPILE_AND_CHART_OUTPUT_OK');
