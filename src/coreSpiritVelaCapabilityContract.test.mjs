import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { extractCoreSpiritSurfaceMetadata } from './services/coreSpirit/languageConcepts.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/surfaceForms.ts';

async function waitFor(predicate,label){
  const deadline=Date.now()+5_000;
  while(!predicate()){
    if(Date.now()>deadline)throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}

const source = `
indicator "Trend"
    input fastLength: int = 20 min=1 max=500
    input slowLength: int = 50 min=2 max=1000
    precision = 2
    overlay = true
    plot(ema(close, fastLength))

strategy "Momentum"
    initialCapital = 100000
    commission = 0.03
`;

const surface = extractCoreSpiritSurfaceMetadata(source);
assert.equal(surface.inputs?.length, 2);
assert.deepEqual(surface.inputs?.map(input => input.key), ['fastLength','slowLength']);
assert.equal(surface.inputs?.[0]?.type, 'int');
assert.equal(surface.inputs?.[0]?.defval, 20);
assert.equal(surface.inputs?.[0]?.min, 1);
assert.equal(surface.inputs?.[0]?.max, 500);
assert.deepEqual(surface.props?.map(prop => prop.property), ['precision','overlay','initialCapital','commission']);
assert.equal(surface.props?.find(prop => prop.property === 'precision')?.defval, 2);
assert.equal(surface.props?.find(prop => prop.property === 'initialCapital')?.defval, 100000);
assert.equal(surface.declarations.find(item => item.name === 'Momentum')?.role, 'strategy');
const normalized = normalizeCoreSpiritSource(source);
assert.match(normalized, /let fastLength = __input\("fastLength", 20\);/);
assert.match(normalized, /let slowLength = __input\("slowLength", 50\);/);
assert.doesNotMatch(normalized, /precision\s*=\s*2/);
assert.doesNotMatch(normalized, /initialCapital\s*=\s*100000/);

const engine = await import('../src/CoreSpiritVelaEngine.ts');
assert.equal(engine.CoreSpiritVelaEngine.prototype.capabilities, undefined, 'capabilities must be an instance field, not a prototype field');
const instance = new engine.CoreSpiritVelaEngine();
assert.deepEqual(instance.capabilities, { streaming:true, visibleRange:true, inputs:true, props:true });

const metadata = await instance.prepare(source, 'contract:vela-capability');
assert.equal(metadata.inputs.length, 2);
assert.equal(metadata.inputs[0].key, 'fastLength');
assert.equal(metadata.props?.length, 4);
assert.equal(metadata.reactsToViewport, false);

const viewportSource = `
indicator "Viewport Profile"
    input rows: int = 24 min=2 max=400 step=1 title="Profile Rows"
    plot(vpvr(rows))
`;
const viewportPrepared = await instance.prepare(viewportSource, 'contract:vela-viewport-capability');
assert.equal(viewportPrepared.reactsToViewport, true);
assert.equal(viewportPrepared.inputs[0].key, 'rows');
assert.equal(viewportPrepared.inputs[0].min, 2);
assert.equal(viewportPrepared.inputs[0].max, 400);
assert.equal(viewportPrepared.inputs[0].title, 'Profile Rows');
const viewportBars = Array.from({ length: 40 }, (_, index) => {
  const close = 100 + index;
  return { time: 1_700_000_000_000 + index * 300_000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 + index };
});
const originalExecuteIr = CoreSpiritRuntime.prototype.executeIr;
let viewportExecuteIrCalls = 0;
CoreSpiritRuntime.prototype.executeIr = function (...args) {
  viewportExecuteIrCalls += 1;
  return originalExecuteIr.apply(this, args);
};
let viewportSession;
try {
  viewportSession = instance.execute({
    prepared: viewportPrepared,
    market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
    bars: viewportBars,
    getBars: () => viewportBars,
    mode: 'static',
    historyState: 'complete',
  }, {
    onModel: () => undefined,
    onScenePatches: () => undefined,
    onError: error => { throw error; },
    onDone: () => undefined,
  });
  await waitFor(()=>viewportExecuteIrCalls===1,'worker-backed initial viewport history');
  assert.equal(viewportExecuteIrCalls, 1, 'viewport indicator initial history should execute once');
  const visibleRange = { left: viewportBars[5].time, right: viewportBars[20].time };
  viewportSession.setVisibleRange(visibleRange);
  viewportSession.setVisibleRange(visibleRange);
  await waitFor(()=>viewportExecuteIrCalls===2,'deduplicated viewport worker run');
  assert.equal(viewportExecuteIrCalls, 2, 'identical viewport notifications must not rebuild the range runtime');

  viewportSession.notifyBars('backfill', { from: viewportBars[5].time, to: viewportBars[20].time });
  await waitFor(()=>viewportExecuteIrCalls===3,'backfill worker run');
  assert.equal(viewportExecuteIrCalls, 3, 'backfill must refresh the changed range');
  viewportSession.setVisibleRange(visibleRange);
  await waitFor(()=>viewportExecuteIrCalls===4,'viewport rerun after backfill');
  assert.equal(viewportExecuteIrCalls, 4, 'data backfill must invalidate the viewport-result cache');
  const engineSource=await readFile(new URL('./CoreSpiritVelaEngine.ts',import.meta.url),'utf8');
  assert.match(engineSource,/runCoreSpiritArtifactInWorker/,'Vela engine must route compiled artifacts to persistent workers');
  assert.doesNotMatch(engineSource,/runtime\.executeIr|runtime\.executeBar|createRuntime\(/,'Vela engine must not execute CoreSpirit historical/live workloads on the UI thread');
  assert.match(engineSource,/phase: stopped \? 'idle' : initializationInFlight \? 'computing'/,'Vela execution snapshots must report pending worker computation instead of idling while work is in flight');
  assert.match(engineSource,/workerDatasetVersions\.delete\(mainContextKey\)[\s\S]{0,220}historyInitialized=false;[\s\S]{0,80}liveStarted=false;/,'historical backfill must invalidate live worker state and force a read-only warm-up before the next forming-bar run');
  assert.match(engineSource,/getCurrentBars\(reason==='backfill'\|\|hasValidDirtyRange,false\)/,'explicit time dirty ranges must force a canonical snapshot instead of reusing a stale prefix');
  assert.match(engineSource,/dirtyRangeTouchesHistoryBeforeTail=reason!=='complete'&&dirtyIntersectsLoadedHistory&&\s*dirtyFromMs<latestBarTime/,'non-tail dirty ranges must be recognized as historical corrections');
  assert.match(engineSource,/if\(historicalCorrection\)\{[\s\S]{0,1400}initializeFromBars\(Object\.freeze\(currentBars\.slice\(\)\) as CoreSpiritMarketBar\[\],true\)/,'historical dirty ranges must trigger a full causal replay with external effects suppressed');
assert.match(engineSource,/if\(secondaryDependencies\.length&&!req\.fetchSeries\)/,'missing secondary-data providers must explicitly degrade the Vela runtime');
assert.match(engineSource,/secondaryDegraded=true;[\s\S]{0,180}secondaryFailed\.add/,'missing secondary market data must block signals/order intents rather than use empty values');
  viewportSession.stop();
} finally {
  if (viewportSession) viewportSession.stop();
  CoreSpiritRuntime.prototype.executeIr = originalExecuteIr;
}


console.log('CORESPIRIT_VELA_FULL_CAPABILITY_CONTRACT_OK');
