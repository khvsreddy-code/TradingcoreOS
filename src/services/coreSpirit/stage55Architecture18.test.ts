import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { makeExecutableArtifact } from './artifact';
import { CoreSpiritPlatformRuntime, datasetFromBars } from './platformRuntime';
import { CoreSpiritSignalEngine } from './signalEngine';
import { CoreSpiritRealtimeExecutionHost } from './executionHost';
import { CoreSpiritExecutionAdapterRegistry } from './executionAdapter';
import { validateCoreSpiritArchitectureEdges } from './architectureContract';

(async () => {
  const source = `
    let fast = ema(close, 3)
    let slow = ema(close, 5)
    let r = rsi(close, 5)
    plot(fast)
    plot(slow)
    signal(crossover(fast, slow) and r > 50, "LONG")
  `;
  const compiler = new CoreSpiritCompiler();
  const compiled = compiler.compile(parseCoreSpirit(source), 'stage55', { layer: 'script' });
  if (!compiled.ir || !compiled.artifact) throw new Error('stage55 failed to create executable artifact');

  const dataset = datasetFromBars('stage55-data', 'TEST', '1m', [
    { timestamp: '2026-09-26T10:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { timestamp: '2026-09-26T10:01:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 1200 },
    { timestamp: '2026-09-26T10:02:00.000Z', open: 101, high: 104, low: 100, close: 103, volume: 1400 },
    { timestamp: '2026-09-26T10:03:00.000Z', open: 103, high: 106, low: 102, close: 105, volume: 1500 },
    { timestamp: '2026-09-26T10:04:00.000Z', open: 105, high: 107, low: 104, close: 106, volume: 1600 },
  ]);

  const platform = new CoreSpiritPlatformRuntime();
  const run = platform.runArtifact(compiled.artifact, dataset, 'stage55:historical');
  if (run.identity.mode !== 'historical') throw new Error('platform did not select historical host');
  if (run.identity.artifactChecksum !== compiled.artifact.checksum) throw new Error('host lost artifact identity');
  const replay = platform.verifyReplay(compiled.artifact, dataset);
  if (replay.irChecksum !== compiled.artifact.checksum) throw new Error('replay artifact identity mismatch');

  const signalEngine = new CoreSpiritSignalEngine();
  const signals = signalEngine.fromOutputs({
    sourceId: compiled.artifact.sourceId,
    programChecksum: compiled.artifact.checksum,
    runId: 'stage55:run',
    mode: 'replay',
    outputs: run.outputs,
  });
  const deduped = signalEngine.fromOutputs({
    sourceId: compiled.artifact.sourceId,
    programChecksum: compiled.artifact.checksum,
    runId: 'stage55:run',
    mode: 'replay',
    outputs: run.outputs,
  });
  if (deduped.events.length !== 0 || signals.checksum.length !== 8) throw new Error('signal engine did not enforce deterministic dedupe');

  const realtime = new CoreSpiritRealtimeExecutionHost(compiled.artifact, { runId: 'stage55:realtime', symbol: 'TEST', timeframe: '1m' });
  realtime.initialize();
  realtime.revise(dataset.bars[0]);
  realtime.revise({ ...dataset.bars[0], close: 100.5, high: 101 });
  realtime.rollback();
  realtime.revise(dataset.bars[0]);
  realtime.commit();
  if (!realtime.snapshot().barState.isConfirmed) throw new Error('realtime host did not commit confirmed state');

  const registry = new CoreSpiritExecutionAdapterRegistry();
  registry.register({ adapterId: 'test', submit: async order => ({ accepted: false, adapterId: 'test', status: 'REJECTED', reason: `test-only ${order.intentId}`, timestamp: Date.now() }) });
  if (!registry.has('test') || registry.list().length !== 1) throw new Error('execution adapter registry failed');

  const architectureErrors = validateCoreSpiritArchitectureEdges([
    ['language', 'broker'],
    ['vm', 'broker'],
  ]);
  if (architectureErrors.length !== 2) throw new Error('forbidden architecture dependencies were not detected');

  const artifact = makeExecutableArtifact(compiled.ir);
  if (artifact.checksum !== compiled.artifact.checksum) throw new Error('artifact identity changed unexpectedly');

  console.log('STAGE55_ARCHITECTURE_18_OK');
})().catch(error => { console.error(error); throw error; });
