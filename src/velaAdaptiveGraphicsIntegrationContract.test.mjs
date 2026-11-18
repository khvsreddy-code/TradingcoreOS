import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('vendor/vela/src/workspace/VelaWorkspace.ts', 'utf8');
const renderer = fs.readFileSync('vendor/vela/src/renderers/native/NativeRenderer.ts', 'utf8');
const graphics = fs.readFileSync('vendor/vela/src/core/graphics.ts', 'utf8');
assert.match(workspace, /planAdaptiveGraphicsBudget\(inputs, hardware, forced\)/);
assert.match(workspace, /cell\.chart\.renderer\.setGraphicsPolicy/);
assert.match(workspace, /cellId === this\.activeId/);
assert.doesNotMatch(workspace, /def\.cells\.length > \(this\.opts\.maxWebglCells/);
assert.match(renderer, /setGraphicsPolicy\(policy: NativeGraphicsPolicy\)/);
assert.match(renderer, /getGraphicsDiagnostics\(\): NativeGraphicsDiagnostics/);
assert.match(renderer, /previousCanvas\.replaceWith\(replacement\)/);
assert.match(renderer, /this\.graphicsPolicy\.resolutionScale/);
assert.match(renderer, /this\.backend\.destroy\(\)/);
assert.match(graphics, /export function planAdaptiveGraphicsBudget/);
console.log('VELA_ADAPTIVE_GRAPHICS_INTEGRATION_OK');
