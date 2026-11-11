import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('src/App.tsx');
const vite = read('vite.config.ts');
const pkg = JSON.parse(read('package.json'));
const vercel = JSON.parse(read('vercel.json'));
const landingShell = read('src/appShells/LandingShell.tsx');

const forbiddenStaticRuntimeImport = /import\s+\{[^}]*tradingCoreRuntime[^}]*\}\s+from\s+['"][^'"]*TradingCoreRuntime['"]/;
if (forbiddenStaticRuntimeImport.test(app)) throw new Error('App.tsx must not statically import TradingCoreRuntime');
if (!app.includes("import { loadTradingCoreRuntime } from './services/runtime/tradingCoreRuntimeLoader';")) {
  throw new Error('App.tsx must use the runtime loader boundary');
}
if (!landingShell.includes("lazy(() => import('../pages/LandingPage'")) {
  throw new Error('LandingPage must be route-lazy inside LandingShell');
}
if (!landingShell.includes("lazy(() => import('../components/auth/AuthModalPlaceholder'")) {
  throw new Error('Auth modal must remain out of the initial chunk');
}
const brokerPage = read('src/pages/BrokerConnectionRequiredPage.tsx');
if (!app.includes("lazy(() => import('./pages/BrokerConnectionRequiredPage'")) {
  if (!brokerPage) throw new Error('Broker connection page module is missing');
}
if (!vite.includes('manifest: true')) throw new Error('Vite manifest must remain enabled for bundle accounting');
if (!vite.includes('chunkSizeWarningLimit: 350')) throw new Error('Vite chunk warning budget must remain 350 KB');
if (pkg.scripts?.['bundle:budget'] !== 'node tools/check-bundle-budget.mjs') throw new Error('Bundle budget script missing');
if (pkg.scripts?.build !== 'vite build && npm run bundle:budget') throw new Error('Build must enforce the bundle budget');
if (vercel.regions?.length !== 1 || vercel.regions[0] !== 'bom1') throw new Error('India-first Vercel region must remain bom1');

console.log('frontend performance architecture contract: OK');


const velaFacade = read('src/services/core/chart/velaChartFacade.ts');
if (/export\s+\{\s*VelaWorkspace\s*\}/.test(velaFacade)) throw new Error('VelaWorkspace must not be a runtime export of the chart facade');
const nativeRenderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
if (/import\s+\{\s*UserDrawingController\s*\}/.test(nativeRenderer)) throw new Error('NativeRenderer must not eagerly import UserDrawingController');
if (!nativeRenderer.includes("import('./drawings/UserDrawingController')")) throw new Error('NativeRenderer must lazy-load drawing capability');
console.log('Vela capability-splitting contract: OK');


const workspaceShell = read('src/appShells/TradingWorkspaceShell.tsx');
const liveShell = read('src/appShells/LiveTradingShell.tsx');
const liveWorkspace = read('src/LiveTradingWorkspace.tsx');
const indicatorPage = read('src/pages/IndicatorsPage.tsx');
const editorPage = read('src/pages/CoreSpiritEditorPage.tsx');
const compilerLoader = read('src/services/coreSpirit/coreSpiritCompilerLoader.ts');
const liveEngineLoader = read('src/services/coreSpirit/coreSpiritVelaEngineLoader.ts');

if (!app.includes("import { LandingShell } from './appShells/LandingShell';")) throw new Error('App must use the landing application shell');
if (!app.includes("const TradingWorkspaceShell = lazy(() => import('./appShells/TradingWorkspaceShell')")) throw new Error('App must lazy-load the trading workspace application shell');
if (!app.includes("const LiveTradingShell = lazy(() => import('./appShells/LiveTradingShell')")) throw new Error('App must lazy-load the live trading application shell');
if (!landingShell.includes("lazy(() => import('../pages/LandingPage'")) throw new Error('Landing shell must own the landing route lazy boundary');
if (!workspaceShell.includes("lazy(() => import('../pages/CoreSpiritEditorPage'")) throw new Error('Trading workspace shell must keep CoreSpirit editor route-lazy');
if (!liveShell.includes("lazy(() => import('../LiveTradingTerminal'")) throw new Error('Live shell must keep the live terminal route-lazy');

if (/import\s+\{\s*CoreSpiritVelaEngine\s*\}\s+from/.test(liveWorkspace)) throw new Error('LiveTradingWorkspace must not eagerly import CoreSpiritVelaEngine');
if (!liveWorkspace.includes('LazyCoreSpiritVelaEngine')) throw new Error('LiveTradingWorkspace must use the lazy CoreSpirit engine boundary');
if (!liveEngineLoader.includes("import('../../CoreSpiritVelaEngine')")) throw new Error('CoreSpirit Vela engine loader must use a dynamic import');
if (!compilerLoader.includes("import('./coreSpiritPipeline')")) throw new Error('CoreSpirit compiler must sit behind a dynamic import boundary');

if (!indicatorPage.includes("lazy(() => import('../components/indicators/IndicatorSourceEditor'")) throw new Error('IndicatorSourceEditor must be route/interaction lazy');
if (!editorPage.includes("../services/coreSpirit/editorModel")) throw new Error('CoreSpirit editor must avoid the barrel import');
if (editorPage.includes("from '../services/coreSpirit';")) throw new Error('CoreSpirit editor must not import the full CoreSpirit barrel');

if (!vite.includes("return 'tco-live-workspace';")) throw new Error('Live workspace chunk boundary missing');
if (!vite.includes("return 'tco-corespirit-compiler';")) throw new Error('CoreSpirit compiler chunk boundary missing');
console.log('application shell + CoreSpirit critical-path performance contract: OK');
