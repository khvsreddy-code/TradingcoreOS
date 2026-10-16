import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('src/App.tsx');
const liveWorkspace = read('src/LiveTradingWorkspace.tsx');
const liveLoader = read('src/services/coreSpirit/coreSpiritVelaEngineLoader.ts');
const compilerLoader = read('src/services/coreSpirit/coreSpiritCompilerLoader.ts');
const indicators = read('src/pages/IndicatorsPage.tsx');
const publication = read('src/services/coreSpirit/indicatorPublicationService.ts');
const editor = read('src/pages/CoreSpiritEditorPage.tsx');
const viteConfig = read('vite.config.ts');
const bundleBudget = read('tools/check-bundle-budget.mjs');

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

assert(app.includes('LandingShell') && app.includes('TradingWorkspaceShell') && app.includes('LiveTradingShell'), 'three application shells are not wired');
assert(!liveWorkspace.includes("import { CoreSpiritVelaEngine }"), 'live workspace still statically imports CoreSpiritVelaEngine');
assert(liveWorkspace.includes('LazyCoreSpiritVelaEngine'), 'live workspace lost the lazy engine proxy');
assert(liveLoader.includes("import('../../CoreSpiritVelaEngine')"), 'CoreSpirit engine implementation is not dynamically imported');
assert(compilerLoader.includes("import('./coreSpiritPipeline')"), 'compiler implementation is not dynamically imported');
assert(indicators.includes("lazy(() => import('../components/indicators/IndicatorSourceEditor'"), 'indicator authoring UI is not interaction-lazy');
assert(publication.includes("from './coreSpiritCompilerLoader'"), 'publication service is not using the compiler boundary');
assert(!publication.includes("from './coreSpiritPipeline'"), 'publication service statically imports the compiler pipeline');
assert(!editor.includes("from '../services/coreSpirit';"), 'editor still imports the CoreSpirit barrel');


assert(!viteConfig.includes("return 'vendor-other';"), 'unclassified vendor dependencies must not be forced into one catch-all chunk');
assert(bundleBudget.includes('TCO_MAX_INITIAL_GZIP_KB'), 'initial entry graph must have an explicit gzip budget');
assert(bundleBudget.includes("requireKey('src/pages/ModelsPage.tsx'"), 'models research must be an explicit measured route');
assert(bundleBudget.includes("requireKey('src/pages/PredictionCenterPage.tsx'"), 'prediction research must be an explicit measured route');
assert(bundleBudget.includes("requireKey('src/pages/CoreSpiritEditorPage.tsx'"), 'CoreSpirit editor must be an explicit measured route');
assert(bundleBudget.includes('dynamicImports'), 'manifest audit must distinguish deferred imports from static initial dependencies');
assert(bundleBudget.includes('new Set()'), 'bundle accounting must de-duplicate emitted JS assets shared across route graphs');
assert(bundleBudget.includes('advancedRegistryFibonacci.ts'), 'production graph audit must guard the advanced Vela drawing boundary');
assert(liveWorkspace.includes('Loading chart engine') && liveWorkspace.includes('Retry chart loading'), 'optional chart capability loading must expose visible pending and retry states');

console.log('TCO_FRONTEND_THREE_SHELL_AND_COMPILER_BOUNDARY_OK');
