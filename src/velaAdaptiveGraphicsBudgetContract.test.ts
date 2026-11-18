import assert from 'node:assert/strict';
import { planAdaptiveGraphicsBudget } from '../vendor/vela/src/core/graphics.ts';

const cells = [
  { cellId: 'background', active: false, visible: true, width: 900, height: 600, devicePixelRatio: 2, visibleBars: 5000, indicatorCount: 8, drawingLayerCount: 5, estimatedGpuBytes: 0, frameP95Ms: 24, frameBudgetMissRate: 0.3 },
  { cellId: 'active', active: true, visible: true, width: 900, height: 600, devicePixelRatio: 2, visibleBars: 5000, indicatorCount: 2, drawingLayerCount: 1, estimatedGpuBytes: 0, frameP95Ms: 12, frameBudgetMissRate: 0.01 },
  { cellId: 'hidden', active: false, visible: false, width: 0, height: 0, devicePixelRatio: 2, visibleBars: 0, indicatorCount: 0, drawingLayerCount: 0, estimatedGpuBytes: 0, frameP95Ms: 0, frameBudgetMissRate: 0 },
];
const hardware = { webgl2Supported: true, deviceMemoryGiB: 4, hardwareConcurrency: 4, maxTextureSize: 8192 };
const decisions = planAdaptiveGraphicsBudget(cells, hardware);
const byId = Object.fromEntries(decisions.map(item => [item.cellId, item]));

assert.equal(byId.active.backend, 'webgl2', 'the active chart receives the scarce WebGL allocation first');
assert.equal(byId.background.backend, 'canvas2d', 'background charts use Canvas2D when the context budget is constrained');
assert.equal(byId.hidden.backend, 'canvas2d', 'hidden charts never consume WebGL contexts');
assert.ok(byId.active.priority > byId.background.priority);
assert.ok(byId.background.resolutionScale <= 0.92, 'frame pressure reduces background resolution');
assert.equal(byId.hidden.glowEnabled, false);
const gpuHeavy = planAdaptiveGraphicsBudget([{ ...cells[0]!, cellId: 'gpu-heavy', estimatedGpuBytes: 128 * 1024 * 1024 }], hardware)[0]!;
assert.equal(gpuHeavy.resolutionScale, 0.5, 'reported GPU allocation pressure lowers render resolution');
assert.equal(planAdaptiveGraphicsBudget(cells, { ...hardware, webgl2Supported: false })[0].backend, 'canvas2d');
assert.ok(planAdaptiveGraphicsBudget(cells, hardware, 'canvas2d').every(item => item.backend === 'canvas2d'), 'explicit backend override wins');
console.log('VELA_ADAPTIVE_GRAPHICS_BUDGET_OK');
