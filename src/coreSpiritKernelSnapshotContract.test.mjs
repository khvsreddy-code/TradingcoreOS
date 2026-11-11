import assert from 'node:assert/strict';

import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritFusedSeriesCursor } from './services/coreSpirit/seriesVector.ts';
import { CoreSpiritKernelSnapshotStore } from './services/coreSpirit/kernelStateSnapshots.ts';

function bars(count) {
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
runtime.loadIr(compiled.ir);
runtime.executeIr(compiled.ir, history);

const snapshots = runtime.getKernelStateSnapshots();
assert.ok(snapshots.length >= 1, 'expected a confirmed-bar kernel snapshot');
const snapshot = snapshots[0];
assert.equal(snapshot.barIndex, history.length - 1);
assert.ok(snapshot.modelVersion.length > 0);
assert.ok(snapshot.inputDependencies.length >= 1);
assert.ok(snapshot.inputDependencies.includes('close'));
assert.ok(snapshot.kernelType.length > 0, 'snapshot must identify the concrete kernel type');
assert.ok(snapshot.kernelVersion === 1 || typeof snapshot.kernelVersion === 'string', 'snapshot must carry the kernel state schema version');
assert.ok(snapshot.parametersSignature.length > 0, 'snapshot must bind to its resolved parameter configuration');
assert.equal(snapshot.nextBarIndex, snapshot.barIndex + 1, 'snapshot must identify the next legal observation index');
assert.equal(typeof snapshot.dataRevision, 'number', 'snapshot must carry an input-history revision');


// Snapshot-store adversarial tests: same bar index is not enough when the kernel
// configuration or input-history generation has changed.
const snapshotStore = new CoreSpiritKernelSnapshotStore(4);
const checkpointMetadata = {
  nodeId:'test:ema', revision:0, inputDependencies:['close'],
  barIndex:4, nextBarIndex:5, modelVersion:'ir-v1',
  kernelType:'ema', kernelVersion:2, parametersSignature:'period=3',
  dataRevision:17,
};
snapshotStore.capture(checkpointMetadata, { cursor:42 }, state=>({ ...state }));
const restoredTarget = { cursor:0 };
const compatibleIdentity = {
  modelVersion:'ir-v1', kernelType:'ema', kernelVersion:2,
  parametersSignature:'period=3', dataRevision:17, nextBarIndex:5,
};
const copy = (target, source) => { target.cursor = source.cursor; };
assert.equal(snapshotStore.restoreAt(restoredTarget,'test:ema','ir-v1',['close'],4,copy,compatibleIdentity),true);
assert.equal(restoredTarget.cursor,42);
assert.equal(
  snapshotStore.restoreAt({cursor:0},'test:ema','ir-v1',['close'],4,copy),
  false,
  'restoration without an explicit kernel/configuration/data identity must fail closed',
);
assert.equal(
  snapshotStore.restore({cursor:0},'test:ema','ir-v1',['close'],4,copy),
  false,
  'latest-snapshot restoration must also require an explicit compatibility identity',
);
for (const mismatch of [
  { parametersSignature:'period=5' },
  { kernelVersion:3 },
  { kernelType:'rma' },
  { dataRevision:18 },
  { nextBarIndex:6 },
  { modelVersion:'ir-v2' },
]) {
  assert.equal(
    snapshotStore.restoreAt({cursor:0},'test:ema','ir-v1',['close'],4,copy,{...compatibleIdentity,...mismatch}),
    false,
    'mismatched checkpoint identity must fail closed: '+JSON.stringify(mismatch),
  );
}
assert.throws(
  ()=>snapshotStore.capture({...checkpointMetadata,nextBarIndex:4},{cursor:1},state=>({...state})),
  /nextBarIndex/,
  'a checkpoint cannot claim a different next execution position',
);

const cursorUpdate = CoreSpiritFusedSeriesCursor.prototype.update;
const cursorCopyFrom = CoreSpiritFusedSeriesCursor.prototype.copyFrom;
let formingKernelUpdates = 0;
let kernelRestores = 0;
CoreSpiritFusedSeriesCursor.prototype.update = function (...args) {
  formingKernelUpdates += 1;
  return cursorUpdate.apply(this, args);
};
CoreSpiritFusedSeriesCursor.prototype.copyFrom = function (...args) {
  kernelRestores += 1;
  return cursorCopyFrom.apply(this, args);
};

try {
  const forming = { ...history.at(-1), timestamp: new Date(1_700_000_000_000 + history.length * 300_000).toISOString(), close: 109, high: 110, low: 108 };
  const firstRevision = runtime.executeBar(forming);
  assert.equal(runtime.getExecutionFrame().isRealtime, true);
  assert.ok(firstRevision.outputs.some((item) => item.kind === 'series'));

  const updatesAfterFirstRevision = formingKernelUpdates;
  const secondRevision = runtime.executeBar({ ...forming, close: 110, high: 111 });
  assert.equal(runtime.getExecutionFrame().revision, 1);
  assert.ok(secondRevision.outputs.some((item) => item.kind === 'series'));
  assert.ok(formingKernelUpdates >= updatesAfterFirstRevision, 'forming revision did not execute its affected kernel');
  assert.ok(kernelRestores >= 1, 'same-bar revision did not restore a confirmed kernel snapshot');

  const restored = runtime.getKernelStateSnapshot(snapshot.nodeId, snapshot.barIndex);
  assert.ok(restored, 'confirmed snapshot was lost after intrabar revisions');
  assert.equal(restored?.barIndex, history.length - 1);
} finally {
  CoreSpiritFusedSeriesCursor.prototype.update = cursorUpdate;
  CoreSpiritFusedSeriesCursor.prototype.copyFrom = cursorCopyFrom;
}

const emptyBaselineRuntime = new CoreSpiritRuntime({
  symbol: 'NSE:NIFTY50-INDEX',
  timeframe: '5',
  sourceId: 'snapshot-empty-baseline',
  executionTier: 'optimized',
});
emptyBaselineRuntime.loadIr(compiled.ir);
const emptyBaselineSpy = CoreSpiritFusedSeriesCursor.prototype.copyFrom;
let emptyBaselineRestores = 0;
CoreSpiritFusedSeriesCursor.prototype.copyFrom = function (...args) {
  emptyBaselineRestores += 1;
  return emptyBaselineSpy.apply(this, args);
};
try {
  const firstBar = bars(1)[0];
  emptyBaselineRuntime.executeBar(firstBar);
  emptyBaselineRuntime.executeBar({ ...firstBar, close: firstBar.close + 1, high: firstBar.high + 1 });
  assert.ok(emptyBaselineRestores >= 1, 'first live bar revisions must restore the empty baseline checkpoint');
  assert.ok(emptyBaselineRuntime.getKernelStateSnapshot('missing') === undefined);
} finally {
  CoreSpiritFusedSeriesCursor.prototype.copyFrom = emptyBaselineSpy;
}

const afterRevisionSnapshots = runtime.getKernelStateSnapshots();
assert.ok(afterRevisionSnapshots.some((entry) => entry.barIndex === history.length - 1));

console.log('CORESPIRIT_KERNEL_SNAPSHOT_CONTRACT_OK');
