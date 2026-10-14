import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ADVANCED_DRAWING_FAMILIES,
  drawingFamilyForType,
  drawingTypes,
  defaultToolbar,
  loadDrawingFamily,
  loadAdvancedDrawingCatalog,
} from '../vendor/vela/src/core/drawings/index.ts';

const userDrawingSource = readFileSync(new URL('../vendor/vela/src/renderers/native/drawings/UserDrawingController.ts', import.meta.url), 'utf8');
const drawingRegistrySource = readFileSync(new URL('../vendor/vela/src/core/drawings/registry.ts', import.meta.url), 'utf8');
const nativeRendererSource = readFileSync(new URL('../vendor/vela/src/renderers/native/NativeRenderer.ts', import.meta.url), 'utf8');
const tcoChromeSource = readFileSync(new URL('./services/core/chart/tcoVelaChrome.ts', import.meta.url), 'utf8');

assert.match(userDrawingSource, /isCanonicalToolbarDefinition/);
assert.match(userDrawingSource, /this\.customToolbar = !isCanonicalToolbarDefinition\(def\)/);
assert.match(drawingRegistrySource, /function lazyDrawingIcon/);
assert.doesNotMatch(drawingRegistrySource, /icon: svg24\('<circle cx="12" cy="12" r="7"\/>/);
assert.match(nativeRendererSource, /private settingsEnabled = true/);
for (const iconId of ['activity','briefcase','shield','list','layers','table','user','layout','play']) {
  assert.match(tcoChromeSource, new RegExp(iconId + ': svg16\\('));
}

const advancedTypes = [
  'parallelchannel',
  'fibretracement',
  'gartley',
];

for (const type of advancedTypes) {
  assert.ok(drawingFamilyForType(type), 'advanced drawing family missing for ' + type);
}

const before = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(before.has('parallelchannel'), false);
assert.equal(before.has('fibretracement'), false);
assert.equal(before.has('gartley'), false);

const toolbar = defaultToolbar();
assert.ok(toolbar.groups.some((group) => group.id === 'fibonacci-gann'));
assert.ok(toolbar.groups.some((group) => group.id === 'patterns-waves-harmonics'));

await loadDrawingFamily('channels');
const channelsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(channelsAfter.has('parallelchannel'), true);
assert.equal(channelsAfter.has('fibretracement'), false, 'loading channels must not hydrate fibonacci');

await loadDrawingFamily('patterns');
const patternsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(patternsAfter.has('gartley'), true);
assert.equal(patternsAfter.has('fibretracement'), false, 'loading patterns must not hydrate fibonacci');

await loadDrawingFamily('fibonacci');
await loadAdvancedDrawingCatalog();
const hydratedToolbar = defaultToolbar();
const hydratedIcons = hydratedToolbar.groups.flatMap((group) => group.tools.map((tool) => tool.icon));
assert.ok(new Set(hydratedIcons).size > 20, 'advanced drawing tools must expose distinct recognisable SVG icons');

// The 0.8.4 palette is grouped for discovery, not truncated to whichever lazy family
// happened to register first. Every available tool appears exactly once across visible
// toolbar sections, and the known advanced families stay reachable from their Vela groups.
const visibleTools = hydratedToolbar.groups.flatMap((group) =>
  group.sections ? group.sections.flatMap((section) => section.tools) : group.tools
);
const visibleTypes = visibleTools.map((tool) => tool.type);
assert.equal(new Set(visibleTypes).size, visibleTypes.length, 'the canonical toolbar must not duplicate tools across categories');
for (const type of [
  'parallelchannel','pitchfork','arrow','ellipse','freehand','flagmark','iconstamp',
  'fibretracement','fibspiral','gannfan','anchoredvwap','fixedrangevp',
  'position','magnifier','fairvaluegap','orderblock','liquidity',
  'elliottimpulse','gartley','cypher',
]) {
  assert.ok(visibleTypes.includes(type), 'Vela 0.8.4 drawing tool missing from toolbar: ' + type);
}
const visibleGroup = (type) => hydratedToolbar.groups.find((group) =>
  (group.sections ? group.sections.flatMap((section) => section.tools) : group.tools).some((tool) => tool.type === type)
)?.id;
assert.equal(visibleGroup('pitchfork'), 'lines-channels-pitchforks');
assert.equal(visibleGroup('arrow'), 'brushes-arrows-shapes');
assert.equal(visibleGroup('flagmark'), 'icons');
assert.equal(visibleGroup('fibretracement'), 'fibonacci-gann');

assert.deepEqual([...ADVANCED_DRAWING_FAMILIES], ['channels', 'fibonacci', 'patterns']);

console.log('VELA_ADVANCED_DRAWING_FAMILY_LAZY_CONTRACT_OK');
