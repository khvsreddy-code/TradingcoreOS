import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'public', 'tradingview');
const library = path.join(target, 'charting_library.js');
if (existsSync(library)) {
  console.log('[TradingCoreOS] TradingView Advanced Charts already installed.');
  process.exit(0);
}
await mkdir(path.dirname(target), { recursive: true });
const tmp = path.join(root, '.tradingview-source');
await rm(tmp, { recursive: true, force: true });
console.log('[TradingCoreOS] Fetching TradingView Advanced Charts from IndexCoop/tradingview-chart...');
const result = spawnSync('git', ['clone', '--depth', '1', 'https://github.com/IndexCoop/tradingview-chart.git', tmp], { stdio: 'inherit' });
if (result.status !== 0) {
  console.warn('[TradingCoreOS] Could not fetch TradingView automatically. Start with the legacy chart or install the library manually in public/tradingview/.');
  process.exit(0);
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const copy = spawnSync(process.platform === 'win32' ? 'xcopy' : 'cp', process.platform === 'win32'
  ? [path.join(tmp, 'charting_library'), target, '/E', '/I', '/Y']
  : ['-R', path.join(tmp, 'charting_library'), target], { stdio: 'inherit' });
await rm(tmp, { recursive: true, force: true });
if (copy.status !== 0) {
  console.warn('[TradingCoreOS] TradingView files could not be copied.');
  process.exit(0);
}
console.log('[TradingCoreOS] TradingView Advanced Charts installed in public/tradingview/.');
