import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const historyPolicy = read('./services/marketData/chartHistoryPolicy.ts');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const engine = read('./CoreSpiritVelaEngine.ts');
const engineLoader = read('./services/coreSpirit/coreSpiritVelaEngineLoader.ts');
const provider = read('./TcoVelaDataProvider.ts');
const semanticAdapter = read('./services/core/chart/tcoVelaSemanticAdapter.ts');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');

assert.match(terminal, /background:'#141518'/, 'live chart should use Vela charcoal canvas');
assert.match(terminal, /upColor:'#089981'/, 'live chart should use Vela bullish candle color');
assert.match(terminal, /downColor:'#f23645'/, 'live chart should use Vela bearish candle color');
assert.match(terminal, /animations:\{ zoom:true, pan:true, liveBar:false \}/, 'chart interactions should retain Vela eased zoom/pan');
const topbar = terminal.match(/topbar:\{([\s\S]*?)\n    \},/);
assert.ok(topbar, 'TCO should explicitly define a compact topbar');
assert.doesNotMatch(topbar[1], /tco\.chart-settings|tco\.journal|tco\.positions/, 'avoid duplicate settings and secondary topbar buttons');
assert.match(nativeRenderer, /private settingsEnabled = true/, 'native Vela chart settings must remain enabled');
assert.match(nativeRenderer, /this\.openSettingsDialog\(\)/, 'native Vela gear must open its settings dialog');

assert.match(historyPolicy, /'5m': 500/, '5-minute history should start with a bounded 500-bar request');
assert.match(historyPolicy, /'5m': 1000/, 'older history should page in bounded 1000-bar chunks');
assert.match(historyPolicy, /Math\.min\(1500, Math\.max\(base, bars \* 4\)\)/, 'viewport-demand paging must stay bounded');
assert.match(provider, /async loadRange\(/, 'Vela range paging must stay on the shared TCO data plane');
assert.match(provider, /async getBars\(/, 'timeframe changes must use the canonical provider history path');
assert.match(provider, /Math\.min\(500, Math\.floor\(Number\(range\.limit\) \|\| 500\)\)/, 'first paint must not request more than 500 candles');

assert.match(chrome, /mountCoreSpiritMonaco/, 'live CoreSpirit panel should use the Pine-editor-inspired Monaco authoring surface');
assert.match(chrome, /compileCoreSpiritSourceOffThread/, 'live CoreScript must compile off the UI thread');
assert.match(chrome, /adapter\.setDiagnostics\(result\.diagnostics, currentSource\)/, 'compiler diagnostics must be visible in the editor');
assert.match(chrome, /adapter\.setSymbolInfo\(result\.symbols\)/, 'compiler symbols must feed editor completion/hover');
assert.match(chrome, /ctx\.addIndicator\(\{ id: indicatorId, name: 'CoreSpirit · Live Studio', script: currentSource, language: 'corespirit' \}\)/, 'Run must submit the actual CoreScript to the active Vela chart with an explicit instance identity');
assert.match(chrome, /candidate\.id === indicatorId/, 'CoreSpirit Run must bind readiness/errors to its exact Vela indicator instance');
assert.match(chrome, /ctx\.chart\.indicators\(\)/, 'find the indicator handle created by the workspace');
assert.match(chrome, /handle\.on\('ready'/, 'report success only when Vela finishes the first execution');
assert.match(chrome, /handle\.on\('error'/, 'surface Vela execution errors');
assert.match(chrome, /try \{ handle\.remove\(\); \} catch \{\}/, 'remove failed indicators instead of leaving dead legend rows');
assert.match(chrome, /registerDefaultEngine\('corespirit'/, 'CoreSpirit must remain registered as a Vela scripting engine');
assert.match(engineLoader, /streaming: true,[\s\S]*visibleRange: true,[\s\S]*inputs: true,[\s\S]*props: true/, 'CoreSpirit must expose Vela streaming, viewport, inputs and props');
assert.match(engine, /handlers\.onModel\(/, 'CoreSpirit execution must publish its model into Vela');
assert.match(engine, /handlers\.onScenePatches\?\./, 'CoreSpirit execution must publish incremental scene patches');
assert.match(semanticAdapter, /overlay:meta\.overlay/, 'CoreSpirit line plots must respect indicator overlay declarations');
assert.match(semanticAdapter, /paneHint:meta\.overlay \? 'price' : 'new'/, 'non-overlay CoreSpirit indicators must route to a Vela study pane');

console.log('VELA_LIVE_UI_CORESPIRIT_CONTRACT_OK');
