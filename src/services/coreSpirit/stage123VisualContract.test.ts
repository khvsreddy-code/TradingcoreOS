import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';

const bars = Array.from({ length: 40 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15 + i * 5)).toISOString(),
  open: 100 + i * 0.5,
  high: 102 + i * 0.5,
  low: 99 + i * 0.5,
  close: 101 + i * 0.5,
  volume: 1000 + i * 10,
}));

describe('CoreSpirit v22 rich visual contract', () => {
  const source = `
    fast = ema(close, 5)
    slow = ema(close, 12)
    plot(fast, "#22c55e", 2, 0, "Fast")
    band(fast + atr(5), fast - atr(5), "#38bdf8", 0.10)
    fill(fast, slow, "#8b5cf6", 0.08)
    gradient(highest(close, 10), lowest(close, 10), "#22c55e", "#8b5cf6", 0.08)
    box(time[10], time, highest(high, 10), lowest(low, 10), "#2563eb", "#60a5fa", 0.10, "hatch")
    arrow(time[5], low[5], time, high, "#f59e0b", 2)
    shape(low, "arrowUp", "#22c55e", 10, "BUY")
  `;

  it('compiles all rich visual primitives', () => {
    const result = compileCoreSpirit(source, 'visual-test');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.ir?.entry.instructions.some(x => x.op === 'emit' && x.kind === 'gradient')).toBe(true);
    expect(result.ir?.entry.instructions.some(x => x.op === 'emit' && x.kind === 'box')).toBe(true);
    expect(result.ir?.entry.instructions.some(x => x.op === 'emit' && x.kind === 'arrow')).toBe(true);
    expect(result.ir?.entry.instructions.some(x => x.op === 'emit' && x.kind === 'shape')).toBe(true);
  });

  it('emits renderer-independent visual objects', () => {
    const result = executeCoreSpirit(source, bars, 'visual-test');
    expect(result.diagnostics.filter(d => !d.startsWith('bar'))).toHaveLength(0);
    expect(result.outputs.some(x => x.kind === 'series')).toBe(true);
    expect(result.outputs.some(x => x.kind === 'band')).toBe(true);
    expect(result.outputs.some(x => x.kind === 'box')).toBe(true);
    expect(result.outputs.some(x => x.kind === 'arrow')).toBe(true);
    expect(result.outputs.some(x => x.kind === 'shape')).toBe(true);
  });
});
