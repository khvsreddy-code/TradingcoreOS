import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('vendor/vela/src/renderers/native/chrome/SettingsDialog.ts', 'utf8');
const workspace = fs.readFileSync('vendor/vela/src/workspace/VelaWorkspace.ts', 'utf8');
const vela = fs.readFileSync('vendor/vela/src/Vela.ts', 'utf8');
const engine = fs.readFileSync('vendor/vela/src/core/engine/EngineOrchestrator.ts', 'utf8');
const watchlist = fs.readFileSync('src/services/core/chart/tcoVelaChrome.ts', 'utf8');

assert.ok(settings.includes("document.documentElement.dataset.tcoActiveSymbol"), 'appearance preview must read the active chart ticker');
assert.ok(settings.includes("document.documentElement.dataset.tcoActiveTimeframe"), 'appearance preview must read the active chart timeframe');
assert.ok(settings.includes("tco:appearance-preview-data"), 'appearance preview must consume active-chart OHLC events');
assert.ok(settings.includes("tco:appearance-preview-request"), 'opening appearance settings must request the current real bar snapshot');
assert.ok(settings.includes("document.createElement('canvas')"), 'appearance preview must use a true interactive chart surface');
assert.ok(settings.includes("canvas.addEventListener('pointerdown'"), 'appearance preview must pan by dragging');
assert.ok(settings.includes("canvas.addEventListener('wheel'"), 'appearance preview must zoom with the mouse wheel');
assert.ok(!settings.includes('candleSamples') && !settings.includes('Simulated sample candlestick chart') && !settings.includes('Simulated prices'), 'appearance preview must not manufacture duplicate sample candles');
assert.ok(workspace.includes('document.documentElement.dataset.tcoActiveSymbol = cell.symbol'), 'workspace must publish the active ticker');
assert.ok(workspace.includes('private onCellMarketChanged(id: string)'), 'workspace must refresh preview context when the active chart market changes');
assert.ok(workspace.includes("'tco:appearance-preview-request'"), 'workspace must respond to preview snapshot requests');
assert.ok(workspace.includes('chart.getBarsSnapshot(500)'), 'workspace must pass the real active chart bar series');
assert.ok(workspace.includes('chart.getBarsSnapshot(1)[0]'), 'live preview updates must use the active chart view bar');
assert.ok(vela.includes('getBarsSnapshot(limit = 500)'), 'Vela exposes a detached bounded OHLCV snapshot');
assert.ok(engine.includes('getBarsSnapshot(limit = 500)'), 'the engine snapshot is a detached clone, not the mutable renderer array');
assert.ok(watchlist.includes("['changeValue', 'Change']") && watchlist.includes("['changePercent', 'Change %']"), 'watchlist detail must show both absolute and percentage change');
assert.ok(watchlist.includes("['high', 'Day high']") && watchlist.includes("['low', 'Day low']"), 'watchlist detail must expose day high and low');
assert.ok(watchlist.includes('font:700 12px Inter,ui-sans-serif,system-ui,sans-serif'), 'watchlist typography must match the TradingCoreOS system font');
assert.ok(watchlist.includes('daily?.high') && watchlist.includes('daily?.low'), 'watchlist must read high/low from daily broker OHLC when available');
assert.ok(workspace.includes('this.globalTool = type;'), 'shared drawing toolbar must update its tool mirror before focus restoration');
assert.ok(workspace.includes('this.active.chart.drawings.setTool(type);'), 'shared drawing toolbar must arm the active chart drawing controller');

console.log('VELA_ACTIVE_PREVIEW_AND_DRAWING_TOOL_CONTRACT_OK');
