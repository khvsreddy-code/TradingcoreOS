import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const workflow = path.join(root,'.github/workflows/fix-layout-duplicate-slots.yml');
if (fs.existsSync(workflow)) throw new Error('self-mutating layout hotfix workflow still exists');
const source = fs.readFileSync(path.join(root,'src','LiveTradingWorkspace.tsx'),'utf8');
if (!source.includes('slotKeys')) throw new Error('canonical workspace did not retain chart-slot management');
console.log('STAGE87_LAYOUT_HOTFIX_RETIRED_OK');
