import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('src/App.tsx');
const liveShell = read('src/appShells/LiveTradingShell.tsx');
const terminalRoot = read('src/LiveTradingTerminal.tsx');
const workspace = read('src/LiveTradingWorkspace.tsx');
const options = read('src/services/core/chart/tcoVelaTerminal.ts');
const loader = read('src/services/core/chart/velaWorkspaceLoader.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const dataPlane = read('src/services/marketData/chartDataPlane.ts');

assert.match(app, /workspacePath\s*===\s*['"]\/live['"][\s\S]*?<LiveTradingShell\s*\/>/,
  '/live must resolve through the canonical live shell');
assert.match(liveShell, /lazy\(\(\)\s*=>\s*import\(['"]\.\.\/LiveTradingTerminal['"]\)/);
assert.match(terminalRoot, /<LiveTradingWorkspace\s*\/>/);
assert.match(workspace, /loadVelaWorkspace/);
assert.match(workspace, /new VelaWorkspaceClass\(host\.current,\s*createTcoVelaTerminalOptions\(/,
  'the production live workspace must instantiate VelaWorkspace as the chart owner');
assert.doesNotMatch(workspace, /components\/workspace\/LiveChart|createChartRuntimeController|createVelaNativeChart/,
  'the production Vela workspace must not mount the legacy React chart runtime');
assert.match(options, /providers:\s*\{[\s\S]*?tco:\s*\(\)\s*=>\s*deps\.createDataProvider\(\)/);
assert.match(options, /engines:\s*\{[\s\S]*?corespirit:\s*\(\)\s*=>\s*deps\.createCoreSpiritEngine\(\)/);
assert.match(options, /maxWebglCells:\s*8/);
assert.match(loader, /await import\(['"]\.\.\/\.\.\/\.\.\/\.\.\/vendor\/vela\/src\/workspace['"]\)/);

assert.match(dataPlane, /this\.canonicalPlane\.market\.append\(canonicalPoint\)/,
  'a confirmed new bucket must append exactly one canonical candle');
assert.match(dataPlane, /this\.canonicalPlane\.market\.updateLast\(canonicalPoint\)/,
  'a forming candle must update the current canonical tail');
assert.match(provider, /operation:\s*'replace-history'/,
  'historical corrections and recovery must replace the Vela columnar history, not masquerade as a tail tick');
assert.match(provider, /onBar\(replacement\)/,
  'canonical historical replacements must reach the Vela provider boundary');
assert.match(provider, /if \(nextKey === fingerprint\) return/,
  'identical canonical tail updates must be deduplicated before dispatch');

const sourceFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(m?tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));
const liveChartConsumers = sourceFiles
  .filter(file => !file.endsWith(path.join('components', 'workspace', 'LiveChart.tsx')))
  .filter(file => /from\s+['"][^'"]*\/LiveChart['"]/.test(fs.readFileSync(file, 'utf8')))
  .map(file => path.relative(root, file).replaceAll('\\', '/'));
assert.deepEqual(liveChartConsumers, [],
  'legacy LiveChart must stay out of the active application graph while Vela owns /live');

console.log('VELA_LIVE_WORKSPACE_OWNERSHIP_CONTRACT_OK');
