import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const terminal = read('src/LiveTradingTerminal.tsx');
const app = read('src/App.tsx');
const workspace = read('src/LiveTradingWorkspace.tsx');
const dock = read('src/components/workspace/RightTerminalDock.tsx');
const layout = read('src/services/workspaceLayoutService.ts');

assert.match(terminal, /return\s*<LiveTradingWorkspace\s*\/>/,
  'canonical terminal host must mount the canonical workspace directly');
assert.doesNotMatch(terminal, /useLiveTradingTerminalController|AdvancedOrderTicket|tct-backdrop|tct-window/,
  'terminal host must not reintroduce the retired modal/controller shell');
assert.doesNotMatch(app, /BrokerRuntimeSwitcher.*LiveTradingTerminal|LiveTradingTerminal.*BrokerRuntimeSwitcher/s,
  'live route must not mount a second broker switcher around the terminal');
assert.doesNotMatch(app, /TradingCoreProWorkspace/,
  'live route must not reference the retired duplicate Pro workspace');
assert.match(workspace, /className="tco-terminal-shell"/, 'top terminal command bar is required');
for (const token of ['Chart', 'Indicators', 'Draw', 'Compare', 'Alerts', 'Replay', 'Settings']) {
  assert.match(workspace, new RegExp(`>${token}`), `top command ${token} is required`);
}
for (const token of ['POSITIONS', 'ORDERS', 'TRADES', 'ACTIVITY', 'STRATEGY LOG']) {
  assert.match(workspace, new RegExp(token), `bottom dock tab ${token} is required`);
}
assert.match(workspace, /<RightTerminalDock[\s\S]*?activeTab=/, 'right dock must be owned by the canonical workspace');
assert.match(dock, /tct-dock-tabs/, 'right dock must expose dock tabs');
for (const token of ['WATCHLIST', 'ORDER BOOK', 'ALERTS']) {
  assert.match(dock, new RegExp(token), `right dock tab ${token} is required`);
}
assert.match(dock, /tct-right-resizer/, 'right dock must be resizable');
assert.match(workspace, /rightDockWidth/, 'right dock width must be first-class workspace state');
assert.match(layout, /rightDockOpen\?: boolean/, 'workspace snapshot must preserve right dock open state');
assert.match(layout, /rightDockTab\?: 'watchlist' \| 'orderbook' \| 'alerts'/,
  'workspace snapshot must preserve right dock tab state');
assert.match(layout, /bottomTab\?: 'positions' \| 'orders' \| 'trades' \| 'activity' \| 'strategy' \| 'ticket'/,
  'workspace snapshot must preserve bottom dock state');

const retired = ['src/TradingCoreProWorkspace.tsx', 'src/LiveTradingTerminalV2.tsx', 'src/LiveTradingTerminalV3.tsx', 'src/LiveTradingTerminalV4.tsx', 'src/LiveTradingTerminalV5.tsx'];
for (const file of retired) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `retired duplicate terminal file must remain absent: ${file}`);
}

console.log('TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK');
