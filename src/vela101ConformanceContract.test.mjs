import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const renderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const engine = read('../vendor/vela/src/core/engine/EngineOrchestrator.ts');
const scenePatch = read('../vendor/vela/src/core/model/patch.ts');
const sceneGraph = read('../vendor/vela/src/renderers/native/core/SceneGraph.ts');
const priceStyle = read('../vendor/vela/src/core/price-styles/heikin-ashi.ts');
const dataProvider = read('./TcoVelaDataProvider.ts');
const liveChart = read('./components/workspace/LiveChart.tsx');
const chartKernel = read('./services/core/chart/velaNativeChartKernel.ts');
const outputLayer = read('./services/core/chart/coreSpiritVelaOutputLayer.ts');
const sceneDiff = read('./services/core/chart/coreSpiritSceneDiff.ts');
const adapter = read('./services/core/chart/tcoVelaSemanticAdapter.ts');
const rendererPorts = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const extension = read('./services/core/chart/tcoVelaNativeExtensions.ts');
const provenance = read('../vendor/vela/UPSTREAM.md');
const patchManifest = JSON.parse(read('../vendor/vela/patches.json'));
const sourceSnapshot = JSON.parse(read('../vendor/vela/UPSTREAM-DIFF.json'));
const releaseSnapshot = JSON.parse(read('../vendor/vela/UPSTREAM-RELEASE-DIFF.json'));

assert.match(provenance, /Upstream source commit: f6769868c5c0e78ba7977a5c89640df896a8f2f3/, 'conf¶»§q«^