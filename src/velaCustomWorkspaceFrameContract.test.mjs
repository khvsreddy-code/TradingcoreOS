import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const terminal = read('src/services/core/chart/tcoVelaTerminal.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const upstream = read('vendor/vela/UPSTREAM.md');

assert.match(upstream, /upstream source version:\s*\*\*0\.8\.4\*\*/i, 'TCO must continue to use the official Vela 0.8.4 foundation');
assert.match(terminal, /topbar:\s*\{/);
assert.match(terminal, /'tco\.workspace-frame'/, 'workspace customization must be reachable from the existing top bar');
assert.match(terminal, /bottombar:\s*false/, 'the terminal keeps its topbar-only command surface');
assert.doesNotMatch(terminal, /quant/i, 'the TCO shell must not introduce a Quant action or second Quant header');
assert.match(chrome, /id:'tco\.workspace-frame'/, 'workspace frame panel/action must be registered');
assert.match(chrome, /TCO_FRAME_STORAGE_KEY/, 'frame preferences must persist across reloads');
assert.match(chrome, /data-tco-sidebar="left"/, 'sidebar placement can be switched left');
assert.match(chrome, /data-tco-density="compact"/, 'the single top bar supports compact density');
assert.match(chrome, /data-action-id="tco\.watchlist"/, 'topbar action preferences target the actual Vela action ids');
assert.match(chrome, /TCO_FRAME_THEME_PRESETS/, 'live trading must expose curated full-workspace color palettes');
assert.match(chrome, /TradingView Dark/, 'a TradingView-style dark preset must be available');
assert.match(chrome, /chartBackgroundMode: 'solid' \\| 'gradient'/, 'chart background can use solid or gradient fill');
assert.match(chrome, /chartBackgroundEnd: string/, 'gradient end color is independently configurable');
assert.match(chrome, /export function applySavedTcoVelaAppearance/, 'stored live trading appearance must be restored on chart startup');
assert.match(chrome, /liveWorkspace\?\.setTheme\?\.\(chartTheme\)/, 'user colors apply through Vela chart theme instead of a parallel renderer');
assert.match(chrome, /Search this watchlist/, 'watchlist contains its own ticker filter');
assert.match(chrome, /Gainers/);
assert.match(chrome, /Losers/);
assert.match(chrome, /Sort watchlist/);
assert.match(chrome, /Live market quote|Snapshot from the active market-data feed/, 'watchlist detail must not present demo prices as live');
assert.match(chrome, /ctx\.symbol.*ctx\.timeframe/, 'CoreSpirit Studio identifies the active chart context');
assert.match(chrome, /tco-core-editor-frame/, 'CoreSpirit Studio uses the refreshed terminal-panel styling');
assert.match(workspace, /this\.topbar = new Topbar/, 'Vela workspace remains the sole owner of the command bar');
assert.doesNotMatch(workspace, /Quant toolbar|Quant topbar/i, 'do not add a second Quant-style header');

console.log('TCO_CUSTOM_WORKSPACE_FRAME_CONTRACT_OK');
