import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const provenance = read('../vendor/vela/UPSTREAM.md');
const releaseNotes = read('../vendor/vela/CHANGELOG.md');
const notice = read('../vendor/vela/NOTICE');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const symbols = read('../vendor/vela/src/widget/symbol-picker.ts');
const provider = read('./TcoVelaDataProvider.ts');
const vela = read('../vendor/vela/src/Vela.ts');
const options = read('../vendor/vela/src/core/options.ts');
const nativeIndicator = read('../vendor/vela/src/core/native-indicators/NativeIndicator.ts');
const paneControl = read('../vendor/vela/src/core/PanesControl.ts');
const chartRenderer = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const engine = read('../vendor/vela/src/core/engine/EngineOrchestrator.ts');
const sceneGraph = read('../vendor/vela/src/renderers/native/core/SceneGraph.ts');
const overlayStack = read('../vendor/vela/src/renderers/native/core/overlayStack.ts');
const averages = read('../vendor/vela/src/core/native-indicators/classics/averages.ts');

assert.match(provenance, /Upstream source version: \*\*0\.8\.5\*\*/, 'vendored Vela foundation must pin the actual upstream source version');
assert.match(provenance, /descends from 0\.8\.4/, 'record the 0.8.4 ancestry of the upstream release');
assert.match(releaseNotes, /^## \[0\.8\.5\]/m, 'vendored changelog must include the 0.8.5 release notes');
assert.match(releaseNotes, /Linear Regression is now two studies/, 'document the breaking linear-regression study replacement');
assert.match(notice, /ATTRIBUTION REQUIREMENT[\s\S]*visible attribution to the Vela project/, 'preserve the required Vela attribution notice');
assert.match(provenance, /596cbbdeba15406cfb72465afd07f8c60c6b1852/, 'record the exact upstream source commit');
assert.match(vela, /priceAxis\?\.ticks|priceAxisTicks/, 'carry the upstream custom price-axis ticks API');
assert.match(options, /priceAxis\??:/, 'carry the upstream price-axis option contract');
assert.match(nativeIndicator, /waitsForHistory\?: boolean/, 'native indicators can opt into full-history gating');
assert.match(paneControl, /setHeightWeight\(paneId: string, weight: number\)/, 'pane height weights are part of the public Vela API');
assert.match(chartRenderer, /paneId\?: string \| null/, 'click and crosshair events include an optional pane identity');
assert.match(engine, /historyComplete\(\): Promise<void>/, 'full-history completion remains an explicit lifecycle boundary');
assert.match(sceneGraph, /heightWeight: heightWeight \?\? \(kind === 'price' \? 3 : 1\)/, 'new panes receive deterministic default weights');
assert.match(sceneGraph, /if \(heightWeight !== undefined\) existing\.heightWeight = heightWeight/, 'mounting an indicator without a weight preserves user resizing');
assert.match(overlayStack, /export function/, 'the overlay stacking order logic is vendored');
assert.match(averages, /type: 'lsma'/, 'the breaking linear regression curve is replaced by LSMA');
assert.match(averages, /type: 'linear-regression-slope'/, 'linear regression slope remains an explicit study');
assert.doesNotMatch(averages, /type: 'linear-regression'/, 'the removed 0.8.5 linear-regression built-in must not be re-registered');
for (const path of [
  '../vendor/vela/src/renderers/native/chrome/priceAxisTicks.ts',
  '../vendor/vela/src/renderers/native/chrome/vela-logos.ts',
  '../vendor/vela/src/ui/surface-events.ts',
  '../vendor/vela/src/ui/surface-exit.ts',
]) assert.equal(exists(path), true, path + ' must be present from upstream Vela 0.8.5');

assert.match(nativeRenderer, /private settingsEnabled = true/, 'keep native chart settings enabled');
assert.match(nativeRenderer, /btn\.addEventListener\('pointerdown', \(event\) => event\.stopPropagation\(\)\)/, 'native settings gear must not bubble into chart gestures');
assert.match(nativeRenderer, /this\.openSettingsDialog\(\)/, 'native gear must open the real Vela settings dialog');
assert.match(symbols, /'Options'/, 'keep TCO's explicit Options market filter');
assert.match(symbols, /queryTokens = q\.match/, 'search compact derivatives by separate query tokens');
assert.match(provider, /Options:\s*\['NSE_FO', 'BSE_FO'\]/, 'Options search must use the FYERS derivatives masters');

for (const path of [
  '../vendor/vela/src/core/model/ColumnarHistoryTape.ts',
  '../vendor/vela/src/core/model/columnar-bars.ts',
  '../vendor/vela/src/core/model/scenePatch.ts',
  '../vendor/vela/src/core/native-indicators/lazyCatalog.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryChannels.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryFibonacci.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryPatterns.ts',
]) assert.equal(exists(path), true, path + ' is a required TCO performance/feature extension');

console.log('VELA_085_FOUNDATION_AND_TCO_OVERLAY_CONTRACT_OK');
