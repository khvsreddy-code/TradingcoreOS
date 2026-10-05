import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const trace = fs.readFileSync(path.join(root, 'src/services/core/performance/marketLatencyTrace.ts'), 'utf8');
const update = fs.readFileSync(path.join(root, 'vendor/vela/src/core/model/columnar-bars.ts'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/TcoVelaDataProvider.ts'), 'utf8');

assert.match(trace, /MarketLatencyStage/);
assert.match(trace, /feed/);
assert.match(trace, /canonical/);
assert.match(trace, /compute/);
assert.match(trace, /patch/);
assert.match(trace, /paint/);
assert.match(trace, /performance\.now/);
assert.match(update, /readonly sequence\?: number/);
assert.match(update, /readonly timelineKey\?: string/);
assert.match(provider, /const sequence = event\.snapshot\.revision/);
assert.match(provider, /marketLatencyTrace\.measure\(timelineKey, sequence, 'canonical'/);
assert.match(provider, /sequence, timelineKey/);

console.log('TRADINGCORE_P0_LATENCY_TRACE_CONTRACT_OK');
