import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const panel=readFileSync('vendor/vela/src/renderers/native/drawings/DrawingSettingsPanel.ts','utf8');
const layout=readFileSync('vendor/vela/src/widget/layout-picker.ts','utf8');
const topbar=readFileSync('vendor/vela/src/widget/topbar.ts','utf8');
const workspace=readFileSync('vendor/vela/src/workspace/VelaWorkspace.ts','utf8');
assert.match(panel,/host: this\.host\.ownerDocument\.body/);assert.match(panel,/contained: false/);assert.match(panel,/vela-dsp-positioner/);assert.match(panel,/z-index: 12000/);assert.match(panel,/max-height: min\(82dvh, calc\(100dvh - 24px\)\)/);
assert.match(layout,/private readonly onDocPointerDown/);assert.match(layout,/private readonly onDocClick/);assert.match(layout,/addEventListener\('click', this\.onDocClick, true\)/);assert.match(layout,/removeEventListener\('click', this\.onDocClick, true\)/);assert.match(layout,/opts\.trigger\.addEventListener\('click', \(\) => this\.toggle\(\)\)/);
assert.match(topbar,/closeLayoutPicker\(\): void/);assert.match(workspace,/this\.topbar\.closeLayoutPicker\(\)/);
console.log('VELA_OVERLAY_STACKING_AND_LAYOUT_DISMISS_OK');
