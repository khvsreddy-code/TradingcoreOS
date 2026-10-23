import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CORE_SPIRIT_DRAWING_TOOL_CATALOG } from './services/core/chart/velaDrawingCatalog.ts';

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
assert.match(drawingRegistrySource, /registerAdvancedChannelTypes\(\);/);
assert.match(drawingRegistrySource, /registerAdvancedFibonacciTypes\(\);/);
assert.match(drawingRegistrySource, /registerAdvancedPatternTypes\(\);/);
assert.match(drawingRegistrySource, /Eagerly hydrate every advanced family before the first chart toolbar is built/);
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
for (const type of advancedTypes) {
  assert.ok(before.has(type), 'advanced drawing type must be ready before any family is clicked: ' + type);
}
assert.ok(before.has('fibretracement'), 'Fibonacci tools should be registered at initial module load');
assert.ok(before.has('gartley'), 'pattern tools should be registered at initial module load');
assert.ok(before.has('parallelchannel'), 'channel tools should be registered at initial module load');

const toolbar = defaultToolbar();
assert.ok(toolbar.groups.some((group) => group.id === 'fibonacci-gann'));
assert.ok(toolbar.groups.some((group) => group.id === 'patterns-waves-harmonics'));

await loadDrawingFamily('channels');
const channelsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(channelsAfter.has('parallelchannel'), true);
assert.equal(channelsAfter.has('fibretracement'), true, 'Fibonacci tools must already be available before opening another family');

await loadDrawingFamily('patterns');
const patternsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(patternsAfter.has('gartley'), true);
assert.equal(patternsAfter.has('fibretracement'), true, 'Fibonacci tools must remain ready independent of which family is selected');

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
const priceAction = hydratedToolbar.groups.find((group) => group.id === 'price-action');
assert.ok(priceAction, 'Vela 0.8.4 Price Action group must be directly accessible');
for (const type of ['fairvaluegap', 'orderblock', 'liquidity']) {
  assert.ok(priceAction.tools.some((tool) => tool.type === type), 'Price Action toolbar group missing ' + type);
}
const hydratedIcons = hydratedToolbar.groups.flatMap((group) => group.tools.map((tool) => tool.icon));
assert.ok(new Set(hydratedIcons).size > 20, 'advanced drawing tools must expose distinct recognisable SVG icons');

assert.deepEqual([...ADVANCED_DRAWING_FAMILIES], ['channels', 'fibonacci', 'patterns']);

console.log('VELA_ADVANCED_DRAWING_FAMILY_LAZY_CONTRACT_OK');
