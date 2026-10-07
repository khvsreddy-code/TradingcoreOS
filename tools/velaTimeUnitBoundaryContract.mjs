import assert from 'node:assert/strict';
import { msFromTime } from '../src/services/core/chart/velaNativeChartKernel.ts';

const seconds = 1791375900;
const milliseconds = 1791375900000;

// Modern epoch milliseconds must not be multiplied a second time.
assert.equal(msFromTime(milliseconds), milliseconds);
// Epoch seconds must still be promoted exactly once.
assert.equal(msFromTime(seconds), milliseconds);
// A realistic 2026 chart timestamp must remain in the correct millisecond range.
assert.ok(msFromTime(milliseconds) < 2_000_000_000_000);

console.log('VELA_TIME_UNIT_BOUNDARY_CONTRACT_OK');
