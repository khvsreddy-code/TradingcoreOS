import { CoreSpiritVisualObjectStore, updateVisualProperty } from './visualIdentity';
import { buildCoreSpiritScene, type CoreSpiritSceneNode } from './visualScene';
import { CORE_SPIRIT_NATIVE_INDICATOR_CONTRACT } from './indicatorContract';
import { CoreSpiritRealtimeTransaction } from './executionTransaction';

const node: CoreSpiritSceneNode = {
  id: 'major_resistance', kind: 'line', layer: 'structure', pane: 'main', zIndex: 100,
  visible: true, interactive: false, locked: false, sourceId: 'demo',
  anchors: [{time: 1, price: 25180}, {time: 2, price: 25180}], payload: {},
};
const store = new CoreSpiritVisualObjectStore('demo');
const handle = store.create(node);
if (handle.id !== 'major_resistance') throw new Error('visual handle identity failed');
store.update(handle.id, { anchors: [{time: 1, price: 25180}, {time: 3, price: 25200}], style: { opacity: 0.8, lineWidth: 3 } });
updateVisualProperty(store, handle.id, 'opacity', 0.6);
if (store.get('major_resistance')?.style?.lineWidth !== 3 || store.get('major_resistance')?.style?.opacity !== 0.6) throw new Error('visual reactive update failed');
const beforeAtomic = store.checksum();
try { store.apply([{ op: 'update', id: 'major_resistance', patch: { style: { opacity: 0.2 } } }, { op: 'create', node: node }]); throw new Error('expected atomic mutation failure'); } catch {}
if (store.checksum() !== beforeAtomic) throw new Error('visual mutation rollback failed');

const scene = buildCoreSpiritScene({ chartId:'chart', symbol:'NIFTY', timeframe:'5m', pane:'main' }, store.values().map(v => ({ kind: 'line', id: v.id, start: v.anchors![0], end: v.anchors![1], style: v.style } as any)), 'demo', 1);
if (!scene.nodes.some(n => n.id.endsWith(':major_resistance'))) throw new Error('scene identity bridge failed');

for (const name of ['sma','ema','rsi','atr','vwap']) {
  const d = CORE_SPIRIT_NATIVE_INDICATOR_CONTRACT[name];
  if (!d || !d.deterministic || !d.rollbackSafe) throw new Error(`native indicator contract failed for ${name}`);
}

const tx = new CoreSpiritRealtimeTransaction<{ ema:number }> ();
tx.begin({ runId:'run-1', barIndex:100, timestamp:1000, revision:0, confirmedBarIndex:99, phase:'open', state:{ema:100}, checksum:'confirmed:99' });
tx.recordRevision('rev0');
const restored = tx.rollback();
if (restored.state.ema !== 100 || tx.getPhase() !== 'open') throw new Error('rollback did not restore confirmed state');
tx.recordRevision('rev1');
const record = tx.commit('commit:100');
if (!record.committed || record.rollbackCount !== 1 || record.revisionChecksums.length !== 2) throw new Error('commit transaction contract failed');

console.log('STAGE42_45_VISUAL_INDICATOR_TRANSACTION_OK');
