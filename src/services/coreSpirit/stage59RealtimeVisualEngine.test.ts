import { buildCoreSpiritScene, buildCoreSpiritSceneFromNodes } from './visualScene';
import { CoreSpiritRealtimeVisualEngine, coalesceVisualPatches } from './visualRealtimeEngine';
import { validateCoreSpiritRoadmap } from './coreSpiritRoadmap';

type AnyObj = Parameters<typeof buildCoreSpiritScene>[1][number];
const roadmapErrors = validateCoreSpiritRoadmap();
if (roadmapErrors.length) throw new Error(`roadmap validation failed: ${roadmapErrors.join('; ')}`);

const identity = { chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' as const };
const line = (id: string, price: number): AnyObj => ({ kind: 'line', id, start:{time:1, price}, end:{time:2, price} });
const scene0 = buildCoreSpiritScene(identity, [line('a', 100)], 'stage59', 0);
const scene1 = buildCoreSpiritScene(identity, [line('a', 101), line('b', 102)], 'stage59', 1);
const scene2 = buildCoreSpiritScene(identity, [line('a', 103)], 'stage59', 2);

const engine = new CoreSpiritRealtimeVisualEngine(identity);
engine.begin(0);
engine.apply(scene0);
engine.commit();
engine.drainPatches();
if (engine.getCommittedScene().nodes.length !== 1) throw new Error('commit should preserve the latest visual scene');

engine.begin(1);
const diff1 = engine.apply(scene1);
if (diff1.updated.length !== 1 || diff1.added.length !== 1) throw new Error('realtime engine should emit only changed/added nodes');
const patch1 = engine.drainPatches()[0];
if (!patch1 || patch1.updated.length !== 1 || patch1.added.length !== 1) throw new Error('visual patch did not mirror scene diff');

engine.begin(2);
engine.apply(scene2);
const rollback = engine.rollback();
if (rollback.revision !== 0 || rollback.added.length || rollback.removed.length || !rollback.updated.includes('stage59:a')) throw new Error('visual rollback must restore committed scene');
if (engine.getWorkingScene().checksum !== engine.getCommittedScene().checksum) throw new Error('rollback must restore committed checksum');

const noop = coalesceVisualPatches([
  { revision:1, previousRevision:0, added:['x'], updated:[], removed:[], sceneChecksum:'a', structuralReset:false },
  { revision:2, previousRevision:1, added:[], updated:[], removed:['x'], sceneChecksum:'b', structuralReset:false },
]);
if (noop.added.length || noop.updated.length || noop.removed.length) throw new Error('coalesced add->remove should be a no-op');
if (rollback.previousRevision !== 2 || rollback.revision !== 0) throw new Error('visual rollback revision boundary is wrong');

console.log('STAGE59_REALTIME_VISUAL_ENGINE_OK');
