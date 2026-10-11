import assert from 'node:assert/strict';
import { CoreSpiritVisualObjectStore, updateVisualProperty } from './visualIdentity.ts';

function node(id, payload = {}, extra = {}) {
  return {
    id,
    kind: 'panel',
    layer: 'ui',
    pane: 'main',
    zIndex: 0,
    visible: true,
    interactive: false,
    locked: false,
    sourceId: 'test-source',
    payload,
    ...extra,
  };
}

const nested = { grid: { values: [{ x: 1 }, { x: 2 }] }, text: 'original' };
const store = new CoreSpiritVisualObjectStore('test-source');
store.create(node('parent', nested));
nested.grid.values[0].x = 900;
assert.equal(store.get('parent').payload.grid.values[0].x, 1, 'store must detach nested producer-owned payload');

const returned = store.get('parent');
returned.payload.grid.values[0].x = 800;
assert.equal(store.get('parent').payload.grid.values[0].x, 1, 'get() must not expose retained nested payload references');

store.create(node('child', { text: 'child' }, { parentId: 'parent' }));
assert.throws(
  () => store.upsert(node('parent', {}, { kind: 'line', layer: 'structure' })),
  /cannot change kind/,
  'a stable visual id cannot silently change primitive kind',
);

const previousChecksum = store.checksum();
assert.throws(() => store.apply([
  { op: 'update', id: 'child', patch: { payload: { changed: true } } },
  { op: 'create', node: node('child') },
]), /already exists/);
assert.equal(store.checksum(), previousChecksum, 'failed batch mutation must roll back every earlier mutation');

assert.equal(store.remove('parent'), true);
assert.equal(store.get('child').parentId, undefined, 'removing a group root must detach retained children');
assert.equal(store.remove('missing'), false);
assert.throws(() => updateVisualProperty(store, 'missing', 'text', 'x'), /does not exist/);

const safeText = updateVisualProperty(store, 'child', 'text', 'new text');
assert.equal(safeText.id, 'child');
assert.equal(store.get('child').payload.text, 'new text');

console.log('CORESPIRIT_VISUAL_OBJECT_LIFECYCLE_CONTRACT_OK');
