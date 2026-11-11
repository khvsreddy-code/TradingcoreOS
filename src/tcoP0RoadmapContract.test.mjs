import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8');
}

const drawingState = read('./services/core/chart/chartRuntimeSupport.ts');
const liveChart = read('./components/workspace/LiveChart.tsx');
const coreSpirit = read('./CoreSpiritVelaEngine.ts');
const multiSymbolTimeframe = read('./services/coreSpirit/multiSymbolTimeframe.ts');
const provider = read('./TcoVelaDataProvider.ts');
const runtime = read('./services/runtime/TradingCoreRuntime.ts');
const server = read('../server.ts');
const auth = read('./auth/context/AuthContext.tsx');
const session = read('./services/auth/sessionService.ts');
const dataPlane = read('./services/marketData/chartDataPlane.ts');
const chartController = read('./components/workspace/chartController.ts');
const runtimeController = read('./services/core/chart/ChartRuntimeController.ts');
const velaChrome = read('./services/core/chart/tcoVelaChrome.ts');
const velaExtensions = read('./services/core/chart/tcoVelaNativeExtensions.ts');

assert.match(drawingState, /const velaDrawings\s*=\s*migrateVelaDrawings\(/, 'Vela drawing restore must migrate the persisted drawing payload');
assert.match(drawingState, /\n\s*velaDrawings,/, 'Vela persisted state must contain the migrated serialized drawing array');
assert.doesNotMatch(liveChart, /LegacyDrawing|legacyDrawing|DrawingController\b/, 'TCO chart UI must not keep a second drawing authority');
assert.match(coreSpirit, /const loadSecondaryData = async \(force\s*=\s*false\)/);
assert.match(multiSymbolTimeframe, /context\.alignment/, 'multi-timeframe snapshots must honor alignment policy');
assert.match(multiSymbolTimeframe, /context\.maxStalenessMs/, 'multi-timeframe snapshots must honor stale-data bounds');
assert.match(multiSymbolTimeframe, /const markedDeveloping = snapshot\.confirmationPhase === 'developing'[\s\S]*snapshot\.state === 'realtime'/, 'snapshot phase and state labels must be normalized as one developing-data policy');
assert.match(multiSymbolTimeframe, /if \(markedDeveloping && context\.alignment !== 'developing'\) return null/, 'last-confirmed alignment must exclude developing higher-timeframe samples');
assert.match(multiSymbolTimeframe, /context\.executionMode !== 'realtime'/, 'developing higher-timeframe samples must be blocked outside realtime execution');
assert.match(coreSpirit, /Secondary market data refresh failed/);
assert.match(coreSpirit, /void loadSecondaryData\(\)/);
assert.doesNotMatch(provider, /getChartDataPlane\(['"]fyers['"]/);
assert.match(provider, /activeBrokerIdSync/);
assert.match(provider, /plane\.ensureReadyHistory\(firstPaintBars\)/, 'Vela first paint must use the shared chart-data-plane history loader');
assert.match(runtime, /getPrimaryBrokerId\(\)/);
assert.match(runtime, /columns && columns\.time\.length > 0/);
assert.match(runtime, /getHistoricalData\(/);
assert.match(server, /REALTIME_GATEWAY_REQUIRED/);
assert.match(server, /realtimeGatewayReady/);
assert.match(server, /!checks\.realtimeGatewayRequired \|\| checks\.realtimeGateway/);
assert.match(session, /RETRY_DELAYS_MS/);
assert.match(session, /getSession\(\)/);
assert.match(session, /queueMicrotask/);
assert.match(auth, /Do not perform additional Supabase calls inside onAuthStateChange/);
assert.match(dataPlane, /Keep Vela on the typed canonical path/);
assert.match(dataPlane, /setColumnarHistory/);
assert.match(chartController, /seedLiveCandle/);
assert.doesNotMatch(runtimeController, /seedLiveCandle/, 'runtime must not synthesize one-price candles before broker history arrives');
assert.match(runtimeController, /event\.type==='quote'/, 'quote-only packets must not mutate candle state');
assert.doesNotMatch(dataPlane, /void this\.ensureHistory\(\)/, 'subscription must not start object history before the typed loader');
assert.match(dataPlane, /this\.ensureReadyColumns\(limit\)\.catch/, 'typed columnar history must be the first cold-start path');
assert.match(runtimeController, /setHistoryFromCanonical/);
assert.match(velaChrome, /registerSidePanel\(bookmarksPanel\)/);
assert.match(velaChrome, /registerStatePersistence\(watchlistStatePersistence\)/);
assert.match(velaChrome, /registerSymbolRanking\(watchlistSymbolRanking\)/);
assert.match(velaExtensions, /registerRendererLayer/);
assert.match(velaExtensions, /registerNativeIndicator/);
assert.match(velaChrome, /registerWidgetAttachment/);

console.log('TCO_P0_ROADMAP_CONTRACT_OK');
