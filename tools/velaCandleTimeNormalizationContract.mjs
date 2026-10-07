import assert from 'node:assert/strict';
import { msFromTime } from '../src/services/core/chart/velaNativeChartKernel.ts';

const epochSeconds2026 = 1791360000;
const epochMilliseconds2026 = 1791360000000;

assert.equal(msFromTime(epochSeconds2026), epochMilliseconds2026);
assert.equal(msFromTime(epochMilliseconds2026), epochMilliseconds2026);
assert.ok(msFromTime(epochMilliseconds2026) < 2_000_000_000_000);
console.log('VELA_CANDLE_TIME_NORMALIZATION_CONTRACT_OK');
