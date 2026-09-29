import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'src', 'LiveTradingWorkspace.tsx'), 'utf8');
const dock = fs.readFileSync(path.join(root, 'src', 'components', 'workspace', 'RightTerminalDock.tsx'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'src', 'services', 'workspaceLayoutService.ts'), 'utf8');

assert.match(workspace, /rightDockOpen/);
assert.match(workspace, /rightDockWidth/);
assert.match(workspace, /Alt\+1|e\.key==='1'/, 'watchlist keyboard entry must exist');
assert.match(workspace, /e\.key==='2'/, 'order-book keyboard entry must exist');
assert.match(workspace, /e\.key==='3'/, 'alerts keyboard entry must exist');
assert.match(workspace, /e\.key==='0'/, 'dock collapse shortcut must exist');
assert.match(workspace, /onWidthChange=\{setRightDockWidth\}/, 'dock width must be controlled by the workspace');
assert.match(dock, /width: number/);
assert.match(dock, /onWidthChange: \(width: number\) => void/);
assert.match(dock, /tct-panel-watchlist/);
assert.match(dock, /tct-panel-orderbook/);
assert.match(dock, /tct-panel-alerts/);
assert.match(dock, /role="tabpanel"/);
assert.match(dock, /shortcut: 'Alt\+1'/);
assert.match(dock, /shortcut: 'Alt\+2'/);
assert.match(dock, /shortcut: 'Alt\+3'/);
assert.match(dock, /tct-dock-status/);
assert.match(layout, /rightDockOpen\?: boolean/);
assert.match(layout, /rightDockTab\?: 'watchlist' \| 'orderbook' \| 'alerts'/);
assert.match(layout, /rightDockWidth\?: number/);

for (const token of ['WATCHLIST', 'ORDER BOOK', 'ALERTS']) {
  assert.match(dock, new RegExp(token), `${token} dock surface is required`);
}

console.log('TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK');
