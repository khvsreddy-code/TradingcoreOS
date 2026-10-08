import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'src', 'LiveTradingWorkspace.tsx'), 'utf8');
const topology = fs.readFileSync(path.join(root, 'src', 'services/core/chart/tcoVelaTerminal.ts'), 'utf8');
assert.ok(topology.includes('shell:\'VelaWorkspace\''));
assert.equal(/RightTerminalDock|rightDockOpen|rightDockWidth|WatchlistDock|tct-rightdock|tc4-side/.test(workspace), false);
console.log('TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK');
