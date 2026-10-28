import assert from 'node:assert/strict';
import {
  CoreSpiritVisualAbiStore,
  CORE_SPIRIT_VISUAL_ABI_VERSION,
  CORE_SPIRIT_VELA_COORDINATE_SYSTEM,
  coreSpiritVisualObjectId,
  createCoreSpiritVisualPatch,
  createCoreSpiritVisualSnapshot,
  isCoreSpiritChartTargetObject,
  isCoreSpiritCustomLayerObject,
  isCoreSpiritVisualVisibleObject,
  normalizeCoreSpiritVisualObjects,
  projectCoreSpiritObjectsToVela,
} from './coreSpiritVisualAbi.ts';
import {
  adaptCoreSpiritOutputsForVela,
  normalizeVelaBarsToCoreSpirit,
} from '../../coreSpirit/velaOutputAdapter.ts';

const t0 = 1767225600;
const bars = normalizeVelaBarsToCoreSpirit([
  { time: t0 * 1000, open: 100, high: 104, low: 99, close: 102, volume: 1000 },
  { time: (t0 + 300) * 1000, open: 102, high: 105, low: 101, close: 104, volume: 1200 },
  { time: (t0 + 600) * 1000, open: 104, high: 106, low: 102, close: 105, volume: 900 },
]);

const sourceObjects = [
  {
    kind: 'zone', id: 'fvg:1', left: t0, right: t0 + 300, top: 104, bottom: 101,
    state: 'active', style: { fillColor: '#2563eb', fillOpacity: 0.12, borderColor: '#60a5fa', lineWidth: 1 },
    metadata: { sourceNodeId: 'zone:17', barIndex: 1 },
  },
  {
    kind: 'line', id: 'swing:1',
    start: { time: t0, price: 104 }, end: { time: t0 + 300, price: 102 },
    style: { color: '#f59e0b', lineWidth: 2, lineStyle: 1 },
    metadata: { sourceNodeId: 'line:18' },
  },
  {
    kind: 'label', id: 'bos:1', time: t0 + 300, price: 104, text: 'BOS', position: 'above',
    style: { background: '#089981', color: '#ffffff', opacity: 0.88, fontSize: 10 },
    metadata: { sourceNodeId: 'label:19' },
  },
  {
    kind: 'customVisual', id: 'session-tint', time: t0,
    visual: { version: 1, area: { kind: 'chart', area: 'price', id: 'price' }, coordinateSpace: 'time', visible: true, clip: 'area' },
    geometry: { kind: 'point', point: { kind: 'point', space: 'time', x: t0, y: 102 } },
    metadata: { sourceNodeId: 'visual:20' },
  },
  {
    kind: 'customVisual', id: 'research-panel-card',
    visual: { version: 1, area: { kind: 'panel', id: 'research', title: 'Research' }, coordinateSpace: 'normalized', visible: true, clip: 'area' },
    geometry: { kind: 'point', point: { kind: 'point', space: 'normalized', x: 0.5, y: 0.5 } },
  },
];

const adapted = adaptCoreSpiritOutputsForVela(sourceObjects, bars);
const zone = adapted.outputs.find(item => item.kind === 'zone');
const line = adapted.outputs.find(item => item.kind === 'line');
const label = adapted.outputs.find(item => item.kind === 'label');
const customVisual = adapted.outputs.find(item => item.kind === 'customVisual' && item.id === 'session-tint');

assert.equal(zone.left, t0 * 1000, 'zone left is normalized at the CoreSpirit-to-Vela boundary');
assert.equal(zone.right, (t0 + 300) * 1000, 'zone right is normalized at the CoreSpirit-to-Vela boundary');
assert.equal(line.start.time, t0 * 1000, 'line anchors are epoch-milliseconds in Vela space');
assert.equal(line.end.time, (t0 + 300) * 1000, 'line end anchor uses the same coordinate unit');
assert.equal(label.time, (t0 + 300) * 1000, 'label anchors are epoch-milliseconds in Vela space');
assert.equal(customVisual.geometry.point.x, t0 * 1000, 'implicit chart-time x coordinates are normalized consistently');

const revision = { streamId: 'coreSpirit-test-stream', datasetRevision: 7, outputRevision: 1 };
const instanceId = 'corespirit:test-instance';
const store = new CoreSpiritVisualAbiStore();
const snapshot = createCoreSpiritVisualSnapshot(adapted.outputs, revision, instanceId);
const prepared = store.prepare(snapshot);
assert.ok(prepared, 'first valid full snapshot should prepare');
assert.ok(prepared.objects.every(object => object.metadata?.coreSpiritVisualAbi?.schemaVersion === CORE_SPIRIT_VISUAL_ABI_VERSION));
assert.ok(prepared.objects.every(object => object.metadata?.coreSpiritVisualAbi?.coordinateSystem === CORE_SPIRIT_VELA_COORDINATE_SYSTEM));

const zoneId = coreSpiritVisualObjectId(zone, instanceId);
const labelId = coreSpiritVisualObjectId(label, instanceId);
assert.equal(prepared.objects.find(object => object.kind === 'zone').metadata.coreSpiritVisualAbi.objectId, zoneId);
assert.equal(prepared.objects.find(object => object.kind === 'label').metadata.coreSpiritVisualAbi.objectId, labelId);

const chartObjects = prepared.objects.filter(isCoreSpiritChartTargetObject);
const projected = projectCoreSpiritObjectsToVela(chartObjects);
assert.equal(projected.boxes.length, 1, 'zones project into Vela-native box collections');
assert.equal(projected.lines.length, 1, 'lines project into Vela-native drawing collections');
assert.equal(projected.labels.length, 1, 'labels project into Vela-native label collections');
assert.equal(projected.customObjects.length, 1, 'specialized geometry remains on the registered custom layer');
assert.equal(projected.boxes[0].id, zoneId, 'native zone id is namespaced and stable');
assert.equal(projected.lines[0].id, coreSpiritVisualObjectId(line, instanceId), 'native line id is namespaced and stable');
assert.equal(projected.boxes[0].bgColor, 'rgba(37, 99, 235, 0.12)', 'zone alpha maps to the native drawing fill');
assert.equal(projected.lines[0].style, 'dashed', 'CoreSpirit line style maps to Vela native line style');

const panelVisual = prepared.objects.find(object => object.metadata?.coreSpiritVisualAbi?.renderTarget === 'panel');
assert.ok(panelVisual, 'panel visual remains represented in the ABI snapshot');
assert.equal(isCoreSpiritChartTargetObject(panelVisual), false, 'panel visuals are excluded from chart painting');

store.commit(prepared);
assert.equal(store.objects(revision.streamId).length, adapted.outputs.length, 'commit retains exactly one copy of each visual');
assert.equal(store.prepare(snapshot), undefined, 'a repeated snapshot revision is rejected rather than re-appended');

const movedZone = { ...zone, right: (t0 + 600) * 1000 };
const nextRevision = { streamId: revision.streamId, datasetRevision: 7, outputRevision: 2 };
const patch = createCoreSpiritVisualPatch([movedZone], [labelId], nextRevision, instanceId);
const preparedPatch = store.prepare(patch);
assert.ok(preparedPatch, 'newer incremental visual patch should prepare');
assert.equal(preparedPatch.objects.filter(object => object.kind === 'zone').length, 1, 'zone boundary updates in place instead of duplicating it');
assert.equal(preparedPatch.objects.find(object => object.kind === 'zone').right, (t0 + 600) * 1000, 'the retained zone receives its new right boundary');
assert.equal(preparedPatch.objects.some(object => object.metadata?.coreSpiritVisualAbi?.objectId === labelId), false, 'remove IDs delete existing retained objects');
store.commit(preparedPatch);
assert.equal(store.objects(revision.streamId).length, adapted.outputs.length - 1, 'a patch retains the updated scene without deleted labels');

assert.equal(store.prepare(createCoreSpiritVisualPatch([], [], nextRevision, instanceId)), undefined, 'a repeated patch revision is rejected');
assert.equal(store.prepare(createCoreSpiritVisualPatch([], [], { ...nextRevision, datasetRevision: 6, outputRevision: 99 }, instanceId)), undefined, 'a lower dataset revision cannot resurrect stale geometry');

assert.throws(
  () => normalizeCoreSpiritVisualObjects([{ kind: 'line', id: 'bad', start: { time: t0, price: 100 }, end: { time: t0 + 300, price: 101 } }], instanceId, revision),
  /expected epoch milliseconds/,
  'the rendering ABI rejects seconds that bypassed the canonical adapter',
);

assert.equal(isCoreSpiritCustomLayerObject(prepared.objects.find(object => object.metadata?.sourceNodeId === 'visual:20')), true, 'custom chart geometry remains on Vela native renderer layers');

const visibilityStore = new CoreSpiritVisualAbiStore();
const toggleId = 'visibility-test-instance';
const hiddenVisual = {
  kind: 'customVisual', id: 'visible-toggle',
  visual: { version: 1, area: { kind: 'chart', area: 'price', id: 'price' }, coordinateSpace: 'normalized', visible: false, clip: 'area' },
  geometry: { kind: 'point', point: { kind: 'point', space: 'normalized', x: 0.5, y: 0.5 } },
};
const hiddenRevision = { streamId: 'visibility-test-stream', datasetRevision: 1, outputRevision: 1 };
const hiddenPrepared = visibilityStore.prepare(createCoreSpiritVisualSnapshot([hiddenVisual], hiddenRevision, toggleId));
assert.ok(hiddenPrepared);
assert.equal(hiddenPrepared.objects.length, 0, 'per-object visibility removes hidden visuals from render snapshots');
visibilityStore.commit(hiddenPrepared);
assert.equal(visibilityStore.objects(hiddenRevision.streamId).length, 0, 'hidden objects are not exposed to the chart scene');
const shownVisual = { ...hiddenVisual, visual: { ...hiddenVisual.visual, visible: true } };
const shownRevision = { ...hiddenRevision, outputRevision: 2 };
const shownPrepared = visibilityStore.prepare(createCoreSpiritVisualPatch([shownVisual], [], shownRevision, toggleId));
assert.ok(shownPrepared);
assert.equal(shownPrepared.objects.length, 1, 'upserting a visible version restores a previously hidden stable object');
visibilityStore.commit(shownPrepared);
assert.equal(visibilityStore.objects(shownRevision.streamId).length, 1);

const hiddenStreamRevision = { streamId: 'script-hidden-stream', datasetRevision: 1, outputRevision: 1 };
const scriptHidden = visibilityStore.prepare(createCoreSpiritVisualSnapshot([zone], hiddenStreamRevision, toggleId, 'price', false));
assert.ok(scriptHidden);
assert.equal(scriptHidden.visible, false, 'script-level visibility is part of the snapshot ABI');
assert.equal(scriptHidden.objects.length, 0, 'hidden script output cannot be painted');
visibilityStore.commit(scriptHidden);
assert.equal(visibilityStore.objects(hiddenStreamRevision.streamId).length, 0, 'hidden script keeps its retained state fenced off from the renderer');
console.log('CORESPIRIT_VISUAL_ABI_CONTRACT_OK');
