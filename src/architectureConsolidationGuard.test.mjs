import fs from 'node:fs';
import path from 'node:path';

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
const workflowDir = path.join(root, '.github/workflows');
for (const file of fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir) : []) {
  const full = path.join(workflowDir, file);
  if (!fs.statSync(full).isFile()) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (/LiveTradingTerminalV[2-9]|fix-layout-duplicate-slots|sed -i|perl -0pi|python .*write_text/i.test(text)) {
    throw new Error(`Production workflow appears to mutate source or reference retired terminal generations: ${file}`);
  }
}
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
if (!app.includes("./LiveTradingTerminal")) throw new Error('App no longer references the canonical LiveTradingTerminal');
if (/LiveTradingTerminalV[2-9]/.test(app)) throw new Error('App references a retired terminal generation');
console.log('STAGE88_TERMINAL_ARCHITECTURE_GUARD_OK');
