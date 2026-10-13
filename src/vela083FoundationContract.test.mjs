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
const chartCell = read('../vendor/vela/src/workspace/ChartCell.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const tcoChrome = read('./services/core/chart/tcoVelaChrome.ts');
const historyProvider = read('./TcoVelaDataProvider.ts');
const coreSpiritEditor = read('./pages/CoreSpiritEditorPage.tsx');

assert.match(provenance, /0\.8\.3/, 'vendored Vela foundation must identify upstream version 0.8.3');
assert.match(provenance, /766a0f134935ac714871c5e89ba63940a245965f/, 'record the exact upstream source commit');
assert.match(vela, /priceAxis\?\.ticks|priceAxisTicks/, 'carry the upstream custom price-axis ticks API');
assert.match(options, /priceAxis\??:/, 'carry the upstream price-axis option contract');
for (const path of [
  '../vendor/vela/src/renderers/native/chrome/priceAxisTicks.ts',
  '../vendor/vela/src/renderers/native/chrome/vela-logos.ts',
  '../vendor/vela/src/ui/surface-events.ts',
  '../vendor/vela/src/ui/surface-exit.ts',
]) assert.equal(exists(path), true, path + ' must be present from upstream Vela 0.8.3');

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

assert.match(chartCell, /void chart\.addNativeIndicatorAsync\(type\)/, 'the picker must load lazy Vela indicator families before adding');
assert.match(chartCell, /void target\.addNativeIndicatorAsync\(type\)/, 'undo/redo must restore lazy native indicators through the async path');
assert.doesNotMatch(chartCell, /let added: IndicatorHandle \| null = chart\.addNativeIndicator\(type\)/, 'do not synchronously add an unloaded native indicator');
assert.match(terminal, /bottombar:true/, 'show Vela native time-range chips and timezone/clock chrome');
assert.match(terminal, /\['symbol','timeframes','style','layout','indicators','undo-redo'\]/, 'keep Vela primary controls grouped on the left');
assert.doesNotMatch(tcoChrome, /tco\.brand|TradingCoreOS × Vela/, 'do not duplicate the Vela/TCO brand in the chart bar');
assert.match(tcoChrome, /ctx\.chart\.renderer\.openSettingsDialog\?\.\(\)/, 'the TCO account settings shortcut must open Vela chart settings');
assert.match(tcoChrome, /id:'tco\.research'.*iconOnly:true/, 'TCO navigation actions should use compact icon chrome');
assert.match(historyProvider, /timeframe: string \| readonly string\[\]/, 'history warming supports multiple likely next timeframes');
assert.match(historyProvider, /await plane\.prewarmHistory\(requested\)/, 'history warming must be sequential and low priority');
assert.match(coreSpiritEditor, /title="CoreSpirit Studio"/, 'the CoreScript writer is presented as a dedicated studio');
assert.match(coreSpiritEditor, /run validated scripts on the active Vela chart/, 'the editor advertises its actual chart-runner path');
assert.doesNotMatch(coreSpiritEditor, /execute on the active chart in the next editor milestone/, 'remove stale text that claims the runner is future work');

console.log('VELA_083_FOUNDATION_AND_TCO_OVERLAY_CONTRACT_OK');
