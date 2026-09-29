import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'src', 'LiveTradingWorkspace.tsx'), 'utf8');
const polish = fs.readFileSync(path.join(root, 'src', 'liveTerminalPolish.css'), 'utf8');

assert.match(workspace, /v100 terminal visual-density layer/);
assert.match(workspace, /v101 terminal-system depth/);
assert.match(workspace, /\.tc4 \.tc4-chart\{[^}]*border-radius:0/);
assert.match(workspace, /\.tc4 \.tc4-chart\{[^}]*box-shadow:none/);
assert.match(workspace, /\.tc4 \.tc4-card\{[^}]*border-radius:2px/);
assert.match(workspace, /\.tc4 \.tco-drawing-rail\{[^}]*border-radius:2px[^}]*[^}]*box-shadow:none/);
assert.match(workspace, /\.tc4 \.tco-command-popover\{[^}]*border-radius:6px[^}]*box-shadow:none/);
assert.match(workspace, /@media\(max-width:760px\)\{\.tc4 \.tco-terminal-shell/);
assert.doesNotMatch(workspace, /\.tc4 \.(?:tc4-chart|tc4-card)[^{]*\{[^}]*box-shadow:\s*0\s*(?!none)/);
assert.match(polish, /v100 terminal visual-density contract/);

console.log('TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK');

