import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');

const chartState=read('src/services/core/chart/chartRuntimeSupport.ts');
const liveChart=read('src/components/workspace/LiveChart.tsx');
const runtime=read('src/CoreSpiritVelaEngine.ts');
const coreSpiritRuntime=read('src/services/coreSpirit/runtime.ts');
const marketGraph=read('src/services/core/data/marketDataGraph.ts');
const multiSymbolTimeframe=read('src/services/coreSpirit/multiSymbolTimeframe.ts');
const provider=read('src/TcoVelaDataProvider.ts');
const plane=read('src/services/marketData/chartDataPlane.ts');
const chartRuntime=read('src/services/core/chart/ChartRuntimeController.ts');
const realtime=read('src/services/core/chart/controllers/ChartRealtimeController.ts');
const interactions=read('src/services/core/chart/ChartInteractionController.ts');
const marketClient=read('src/services/marketData/BrokerMarketDataClient.ts');
const ticket=read('src/server/routes/realtime-ticket.routes.ts');
const gateway=read('realtime-gateway/server.ts');
const vercel=JSON.parse(read('vercel.json'));
const authClient=read('src/services/auth/supabaseClient.ts');
const authSession=read('src/services/auth/sessionService.ts');
const authContext=read('src/auth/context/AuthContext.tsx');
const scene=read('src/services/core/chart/coreSpiritSceneDiff.ts');
const watchlist=read('src/services/core/chart/tcoVelaChrome.ts');
const chrome=watchlist;
const facade=read('src/services/core/chart/velaChartFacade.ts');
const workspace=read('src/LiveTradingWorkspace.tsx');
const storage=read('src/services/core/chart/tcoVelaSupabaseStorage.ts');
const nativeExtensions=read('src/services/core/chart/tcoVelaNativeExtensions.ts');

assert.match(chartState,/velaDrawings[\s,=]/);
assert.doesNotMatch(liveChart,/createChartDrawingController|drawingControllerRef|drawingInitial/);
assert.doesNotMatch(interactions,/hitTestDrawings|moveDrawingHandle|CoreDrawingStore/);
assert.match(liveChart,/chart\.current\.drawings/);

// Secondary data now travels through a typed CoreSpiritGraphSnapshot. The Vela
// engine owns fetching/calendar close-times; the shared graph resolver owns
// alignment, confirmation and optional staleness; the language runtime validates
// every resolved snapshot before exposing its value to CoreScript.
assert.match(runtime,/loadSecondaryData\s*=\s*async\s*\(force=false\)/);
assert.match(runtime,/const makeSecondaryGraphSnapshot=/, 'Vela must publish secondary dependencies through the canonical graph snapshot');
assert.match(runtime,/req\.marketCalendar\?\.resolveBarCloseTime/, 'secondary bars must use exchange-calendar close boundaries when available');
assert.match(runtime,/closeTime:Float64Array\.from\(temporalRows/, 'the graph snapshot must carry per-bar close timestamps');
assert.match(runtime,/Secondary market data refresh failed/);
assert.match(marketGraph,/if\(alignment==='exact'\)return node\.time\[index\]===asOf\?index:-1/, 'exact graph alignment must match the requested decision timestamp');
assert.match(marketGraph,/alignment==='last-confirmed'\|\|alignment==='nearest-confirmed'/, 'confirmed alignment must walk back past unfinished candles');
assert.match(marketGraph,/ctx\?\.maxStalenessMs!=null/, 'the graph resolver must enforce an optional caller-supplied freshness budget');
assert.match(marketGraph,/state:isConfirmed\?'confirmed':'developing'/, 'graph snapshots must label their confirmation state');
assert.match(multiSymbolTimeframe,/context\.maxStalenessMs/, 'snapshot validation must enforce the same optional freshness budget');
assert.match(multiSymbolTimeframe,/if \(markedDeveloping && context\.alignment !== 'developing'\) return null/, 'non-developing requests must reject developing graph samples');
assert.match(coreSpiritRuntime,/validateSynchronizedSnapshot\(snapshot,ctx\)/, 'CoreScript must validate graph samples before exposing their values');

assert.doesNotMatch(provider,/getChartDataPlane\(['"]fyers['"]/);
assert.match(provider,/activeBrokerId\(\)/);
assert.match(provider,/seedColumnsFromBars/);
assert.match(provider,/supportedTimeframes: \['1'.*'M'\]/s);

assert.match(plane,/columns\?: ChartColumnarSnapshot/);
assert.match(plane,/getCompatibilityCandles/);
assert.match(plane,/this\.state\.columns = columns/);
assert.match(plane,/Critical render path: keep Vela on the typed columnar representation/);
assert.match(plane,/historyReady = false/);
assert.match(plane,/if \(!columns \|\| columns\.time\.length === 0\)[\s\S]*return this\.ensureHistory\(requestedLimit\)/, 'an empty columnar response must fall back to the object-history generation');
assert.match(plane,/if \(!active\.length\) throw new Error\('No historical candles available'\)/, 'empty normalized history cannot be committed as a ready dataset');
assert.match(plane,/this\.state\.historyReady = false;\s*this\.liveCandle\.failHistoryLoad\(generation, true\)/, 'a failed cold start without valid cached history remains not-ready and reports failure');
assert.match(plane,/ensureReady\(limit\?: number\): Promise<HistoricalCandle\[\]> \{\s*return this\.ensureReadyColumns\(limit\)\.catch\(\(\) => this\.ensureHistory\(limit\)\);/, 'the public history loader preserves a bounded object-history fallback');
assert.match(chartRuntime,/rendererController\.setHistoryFromCanonical/);
assert.match(chartRuntime,/getCompatibilityCandles/);
assert.match(realtime,/getCompatibilityCandles/);

assert.match(scene,/function outputDirtySpan/);
for(const token of ['series','marker','signal','label','shape','line','arrow','box','zone','band','polyline','polygon','background','barcolor','table','footprint','customVisual','event','scanCandidate','orderIntent'])assert.match(scene,new RegExp(token));
assert.match(scene,/export function outputDirtySpan/);

assert.match(gateway,/claim_realtime_gateway_owner/);
assert.match(gateway,/tco:realtime:coordination/);
assert.doesNotMatch(gateway,/UpstashRedis|ioredis|redis/i);
assert.match(gateway,/api\/realtime\/ws/);
assert.match(ticket,/REALTIME_GATEWAY_SHARED_SECRET/);
assert.match(ticket,/\/api\/realtime/);
assert.match(ticket,/NODE_ENV === 'production'/);
assert.match(ticket,/REALTIME_GATEWAY_UNAVAILABLE/);
assert.match(marketClient,/import\.meta\.env\.DEV/);
assert.match(marketClient,/VITE_REALTIME_LEGACY_FALLBACK/);
assert.equal(vercel.services?.realtimegateway?.runtime,'container');
assert.equal(vercel.services?.realtimegateway?.entrypoint,'Dockerfile');
assert.match(read('Dockerfile'),/realtime:gateway/);

assert.doesNotMatch(authClient,/DEFAULT_URL|DEFAULT_PUBLISHABLE_KEY/);
assert.match(authClient,/VITE_SUPABASE_URL/);
assert.match(authSession,/queueMicrotask/);
assert.match(authContext,/sessionErr\)/);
assert.match(authContext,/Keep any existing session state/);
assert.match(authContext,/authBootstrapGeneration/);
assert.match(authContext,/generation !== authBootstrapGeneration\.current/);

assert.match(watchlist,/registerSidePanel/);
assert.match(watchlist,/registerStatePersistence/);
assert.match(watchlist,/registerSymbolRanking/);
assert.match(watchlist,/registerStatePersistence/);
assert.match(watchlist,/subscribeMarketData/);
assert.match(watchlist,/\+ Add current/);
assert.match(facade,/registerLegendAction/);
assert.match(facade,/registerLegendCallout/);
assert.match(workspace,/\['tco\.watchlist'.*'alerts'.*'panels'/s);
assert.match(storage,/resolveBroker/);
assert.match(nativeExtensions,/registerNativeIndicator/);
assert.match(nativeExtensions,/registerRendererLayer/);
assert.match(nativeExtensions,/tco-regime-ribbon/);
assert.match(facade,/registerDefaultEngine/);
assert.match(watchlist,/registerDefaultEngine\('corespirit'/);
assert.match(watchlist,/registerSidePanel\(positionsPanel\)/);
assert.match(watchlist,/registerSidePanel\(orderBookPanel\)/);
assert.match(watchlist,/registerSidePanel\(optionsPanel\)/);
assert.match(watchlist,/registerSidePanel\(riskPanel\)/);
assert.match(workspace,/'tco\.replay'.*'tco\.positions'.*'tco\.risk'.*'tco\.orderbook'.*'tco\.options'/s);
assert.match(workspace,/createTcoVelaSupabaseStorage\(\(\) => tradingCoreRuntime\.getPrimaryBrokerId\(\)/);

assert.match(marketClient,/data\?\.transport/);

assert.match(marketClient,/transport === ['"]legacy['"]/);

assert.match(watchlist,/rowRefs/);

assert.match(watchlist,/registerWidgetAttachment/);

assert.match(watchlist,/tco\.market-health/);

assert.match(workspace,/timeframes: \['1'.*'M'\]/s);
assert.match(workspace,/getCellHealth: async/);
assert.match(read('tools/verify-authenticated-chart-matrix.mjs'),/getCellHealth/);
assert.match(read('tools/verify-authenticated-chart-matrix.mjs'),/chartHealth/);

console.log('TCO_P0_ROADMAP_CONTRACT_OK');
