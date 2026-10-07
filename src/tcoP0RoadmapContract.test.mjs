import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8');
}

const drawingState = read('./services/core/chart/chartRuntimeSupport.ts');
const liveChart = read('./components/workspace/LiveChart.tsx');
const coreSpirit = read('./CoreSpiritVelaEngine.ts');
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

assert.match(drawingState, /velaDrawings:velaDocument\.drawings,/, 'Vela drawing restore must pass serialized drawings[]');
assert.doesNotMatch(liveChart, /LegacyDrawing|legacyDrawing|DrawingController\b/, 'TCO chart UI must not keep a second drawing authority');
assert.match(coreSpirit, /loadSecondaryData = async \(force = false\)/);
assert.match(coreSpirit, /request\.alignment/);
assert.match(coreSpirit, /request\.maxStalenessMs/);
assert.match(coreSpirit, /state:confirmed \? 'confirmed' : 'developing'/);
assert.match(coreSpirit, /Secondary market data refresh failed/);
assert.match(coreSpirit, /void loadSecondaryData\(\)/);
assert.doesNotMatch(provider, /getChartDataPlane\(['"]fyers['"]/);
assert.match(provider, /activeBrokerIdSync/);
assert.match(provider, /Last-resort seed/);
assert.match(runtime, /getPrimaryBrokerId\(\)/);
assert.match(runtime, /columns && columns\.time\.length > 0/);
assert.match(runtime, /const rows = await requestBroker\.getHistoricalData/);
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
assert.match(runtimeController, /seedLiveCandle/);
assert.match(runtimeController, /setHistoryFromCanonical/);
assert.match(velaChrome, /registerSidePanel\(bookmarksPanel\)/);
assert.match(velaChrome, /registerStatePersistence\(watchlistStatePersistence\)/);
assert.match(velaChrome, /registerSymbolRanking\(watchlistSymbolRanking\)/);
assert.match(velaExtensions, /registerRendererLayer/);
assert.match(velaExtensions, /registerNativeIndicator/);
assert.match(velaChrome, /registerWidgetAttachment/);

console.log('TCO_P0_ROADMAP_CONTRACT_OK');
