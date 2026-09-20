import { CoreDrawingStore } from './drawing/coreDrawingStore';
import { hitTestDrawings, moveDrawingHandle } from './drawing/drawingGeometry';
import { CoreEventBus } from './event/eventBus';
import { ReplayEngine } from './replay/replayEngine';
import { compileCoreSpirit, makeCoreSpiritProgram } from '../coreSpirit';
import { CoreSpiritRuntime } from '../coreSpirit/runtime';
import { validateExecutableArtifact } from '../coreSpirit/artifact';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = Array.from({length: 25}, (_,i) => ({
  timestamp: new Date(1700000000000 + i*60000).toISOString(), open:100+i, high:102+i, low:99+i, close:101+i, volume:1000+i,
}));

export function runCoreStageSelfTest(): void {
  const store = new CoreDrawingStore();
  const drawing = store.add({id:'d1',kind:'trendline',points:[{time:1,price:100},{time:2,price:101}],owner:'user',coordinateSpace:'data',lifecycle:'active'});
  if (!drawing || store.list().length !== 1) throw new Error('CoreDrawing add failed');
  if (!store.undo() || store.list().length !== 0 || !store.redo() || store.list().length !== 1) throw new Error('CoreDrawing undo/redo failed');
  const adapter = {timeToX:(t:number)=>t*10,priceToY:(p:number)=>200-p,xToTime:(x:number)=>x/10,yToPrice:(y:number)=>200-y};
  const hit = hitTestDrawings(store.list(), {x:10,y:100}, adapter, 2);
  if (!hit?.handle) throw new Error('CoreDrawing hit test failed');
  if (!moveDrawingHandle(drawing!,0,{x:20,y:90},adapter)) throw new Error('CoreDrawing handle move failed');

  const source = 'let e = ema(close, 20); plot(e); if (close > e) { signal("up"); }';
  const compiled = compileCoreSpirit(source, 'self-test');
  if (!compiled.ir || !compiled.artifact || !validateExecutableArtifact(compiled.artifact)) throw new Error('CoreSpirit compiler/artifact failed');
  const runtimeBus = new CoreEventBus(); let signals = 0; runtimeBus.on('script.signal', () => signals++);
  const runtime = new CoreSpiritRuntime({sourceId:'self-test'}, runtimeBus);
  runtime.loadProgram(makeCoreSpiritProgram(source,'self-test'));
  const result = runtime.executeIr(compiled.ir, bars);
  if (result.diagnostics.length || result.outputs.filter(x => x.kind === 'series').length !== bars.length || signals === 0) throw new Error(`CoreSpirit runtime failed: ${result.diagnostics.join('; ')}`);

  // Stage 1 runtime semantics: local series history, strict warm-up, and realtime rollback.
  const seriesSource = 'let x = close * 2; plot(x); plot(x[1]);';
  const seriesProgram = makeCoreSpiritProgram(seriesSource, 'series-semantics');
  const seriesRuntime = new CoreSpiritRuntime({sourceId:'series-semantics'});
  seriesRuntime.loadProgram(seriesProgram);
  const s1 = seriesRuntime.executeBar(bars[0]);
  const s2 = seriesRuntime.executeBar(bars[1]);
  if (s2.diagnostics.length) throw new Error(`CoreSpirit series indexing failed: ${s2.diagnostics.join('; ')}`);
  const seriesState = s2.state.localSeries.x || [];
  if (seriesState.length !== 2 || seriesState[0] !== 202 || seriesState[1] !== 204) throw new Error('CoreSpirit local series history failed');

  const warmupSource = 'let m = sma(close, 3); plot(m);';
  const warmupRuntime = new CoreSpiritRuntime({sourceId:'warmup'});
  warmupRuntime.loadProgram(makeCoreSpiritProgram(warmupSource, 'warmup'));
  const warmup = bars.slice(0, 3).flatMap(bar => warmupRuntime.executeBar(bar).outputs).filter(x => x.kind === 'series');
  if (warmup.length !== 3 || warmup[0].value !== null || warmup[1].value !== null || warmup[2].value === null) throw new Error('CoreSpirit warm-up/na semantics failed');

  const realtimeSource = 'let e = ema(close, 2); plot(e);';
  const realtimeRuntime = new CoreSpiritRuntime({sourceId:'realtime'});
  realtimeRuntime.loadProgram(makeCoreSpiritProgram(realtimeSource, 'realtime'));
  const first = realtimeRuntime.executeBar({...bars[0], close:101});
  const second = realtimeRuntime.executeBar({...bars[0], close:103});
  const committed = realtimeRuntime.executeBar({...bars[1], close:105});
  if (first.state.localSeries.x || second.state.localSeries.x) { /* no-op: x is not part of this script */ }
  if (second.state.seriesState['ema:close:2']?.length !== 1) throw new Error('Realtime rollback duplicated EMA state');
  if (committed.state.seriesState['ema:close:2']?.length !== 2) throw new Error('Realtime commit/new-bar state failed');
  realtimeRuntime.confirmRealtimeBar();


  const replayBus = new CoreEventBus(); let emitted = 0; replayBus.on('market.bar', e => { if(e.source === 'replay') emitted++; });
  const replay = new ReplayEngine(replayBus); replay.load({sessionId:'self-test',symbol:'TEST',timeframe:'1m',bars});
  for(let i=0;i<bars.length;i++) if(!replay.step()) throw new Error('Replay step failed');
  if(emitted !== bars.length || replay.getCursor() !== bars.length) throw new Error('Replay determinism/step failed');
  try { replay.load({sessionId:'bad',symbol:'TEST',timeframe:'1m',bars:[{...bars[0], high: 1, low: 2}]}); throw new Error('Replay validator accepted invalid OHLC'); } catch (e) { if (String(e).includes('validator accepted')) throw e; }
}
