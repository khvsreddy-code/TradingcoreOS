import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const terminal = fs.readFileSync(path.join(root,'src/LiveTradingTerminal.tsx'),'utf8');
const app = fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
for (const legacy of ['LiveTradingTerminalV2.tsx','LiveTradingTerminalV3.tsx','LiveTradingTerminalV4.tsx','LiveTradingTerminalV5.tsx']) {
  if (fs.existsSync(path.join(root,'src',legacy))) throw new Error(`legacy terminal remains: ${legacy}`);
}
if (!terminal.includes('export function LiveTradingTerminal()')) throw new Error('canonical terminal export missing');
if (!terminal.includes('<LiveTradingWorkspace />')) throw new Error('canonical terminal does not compose the neutral workspace implementation');
if (/LiveTradingTerminalV[2-5]|tc5-/.test(terminal)) throw new Error('canonical terminal still carries generation-era naming');
if (app.includes('LiveTradingTerminalV5') || app.includes('LiveTradingTerminalV4')) throw new Error('App still references a terminal generation');
console.log('STAGE86_TERMINAL_CONSOLIDATION_OK');
