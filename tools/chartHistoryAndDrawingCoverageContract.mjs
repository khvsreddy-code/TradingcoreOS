import assert from 'node:assert/strict';
import fs from 'node:fs';

const historyRoute = fs.readFileSync(
  new URL('../src/server/routes/fyers-history.routes.ts', import.meta.url),
  'utf8',
);
const webgl = fs.readFileSync(
  new URL('../vendor/vela/src/renderers/native/backend/WebGL2Backend.ts', import.meta.url),
  'utf8',
);
const canvas = fs.readFileSync(
  new URL('../vendor/vela/src/renderers/native/backend/Canvas2dBackend.ts', import.meta.url),
  'utf8',
);
const toolbar = fs.readFileSync(
  new URL('../src/components/workspace/ChartToolbar.tsx', import.meta.url),
  'utf8',
);

assert.match(historyRoute, /new FyersApiClient\(accessToken\)/, 'history route must use the shared FYERS API client');
assert.match(historyRoute, /cont_flag:\s*continuousFutures \? 1 : undefined/, 'continuous-futures flag must not be sent for index/equity history');
assert.match(historyRoute, /maxDaysForResolution = Number\.isFinite\(minuteResolution\) \? 100 : 366/, 'history range must respect FYERS request caps');
assert.match(historyRoute, /\[FYERS history\] upstream failure/, 'broker failures must be diagnosable without leaking credentials');

assert.match(webgl, /if \(h < l\) continue;/, 'WebGL candle renderer must retain valid zero-range candles');
assert.match(webgl, /if \(!bar \|\| bar\.high < bar\.low\) continue;/, 'WebGL object candle renderer must retain zero-range live seed candles');
assert.match(canvas, /if \(h < l\) continue;/, 'Canvas2D candle renderer must retain valid zero-range candles');
assert.match(canvas, /if \(!b \|\| b\.high < b\.low\) continue;/, 'Canvas2D object candle renderer must retain zero-range live seed candles');

const catalog = fs.readFileSync(
  new URL('../src/services/core/chart/velaDrawingCatalog.ts', import.meta.url),
  'utf8',
);
const catalogTypes = (catalog.match(/'[a-z0-9]+(?=',)/g) ?? []).length;
assert.ok(catalogTypes >= 67, 'host Vela drawing catalog must cover the full Vela tool inventory');
assert.match(toolbar, /Fibonacci \/ Gann/, 'host toolbar must expose the Vela Fibonacci/Gann group');
assert.match(toolbar, /Patterns \/ Waves/, 'host toolbar must expose the Vela pattern/wave group');
assert.match(toolbar, /fixedrangevp/, 'host toolbar must expose Vela volume-profile tooling');
assert.match(toolbar, /iconstamp/, 'host toolbar must expose Vela icon tooling');

console.log('CHART_HISTORY_AND_DRAWING_COVERAGE_OK');
