import { CoreSpiritV1Runtime } from './coreSpiritV1Runtime';
import { datasetFromBars } from './platformRuntime';

const bars = [
  { timestamp: '2026-01-01T09:15:00Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { timestamp: '2026-01-01T09:20:00Z', open: 100, high: 103, low: 100, close: 102, volume: 1200 },
];

export function runStage48SceneGraphEncapsulationContract() {
  const runtime = new CoreSpiritV1Runtime();
  const artifact = runtime.compile('show close on price', 'stage48-scene-hidden');
  const dataset = datasetFromBars('stage48-dataset', 'NIFTY', '5m', bars);
  const historical: any = runtime.runHistorical(artifact, dataset);

  if ('scene' in historical) throw new Error('v1 runtime result exposes Scene Graph state');
  if (!historical.visuals || typeof historical.visuals.objectCount !== 'number') throw new Error('v1 runtime lacks public visual summary');
  if ('nodes' in historical.visuals) throw new Error('public visual summary leaks scene nodes');

  const realtime = runtime.createRealtimeSession(artifact, { runId: 'stage48-realtime', symbol: 'NIFTY', timeframe: '5m' });
  const revision: any = realtime.revise(bars[0]);
  if ('scene' in revision || 'diff' in revision || 'patch' in revision) throw new Error('realtime revision exposes Scene Graph implementation objects');
  if (!revision.visualUpdate || revision.visualUpdate.added < 1) throw new Error('realtime visual update summary missing');

  const snapshot: any = realtime.snapshot();
  if ('scene' in snapshot || 'committedScene' in snapshot) throw new Error('realtime snapshot exposes Scene Graph implementation objects');
  if (!snapshot.visuals || !snapshot.committedVisuals) throw new Error('realtime snapshot lacks public visual summaries');

  return 'STAGE48_SCENE_GRAPH_ENCAPSULATION_OK';
}

console.log(runStage48SceneGraphEncapsulationContract());
