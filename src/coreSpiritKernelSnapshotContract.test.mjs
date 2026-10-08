import assert from 'node:assert/strict';

import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritFusedSeriesCursor } from './services/coreSpirit/seriesVector.ts';

function bars(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      timestamp: new Date(1_700_000_000_000 + index * 300_000).toISOString(),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + index,
    };
  });
}

const source = `
indicator "Snapshot EMA"
plot(ema(close, 3))
`;

const compiled = compileCoreSpirit(source, 'snapshot-test');
assert.ok(compiled.ir, compiled.diagnostics.map((item) => item.message).join('; '));

const runtime = new CoreSpiritRuntime({
  symbol: 'NSE:NIFTY50-INDEX',
  timeframe: '5',
  sourceId: 'snapshot-test',
  executionTier: 'optimized',
});

const history = bars(8);
runtime.loadIr(compiled.ir!);
runtime.executeIr(compiled.ir!, history);

const snapshots = runtime.getKernelStateSnapshots();
assert.ok(snapshots.length >= 1, 'expected a confirmed-bar kernel snapshot');
const snapshot = snapshots[0]!;
assert.equal(snapshot.barIndex, history.length - 1);
assert.ok(snapshot.modelVersion.length > 0);
assert.ok(snapshot.inputDependencies.length >= 1);
assert.ok(snapshot.inputDependencies.includes('close'));

const cursorUpdate = CoreSpiritFusedSeriesCursor.prototype.update;
let formingKernelUpdates = 0;
CoreSpiritFusedSeriesCursor.prototype.update = function (...args) {
  formingKernelUpdates += 1;
  return cursorUpdate.apply(this, args);
};

try {
  const forming = { ...history.at(-1)!, timestamp: new Date(1_700_000_000_000 + history.length * 300_000).toISOString(), close: 109, high: 110, low: 108 };
  const firstRevision = runtime.executeBar(forming);
  assert.equal(runtime.getExecutionFrame().isRealtime, true);
  assert.ok(firstRevision.outputs.some((item) => item.kind === 'series'));

  const updatesAfterFirstRevision = formingKernelUpdates;
  const secondRevision = runtime.executeBar({ ...forming, close: 110, high: 111 });
  assert.equal(runtime.getExecutionFrame().revision, 1);
  assert.ok(secondRevision.outputs.some((item) => item.kind === 'series'));
  assert.ok(formingKernelUpdates >= updatesAfterFirstRevision, 'forming revision did not execute its affected kernel');

  const restored = runtime.getKernelStateSnapshot(snapshot.nodeId, snapshot.barIndex);
  assert.ok(restored, 'confirmed snapshot was lost after intrabar revisions');
  assert.equal(restored?.barIndex, history.length - 1);
} finally {
  CoreSpiritFusedSeriesCursor.prototype.update = cursorUpdate;
}

const afterRevisionSnapshots = runtime.getKernelStateSnapshots();
assert.ok(afterRevisionSnapshots.some((entry) => entry.barIndex === history.length - 1));

console.log('CORESPIRIT_KERNEL_SNAPSHOT_CONTRACT_OK');
