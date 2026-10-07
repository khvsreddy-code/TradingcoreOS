import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

const live=read('src/components/workspace/LiveChart.tsx');
assert.ok(live.length < 32000, `LiveChart should stay below 32 KB after controller split; got ${live.length}`);
for (const symbol of [
  "createChartAnalyticsController",
  "createChartInteractionController",
  "createChartRuntimeController",
  "createChartDataController",
  "createChartIndicatorController",
  "Vela-native drawing facade",
  "createChartRealtimeController",
  "createChartPredictionController",
  "createChartCoreSpiritController",
  "ChartStore",
  "CoreSpiritStore",
  "ChartShell",
  "ChartOverlay",
]) {
  if(symbol==="Vela-native drawing facade") assert.ok(live.includes("chart.current?.drawings") || live.includes("chart.current.drawings"), "LiveChart must use Vela native drawings");
  else assert.ok(live.includes(symbol), `LiveChart missing architecture boundary: ${symbol}`);
}
assert.ok(!live.includes("createChartDrawingController"), "Legacy drawing controller must not be wired into LiveChart");

assert.equal((live.match(/const renderStudiess*=/g)||[]).length, 0, 'indicator rendering must live in ChartIndicatorController');
assert.equal((live.match(/const renderWorkerIndicatorss*=/g)||[]).length, 0, 'worker indicator rendering must live in ChartIndicatorController');
assert.equal((live.match(/const renderPredictionOverlays*=/g)||[]).length, 0, 'prediction rendering must live in ChartPredictionController');
assert.ok(!live.includes("CoreSpiritVelaEngine"), 'LiveChart must not import the concrete CoreSpirit engine');
assert.ok(!live.includes("coreSpiritPipeline"), 'LiveChart must not import the compiler pipeline');
assert.ok(!live.includes("chartDataPlane.subscribe"), 'LiveChart must not be the market-data subscription bus');
for (const forbidden of [
  "createVelaNativeChart(",
  "new ChartUpdateScheduler(",
  "from '../../services/runtime/TradingCoreRuntime'",
  "from '../../services/marketData/chartComputeCoordinator'",
  "from '../../services/core/drawing/drawingGeometry'",
  "buildOIChartAnalytics",
]) assert.ok(!live.includes(forbidden), `LiveChart leaked infrastructure responsibility: ${forbidden}`);

const runtime=read('src/services/core/chart/ChartRuntimeController.ts');
assert.ok(runtime.includes('createChartRuntimeController'));
assert.ok(runtime.includes('createChartRealtimeController'));
assert.ok(runtime.includes('createChartInteractionController'));
assert.ok(runtime.includes('createChartAnalyticsController'));

const analytics=read('src/services/core/chart/ChartAnalyticsController.ts');
assert.ok(analytics.includes('createChartAnalyticsController'));
const interactions=read('src/services/core/chart/ChartInteractionController.ts');
assert.ok(interactions.includes('createChartInteractionController'));
const storeRegistry=read('src/services/core/chart/chartStoreRegistry.ts');
assert.ok(storeRegistry.includes('acquireChartStore'));
assert.ok(storeRegistry.includes('releaseChartStore'));

const market=read('src/services/marketData/MarketDataStore.ts');
assert.ok(market.includes('class MarketDataStore'));
assert.ok(market.includes('requestOlder'));
assert.ok(market.includes('requestWarm'));
assert.ok(market.includes('requestAnimationFrame'));
assert.ok(market.includes('consumers'), 'shared market store must ref-count chart consumers');

const chartStore=read('src/services/core/chart/ChartStore.ts');
assert.ok(chartStore.includes('subscribe(listener'));
assert.ok(chartStore.includes('subscribeUi(listener'));
assert.ok(chartStore.includes('requestAnimationFrame'));
assert.ok(chartStore.includes('publishMarketSnapshot'));

const realtime=read('src/services/core/chart/controllers/ChartRealtimeController.ts');
assert.ok(realtime.includes('handleTick'));
assert.ok(realtime.includes('rendererController.applyRealtimeCanonical'));
assert.ok(!realtime.includes('publishMarketSnapshot'), 'realtime renderer controller must not duplicate store publication');

const data=read('src/services/core/chart/controllers/ChartDataController.ts');
assert.ok(data.includes('marketDataStore.subscribe'));
assert.ok(data.includes('marketDataStore.requestOlder'));
assert.ok(!data.includes('marketDataStore.detach(key);'), 'data controller must balance exactly one shared-store consumer');

const coreSpirit=read('src/services/coreSpirit/CoreSpiritStore.ts');
assert.ok(coreSpirit.includes('setSource'));
assert.ok(coreSpirit.includes('subscribe'));
assert.ok(coreSpirit.includes('persistSource'));

const overlay=read('src/components/workspace/ChartOverlay.tsx');
assert.ok(overlay.includes('coreSpiritState'));
assert.ok(overlay.includes('IndicatorSettingsPanel'));
assert.ok(overlay.length < 30000, `ChartOverlay unexpectedly large: ${overlay.length}`);

console.log('TCO_LIVE_CHART_CONTROLLER_STORE_ARCHITECTURE_OK');
