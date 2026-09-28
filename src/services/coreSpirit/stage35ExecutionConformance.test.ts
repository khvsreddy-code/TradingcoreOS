import { CoreSpiritRuntime } from './runtime';
import { makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CORE_SPIRIT_STANDARD_LIBRARY } from './standardLibrary';
import { CORE_SPIRIT_NATIVE_INDICATOR_NAMES } from './nativeIndicatorRegistry';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = [
  { timestamp:'2026-09-25T03:00:00.000Z', open:100, high:102, low:99, close:101, volume:1000 },
  { timestamp:'2026-09-25T03:05:00.000Z', open:101, high:105, low:100, close:104, volume:1200 },
  { timestamp:'2026-09-25T03:10:00.000Z', open:104, high:106, low:102, close:103, volume:1400 },
];

function seriesValues(outputs: any[]): Array<number|null> {
  return outputs.filter(x => x.kind === 'series').map(x => x.value == null ? null : Number(x.value));
}

/** Stage 35: historical/replay/realtime equivalence + rollback + native registry. */
export function runCoreSpiritStage35ExecutionConformanceTest(): void {
  const source = `let e = ema(close, 2); plot(e); if crossover(close, e) { signal("UP") }`;
  const program = makeCoreSpiritProgram(source, 'stage35');

  // 1) Historical is the reference execution.
  const historical = new CoreSpiritRuntime({ sourceId:'stage35-h', timeframe:'5m', executionMode:'historical' });
  const reference = historical.execute(program, bars);
  if (reference.length === 0) throw new Error('historical execution produced no outputs');

  // 2) Replay must produce identical values for the same bars.
  const replay = new CoreSpiritRuntime({ sourceId:'stage35-r', timeframe:'5m', executionMode:'replay' });
  const replayResult = replay.execute(program, bars);
  if (JSON.stringify(seriesValues(reference)) !== JSON.stringify(seriesValues(replayResult)))
    throw new Error('replay diverged from historical series values');

  // 3) Realtime: every developing bar is provisional, then commit exactly once.
  const realtime = new CoreSpiritRuntime({ sourceId:'stage35-live', timeframe:'5m', executionMode:'realtime' });
  realtime.loadProgram(program);
  const liveOutputs: any[] = [];
  for (const bar of bars) {
    const result = realtime.executeBar(bar);
    if (!result.state.barState.isRealtime || result.state.barState.isConfirmed)
      throw new Error('realtime bar was not provisional');
    liveOutputs.push(...result.outputs);
    realtime.commitRealtimeBar();
    if (!realtime.getExecutionFrame()?.isConfirmed || realtime.getExecutionFrame()?.isRealtime)
      throw new Error('commit did not create confirmed state');
  }
  // One final committed evaluation per bar must match historical output values.
  if (JSON.stringify(seriesValues(liveOutputs)) !== JSON.stringify(seriesValues(reference)))
    throw new Error('realtime committed values diverged from historical values');

  // 4) Rollback: an unconfirmed revision must never contaminate committed EMA state.
  const rollback = new CoreSpiritRuntime({ sourceId:'stage35-rollback', timeframe:'5m', executionMode:'realtime' });
  rollback.loadProgram(program);
  rollback.executeBar(bars[0]);
  rollback.commitRealtimeBar();
  rollback.executeBar({ ...bars[1], close:110 });
  const provisional = rollback.getState().seriesState['ema:close:2']?.at(-1);
  rollback.executeBar({ ...bars[1], close:104 });
  rollback.commitRealtimeBar();

  const expected = new CoreSpiritRuntime({ sourceId:'stage35-expected', timeframe:'5m', executionMode:'historical' });
  expected.execute(program, [bars[0], bars[1]]);
  const expectedEma = expected.getState().seriesState['ema:close:2']?.at(-1);
  const committedEma = rollback.getState().seriesState['ema:close:2']?.at(-1);
  if (provisional === expectedEma) throw new Error('test fixture did not produce a distinct provisional EMA');
  if (committedEma !== expectedEma) throw new Error('rollback/commit contaminated committed EMA state');

  // 5) The tiny stdlib and native indicator engine have an explicit coverage contract.
  if (CORE_SPIRIT_STANDARD_LIBRARY.length !== 30) throw new Error('core stdlib size changed unexpectedly');
  for (const name of ['sma','ema','hma','highest','lowest','sum','mean','stdev','wma','rma','median']) {
    if (!CORE_SPIRIT_NATIVE_INDICATOR_NAMES.has(name)) throw new Error(`native indicator registry missing ${name}`);
  }
}
