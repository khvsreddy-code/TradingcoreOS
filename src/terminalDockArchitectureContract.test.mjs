import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dock = fs.readFileSync(path.join(root, 'src', 'components', 'workspace', 'RightTerminalDock.tsx'), 'utf8');
const compat = fs.readFileSync(path.join(root, 'src', 'components', 'workspace', 'WatchlistDock.tsx'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'src', 'LiveTradingWorkspace.tsx'), 'utf8');

assert.match(dock, /export function RightTerminalDock/);
assert.match(dock, /RIGHT_DOCK_TABS/);
for (const surface of ['WatchlistSurface', 'OrderBookSurface', 'AlertsSurface']) {
  assert.match(dock, new RegExp(`const ${surface} = memo\\(function ${surface}`), `${surface} must be an independently renderable dock surface`);
}
for (const token of ['data-tco-dock="right"', 'data-tco-dock-surface="watchlist"', 'data-tco-dock-surface="orderbook"', 'data-tco-dock-surface="alerts"']) {
  assert.match(dock, new RegExp(token.replace(/["\\]/g, '\\$&')));
}
assert.match(dock, /tabIndex=\{active \? 0 : -1\}/);
assert.match(dock, /ArrowRight|ArrowDown/);
assert.match(dock, /ArrowLeft|ArrowUp/);
assert.match(dock, /aria-controls=/);
assert.match(dock, /aria-labelledby=/);
assert.match(dock, /clampDockWidth/);
assert.doesNotMatch(dock, /createRoot\(/);
assert.doesNotMatch(dock, /document\.body/);
assert.match(workspace, /<RightTerminalDock[\s\S]*?onWidthChange=\{setRightDockWidth\}/);
assert.match(compat, /from '\.\/RightTerminalDock'/, 'WatchlistDock must only be a compatibility adapter');
console.log('TRADINGCORE_V102_RIGHT_DOCK_ARCHITECTURE_CONTRACT_OK');
