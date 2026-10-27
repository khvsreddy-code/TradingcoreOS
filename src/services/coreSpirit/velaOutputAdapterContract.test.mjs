import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adaptCoreSpiritOutputsForVela,
  coreSpiritTimeToVelaMillis,
  normalizeVelaBarsToCoreSpirit,
  CoreSpiritVelaAlignmentError,
  CoreSpiritVelaOutputRevisionGate,
  safeVelaNormalizationStart,
} from './velaOutputAdapter.ts';
import { CoreSpiritOutputDispatcher } from './outputDispatcher.ts';
import { CoreSpiritSceneDiff } from '../core/chart/coreSpiritSceneDiff.ts';
import { buildCoreSpiritVelaIndicatorModel } from '../core/chart/tcoVelaSemanticAdapter.ts';

const t0 = 1767225600; // 2026-01-01T00:00:00Z in CoreSpirit epoch-seconds.
const bars = normalizeVelaBarsToCoreSpirit([
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
]);

assert.equal(coreSpiritTimeToVelaMillis(t0), t0 * 1000);
assert.equal(coreSpiritTimeToVelaMillis(t0 * 1000), t0 * 1000);
assert.equal(Date.parse(bars[1]!.timestamp), (t0 + 300) * 1000);

assert.equal(safeVelaNormalizationStart([
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
], bars, 3), 2, 'same timeline only renormalizes the forming candle');
assert.equal(safeVelaNormalizationStart([
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
  { time: (t0 + 900) * 1000, open: 104, high: 106, low: 103, close: 105, volume: 800 },
], bars, 3), 2, 'append re-normalizes the former forming bar and the new tail');
assert.equal(safeVelaNormalizationStart([
  { time: (t0 - 300) * 1000, open: 99, high: 101, low: 98, close: 100, volume: 900 },
  { time: t0 * 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
], bars, 3), null, 'history prepend must invalidate cached absolute indices');
assert.equal(safeVelaNormalizationStart([
  { time: (t0 + 300) * 1000, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 103, high: 105, low: 102, close: 104, volume: 900 },
  { time: (t0 + 900) * 1000, open: 104, high: 106, low: 103, close: 105, volume: 800 },
], bars, 3), null, 'same-length timeline shift must force a full normalization');

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

// CoreScript geometry declares its own coordinate space. Time-space x coordinates
// are converted to Vela milliseconds while screen/normalized coordinates stay pixels.
const geometryAdapted = adaptCoreSpiritOutputsForVela([
  {
    kind: 'customVisual', id: 'time-geometry',
    geometry: {
      kind: 'line',
      from: { kind: 'point', space: 'time', x: t0 + 300, y: 101 },
      to: { kind: 'point', space: 'time', x: t0 + 600, y: 104 },
    },
  },
  {
    kind: 'customVisual', id: 'normalized-geometry',
    geometry: { kind: 'point', point: { kind: 'point', space: 'normalized', x: 0.5, y: 0.25 } },
  },
], bars);
assert.equal(geometryAdapted.outputs[0]!.kind, 'customVisual');
if (geometryAdapted.outputs[0]!.kind === 'customVisual') {
  assert.equal(geometryAdapted.outputs[0]!.geometry.from?.x, (t0 + 300) * 1000);
  assert.equal(geometryAdapted.outputs[0]!.geometry.to?.x, (t0 + 600) * 1000);
}
if (geometryAdapted.outputs[1]!.kind === 'customVisual') {
  assert.equal(geometryAdapted.outputs[1]!.geometry.point?.x, 0.5, 'normalized coordinates must never be interpreted as timestamps');
  assert.equal(geometryAdapted.outputs[1]!.geometry.point?.y, 0.25);
}

// Opening-time alignment must survive overnight/session gaps; infer the index
// from the canonical timestamp map, never from a constant timeframe duration.
const sessionTimes = [
  Date.parse('2026-10-15T03:45:00Z'), // 09:15 India
  Date.parse('2026-10-15T10:00:00Z'), // 15:30 India
  Date.parse('2026-10-16T03:45:00Z'), // next session open
];
const sessionBars = normalizeVelaBarsToCoreSpirit(sessionTimes.map((time, index) => ({
  time, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000,
})));
const afterSessionGap = adaptCoreSpiritOutputsForVela([
  { kind: 'series', time: sessionTimes[2]! / 1000, value: 103, seriesId: 'session', metadata: { barIndex: 2 } },
], sessionBars);
assert.deepEqual(afterSessionGap.alignment.map(item => [item.barIndex, item.aligned]), [[2, true]]);

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
assert.equal(revisions.accept({ ...rev2, streamId: 'chart-1:NIFTY:15m' }), true,
  'a timeframe change has an independent chart stream and revision sequence');

// The scene ABI must carry plot styling through to Vela's native series schema.
// Dropping this style caused every CoreSpirit plot to be rendered in the generic lavender.
const styledScene = new CoreSpiritSceneDiff('styled-series-test');
const styledPatches = styledScene.apply([
  { kind: 'series', time: t0 * 1000, value: 101, seriesId: 'swing-high',
    style: { color: '#F23645', lineWidth: 1, lineStyle: 1, title: 'Swing High' } },
], { from: t0 * 1000, to: t0 * 1000 }, 1);
const styledSchema = styledPatches.find(patch => patch.kind === 'schema');
assert.ok(styledSchema && styledSchema.kind === 'schema', 'the first plot point must mount a Vela line series');
assert.equal(styledSchema.added[0]?.title, 'Swing High',
  'CoreSpirit plot title must survive scene adaptation');
assert.deepEqual(styledSchema.added[0]?.style, { color: '#F23645', width: 1, lineStyle: 'dashed' },
  'CoreSpirit plot color, width and line style must reach Vela instead of falling back to lavender');

// Full-history snapshots must include native drawings and retain declared plot styling.
const drawingScene = new CoreSpiritSceneDiff('native-drawing-bridge-test');
drawingScene.seed([
  { kind: 'series', time: t0 * 1000, value: 101, seriesId: 'swing-high', style: { color: '#F23645', lineWidth: 1, lineStyle: 1, title: 'Swing High' } },
  { kind: 'line', id: 'bos-line', start: { time: t0 * 1000, price: 100 }, end: { time: (t0 + 600) * 1000, price: 100 }, style: { color: '#089981', lineWidth: 2 } },
  { kind: 'label', id: 'bos-label', time: (t0 + 300) * 1000, price: 103, text: 'BOS', position: 'below', style: { background: '#089981', color: '#FFFFFF', fontSize: 10, shape: 'pill' } },
  { kind: 'polyline', id: 'swing-path', points: [{ time: t0 * 1000, price: 99 }, { time: (t0 + 300) * 1000, price: 102 }], style: { color: '#3179F5', lineWidth: 2 } },
  { kind: 'zone', id: 'demand-zone', left: t0 * 1000, right: (t0 + 600) * 1000, top: 104, bottom: 99, style: { color: '#1848CC', fillColor: '#1848CC', fillOpacity: 0.18 } },
  { kind: 'background', id: 'session-bg', time: t0 * 1000, color: '#38bdf8', opacity: 0.2 },
]);
const drawingSnapshot = drawingScene.snapshot();
assert.equal(drawingSnapshot.lines.length, 1);
assert.equal(drawingSnapshot.labels.length, 1);
assert.equal(drawingSnapshot.polylines.length, 1);
assert.equal(drawingSnapshot.boxes.length, 1, 'zones retain a native Vela outline');
assert.match(drawingSnapshot.rectBatches[0].instances[0].fill, /^rgba\(/, 'zone fill keeps its configured opacity');
assert.match(drawingSnapshot.backgrounds[0].color, /^rgba\(/, 'background tint keeps its configured opacity');
const drawingModel = buildCoreSpiritVelaIndicatorModel('native-drawing-bridge-test', { title: 'Native drawings', overlay: true },
  drawingSnapshot.points, [], drawingSnapshot.priceLines, drawingSnapshot.rectBatches, t0 * 1000, undefined, [], {}, [], {}, {
    seriesStyles: drawingSnapshot.seriesStyles, lines: drawingSnapshot.lines, boxes: drawingSnapshot.boxes,
    labels: drawingSnapshot.labels, polylines: drawingSnapshot.polylines, backgrounds: drawingSnapshot.backgrounds,
  });
assert.equal(drawingModel.series[0]?.title, 'Swing High');
assert.equal(drawingModel.series[0]?.style?.color, '#F23645');
assert.equal(drawingModel.series[0]?.style?.width, 1);
assert.equal(drawingModel.series[0]?.style?.lineStyle, 'dashed');
assert.equal(drawingModel.lines?.[0]?.id, 'bos-line');
assert.equal(drawingModel.labels?.[0]?.text, 'BOS');
assert.equal(drawingModel.polylines?.[0]?.id, 'swing-path');
assert.equal(drawingModel.boxes?.[0]?.id, 'demand-zone');
assert.equal(drawingModel.backgrounds?.[0]?.id, 'session-bg');

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
const outputLayer = readFileSync('src/services/core/chart/coreSpiritVelaOutputLayer.ts', 'utf8');
const velaKernel = readFileSync('src/services/core/chart/velaNativeChartKernel.ts', 'utf8');
const chartController = readFileSync('src/services/core/chart/controllers/ChartCoreSpiritController.ts', 'utf8');
const sceneDiff = readFileSync('src/services/core/chart/coreSpiritSceneDiff.ts', 'utf8');
const velaEngine = readFileSync('src/CoreSpiritVelaEngine.ts', 'utf8');

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
assert.ok(outputController.includes('chart.renderer.setNativeData(this.overlayChannel, data)'),
  'CoreSpirit publishes immutable rich-output data into Vela native state');
assert.ok(outputController.includes('chart.renderer.mountIndicator('),
  'the rich-output layer must be attached to Vela as a renderer-owned model');
assert.ok(!outputController.includes('runCoreSpiritArtifactInWorker') && !outputController.includes('compileCoreSpirit'),
  'Vela output consumption must not invoke CoreSpirit execution or compilation');
assert.ok(!outputController.includes('requestAnimationFrame(') && !outputController.includes("document.createElement('canvas')") && !outputController.includes('document.createElement("canvas")'),
  'the adapter must not create a competing canvas or a second render-frame scheduler');
assert.doesNotMatch(outputController, /runCoreSpiritArtifactInWorker|CoreSpiritRuntime|compileCoreSpirit/,
  'the output/render adapter must not own or trigger script evaluation');
assert.ok(outputLayer.includes('registerRendererLayer('),
  'rich CoreSpirit visuals must be painted by Vela’s renderer-layer extension seam');
assert.ok(outputLayer.includes('args.coords.timeToX('),
  'Vela’s canonical time-to-pixel transform must place time-anchored outputs');
assert.ok(outputLayer.includes('args.coords.priceToY('),
  'Vela’s canonical pane price transform must place price-anchored outputs');
assert.ok(outputLayer.includes('args.coords.logicalToX('),
  'bar-index visual coordinates must use Vela’s logical-index transform');
assert.ok(velaKernel.includes("import './coreSpiritVelaOutputLayer'"),
  'the layer must register before native renderers are constructed');
assert.ok(velaEngine.includes('const getCurrentBars=(forceFullNormalization=false)=>'),
  'Vela history is read through one normalized host-data boundary');
assert.ok(velaEngine.includes('safeVelaNormalizationStart(rows,normalizedBarsCache,normalizedInputLength,forceFullNormalization)'),
  'the canonical bar adapter must prove stable timestamp anchors before reusing an incremental history prefix');
assert.ok(velaEngine.includes('time<=previousTime'),
  'the canonical bar adapter must reject duplicate as well as descending bar-opening timestamps');
assert.ok(velaEngine.includes('return Object.freeze(normalizedBarsCache.slice())'),
  'asynchronous execution receives an isolated array snapshot rather than a mutable reference to the adapter cache');
assert.ok(chartController.includes('const bars=[...candles.current]'),
  'chart-indicator execution captures one stable source snapshot per run rather than copying history on render');
assert.match(sceneDiff, /outputDirtySpan/,
  'the Vela scene diff remains the native rendering consumer of declarative output');

console.log('CORESPIRIT_VELA_CANONICAL_BOUNDARY_CONTRACT_OK');
