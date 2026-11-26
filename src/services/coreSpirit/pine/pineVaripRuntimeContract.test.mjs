import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from '../compiler.ts';
import { CoreSpiritRuntime } from '../runtime.ts';

const source = [
  '//@version=6',
  'indicator("Pine varip runtime")',
  'var int barCount = 0',
  'varip int tickCount = 0',
  'barCount := barCount + 1',
  'tickCount := tickCount + 1',
  'plot(barCount)',
  'plot(tickCount)',
].join('\n');
const compiled = new CoreSpiritCompiler().compileSource(source, 'pine-varip-runtime', { frontend:'pine-v6' });
assert.ok(compiled.ir, compiled.diagnostics.map(item => item.code + ': ' + item.message).join('\n'));

const history = [
  { timestamp:'2026-11-25T09:15:00.000Z', open:100, high:102, low:99, close:101, volume:100 },
  { timestamp:'2026-11-25T09:20:00.000Z', open:101, high:103, low:100, close:102, volume:110 },
];
const liveBar = { timestamp:'2026-11-25T09:25:00.000Z', open:102, high:104, low:101, close:103, volume:120 };

for (const executionTier of ['reference', 'optimized']) {
  const runtime = new CoreSpiritRuntime({ sourceId:'pine-varip-' + executionTier, executionTier });
  runtime.executeIr(compiled.ir, history);
  let checkpoint = runtime.exportCheckpoint();
  assert.equal(checkpoint.persistentState.barCount, 2, executionTier + ': var must persist across historical bars');
  assert.equal(checkpoint.intrabarState.tickCount, 2, executionTier + ': varip must also advance on historical bars');

  runtime.executeBar(liveBar, 'realtime');
  checkpoint = runtime.exportCheckpoint();
  assert.equal(checkpoint.persistentState.barCount, 3, executionTier + ': first forming-bar revision updates var once');
  assert.equal(checkpoint.intrabarState.tickCount, 3, executionTier + ': first forming-bar revision updates varip');

  runtime.executeBar({ ...liveBar, high:105, close:104, volume:130 }, 'realtime');
  checkpoint = runtime.exportCheckpoint();
  assert.equal(checkpoint.persistentState.barCount, 3, executionTier + ': var must roll back to confirmed baseline before the next tick');
  assert.equal(checkpoint.intrabarState.tickCount, 4, executionTier + ': varip must survive rollback and increment across ticks');

  runtime.executeBar({ ...liveBar, high:106, close:105, volume:140 }, 'realtime');
  checkpoint = runtime.exportCheckpoint();
  assert.equal(checkpoint.persistentState.barCount, 3, executionTier + ': repeated realtime updates must not duplicate var state');
  assert.equal(checkpoint.intrabarState.tickCount, 5, executionTier + ': varip must retain every intrabar update');

  runtime.confirmRealtimeBar();
  const committed = runtime.exportCheckpoint();
  assert.equal(committed.persistentState.barCount, 3);
  assert.equal(committed.persistentState.barCount, 3, executionTier + ': confirmed execution must commit the bar-local var value once');
  assert.equal(committed.intrabarState.tickCount, 6, executionTier + ': varip must survive the final confirmed execution as well as forming ticks');
}
console.log('CORESPIRIT_PINE_VARIP_RUNTIME_OK');
