import assert from 'node:assert/strict';
import fs from 'node:fs';

import { columnarTimeToMillis } from '../vendor/vela/src/core/model/columnar-bars.ts';

const seconds2026 = 1791360000;
const milliseconds2026 = 1791360000000;

assert.equal(columnarTimeToMillis(seconds2026, 'seconds'), milliseconds2026);
assert.equal(columnarTimeToMillis(milliseconds2026, 'milliseconds'), milliseconds2026);

const source = fs.readFileSync(
  new URL('../vendor/vela/src/renderers/native/NativeRenderer.ts', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /if \(!this\.columnarBars\) \{\s*\/\/ LiveSession may select the compact columnar transport[\s\S]*?this\.updateBar\(\{/,
  'columnar live updates must fall back to scalar bar updates when history used the scalar renderer path',
);
assert.match(
  source,
  /this\.scheduler\.invalidate\(InvalidateLevel\.Full\);/,
  'in-place columnar mutations must invalidate the native renderer',
);
assert.match(
  source,
  /const nextTimeMs = columnarTimeToMillis\(next\.time, columns\.timeUnit \?\? 'milliseconds'\);/,
  'columnar seconds must be normalized before appending to the renderer time axis',
);

console.log('VELA_COLUMNAR_LIVE_RENDERER_CONTRACT_OK');
