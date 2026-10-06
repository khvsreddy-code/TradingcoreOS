import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const graph = fs.readFileSync(path.join(root, 'vendor/vela/src/core/model/sceneGraph.ts'), 'utf8');
const rendererGraph = fs.readFileSync(path.join(root, 'vendor/vela/src/renderers/native/core/SceneGraph.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'vendor/vela/src/renderers/native/NativeRenderer.ts'), 'utf8');

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

assert(graph.includes('export const SceneDirty'), 'SceneDirty flags are missing');
assert(graph.includes('viewportBounds'), 'Scene node viewport bounds are missing');
assert(graph.includes('dataRange'), 'Scene node data range is missing');
assert(graph.includes('style?: unknown'), 'Scene node style is missing');
assert(graph.includes('queryDirty('), 'Scene graph has no dirty-node query');
assert(graph.includes('intersectsViewport'), 'Scene graph has no viewport culling contract');
assert(graph.includes('Large collections'), 'Scene graph does not document instance-batch representation');
assert(rendererGraph.includes('readonly retained = new RetainedSceneGraph()'), 'native SceneGraph is not backed by retained graph');
assert(rendererGraph.includes('syncIndicatorNodes'), 'native SceneGraph does not reconcile indicator nodes');
assert(renderer.includes('SceneDirty'), 'NativeRenderer does not consume scene dirty flags');
assert(renderer.includes('retainedVisualDirty'), 'NativeRenderer still rebuilds indicator drawing work every frame');

console.log('VELA_RETAINED_SCENE_GRAPH_CONTRACT_OK');