import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const terminal = read('src/LiveTradingTerminal.tsx');
const workspace = read('src/LiveTradingWorkspace.tsx');
const terminalTopology = read('src/services/core/chart/tcoVelaTerminal.ts');
const dataProvider = read('src/TcoVelaDataProvider.ts');
const historyPolicy = read('src/services/marketData/chartHistoryPolicy.ts');

assert.match(terminal, /return\s*<LiveTradingWorkspace\s*\/>/);
assert.doesNotMatch(terminal, /useEffect\(|history\.|popstate|setTimeout\(/);
assert.ok(terminalTopology.includes('bars:2_000'), 'Vela should retain a bounded 2,000-candle workspace history ceiling');
assert.match(historyPolicy, /DEFAULT_INITIAL_HISTORY_CANDLES = 300/, 'cold starts should use the viewport-sized 300-candle initial history policy');
assert.match(historyPolicy, /MAX_INITIAL_HISTORY_CANDLES = 2_000/, 'the canonical initial history policy must retain its hard 2,000-candle bound');
assert.match(dataProvider, /const firstPaintBars = Math\.min\(requested, 300\)/, 'Vela must paint a first real-candle batch capped at 300 before requesting the larger history target');

for (const token of ['VelaWorkspace', 'CoreSpiritVelaEngine', 'createTcoVelaDataProvider']) {
  assert.ok(workspace.includes(token), 'new Vela live contract missing: ' + token);
}
for (const token of ['defaultLanguage', 'corespirit', 'bars:2_000', 'live:true', 'indicatorPicker:true', 'maxWebglCells:8']) {
  assert.ok(terminalTopology.includes(token), 'Vela terminal configuration missing: ' + token);
}

for (const token of ['LiveChart', 'RightTerminalDock', 'WatchlistDock', 'AdvancedOrderTicket', 'useLiveTradingTerminalController', 'Option Chain', 'Order Book', 'Strategy Log', 'TradingCoreRuntime.placeOrder', 'tco-terminal-shell', 'TRADINGCORE_TOGGLE_OI', 'TRADINGCORE_TOGGLE_DEPTH']) {
  assert.equal(workspace.includes(token), false, 'legacy live-terminal token remains: ' + token);
}


for (const file of ['src/TradingCoreProWorkspace.tsx', 'src/LiveTradingTerminalV2.tsx', 'src/LiveTradingTerminalV3.tsx', 'src/LiveTradingTerminalV4.tsx', 'src/LiveTradingTerminalV5.tsx']) {
  assert.equal(fs.existsSync(path.join(root, file)), false, 'retired duplicate terminal must remain absent: ' + file);
}

console.log('TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK');
