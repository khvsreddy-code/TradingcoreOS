import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const live = read('./LiveTradingWorkspace.tsx');
const dock = read('./components/corespirit/CoreSpiritDock.tsx');
const smc = read('./services/coreSpirit/luxAlgoSmcCoreSource.ts');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const cell = read('../vendor/vela/src/workspace/ChartCell.ts');
const contributions = read('../vendor/vela/src/widget/contributions.ts');

const includes = (source, snippet, message) => assert.ok(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert.ok(!source.includes(snippet), message);

includes(live, 'aria-label="Toggle Watchlist panel"', 'right rail exposes the Watchlist control');
includes(live, 'aria-label="Toggle CoreSpirit coding terminal"', 'right rail exposes the CoreSpirit control');
includes(live, 'corespirit-rail-flame', 'right-side button uses the custom fire-and-cogwheel icon');
includes(live, 'right-11', 'chart host reserves space for the right rail');
includes(live, 'activeCell.addExternalIndicator(', 'Add to Chart uses Vela external-indicator lifecycle on the active chart');
includes(live, '__TCO_ADD_CORESPIRIT_TO_CHART__', 'active-chart bridge is installed and disposed with the workspace');
includes(chrome, 'createRoot(body)', 'CoreSpirit React terminal is mounted inside Vela panel body');
includes(chrome, 'embedded: true', 'CoreSpirit is docked rather than rendered as an overlay popup');
includes(chrome, "ctx.togglePanel('tco.corespirit-code', false)", 'terminal close button closes the Vela side panel');
includes(chrome, 'onAddToChart: async', 'embedded terminal uses the active-chart bridge for Add to Chart');
includes(dock, 'compileCoreSpiritSourceOffThread', 'CoreSpirit source compiles through its worker pipeline');
includes(dock, 'CORESPIRIT_LUXALGO_SMC_SOURCE', 'the editor uses the converted SMC script as its default');
includes(smc, 'input swingLength: int = 50 min=10 max=100', 'SMC swing lookback defaults to the Pine script 50-bar setting');
includes(smc, 'let internalRollingHigh = highest(high, 5)', 'SMC internal structure uses the original fixed five-bar internal length');
includes(smc, 'Swing CHoCH', 'converted source emits swing structure labels');
includes(smc, 'Swing BOS', 'converted source emits swing structure labels');
includes(smc, 'Internal CHoCH', 'converted source emits internal structure labels');
includes(smc, 'Internal BOS', 'converted source emits internal structure labels');
includes(smc, 'showOrderBlockZones', 'converted source exposes the provisional order-block zone option');
includes(smc, 'showFairValueGaps', 'converted source exposes FVG visibility');
excludes(smc, 'lookahead =', 'initial conversion does not contain a lookahead expression');
excludes(smc, 'request.security(', 'initial conversion does not introduce a higher-timeframe security call');
includes(dock, 'saveUserIndicatorDraft', 'Save creates a versioned cloud draft');
includes(dock, ".from('corespirit_script_versions')", 'version history is read from the script version table');
includes(dock, 'onClick={() => void rename()}', 'rename button is wired');
includes(dock, 'publishUserIndicator', 'Publish uses the existing publication service');
includes(dock, 'onAddToChart(cleanName, source)', 'Add to Chart calls the active-chart callback');
includes(dock, 'Fullscreen CoreSpirit editor', 'terminal provides a fullscreen control');
includes(dock, 'Minimize CoreSpirit editor', 'terminal provides a minimize control');
includes(dock, 'Close CoreSpirit terminal', 'terminal provides a close control');
includes(cell, 'addExternalIndicator(entry: ExternalIndicatorEntry)', 'Vela external-indicator entry point remains available');
includes(contributions, 'export interface ExternalIndicatorEntry', 'dock uses Vela public external-indicator entry type');
for (const label of ['Compile', 'Compile & Run', 'Save', 'Publish', 'Add to chart', 'Rename']) {
  assert.ok(dock.includes(label), label + ' action visible');
}
excludes(terminal, "'tco.watchlist',", 'Watchlist must be removed from the topbar action list');
excludes(terminal, "'tco.corespirit-code',", 'CoreSpirit must be removed from the topbar action list');

console.log('CORESPIRIT_DOCK_CONTRACT_OK');
