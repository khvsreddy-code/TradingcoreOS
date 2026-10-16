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
const tcoVelaChrome = read('src/services/core/chart/tcoVelaChrome.ts');
const workspaceShell = read('src/components/workspace/WorkspaceModuleShell.tsx');
const workspaceRoutes = read('src/appShells/TradingWorkspaceShell.tsx');
const coreSpiritPage = read('src/pages/CoreSpiritEditorPage.tsx');
const tcoVelaTerminal = read('src/services/core/chart/tcoVelaTerminal.ts');

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


assert(tcoVelaTerminal.includes("left:['symbol','timeframes','style','layout','indicators']"), 'Vela must retain ownership of the primary symbol/timeframe/style toolbar');
assert(tcoVelaTerminal.includes("'tco.chart-settings'"), 'chart settings must stay in the existing terminal top bar');
assert(tcoVelaChrome.includes("if (typeof renderer.openSettings === 'function')"), 'chart settings must delegate to the Vela chart adapter rather than maintain a duplicate settings model');
assert(!tcoVelaChrome.includes("import { CoreSpiritEditorModel }"), 'CoreSpirit Studio model must not be loaded with the chart chrome');
assert(!tcoVelaChrome.includes("import { mountCoreSpiritMonaco"), 'Monaco must not be loaded with the chart chrome');
assert(!tcoVelaChrome.includes("import { compileCoreSpiritSourceOffThread"), 'CoreSpirit compiler client must not be loaded with the chart chrome');
assert(tcoVelaChrome.includes("import('../../coreSpirit/editorModel')"), 'CoreSpirit Studio editor model must load when Code is opened');
assert(tcoVelaChrome.includes("import('../../coreSpirit/monacoAdapter')"), 'Monaco must load only when Code is opened');
assert(tcoVelaChrome.includes("import('../../coreSpirit/coreSpiritCompilerClient')"), 'compiler client must load only when CoreSpirit is run');
assert(tcoVelaChrome.includes('updateRows(symbol)'), 'watchlist quote ticks must update only the changed symbol on the default sort');
assert(tcoVelaChrome.includes('quoteUpdatedAt'), 'watchlist rows must retain an explicit quote freshness marker');
assert(tcoVelaChrome.includes('STALE ·') && tcoVelaChrome.includes('WAITING FOR QUOTE'), 'watchlist must distinguish stale and missing quotes');
assert(tcoVelaChrome.includes('previousClose?: number;'), 'watchlist quote normalization must retain previous close');
assert(tcoVelaChrome.includes('Quote freshness'), 'Trading context must report active-chart quote freshness');
assert(tcoVelaChrome.includes('Open chart replay controls'), 'research dock must expose the existing chart replay capability');
assert(tcoVelaChrome.includes('Open market health & performance'), 'research dock must link to live renderer/market health diagnostics');
assert(tcoVelaChrome.includes('Renderer metrics are warming up'), 'research dock must communicate when renderer telemetry is not ready');
assert(tcoVelaChrome.includes(' · LTP ${Number.isFinite(ltp)?ltp.toLocaleString'), 'order-book context must show the active quote and its freshness state');
assert(workspaceShell.includes('Skip to workspace content'), 'workspace shell must provide a keyboard skip link');
assert(workspaceShell.includes('aria-label="Primary workspace navigation"'), 'workspace navigation must be named for assistive technology');
assert(workspaceShell.includes("aria-current={active===path?'page':undefined}"), 'workspace navigation must expose the current page');
assert(workspaceRoutes.includes('ROUTE_LOADING_COPY') && workspaceRoutes.includes('fallback(route)'), 'lazy workspace routes must have meaningful route-specific loading states');
assert(coreSpiritPage.includes('aria-label="CoreSpirit research workspace"'), 'CoreSpirit research workspace must have a labelled main region');
assert(coreSpiritPage.includes('aria-label="CoreSpirit compiler diagnostics"'), 'CoreSpirit diagnostics must be announced accessibly');
assert(coreSpiritPage.includes('Compile, review diagnostics, and run the validated artifact on the active Vela chart.'), 'CoreSpirit editor copy must match its actual run capability');

console.log('TCO_FRONTEND_THREE_SHELL_AND_COMPILER_BOUNDARY_OK');
