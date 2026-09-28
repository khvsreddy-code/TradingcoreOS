import { CoreSpiritV1Runtime, assertCoreSpiritV1Determinism } from './coreSpiritV1Runtime';
import { datasetFromBars } from './platformRuntime';
import { validateCoreSpiritRoadmap } from './coreSpiritRoadmap';

const bars = [
  { timestamp:'2026-01-01T09:15:00Z', open:100, high:101, low:99, close:100, volume:1000 },
  { timestamp:'2026-01-01T09:20:00Z', open:100, high:103, low:100, close:102, volume:1200 },
];

export function runStage42CoreSpiritV1RuntimeContract() {
  const runtime = new CoreSpiritV1Runtime();
  const artifact = runtime.compile(
    'let fast = ema(close, 2)\nlet slow = ema(close, 3)\nplot(fast)\nif (crossover(fast, slow)) { signal("LONG") }',
    'stage77-79',
  );
  const dataset = datasetFromBars('stage77-79-dataset', 'NIFTY', '5m', bars);

  const historical = runtime.runHistorical(artifact, dataset);
  if (!historical.artifact || historical.artifact.checksum !== artifact.checksum) throw new Error('v1 historical run did not preserve artifact identity');
  if (historical.visuals.objectCount < 1) throw new Error('v1 historical run produced no visual objects');
  if (!historical.visuals.checksum) throw new Error('v1 historical visual summary is missing checksum');
  if (historical.signals.events.some(event => event.sourceId !== artifact.sourceId)) throw new Error('v1 signal projection lost source identity');
  if (historical.reactiveStats.recomputed < 1) throw new Error('v1 runtime did not expose reactive execution stats');

  const replay = runtime.runReplay(artifact, dataset);
  if (replay.deterministic !== true || !replay.replay) throw new Error('v1 replay did not produce deterministic acceptance record');
  if (JSON.stringify(replay.visuals.kinds) !== JSON.stringify(historical.visuals.kinds)) throw new Error('historical and replay visual projections diverged structurally');
  const replayAgain = runtime.runReplay(artifact, dataset);
  if (replayAgain.visuals.checksum !== replay.visuals.checksum) throw new Error('replay visual projection is nondeterministic');

  const direct = assertCoreSpiritV1Determinism(artifact, dataset);
  if (!direct || direct.irChecksum !== artifact.checksum) throw new Error('direct v1 deterministic replay mismatch');

  const realtime = runtime.createRealtimeSession(
    artifact,
    { runId:'stage77-79-realtime', symbol:'NIFTY', timeframe:'5m' },
  );
  const first = realtime.revise(bars[0]);
  if (first.visuals.revision !== 0) throw new Error('first realtime revision should be revision 0');
  if (first.visualUpdate.added < 1) throw new Error('realtime revision did not report a visual addition');
  realtime.commit();
  const committed = realtime.snapshot();
  if (committed.lifecycle !== 'committed' || committed.committedVisuals.checksum !== first.visuals.checksum) throw new Error('realtime commit did not converge visual state');

  const second = realtime.revise({ ...bars[0], close:101, high:102, volume:1100 });
  if (second.visuals.revision !== 1) throw new Error('second realtime revision should be revision 1');
  realtime.rollback();
  const rolledBack = realtime.snapshot();
  if (rolledBack.visuals.checksum !== committed.committedVisuals.checksum) throw new Error('visual rollback did not restore committed visual state');

  if (validateCoreSpiritRoadmap().length) throw new Error(`roadmap invalid: ${validateCoreSpiritRoadmap().join('; ')}`);
  return 'STAGE42_CORESPIRIT_V1_RUNTIME_OK';
}
