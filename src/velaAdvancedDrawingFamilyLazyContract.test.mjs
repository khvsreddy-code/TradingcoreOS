import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CORE_SPIRIT_DRAWING_TOOL_CATALOG } from './services/core/chart/velaDrawingCatalog.ts';

import {
  drawingTypes,
  defaultToolbar,
  loadAdvancedDrawingCatalog,
} from '../vendor/vela/src/core/drawings/index.ts';
import {
  ADVANCED_DRAWING_FAMILIES,
  drawingFamilyForType,
  loadDrawingFamily,
} from '../vendor/vela/src/core/drawings/registry.ts';

const userDrawingSource = readFileSync(new URL('../vendor/vela/src/renderers/native/drawings/UserDrawingController.ts', import.meta.url), 'utf8');
const drawingRegistrySource = readFileSync(new URL('../vendor/vela/src/core/drawings/registry.ts', import.meta.url), 'utf8');
const nativeRendererSource = readFileSync(new URL('../vendor/vela/src/renderers/native/NativeRenderer.ts', import.meta.url), 'utf8');
const tcoChromeSource = readFileSync(new URL('./services/core/chart/tcoVelaChrome.ts', import.meta.url), 'utf8');

assert.match(userDrawingSource, /isCanonicalToolbarDefinition/);
assert.match(userDrawingSource, /this\.customToolbar = !isCanonicalToolbarDefinition\(def\)/);
assert.match(drawingRegistrySource, /function lazyDrawingIcon/);
for (const familyModule of ['advancedRegistryChannels','advancedRegistryFibonacci','advancedRegistryPatterns']) {
  assert.match(
    drawingRegistrySource,
    new RegExp("import\\('\\./" + familyModule + "'\\)"),
    familyModule + ' must be a separate on-demand module chunk',
  );
  assert.doesNotMatch(
    drawingRegistrySource,
    new RegExp("from ['\\\"]\\./" + familyModule + "['\\\"]"),
    familyModule + ' must not be statically imported by the base drawing registry',
  );
}
assert.doesNotMatch(drawingRegistrySource, /Eagerly hydrate every advanced family/);
assert.match(drawingRegistrySource, /advancedFamilyPromises\.delete\(family\)/,
  'a failed lazy chunk must be retryable');
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
for (const type of advancedTypes) {
  assert.equal(before.has(type), false, 'advanced drawing implementation must not load before its family is requested: ' + type);
}

const toolbar = defaultToolbar();
assert.ok(toolbar.groups.some((group) => group.id === 'fibonacci-gann'));
assert.ok(toolbar.groups.some((group) => group.id === 'patterns-waves-harmonics'));
const placeholderTools = new Set(toolbar.groups.flatMap((group) => [
  ...group.tools.map((tool) => tool.type),
  ...(group.sections ?? []).flatMap((section) => section.tools.map((tool) => tool.type)),
]));
for (const type of advancedTypes) {
  assert.ok(placeholderTools.has(type), 'lightweight toolbar metadata must remain available before download: ' + type);
}

await loadDrawingFamily('channels');
const channelsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(channelsAfter.has('parallelchannel'), true);
assert.equal(channelsAfter.has('fibretracement'), false, 'loading channels must not download the Fibonacci implementation');
assert.equal(channelsAfter.has('gartley'), false, 'loading channels must not download pattern implementations');

await loadDrawingFamily('patterns');
const patternsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(patternsAfter.has('gartley'), true);
assert.equal(patternsAfter.has('fibretracement'), false, 'loading patterns must not download the Fibonacci implementation');

await loadDrawingFamily('fibonacci');
await loadAdvancedDrawingCatalog();
const hydratedToolbar = defaultToolbar();
const hydratedTools = hydratedToolbar.groups.flatMap((group) => [
  ...group.tools.map((tool) => tool.type),
  ...(group.sections ?? []).flatMap((section) => section.tools.map((tool) => tool.type)),
]);
const availableTools = new Set(hydratedTools);
for (const type of CORE_SPIRIT_DRAWING_TOOL_CATALOG) {
  assert.ok(availableTools.has(type), 'Vela drawing tool missing from toolbar: ' + type);
}
const fibonacciGann = hydratedToolbar.groups.find((group) => group.id === 'fibonacci-gann');
assert.ok(fibonacciGann, 'Vela Fibonacci/Gann toolbar group must be directly accessible');
const priceActionTools = new Set((fibonacciGann.sections ?? []).flatMap((section) => section.tools.map((tool) => tool.type)));
for (const type of ['fairvaluegap', 'orderblock', 'liquidity']) {
  assert.ok(priceActionTools.has(type), 'Fibonacci/Gann Price Action section missing ' + type);
}
const hydratedIcons = hydratedToolbar.groups.flatMap((group) => group.tools.map((tool) => tool.icon));
assert.ok(new Set(hydratedIcons).size > 20, 'advanced drawing tools must expose distinct recognisable SVG icons');

assert.deepEqual([...ADVANCED_DRAWING_FAMILIES], ['channels', 'fibonacci', 'patterns']);

console.log('VELA_ADVANCED_DRAWING_FAMILY_LAZY_CONTRACT_OK');
