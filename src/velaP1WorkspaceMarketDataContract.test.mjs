import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const workspaceLayouts = read('vendor/vela/src/workspace/layouts.ts');
const layoutPicker = read('vendor/vela/src/widget/layout-picker.ts');
const workspaceContext = read('vendor/vela/src/workspace/context.ts');
const workspaceReplay = read('vendor/vela/src/workspace/WorkspaceReplay.ts');
const syncModel = read('vendor/vela/src/workspace/sync.ts');
const terminalChrome = read('src/services/core/chart/tcoVelaChrome.ts');
const watchlist = read('src/services/core/chart/tcoVelaChrome.ts');
const chartDataPlane = read('src/services/marketData/chartDataPlane.ts');
const gapPolicy = read('src/services/marketData/liveGapPolicy.ts');
const historyStore = read('src/services/marketData/HistoryStore.ts');
const sessionCalendarStore = read('src/services/marketData/sessionCalendarStore.ts');
const historicalService = read('src/server/marketData/HistoricalDataService.ts');
const historicalRoute = read('src/server/routes/fyers-history.routes.ts');
const canonicalHistory = read('src/server/marketData/canonicalHistoricalData.ts');
const velaDataProvider = read('src/TcoVelaDataProvider.ts');
const optionAdapter = read('src/server/brokers/adapters/BrokerAdapters.ts');
const optionPanel = read('src/components/workspace/FullWorkspaceView.tsx');
const marketTypes = read('src/types/market.ts');

// Native Vela layout picker remains the layout authority; TCO only validates deep links.
assert.match(live, /layoutForGrid|registerVelaWorkspaceLayouts/);
assert.match(live, /const gridMatch = \/\^g\(\[1-4\]\)x\(\[1-4\]\)\$\/\.exec\(queryLayout\)/);
assert.match(live, /Number\(gridMatch\[1\]\) \* Number\(gridMatch\[2\]\) <= 8/);
assert.match(live, /isTcoLayoutPreset|TCO_VELA_LAYOUT_PRESETS/);
assert.ok(workspace.includes('layoutForGrid('), 'Vela must synthesize native grid layouts');
assert.match(layoutPicker, /sq\.disabled = true/);
assert.match(layoutPicker, /chartCount > WORKSPACE_MAX_CHART_CELLS/);
assert.match(workspaceLayouts, /throw new RangeError/);
assert.match(workspaceLayouts, /rows \* cols > WORKSPACE_MAX_CHART_CELLS/);
assert.match(workspace, /def\.cells\.length > WORKSPACE_MAX_CHART_CELLS/);
assert.match(workspace, /duplicateActiveCell\(\)/);
assert.match(workspace, /source\.dehydrate\(\)/);
assert.match(workspace, /structuredClone\(state\)/);
assert.match(live, /duplicateActiveCell\(\)/);
assert.match(live, /Maximum of eight charts reached/);
assert.match(workspaceLayouts, /tco-duplicate-grid-5/);
assert.match(workspaceLayouts, /tco-duplicate-grid-7/);
assert.ok(workspace.includes('readonly sync ='), 'Vela sync API remains the canonical workspace sync model');
assert.ok(workspace.includes('readonly replay: WorkspaceReplay'), 'Vela workspace owns the shared replay controller');

// The compact Vela sync toggles are preserved; TCO adds per-cell group assignment
// through the same Vela sync model rather than creating a second synchronization engine.
assert.match(syncModel, /export function syncTargets/);
assert.match(syncModel, /const group = setting\[originId\]/);
assert.match(terminalChrome, /id: 'tco\.sync-groups'/);
assert.match(terminalChrome, /type TerminalSyncKind = 'symbol' \| 'timeframe' \| 'crosshair' \| 'viewport' \| 'style' \| 'drawings'/);
for (const kind of ['symbol', 'timeframe', 'crosshair', 'viewport', 'style', 'drawings']) {
  assert.ok(terminalChrome.includes(`kind: '${kind}'`), `independent sync control missing: ${kind}`);
}
for (const group of ['A', 'B', 'C', 'D']) assert.ok(terminalChrome.includes(`value: '${group}'`), `sync group ${group} missing`);
assert.match(terminalChrome, /sync\.get\(kind\)/);
assert.match(terminalChrome, /sync\.set\(kind, next\)/);
assert.match(terminalChrome, /workspace\?\.saveNow/);

// Replay is a single Vela workspace clock. Multi-timeframe cells advance by the
// earliest next bar close, so the coarse chart never leaks future bars.
assert.match(workspaceContext, /replay: host\.replay/);
assert.match(workspaceReplay, /private stepGroup\(\)/);
assert.match(workspaceReplay, /Math\.min\(next, barClose\(t, c\.chart\.market\.timeframe\)\)/);
assert.match(workspaceReplay, /lastOpenClosedBy\(clock, cell\.chart\.market\.timeframe\)/);
assert.match(terminalChrome, /ctx\.replay/);
for (const action of ['start', 'play', 'pause', 'step', 'stop', 'bounds']) {
  assert.ok(terminalChrome.includes(`replay.${action}`), `Vela replay control missing: ${action}`);
}
assert.match(terminalChrome, /value \+ ':00\+05:30'/);
assert.match(terminalChrome, /330 \* 60_000/);
assert.match(terminalChrome, /const numericMinutes = Number\(normalized\)/);
assert.match(terminalChrome, /case 'D': case 'DAY': return amount \* 86_400_000/);
assert.match(terminalChrome, /case 'W': case 'WEEK': return amount \* 7 \* 86_400_000/);

// Watchlists retain named-group persistence and only show active, known-expiry option contracts.
// A numeric price query and an explicit CE/PE request are resolved separately.
assert.match(watchlist, /function normalizeWatchlistGroups/);
assert.match(watchlist, /activeWatchlistId/);
assert.match(watchlist, /version: 3/);
assert.match(watchlist, /function optionRight\(/);
assert.ok(watchlist.includes('[\\s:_-]'), 'CE/PE parsing must recognize contract separators');
assert.match(watchlist, /replaceAll\(',', ''\)/, 'smart price search normalizes formatted strikes such as 22,700');
assert.match(watchlist, /const masterQuery = requestedStrike !== undefined/, 'the instrument master receives a normalized strike query');
assert.match(watchlist, /optionRight\(instrument\) === requestedRight/);
assert.match(watchlist, /expiryAt > Date\.now\(\)/);
assert.match(watchlist, /sortMode === 'volume'/);
assert.match(watchlist, /sortMode === 'oi'/);
assert.match(watchlist, /lotSize/);

// FYERS option-chain fields retain provider provenance and do not invent an exchange.
assert.match(optionAdapter, /strikecount: '50'/);
assert.match(optionAdapter, /greeks: '1'/);
assert.match(optionAdapter, /timestamp: requestedExpiry/);
assert.ok(optionAdapter.includes('/^\\d{10,13}$/'), 'FYERS expiry timestamp must accept numeric Unix timestamps');
assert.match(optionAdapter, /aggregateCallOi:/);
assert.match(optionAdapter, /aggregatePutOi:/);
assert.match(optionAdapter, /indiaVix:/);
assert.match(optionAdapter, /providerGreeks:/);
assert.match(optionAdapter, /impliedVolatility: providerIvPercent \/ 100/);
assert.match(optionAdapter, /row\?\.exchange === 'NSE' \|\| row\?\.exchange === 'BSE'/);
assert.doesNotMatch(optionAdapter, /exchange: row\?\.exchange === 'BSE' \? 'BSE' : 'NSE'/);
assert.match(marketTypes, /expiryOptions\?: OptionExpiryChoice\[\]/);
assert.match(marketTypes, /aggregateCallOi\?: number/);
assert.match(optionPanel, /modelImpliedVolatility/);
assert.match(optionPanel, /modelSkew/);
assert.match(optionPanel, /hasCompleteRowOi/);
assert.match(optionPanel, /Load IV term structure/);

// Same-session NSE/BSE gaps trigger bounded canonical history reconciliation
// even if the websocket stays connected. The triggering tick is buffered first.
assert.match(chartDataPlane, /hasUnexpectedIntradayGap/);
assert.match(chartDataPlane, /this\.liveCandle\.bufferTick\(tick\)/);
assert.match(chartDataPlane, /this\.maybeRecoverAfterReconnect\(\)/);
assert.match(gapPolicy, /previousIndiaDay !== currentIndiaDay/);
assert.match(gapPolicy, /timeframeSeconds \* 2_000/);
assert.match(historyStore, /checkpoint/);
assert.match(historyStore, /retry/i);
assert.match(historicalService, /calendarHolidays: string\[\]/);
assert.match(historicalService, /specialSessions: HistoricalSpecialSession\[\]/);
assert.match(historicalService, /sessionCalendar,\s*bars:/);
assert.match(historicalRoute, /sessionCalendar: loaded\.sessionCalendar/);
assert.match(canonicalHistory, /sessionCalendar: loaded\.sessionCalendar/);
assert.match(velaDataProvider, /setChartSessionCalendar\(runtimeSymbol\(symbol\), payload\.sessionCalendar\)/);
assert.match(sessionCalendarStore, /getChartSessionCalendar/);
assert.match(chartDataPlane, /getChartSessionCalendar\(this\.instrumentKey\)/);

console.log('VELA_P1_WORKSPACE_MARKETDATA_CONTRACT_OK');
