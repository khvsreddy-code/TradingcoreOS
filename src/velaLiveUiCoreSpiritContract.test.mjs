import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const picker = read('../vendor/vela/src/widget/symbol-picker.ts');
const provider = read('./TcoVelaDataProvider.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const workspace = read('./LiveTradingWorkspace.tsx');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const editor = read('./components/workspace/CoreSpiritLiveEditor.tsx');
const settings = read('../vendor/vela/src/renderers/native/chrome/SettingsDialog.ts');
const chartCell = read('../vendor/vela/src/workspace/ChartCell.ts');

assert.match(picker, /Options:\s*\['option'\]/, 'Options tab must retain option descriptors');
assert.match(picker, /Futures:\s*\['futures', 'root', 'derivative'\]/, 'Futures tab must not swallow option contracts');
assert.match(provider, /looksLikeOption/, 'FYERS FO rows must classify strike/CE/PE contracts as options');
assert.match(provider, /type: kind, market: master/, 'provider must preserve the market and classification');
assert.match(terminal, /bottombar:true/, 'Vela bottom range/timezone bar must be enabled');
assert.doesNotMatch(terminal, /'tco\.replay'/, 'do not duplicate Vela native Replay in the topbar');
assert.match(workspace, /defaults\.layout \|\| '1'/, 'fresh live workspace should open as a single chart');
assert.match(workspace, /prewarmTcoVelaHistory\(\[activeSymbol\], timeframe, 250\)/, 'common adjacent intraday intervals should be warmed off the first-paint path');
assert.doesNotMatch(chrome, /TradingCoreOS × Vela/, 'do not render the redundant combined brand pill');
assert.match(chrome, /id: 'tco\.corespirit'/, 'CoreSpirit Studio must be reachable from Vela topbar');
assert.match(editor, /compileCoreSpiritSourceOffThread/, 'CoreSpirit Studio must compile through the compiler worker');
assert.match(editor, /chart\.runIndicator\(source, \{ language: 'corespirit' \}\)/, 'Run must add the script through Vela scripting engine port');
assert.match(editor, /mountCoreSpiritMonaco/, 'CoreSpirit Studio must use the CoreScript language editor adapter');
assert.match(chartCell, /await chart\.addNativeIndicatorAsync\(type\)/, 'picker-added native indicators must use Vela lazy async loading');
assert.doesNotMatch(chartCell, /chart\.addNativeIndicator\(type\)/, 'do not use the sync-only native API for lazy picker studies');
assert.match(settings, /Chart settings/, 'keep the official Vela chart settings dialog');
for (const tab of ['Status line', 'Scales and lines', 'Canvas', 'Events', 'Advanced']) {
  assert.ok(settings.includes(tab), 'Vela settings dialog should include ' + tab);
}

console.log('VELA_LIVE_UI_CORESPIRIT_CONTRACT_OK');
