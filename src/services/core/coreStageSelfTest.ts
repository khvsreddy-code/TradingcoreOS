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

  const replayBus = new CoreEventBus(); let emitted = 0; replayBus.on('market.bar', e => { if(e.source === 'replay') emitted++; });
  const replay = new ReplayEngine(replayBus); replay.load({sessionId:'self-test',symbol:'TEST',timeframe:'1m',bars});
  for(let i=0;i<bars.length;i++) if(!replay.step()) throw new Error('Replay step failed');
  if(emitted !== bars.length || replay.getCursor() !== bars.length) throw new Error('Replay determinism/step failed');
  try { replay.load({sessionId:'bad',symbol:'TEST',timeframe:'1m',bars:[{...bars[0], high: 1, low: 2}]}); throw new Error('Replay validator accepted invalid OHLC'); } catch (e) { if (String(e).includes('validator accepted')) throw e; }
}
