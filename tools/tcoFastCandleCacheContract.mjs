import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const provider = readFileSync(new URL('../src/TcoVelaDataProvider.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/LiveTradingWorkspace.tsx', import.meta.url), 'utf8');
const dataPlane = readFileSync(new URL('../src/services/marketData/chartDataPlane.ts', import.meta.url), 'utf8');
const historyCoordinator = readFileSync(new URL('../src/services/marketData/chartHistoryCoordinator.ts', import.meta.url), 'utf8');
const historicalColumns = readFileSync(new URL('../src/services/marketData/historicalColumns.ts', import.meta.url), 'utf8');

const start = provider.indexOf('async getBarsColumns');
const end = provider.indexOf('/**', start + 32);
const body = provider.slice(start, end);

assert.match(body, /const cached = plane\.readCanonical\(\)/);
assert.match(body, /plane\.getSnapshot\(\)\.historyReady/);
assert.match(body, /if \(cached\.length > 0 && plane\.getSnapshot\(\)\.historyReady\)/);
assert.match(body, /return EMPTY_COLUMNAR_BARS/);
assert.match(provider, /async getBarsProgressive/);
assert.match(provider, /plane\.ensureReadyHistory\(firstPaintBars\)/);
assert.doesNotMatch(body, /getHistoricalDataColumns/);
assert.match(provider, /historicalRowsToVelaColumns\(result\.rows, range, result\.requested\)/,
  'the cold REST fallback must write typed columns directly from validated history rows');
assert.doesNotMatch(provider, /seedColumnsFromBars/,
  'canonical history must not build OHLCV objects only to decompose them into typed columns');
assert.match(historicalColumns, /selectedIndexes = new Uint32Array/);
assert.match(historicalColumns, /new Float64Array\(selectedLength\)/,
  'column channels must be allocated as typed arrays without per-row OHLCV wrappers');
assert.match(body, /plane\.loadOlderHistory\('visible', \{ visibleBars: requested \}\)/,
  'historical columnar requests must extend the shared plane at the older edge');
assert.match(body, /marketViewToColumns\(loaded, range, requested\)/,
  'historical range pages must return canonical typed views rather than object bars');
assert.match(provider, /async getBarsProgressive/);
assert.doesNotMatch(provider, /Promise\.race/);
assert.doesNotMatch(provider, /getMarketQuotes/);
assert.doesNotMatch(provider, /quoteBars|kind:\s*'quote'/);
assert.match(provider, /A quote is a price, not OHLC history/);
assert.match(dataPlane, /prewarmHistory\(limitOverride\?: number\)/);
assert.match(dataPlane, /'warm'\)\.then\(rows => rows\.length\)/);
assert.match(historyCoordinator, /queuedByKey\.get\(key\)/);
assert.match(historyCoordinator, /queued\.priority = nextPriority/);
assert.match(provider, /plane\.prewarmHistory\(requested\)/);
assert.match(provider, /await plane\.ensureReadyHistory\(requested\)/);
assert.match(provider, /export function prewarmTcoVelaHistory/);
assert.match(provider, /ensureReadyHistory\(requested\)/);
assert.match(provider, /requestIdleCallback/);
assert.match(workspace, /prewarmTcoVelaHistory\(/);
assert.match(workspace, /NSE:NIFTYBANK-INDEX/);
assert.match(workspace, /BSE:SENSEX-INDEX/);
console.log('TCO_FAST_CANDLE_CACHE_CONTRACT_OK');
