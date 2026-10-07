import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const topbar = read('vendor/vela/src/widget/topbar.ts');
const wheel = read('vendor/vela/src/widget/alt-wheel.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const plane = read('src/services/marketData/chartDataPlane.ts');
const theme = read('src/theme/theme.ts');

assert(/const queryLayout = new URLSearchParams\(window\.location\.search\)/.test(live));
assert(/const initialLayout = .*defaults\.layout/.test(live));
assert(live.includes("layout: initialLayout"));
assert(live.includes("animations: false"));
assert(live.includes("'tco.watchlist'"));
assert(live.includes("'tco.journal'"));
assert(live.includes("'panels'") || live.includes("'tco.panels'"), "workspace must expose Vela panel chrome");
assert(live.includes("'tco.brand'"));
assert(!live.includes("'quant'"));
assert(chrome.includes("id: 'tco.brand'") || chrome.includes("id:'tco.brand'"));
assert(chrome.includes("label: 'TradingCoreOS × Vela'") || chrome.includes("label:'TradingCoreOS × Vela'"));
assert(chrome.includes("id: 'tco.watchlist'") || chrome.includes("id:'tco.watchlist'"));
assert(chrome.includes("id: 'tco.journal'") || chrome.includes("id:'tco.journal'"));
assert(chrome.includes("id: 'tco.panels'") || chrome.includes("id:'tco.panels'"));
assert(chrome.includes("title: 'Watchlist'") || chrome.includes("title:'Watchlist'"));
assert(topbar.includes("b.dataset.actionId = action.id"));
assert(wheel.includes("#7c5cff"));
assert(theme.includes("accent: '#d3ebf4'"));
assert(provider.includes("const cached = plane.readCanonical()"), "Vela TCO provider must inspect shared canonical cache first");
assert(provider.includes("return EMPTY_COLUMNAR_BARS"), "cold Vela column load must yield to progressive history");
assert(provider.includes("plane.ensureReadyHistory(firstPaintBars)"), "cold Vela history must use the shared ChartDataPlane history path");
assert(!provider.includes("tradingCoreRuntime.getHistoricalDataColumns"), "Vela provider must not bypass the shared history cache");

assert(plane.includes("columns.time.length === 0"));

console.log('TRADINGCORE_V132_VELA_WORKSPACE_UX_AND_CANDLE_FALLBACK_CONTRACT_OK');
