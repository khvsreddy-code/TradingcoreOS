import assert from 'node:assert/strict';
import { decodeState, encodeState, sanitizeState } from '../vendor/vela/src/state/document';

const paneWeights = Object.create(null) as Record<string, unknown>;
paneWeights.price = 3;
paneWeights['study:rsi'] = 1.75;
paneWeights['study:macd'] = 2;
paneWeights.zero = 0;
paneWeights.negative = -1;
paneWeights.tooLarge = 101;
paneWeights.notFinite = Number.POSITIVE_INFINITY;
paneWeights.asString = '2';
paneWeights['__proto__'] = 7;
paneWeights.constructor = 4;
paneWeights.prototype = 5;
paneWeights['x'.repeat(181)] = 2;

const source = {
  version: 1,
  layout: '1',
  charts: [{ id: 'c1', symbol: 'NSE:NIFTY50-INDEX', paneHeightWeights: paneWeights }],
};
const sanitized = sanitizeState(source);
assert.ok(sanitized, 'versioned workspace documents with pane weights should sanitize');
assert.deepEqual(
  { ...sanitized.charts[0]!.paneHeightWeights },
  { price: 3, 'study:rsi': 1.75, 'study:macd': 2 },
  'only bounded, finite, positive numeric weights with safe pane ids should survive',
);

const encoded = encodeState(sanitized);
const restored = decodeState(encoded);
assert.ok(restored, 'the versioned persistence codec should round-trip pane weights');
assert.deepEqual(
  { ...restored.charts[0]!.paneHeightWeights },
  { price: 3, 'study:rsi': 1.75, 'study:macd': 2 },
  'valid pane weights must survive save/reload',
);

const legacy = decodeState(JSON.stringify({ version: 1, layout: '1', charts: [{ id: 'legacy' }] }));
assert.ok(legacy, 'pre-upgrade chart documents remain loadable');
assert.equal(legacy.charts[0]!.paneHeightWeights, undefined, 'legacy documents retain default pane sizing without migration failure');

const migratedStudies = sanitizeState({
  version: 1,
  layout: '1',
  charts: [{
    id: 'legacy-linear-regression',
    indicators: {
      manifest: [],
      natives: [
        { type: 'linear-regression', inputs: { mode: 'Curve', lineColor: '#f59e0b' }, hidden: true },
        { type: 'linear-regression', inputs: { mode: 'Slope', lineColor: '#60a5fa', length: 14 } },
      ],
    },
  }],
});
assert.ok(migratedStudies, 'legacy saved studies should survive state validation');
assert.deepEqual(
  migratedStudies.charts[0]!.indicators?.natives,
  [
    { type: 'lsma', inputs: { length: 100, neutralColor: '#f59e0b' }, hidden: true },
    { type: 'linear-regression-slope', inputs: { length: 14, lineColor: '#60a5fa' } },
  ],
  'legacy Curve and Slope studies preserve mode, inputs, hidden state, and former 100-bar curve default',
);

const tooMany: Record<string, number> = Object.create(null);
for (let i = 0; i < 80; i++) tooMany[`pane-${i}`] = i + 1;
const capped = sanitizeState({ version: 1, layout: '1', charts: [{ id: 'c1', paneHeightWeights: tooMany }] });
assert.ok(capped);
assert.ok(Object.keys(capped.charts[0]!.paneHeightWeights ?? {}).length <= 64, 'persisted layouts cannot retain unbounded pane maps');

console.log('VELA_PANE_LAYOUT_PERSISTENCE_RUNTIME_OK');
