import { CoreSpiritSeriesEngine } from './seriesEngine';
import { createCoreSpiritExecutionFrame } from './executionContext';
import { resolveSession } from './session';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreSpiritRuntime } from './runtime';
import { makeCoreSpiritProgram } from './coreSpiritPipeline';

const bars: HistoricalCandle[] = [
  { timestamp:'2026-09-24T09:15:00.000Z', open:100, high:105, low:99, close:104, volume:1000 },
  { timestamp:'2026-09-24T09:20:00.000Z', open:104, high:108, low:103, close:107, volume:1200 },
  { timestamp:'2026-09-24T09:25:00.000Z', open:107, high:109, low:106, close:108, volume:1400 },
];

export function runStage32TimeSeriesContract() {
  const engine = new CoreSpiritSeriesEngine();
  engine.reset(bars);
  engine.beginBar(2, bars[2], true, 0);
  if(engine.value('close',0)!==108 || engine.value('close',1)!==107 || engine.value('close',2)!==104) throw new Error('series offsets are not chronological');
  if(engine.window('high',2).join(',')!=='109,108') throw new Error('series window ordering is incorrect');
  if(engine.value('close',3)!==null) throw new Error('out-of-history series lookup must return null');
  let rejected=false; try { engine.value('close',-1); } catch { rejected=true; }
  if(!rejected) throw new Error('future indexing was not rejected');

  const session=resolveSession(Date.parse('2026-09-24T04:00:00.000Z'),'Asia/Kolkata');
  if(session.marketDate!=='2026-09-24') throw new Error('session market date mismatch');
  const frame=createCoreSpiritExecutionFrame({ timestamp:Date.parse(bars[2].timestamp), barIndex:2, symbol:'NSE:NIFTY50-INDEX', timeframe:'5m', timezone:'Asia/Kolkata', mode:'historical', isRealtime:false, isConfirmed:true, isNewBar:true, revision:0, isFirst:false, isLast:true });
  if(frame.barIndex!==2 || frame.symbol!=='NSE:NIFTY50-INDEX' || frame.timeframe!=='5m' || frame.mode!=='historical') throw new Error('execution frame contract mismatch');
  return { ok:true, frame, session };
}

/** Stage 33: realtime transaction + native indicator contract. */
export function runCoreSpiritStage33RealtimeIndicatorContractTest(): void {
  const source = `let e = ema(close, 2); plot(e); if close > e { signal("UP") }`;
  const runtime = new CoreSpiritRuntime({ sourceId: 'stage33', timeframe: '5m' });
  runtime.loadProgram(makeCoreSpiritProgram(source, 'stage33'));

  const b0 = { timestamp: '2026-01-01T03:00:00.000Z', open:100, high:102, low:99, close:101, volume:1000 };
  const b1 = { timestamp: '2026-01-01T03:05:00.000Z', open:101, high:103, low:100, close:102, volume:1000 };
  runtime.executeBar(b0);
  const first = runtime.executeBar({ ...b1, close:102 });
  if (!first.state.barState.isRealtime || first.state.barState.isConfirmed) throw new Error('developing bar was not marked unconfirmed');
  const second = runtime.executeBar({ ...b1, close:105 });
  if (second.state.barState.revision !== 1) throw new Error('realtime revision did not advance');
  runtime.commitRealtimeBar();
  if (runtime.getExecutionFrame()?.isRealtime || !runtime.getExecutionFrame()?.isConfirmed) throw new Error('realtime commit did not confirm frame');

  const before = runtime.getState().seriesState['ema:close:2']?.at(-1);
  const b2 = { timestamp: '2026-01-01T03:10:00.000Z', open:105, high:108, low:104, close:107, volume:1000 };
  runtime.executeBar(b2);
  runtime.rollbackRealtimeBar();
  const after = runtime.getState().seriesState['ema:close:2']?.at(-1);
  if (before !== after) throw new Error('rollback changed committed indicator state');
}
