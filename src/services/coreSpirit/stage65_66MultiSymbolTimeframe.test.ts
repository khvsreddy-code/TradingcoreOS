import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import { CORE_SPIRIT_EXECUTION_TARGET_PROFILES } from './executionTarget';
import { alignTimeframeSnapshots } from './timeframeAlignment';
import { createMarketReference, createTimeframeReference, validateSynchronizedSnapshot } from './multiSymbolTimeframe';

const assert = (condition: unknown, message = 'assertion failed') => { if (!condition) throw new Error(message); };
const equal = (a: unknown, b: unknown, message = 'values differ') => { if (a !== b) throw new Error(`${message}: ${String(a)} !== ${String(b)}`); };

function main() {
  assert(CORE_SPIRIT_EXECUTION_TARGET_PROFILES.chart.capabilities.includes('multi-symbol-data'));
  assert(CORE_SPIRIT_EXECUTION_TARGET_PROFILES.chart.capabilities.includes('multi-timeframe-data'));

  const source = `
    let nifty = market("NIFTY")
    let banknifty = market("BANKNIFTY")
    let spread = nifty.close - banknifty.close
    let daily = timeframe("1D")
    let trend = ema(daily.close, 2)
    plot(spread)
    plot(trend)
  `;
  const compiler = new CoreSpiritCompiler();
  const compiled = compiler.compile(parseCoreSpirit(source), 'stage65-66');
  assert(compiled.artifact, compiled.diagnostics.map(d => d.message).join('; '));

  const bars = [0,1,2].map(i => ({
    timestamp: new Date(Date.UTC(2026,0,1,9,15 + i*5)).toISOString(),
    open: 10+i, high: 11+i, low: 9+i, close: 10+i, volume: 1000+i,
  }));
  const timestamps = bars.map(bar => Math.floor(Date.parse(bar.timestamp) / 1000));
  const dailyHistory = [100, 102, 104];
  const niftyHistory = [200, 201, 204];
  const bankHistory = [190, 189, 191];

  const runtime = new CoreSpiritRuntime({ symbol:'BASE', timeframe:'5m', executionTarget:'chart', dataResolver: {
    requestAt(request, context) {
      const idx = Math.max(0, timestamps.findIndex(t => t === context.asOfTimestamp));
      const values = request.symbol === 'NIFTY' ? niftyHistory : bankHistory;
      return { value: values[idx], source:'test', symbol:request.symbol, timeframe:request.timeframe, timestamp:context.asOfTimestamp, state:'confirmed' };
    },
    series(request, context) {
      const idx = Math.max(0, timestamps.findIndex(t => t === context.asOfTimestamp));
      const values = request.timeframe === '1D' ? dailyHistory : (request.symbol === 'NIFTY' ? niftyHistory : bankHistory);
      return values.slice(0, idx + 1);
    },
  }});

  const program = makeCoreSpiritProgram(source,'stage65-66');
  const ir = runtime.loadProgram(program);
  const result = runtime.executeIr(ir, bars);
  equal(result.diagnostics.length, 0, result.diagnostics.join('; '));
  assert(result.outputs.length >= 6, 'expected two plots across three bars');

  const current = runtime.getState();
  equal(current.localSeries.spread?.at(-1), 13, 'spread should be NIFTY - BANKNIFTY');

  const higher = alignTimeframeSnapshots(
    [1000, 2000, 3000],
    [
      {value:10, source:'daily', symbol:'BASE', timeframe:'1D', timestamp:900, state:'confirmed'},
      {value:20, source:'daily', symbol:'BASE', timeframe:'1D', timestamp:2500, state:'developing'},
      {value:30, source:'daily', symbol:'BASE', timeframe:'1D', timestamp:2600, state:'confirmed'},
    ],
    { confirmedOnly:true },
  );
  equal(higher[0].value, 10);
  equal(higher[1].value, 10, 'developing higher-TF sample must not leak');
  equal(higher[2].value, 30);

  const stale = validateSynchronizedSnapshot(
    {value:5, source:'x', symbol:'NIFTY', timeframe:'5m', timestamp:0, state:'confirmed'},
    {asOfTimestamp:10_000, alignment:'last-confirmed', maxStalenessMs:1000},
  );
  equal(stale, null, 'stale cross-symbol data should be rejected when a max age is configured');

  const marketRef = createMarketReference('NIFTY','close');
  const timeframeRef = createTimeframeReference('1D','close');
  equal(marketRef.kind, 'market');
  equal(timeframeRef.kind, 'timeframe');

  console.log('STAGE65_66_MULTI_SYMBOL_TIMEFRAME_OK');
}

main();
