import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const topology = read('src/services/core/chart/tcoVelaTerminal.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const topbar = read('vendor/vela/src/widget/topbar.ts');
const wheel = read('vendor/vela/src/widget/alt-wheel.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const plane = read('src/services/marketData/chartDataPlane.ts');
const theme = read('src/theme/theme.ts');

assert(/const queryLayout = new URLSearchParams\(window\.location\.search\)/.test(live));
assert(/const initialLayout = .*defaults\.layout/.test(live));
assert(live.includes("layout: initialLayout"));
assert(topology.includes('animations:false'));
assert(topology.includes("'tco.watchlist'"));
assert(topology.includes("'tco.journal'"));
assert(topology.includes("'panels'"), "workspace topology must expose Vela panel chrome");
assert(topology.includes("'tco.brand'"));
assert(!live.includes("'quant'"));
assert(chrome.includes("id: 'tco.brand'") || chrome.includes("id:'tco.brand'"));
assert(topology.includes("shell:'VelaWorkspace'"));
assert(topology.includes("'tco.research'"));
assert(topology.includes("'tco.automation'"));
assert(topology.includes("'tco.trading'"));
assert(topology.includes('bottombar:false'), 'live Vela terminal must use the topbar-only command surface');
assert(chrome.includes("label: 'TradingCoreOS × Vela'") || chrome.includes("label:'TradingCoreOS × Vela'"));
assert(chrome.includes("id: 'tco.watchlist'") || chrome.includes("id:'tco.watchlist'"));
assert(chrome.includes("id: 'tco.journal'") || chrome.includes("id:'tco.journal'"));
assert(chrome.includes("id: 'tco.panels'") || chrome.includes("id:'tco.panels'"));
assert(chrome.includes("title: 'Watchlist'") || chrome.includes("title:'Watchlist'"));
assert(topbar.includes("b.dataset.actionId = action.id"));
assert(wheel.includes("#7c5cff"));
assert(theme.includes("accent: '#d3ebf4'"));
assert.equal((provider.match(/export class TcoVelaDataProvider implements DataProvider/g) ?? []).length, 1,
  "the Vela data provider must have one canonical implementation");
assert.equal((provider.match(/else void activeBrokerId\(\)\.then\(attach\)\.catch\(\(\) => undefined\);/g) ?? []).length, 2,
  "both Vela live-subscription forms must attach if broker restore completes after subscribe");
assert(!provider.includes("if (!brokerId) return () => {};"),
  "a cold-start subscription must not become a permanent no-op before broker restore");
assert.equal((provider.match(/tradingCoreRuntime\.on\('BROKER_CONNECTED', syncBroker\)/g) ?? []).length, 2,
  "row and columnar subscriptions must recover when a broker is connected after chart mount");
assert.equal((provider.match(/tradingCoreRuntime\.on\('BROKER_DISCONNECTED', syncBroker\)/g) ?? []).length, 2,
  "row and columnar subscriptions must detach stale broker streams after disconnect");

assert(provider.includes("const cached = plane.readCanonical()"), "Vela TCO provider must inspect shared canonical cache first");
assert(provider.includes("return EMPTY_COLUMNAR_BARS"), "cold Vela column load must yield to progressive history");
assert(provider.includes("plane.ensureReadyHistory(firstPaintBars)"), "cold Vela history must use the shared ChartDataPlane history path");
assert(!/await Promise\.all\(\[brokerReady,\s*defaultsPromise\]\)/.test(live),
  "Vela workspace mount must not block first paint on broker session restoration");
assert(live.includes("void brokerReady.then(() => {"),
  "common-symbol history warm-up should begin after the workspace is already mounted");
assert.equal((provider.match(/else void activeBrokerId\(\)\.then\(attach\)\.catch\(\(\) => undefined\);/g) ?? []).length, 2,
  "both columnar and row subscriptions must attach after asynchronous broker restoration");
assert(!provider.includes("if (!brokerId) return () => {};"),
  "a subscription created before broker restoration must not become a permanent no-op");

assert(!provider.includes("tradingCoreRuntime.getHistoricalDataColumns"), "Vela provider must not bypass the shared history cache");

assert(plane.includes("columns.time.length === 0"));

console.log('TRADINGCORE_V132_VELA_WORKSPACE_UX_AND_CANDLE_FALLBACK_CONTRACT_OK');
