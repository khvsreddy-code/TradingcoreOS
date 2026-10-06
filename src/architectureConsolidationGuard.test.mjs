import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const forbiddenTerminalFiles = [
  'src/LiveTradingTerminalV2.tsx',
  'src/LiveTradingTerminalV3.tsx',
  'src/LiveTradingTerminalV4.tsx',
  'src/LiveTradingTerminalV5.tsx',
];
for (const relative of forbiddenTerminalFiles) {
  if (fs.existsSync(path.join(root, relative))) throw new Error(`Retired terminal generation returned: ${relative}`);
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const forbiddenActivePatterns = [
  /^CORESPIRIT_V\d+_MANIFEST\.json$/,
  /^tsconfig\.stage.*\.json$/,
  /^src\/services\/coreSpirit\/stage\d+.*\.(?:ts|mjs)$/,
  /^src\/services\/core\/chart\/stage\d+.*\.(?:ts|mjs)$/,
  /^src\/(?:components\/.*\/|services\/boundary\/|)stage\d+.*\.test\.ts$/,
  /^src\/v\d+.*\.test\.(?:ts|mjs)$/
];
const forbidden = tracked.filter((file) => forbiddenActivePatterns.some((pattern) => pattern.test(file)));
if (forbidden.length) throw new Error(`Historical stage/version artifacts must live only in Git history or docs/archive: ${forbidden.slice(0, 12).join(', ')}`);

const workflowDir = path.join(root, '.github/workflows');
for (const file of fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir) : []) {
  const full = path.join(workflowDir, file);
  if (!fs.statSync(full).isFile()) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (/LiveTradingTerminalV[2-9]|fix-layout-duplicate-slots|sed -i|perl -0pi|python .*write_text/i.test(text)) throw new Error(`Production workflow appears to mutate source or reference retired terminal generations: ${file}`);
}

const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
if (!app.includes('./appShells/LiveTradingShell')) throw new Error('App no longer references the canonical LiveTradingShell');
if (/LiveTradingTerminalV[2-9]/.test(app)) throw new Error('App references a retired terminal generation');

const architecture = fs.readFileSync(path.join(root, 'src/architecture/architectureContract.ts'), 'utf8');
for (const plane of ['marketData', 'coreSpirit', 'compute', 'vela', 'trading']) {
  if (!architecture.includes(`'${plane}'`)) throw new Error(`Canonical architecture plane missing: ${plane}`);
}

console.log('TRADINGCOREOS_CONSOLIDATED_ARCHITECTURE_GUARD_OK');