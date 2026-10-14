import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const provenance = read('../vendor/vela/UPSTREAM.md');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const symbols = read('../vendor/vela/src/widget/symbol-picker.ts');
const provider = read('./TcoVelaDataProvider.ts');
const vela = read('../vendor/vela/src/Vela.ts');
const options = read('../vendor/vela/src/core/options.ts');

assert.match(provenance, /0\.8\.4/, 'vendored Vela foundation must identify upstream version 0.8.4');
assert.match(provenance, /850fa1f431e2065e9b0074c4b0555a48a2999eaf/, 'record the exact upstream source commit');
assert.match(vela, /priceAxis\?\.ticks|priceAxisTicks/, 'carry the upstream custom price-axis ticks API');
assert.match(options, /priceAxis\??:/, 'carry the upstream price-axis option contract');
for (const path of [
  '../vendor/vela/src/renderers/native/chrome/priceAxisTicks.ts',
  '../vendor/vela/src/renderers/native/chrome/vela-logos.ts',
  '../vendor/vela/src/ui/surface-events.ts',
  '../vendor/vela/src/ui/surface-exit.ts',
]) assert.equal(exists(path), true, path + ' must be present from upstream Vela 0.8.4');

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

console.log('VELA_084_FOUNDATION_AND_TCO_OVERLAY_CONTRACT_OK');
