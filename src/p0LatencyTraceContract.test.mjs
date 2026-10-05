import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const trace = fs.readFileSync(path.join(root, 'src/services/core/performance/marketLatencyTrace.ts'), 'utf8');
const bars = fs.readFileSync(path.join(root, 'vendor/vela/src/core/model/columnar-bars.ts'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/TcoVelaDataProvider.ts'), 'utf8');

assert.match(trace, /MarketLatencyStage/);
assert.match(trace, /feed/);
assert.match(trace, /canonical/);
assert.match(trace, /compute/);
assert.match(trace, /patch/);
assert.match(trace, /paint/);
assert.match(bars, /readonly sequence\?: number/);
assert.match(bars, /readonly timelineKey\?: string/);
assert.match(provider, /event\.snapshot\.revision/);
assert.match(provider, /sequence, timelineKey/);

console.log('TRADINGCORE_P0_LATENCY_TRACE_CONTRACT_OK');
