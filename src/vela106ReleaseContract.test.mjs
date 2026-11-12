import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));

const version = read('../vendor/vela/VERSION').trim();
const provenance = read('../vendor/vela/UPSTREAM.md');
const changelog = read('../vendor/vela/CHANGELOG.md');
const readme = read('../vendor/vela/README.md');
const patches = json('../vendor/vela/patches.json');
const overlay = json('../vendor/vela/UPSTREAM-DIFF.json');
const release = json('../vendor/vela/UPSTREAM-RELEASE-DIFF.json');
const packageJson = json('../package.json');

const options = read('../vendor/vela/src/core/options.ts');
const inputController = read('../vendor/vela/src/renderers/native/core/InputController.ts');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const chartConfig = read('../vendor/vela/src/renderers/native/core/chartConfig.ts');
const box = read('../vendor/vela/src/core/drawings/types/Box.ts');
const painter = read('../vendor/vela/src/renderers/native/drawings/DrawingPainter.ts');
const sync = read('../vendor/vela/src/workspace/sync.ts');
const chartCell = read('../vendor/vela/src/workspace/ChartCell.ts');
const workspace = read('../vendor/vela/src/workspace/VelaWorkspace.ts');
const inputsDialog = read('../vendor/vela/src/renderers/shared/IndicatorInputsDialog.ts');

assert.equal(version, '0.10.6');
assert.ok(provenance.includes('release tag: v0.10.6'));
asse¶»§q«^