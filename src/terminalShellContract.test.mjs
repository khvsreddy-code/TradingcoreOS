import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const terminal = read('src/LiveTradingTerminal.tsx');
const workspace = read('src/LiveTradingWorkspace.tsx');

assert.match(terminal, /return\s*<LiveTradingWorkspace\s*\/>/);
assert.doesNotMatch(terminal, /useEffect\(|history\.|popstate|setTimeout\(/);

for (const token of ['VelaWorkspace', 'defaultLanguage', 'corespirit', 'CoreSpiritVelaEngine', 'createTcoVelaDataProvider', 'layout: false', 'live: true']) {
  assert.ok(workspace.includes(token), 'new Vela live contract missing: ' + token);
}

for (const token of ['LiveChart', 'RightTerminalDock', 'WatchlistDock', 'AdvancedOrderTicket', 'useLiveTradingTerminalController', 'Option Chain', 'Order Book', 'Strategy Log', 'TradingCoreRuntime.placeOrder', 'tco-terminal-shell', 'TRADINGCORE_TOGGLE_OI', 'TRADINGCORE_TOGGLE_DEPTH']) {
  assert.equal(workspace.includes(token), false, 'legacy live-terminal token remains: ' + token);
}

for (const token of ['PineEngine', 'pine', 'Pine Script', 'PineTS']) {
  assert.equal(workspace.toLowerCase().includes(token.toLowerCase()), false, 'Pine compatibility remains in the live workspace: ' + token);
}

for (const file of ['src/TradingCoreProWorkspace.tsx', 'src/LiveTradingTerminalV2.tsx', 'src/LiveTradingTerminalV3.tsx', 'src/LiveTradingTerminalV4.tsx', 'src/LiveTradingTerminalV5.tsx']) {
  assert.equal(fs.existsSync(path.join(root, file)), false, 'retired duplicate terminal must remain absent: ' + file);
}

console.log('TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK');
