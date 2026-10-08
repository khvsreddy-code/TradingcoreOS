import assert from 'node:assert/strict';

const { CoreSpiritVelaEngine } = await import('../src/CoreSpiritVelaEngine.ts');

const engine = new CoreSpiritVelaEngine();
assert.deepEqual(engine.capabilities, {
  streaming: true,
  visibleRange: true,
  inputs: true,
  props: true,
});

const source = `indicator "EMA Cross":
  input fastLength: int = 20 min=1 max=500 step=1 title="Fast Length"
  input slowLength: int = 50 min=2 max=1000 step=1 title="Slow Length"
  precision = 2
  overlay = true
  @viewport
  plot(close)
`;

const prepared = await engine.prepare(source, 'contract:ema-cross');
assert.equal(prepared.reactsToViewport, true);
assert.equal(prepared.maxLookback ?? 0, 0);
assert.equal(prepared.inputs.length, 2);
assert.equal(prepared.inputs[0]?.key, 'fastLength');
assert.equal(prepared.inputs[0]?.type, 'int');
assert.equal(prepared.inputs[0]?.min, 1);
assert.equal(prepared.inputs[0]?.max, 500);
assert.equal(prepared.inputs[0]?.step, 1);
assert.equal(prepared.inputs[0]?.defval, 20);
assert.equal(prepared.props?.length, 2);
assert.equal(prepared.props?.find((item) => item.key === 'precision')?.defval, 2);
assert.equal(prepared.props?.find((item) => item.key === 'overlay')?.defval, true);
assert.equal(prepared.meta.title, 'EMA Cross');
assert.equal(prepared.meta.precision, 2);
assert.equal(prepared.meta.overlay, true);

const bars = Array.from({ length: 20 }, (_, index) => {
  const close = 100 + index;
  return {
    time: 1_700_000_000 + index * 300,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000 + index,
  };
});

const models = [];
const errors = [];
const session = engine.execute(
  {
    prepared,
    market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
    bars,
    mode: 'static',
    historyState: 'complete',
    inputs: { fastLength: 5, slowLength: 10 },
    props: { precision: 4, overlay: false },
  },
  {
    onModel: (model) => models.push(model),
    onError: (error) => errors.push(error),
  },
);

assert.equal(errors.length, 0);
assert.ok(models.length >= 1);
const first = models.at(-1);
assert.equal(first?.inputValues.fastLength, 5);
assert.equal(first?.inputValues.slowLength, 10);
assert.equal(first?.propValues?.precision, 4);
assert.equal(first?.propValues?.overlay, false);
assert.equal(first?.overlay, false);
assert.equal(first?.title, 'EMA Cross');

session.update({ fastLength: 3 }, { precision: 5 });
assert.equal(errors.length, 0);
const updated = models.at(-1);
assert.equal(updated?.inputValues.fastLength, 3);
assert.equal(updated?.propValues?.precision, 5);
assert.equal(updated?.propValues?.overlay, false);

const modelCountBeforeRange = models.length;
session.setVisibleRange({ left: bars[10].time * 1000, right: bars[14].time * 1000 });
assert.ok(models.length > modelCountBeforeRange);
const rangeModel = models.at(-1);
assert.equal(rangeModel?.dirty?.from, bars[10].time * 1000);
assert.equal(rangeModel?.dirty?.to, bars[14].time * 1000);
assert.ok((rangeModel?.anchorTime ?? 0) <= bars[10].time * 1000);

session.stop();
console.log('CORESPIRIT_VELA_CAPABILITIES_CONTRACT_OK');
