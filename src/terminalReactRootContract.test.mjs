import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const index = read('index.html');
const main = read('src/main.tsx');
const app = read('src/App.tsx');
const terminal = read('src/LiveTradingTerminal.tsx');

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(m?tsx?|jsx?)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));

const rootFiles = sourceFiles
  .filter(file => /createRoot\s*\(/.test(fs.readFileSync(file, 'utf8')))
  .map(file => path.relative(root, file).replaceAll('\\', '/'))
  .sort();
const velaPanelRootFile = 'src/services/core/chart/tcoVelaChrome.ts';
assert.deepEqual(rootFiles, ['src/main.tsx', velaPanelRootFile].sort(),
  'one application React root is allowed; the only additional roots may be scoped Vela side-panel mounts');
assert.match(main, /createRoot\(document\.getElementById\('root'\)!\)/,
  'src/main.tsx owns the single application root');

const velaPanelChrome = read(velaPanelRootFile);
assert.equal((velaPanelChrome.match(/createRoot\(/g) ?? []).length, 3,
  'only CoreSpirit Studio, Quant and Journal may mount embedded React panel roots');
assert.equal((velaPanelChrome.match(/\.unmount\(\)/g) ?? []).length, 3,
  'every Vela-owned embedded React panel root must be disposed with its panel');
assert.match(velaPanelChrome, /const root = createRoot\(body\)[\s\S]{0,1800}destroy\(\)\s*\{\s*cancelled = true;\s*root\.unmount\(\)/,
  'CoreSpirit Studio mounts into its Vela-owned panel body and unmounts on panel destruction');
assert.equal((velaPanelChrome.match(/destroy:\s*\(\)\s*=>\s*reactRoot\.unmount\(\)/g) ?? []).length, 2,
  'Quant and Journal release their embedded React roots when Vela destroys those panels');

const moduleScripts = [...index.matchAll(/<script\s+type="module"/g)];
assert.equal(moduleScripts.length, 1, 'index.html must expose exactly one module entrypoint');
assert.match(index, /src="\/src\/main\.tsx"/);
assert.doesNotMatch(index, /workspaceRuntimeBridge|workspaceChromeStyle|workspaceOrderBridge|workspaceHotfix|quickOrderHotfix/);

for (const token of ['TradingCoreProWorkspace', 'proHost', 'tco-pro-hide', 'createRoot(proHost', 'document.body.appendChild(proHost)']) {
  assert.doesNotMatch(app, new RegExp(token.replace(/[\\.*+?^${}()|[\]]/g, '\\$&')), `legacy terminal mount token remains: ${token}`);
  assert.doesNotMatch(terminal, new RegExp(token.replace(/[\\.*+?^${}()|[\]]/g, '\\$&')), `legacy terminal mount token remains: ${token}`);
}

for (const retired of [
  'src/TradingCoreProWorkspace.tsx',
  'src/LiveTradingTerminalV2.tsx',
  'src/LiveTradingTerminalV3.tsx',
  'src/LiveTradingTerminalV4.tsx',
  'src/LiveTradingTerminalV5.tsx',
  'src/workspaceRuntimeBridge.ts',
  'src/workspaceChromeStyle.ts',
  'src/workspaceOrderBridge.ts',
  'src/workspaceHotfix.ts',
  'src/workspaceChromeHotfix.ts',
  'src/quickOrderHotfix.ts',
]) assert.equal(fs.existsSync(path.join(root, retired)), false, `retired frontend mount/bridge still exists: ${retired}`);

assert.match(app, /workspacePath\s*===\s*['"]\/live['"][\s\S]*?<LiveTradingShell\s*\/>/, 'live route must enter the canonical LiveTradingShell directly in the application tree');
const liveShell = read('src/appShells/LiveTradingShell.tsx');
assert.match(liveShell, /lazy\(\(\)\s*=>\s*import\(['"]\.\.\/LiveTradingTerminal['"]\)/, 'LiveTradingShell must lazy-load the canonical terminal');
assert.match(liveShell, /<LiveTradingTerminal\s*\/>/);
assert.match(terminal, /<LiveTradingWorkspace\s*\/>/);
assert.doesNotMatch(terminal, /useEffect\(|history\.|popstate|setTimeout\(/);

console.log('TRADINGCORE_V102_SINGLE_REACT_ROOT_CONTRACT_OK');
