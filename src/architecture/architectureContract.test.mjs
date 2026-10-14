import assert from 'node:assert/strict';
import { TRADINGCOREOS_ARCHITECTURE, TRADINGCOREOS_ARCHITECTURE_VERSION, TRADINGCOREOS_BOUNDARY_CONTRACTS, validateTradingCoreOSDependency } from './architectureContract.ts';
import { canonicalBarIndexRange, canonicalDirtyRange, toVelaSceneDirtyRange, velaTimeRange } from './crossPlaneContracts.ts';
assert.equal(TRADINGCOREOS_ARCHITECTURE_VERSION, 2);
assert.deepEqual(TRADINGCOREOS_ARCHITECTURE.map((plane) => plane.id), ['marketData', 'coreSpirit', 'compute', 'vela', 'trading']);
assert.equal(validateTradingCoreOSDependency('coreSpirit', 'marketData'), true);
assert.equal(validateTradingCoreOSDependency('coreSpirit', 'compute'), true);
assert.equal(validateTradingCoreOSDependency('vela', 'coreSpirit'), true);
assert.equal(validateTradingCoreOSDependency('trading', 'coreSpirit'), true);
assert.equal(validateTradingCoreOSDependency('coreSpirit', 'trading'), false);
assert.equal(validateTradingCoreOSDependency('vela', 'trading'), false);
assert.equal(validateTradingCoreOSDependency('marketData', 'vela'), false);
assert.equal(validateTradingCoreOSDependency('compute', 'vela'), false);
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.marketDataSnapshot.owner, 'marketData');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.marketDataSnapshot.timeUnit, 'epoch-seconds');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.canonicalDirtyRange.coordinate, 'bar-index');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.canonicalDirtyRange.bounds, 'half-open');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.velaDirtyRange.coordinate, 'epoch-milliseconds');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.velaDirtyRange.bounds, 'inclusive');
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.visibleRange.authoritative, true);
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.indicatorOutputPatch.sourceRevisionRequired, true);
assert.deepEqual(TRADINGCOREOS_BOUNDARY_CONTRACTS.chartSeriesPatch.liveOperations, ['append', 'replace-last']);
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.orderIntent.signalIsOrder, false);
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.orderIntent.riskApprovalRequired, true);
assert.equal(TRADINGCOREOS_BOUNDARY_CONTRACTS.orderStateTransition.reconcileSnapshotBeforePublish, true);

assert.deepEqual(canonicalBarIndexRange(3, 5), { from: 3, to: 5 });
assert.throws(() => canonicalBarIndexRange(2, 1), RangeError);
assert.deepEqual(canonicalDirtyRange('NSE:NIFTY:5m', 7, 4, 8), {
  timelineKey: 'NSE:NIFTY:5m', revision: 7, from: 4, to: 8,
});
assert.throws(() => canonicalDirtyRange(' ', 1, 0, 1), TypeError);
const velaRange = velaTimeRange(1_800_000_000_000, 1_800_000_000_500);
assert.deepEqual(toVelaSceneDirtyRange(velaRange), { from: 1_800_000_000_000, to: 1_800_000_000_500 });
assert.throws(() => velaTimeRange(Number.NaN, 1), RangeError);

console.log('TRADINGCOREOS_ARCHITECTURE_CONTRACT_OK');