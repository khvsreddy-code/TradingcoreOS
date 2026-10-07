import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const provider = read('./TcoVelaDataProvider.ts');
const runtime = read('./services/runtime/TradingCoreRuntime.ts');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const workspace = read('./LiveTradingWorkspace.tsx');

assert.doesNotMatch(provider, /getChartDataPlane\(['"]fyers['"]/g, 'Vela provider must not hard-code FYERS chart planes');
assert.match(provider, /getPrimaryBrokerId\(\)/, 'Vela provider must resolve the active broker');
assert.match(provider, /function activeBrokerIdSync\(\): string \| null/, 'sync subscriptions need an explicit non-async broker seam');
assert.match(provider, /Last-resort seed: if the broker's history endpoint is temporarily unavailable/, 'empty-history path must have a visible chart seed fallback');
assert.doesNotMatch(provider, /subscribeColumns[\\s\\S]*?await activeBrokerId\(\)/, 'columnar subscription cannot await inside the synchronous Vela DataProvider contract');
assert.doesNotMatch(provider, /subscribe\(ticker: string, timeframe: string, onBar:[\\s\\S]*?await activeBrokerId\(\)/, 'bar subscription cannot await inside the synchronous Vela DataProvider contract');

assert.match(runtime, /public getPrimaryBrokerId\(\): string \| null/, 'runtime must expose one canonical broker identity');
assert.match(runtime, /if \(columns && columns\.time\.length > 0\) return columns/, 'compact history must reject empty column responses');
assert.match(runtime, /const rows = await broker\.getHistoricalData\(/, 'empty compact history must fall back to normal candle history');

assert.match(chrome, /registerSidePanel\(bookmarksPanel\)/, 'watchlist must live in Vela side-panel chrome');
assert.match(chrome, /registerStatePersistence\(watchlistStatePersistence\)/, 'watchlist must use Vela state persistence');
assert.match(chrome, /registerSymbolRanking\(watchlistSymbolRanking\)/, 'watchlist must influence the native Vela symbol picker');
assert.match(chrome, /tradingCoreRuntime\.subscribeMarketData/, 'watchlist must use the same runtime market-data path as charts');
assert.match(chrome, /\+ Add current/, 'watchlist must support adding the active Vela symbol');
assert.match(chrome, /tco\.corespirit\.open/, 'Vela legend must expose the CoreSpirit integration');

assert.match(workspace, /createTcoVelaSupabaseStorage\(tradingCoreRuntime\.getPrimaryBrokerId\(\) \?\? 'fyers'\)/, 'workspace persistence must follow the active broker');

console.log('TCO_VELA_DATA_WATCHLIST_CONTRACT_OK');
