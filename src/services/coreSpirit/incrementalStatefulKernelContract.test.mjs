import assert from 'node:assert/strict';
import { ema, rma } from './numericalKernels.ts';
import { CoreSpiritIncrementalSmoother, compareCoreSpiritSmootherToBatch } from './incrementalStatefulKernel.ts';

const close = (a, b, eps = 1e-10) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return;
  assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `expected ${b}, received ${a}`);
};

// Deterministic randomized and adversarial histories exercise warmup, gaps,
// large price levels, negative values, and repeated values.
let seed = 0x51f15e;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
for (const kind of ['ema', 'rma']) {
  for (const period of [1, 2, 5, 20]) {
    for (let trial = 0; trial < 30; trial++) {
      const values = Float64Array.from({ length: 1 + Math.floor(random() * 180) }, (_, i) => {
        if (trial % 5 === 0 && i % 31 === 12) return Number.NaN;
        if (trial % 7 === 0 && i % 29 === 11) return Number.POSITIVE_INFINITY;
        if (trial % 3 === 0) return 1e9 + (random() - 0.5) * 0.01;
        return (random() - 0.5) * 100;
      });
      assert.equal(compareCoreSpiritSmootherToBatch(kind, period, values).equal, true, `${kind} parity period=${period} trial=${trial}`);
    }
  }
}

// A forming bar can be replaced repeatedly without being treated as new data.
for (const kind of ['ema', 'rma']) {
  const period = 4;
  const committed = [10, 12, 11, 14, 13, 15];
  const smoother = new CoreSpiritIncrementalSmoother(kind, period);
  const reference = kind === 'ema' ? ema : rma;
  for (let i = 0; i < committed.length - 1; i++) close(smoother.update(i, committed[i], true), reference(committed.slice(0, i + 1), period)[i]);
  const formingIndex = committed.length - 1;
  for (const replacement of [15, 17, 12, 19, 16]) {
    committed[formingIndex] = replacement;
    close(smoother.update(formingIndex, replacement, false), reference(committed.slice(0, formingIndex + 1), period)[formingIndex]);
  }
  const checkpoint = smoother.snapshot();
  const restored = new CoreSpiritIncrementalSmoother(kind, period);
  restored.restore(checkpoint);
  committed[formingIndex] = 18;
  close(restored.update(formingIndex, 18, true), reference(committed, period)[formingIndex]);
  const appended = 20;
  committed.push(appended);
  close(restored.update(committed.length - 1, appended, true), reference(committed, period).at(-1));
  assert.deepEqual(Array.from(restored.replay(committed)), Array.from(reference(committed, period)), `${kind} replay/reset parity`);
}

// Dataset reset, session-like invalid gaps, and invalid checkpoint rejection.
const gap = [1, 2, Number.NaN, 5, 7, Number.POSITIVE_INFINITY, 8, 9];
for (const kind of ['ema', 'rma']) {
  const result = compareCoreSpiritSmootherToBatch(kind, 3, gap);
  assert.equal(result.equal, true);
  const smoother = new CoreSpiritIncrementalSmoother(kind, 3);
  smoother.replay([100, 101, 102]);
  smoother.reset();
  assert.deepEqual(Array.from(smoother.replay([1, 2, 3])), Array.from((kind === 'ema' ? ema : rma)([1, 2, 3], 3)));
  assert.throws(() => smoother.restore({ ...smoother.snapshot(), period: 0 }), /checkpoint/);
}

assert.throws(() => new CoreSpiritIncrementalSmoother('ema', 0), /period/);
console.log('CoreSpirit incremental stateful kernel contract: OK');
