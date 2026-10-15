import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adaptCoreSpiritOutputsForVela,
  coreSpiritTimeToVelaMillis,
  normalizeVelaBarsToCoreSpirit,
  CoreSpiritVelaAlignmentError,
  CoreSpiritVelaOutputRevisionGate,
} from './velaOutputAdapter.ts';
import { CoreSpiritOutputDispatcher } from './outputDispatcher.ts';

const t0 = 1767225600; // 2026-01-01T00:00:00Z in CoreSpirit epoch-seconds.
const bars = normalizeVelaBarsToCoreSpirit([
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
]);

assert.equal(coreSpiritTimeToVelaMillis(t0), t0 * 1000);
assert.equal(coreSpiritTimeToVelaMillis(t0 * 1000), t0 * 1000);
assert.equal(Date.parse(bars[1]!.timestamp), (t0 + 300) * 1000);
assert.throws(() => normalizeVelaBarsToCoreSpirit([
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: t0 * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
]), /non-unique or non-chronological/);

const adapted = adaptCoreSpiritOutputsForVela([
  { kind: 'series', time: t0, value: 101, seriesId: 'sma', metadata: { barIndex: 0 } },
  { kind: 'series', time: t0 + 300, value: 102, seriesId: 'sma', metadata: { barIndex: 1 } },
  { kind: 'line', id: 'trend-line', start: { time: t0, price: 100 }, end: { time: t0 + 600, price: 105 } },
  { kind: 'signal', time: t0 + 300, type: 'BUY', metadata: { barIndex: 1, signalId: 'buy-1' } },
], bars);

assert.equal(adapted.timeUnit, 'epoch-milliseconds');
assert.equal(adapted.outputs[0]!.time, t0 * 1000);
assert.equal(adapted.outputs[1]!.time, (t0 + 300) * 1000);
assert.deepEqual(adapted.alignment.slice(0, 2).map(item => [item.barIndex, item.aligned]), [[0, true], [1, true]]);
const convertedLine = adapted.outputs[2]!;
assert.equal(convertedLine.kind, 'line');
if (convertedLine.kind === 'line') {
  assert.equal(convertedLine.start.time, t0 * 1000, 'drawing geometry must use the same Vela millisecond coordinate space');
  assert.equal(convertedLine.end.time, (t0 + 600) * 1000);
}
assert.equal(adapted.outputs[3]!.time, (t0 + 300) * 1000);

assert.throws(() => adaptCoreSpiritOutputsForVela([
  { kind: 'series', time: t0 + 301, value: 1, seriesId: 'misaligned' },
], bars), (error) => error instanceof CoreSpiritVelaAlignmentError && error.outputIndex === 0);
assert.throws(() => adaptCoreSpiritOutputsForVela([
  { kind: 'series', time: t0 + 300, value: 1, seriesId: 'wrong-index', metadata: { barIndex: 2 } },
], bars), /claims bar index 2/);
const offWindowSignal = adaptCoreSpiritOutputsForVela([
  { kind: 'signal', time: t0 - 300, type: 'OLD', metadata: { barIndex: 0 } },
], bars);
assert.equal(offWindowSignal.warnings.length, 1, 'off-window signals are normalized but surfaced for diagnostics');

const revisions = new CoreSpiritVelaOutputRevisionGate();
const rev1 = { streamId: 'chart-1', datasetRevision: 4, outputRevision: 10 };
assert.equal(revisions.accept(rev1), true);
assert.equal(revisions.isCurrent(rev1), true);
assert.equal(revisions.accept({ ...rev1, outputRevision: 10 }), false, 'duplicate output revisions must be rejected');
assert.equal(revisions.accept({ ...rev1, outputRevision: 9 }), false, 'older output revisions must be rejected');
const rev2 = { streamId: 'chart-1', datasetRevision: 5, outputRevision: 1 };
assert.equal(revisions.accept(rev2), true, 'a newer data revision may restart its output sequence');
assert.equal(revisions.isCurrent(rev1), false);
assert.equal(revisions.accept({ ...rev2, datasetRevision: 4, outputRevision: 99 }), false, 'a stale dataset cannot win with a larger output revision');

// CoreSpiritOutputDispatcher is a retained output cache, not an append-only tick log.
// A forming bar reuses the timestamp and historical inserts maintain sorted time order.
const dispatcher = new CoreSpiritOutputDispatcher();
dispatcher.accept([
  { kind: 'series', time: t0, value: 10, seriesId: 'ema' },
  { kind: 'series', time: t0 + 600, value: 12, seriesId: 'ema' },
], 'test');
dispatcher.accept([
  { kind: 'series', time: t0 + 600, value: 13, seriesId: 'ema' },
  { kind: 'series', time: t0 + 300, value: 11, seriesId: 'ema' },
], 'test');
const emaPoints = dispatcher.frame().plots.get('ema')!;
assert.deepEqual(emaPoints.map(point => point.time), [t0, t0 + 300, t0 + 600]);
assert.deepEqual(emaPoints.map(point => point.value), [10, 11, 13], 'forming-bar updates replace, not duplicate, their observation');

dispatcher.accept([
  { kind: 'signal', time: t0 + 300, type: 'BUY', metadata: { signalId: 'stable-signal' } },
], 'test');
dispatcher.accept([
  { kind: 'signal', time: t0 + 300, type: 'BUY UPDATED', metadata: { signalId: 'stable-signal' } },
], 'test');
assert.equal(dispatcher.frame().signals.length, 1, 'stable signal identity updates one retained object');

const engineSource = readFileSync('src/CoreSpiritVelaEngine.ts', 'utf8');
const outputController = readFileSync('src/services/coreSpirit/chartOutputController.ts', 'utf8');
const chartController = readFileSync('src/services/core/chart/controllers/ChartCoreSpiritController.ts', 'utf8');
const sceneDiff = readFileSync('src/services/core/chart/coreSpiritSceneDiff.ts', 'utf8');

assert.match(engineSource, /adaptCoreSpiritOutputsForVela\(result\.outputs,\s*currentBars\)/,
  'Vela scripting engine must use the shared timestamp adapter before diffing output into Vela');
const workerBridgeStart = engineSource.indexOf('const executeInWorker=async(');
const workerBridgeEnd = engineSource.indexOf('const safeOutputs =', workerBridgeStart);
const workerBridge = engineSource.slice(workerBridgeStart, workerBridgeEnd);
assert.ok(workerBridge.indexOf('adaptCoreSpiritOutputsForVela(result.outputs, currentBars)') <
  workerBridge.indexOf('outputs: adapted.outputs'),
  'Vela time normalization must happen before adapted outputs leave the worker bridge and reach retained scene state');
assert.match(chartController, /adaptCoreSpiritOutputsForVela\(result\.outputs,\s*bars\)/,
  'chart-indicator execution must share the exact same output adapter');
assert.match(chartController, /scheduleObjects\(adapted\.outputs/,
  'chart indicator result commits must go through a latest-wins render boundary');
assert.match(outputController, /requestAnimationFrame/,
  'Vela rendering may schedule commits but should not trigger CoreSpirit computation');
assert.doesNotMatch(outputController, /runCoreSpiritArtifactInWorker|CoreSpiritRuntime|compileCoreSpirit/,
  'the output/render adapter must not own or trigger script evaluation');
assert.match(sceneDiff, /outputDirtySpan/,
  'the Vela scene diff remains the native rendering consumer of declarative output');

console.log('CORESPIRIT_VELA_CANONICAL_BOUNDARY_CONTRACT_OK');
