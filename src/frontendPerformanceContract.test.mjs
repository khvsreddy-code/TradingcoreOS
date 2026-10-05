import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('src/App.tsx');
const vite = read('vite.config.ts');
const pkg = JSON.parse(read('package.json'));
const vercel = JSON.parse(read('vercel.json'));

const forbiddenStaticRuntimeImport = /import\s+\{[^}]*tradingCoreRuntime[^}]*\}\s+from\s+['"][^'"]*TradingCoreRuntime['"]/;
if (forbiddenStaticRuntimeImport.test(app)) throw new Error('App.tsx must not statically import TradingCoreRuntime');
if (!app.includes("import { loadTradingCoreRuntime } from './services/runtime/tradingCoreRuntimeLoader';")) {
  throw new Error('App.tsx must use the runtime loader boundary');
}
if (!app.includes("lazy(() => import('./pages/LandingPage'")) {
  throw new Error('LandingPage must be route-lazy');
}
if (!app.includes("lazy(() => import('./components/auth/AuthModalPlaceholder'")) {
  throw new Error('Auth modal must remain out of the initial chunk');
}
if (!app.includes("lazy(() => import('./pages/BrokerConnectionRequiredPage'")) {
  throw new Error('Broker connection page must be route-lazy');
}
if (!vite.includes('manifest: true')) throw new Error('Vite manifest must remain enabled for bundle accounting');
if (!vite.includes('chunkSizeWarningLimit: 350')) throw new Error('Vite chunk warning budget must remain 350 KB');
if (pkg.scripts?.['bundle:budget'] !== 'node tools/check-bundle-budget.mjs') throw new Error('Bundle budget script missing');
if (pkg.scripts?.build !== 'vite build && npm run bundle:budget') throw new Error('Build must enforce the bundle budget');
if (vercel.regions?.length !== 1 || vercel.regions[0] !== 'bom1') throw new Error('India-first Vercel region must remain bom1');

console.log('frontend performance architecture contract: OK');
