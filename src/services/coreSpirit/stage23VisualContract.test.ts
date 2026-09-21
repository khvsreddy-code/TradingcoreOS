import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';

const bars = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15 + i * 5)).toISOString(),
  open: 100 + i * 0.4,
  high: 102 + i * 0.4,
  low: 99 + i * 0.4,
  close: 101 + i * 0.4,
  volume: 1000 + i * 10,
}));

describe('CoreSpirit v23 expressive visual contract', () => {
  const source = `
    fast = ema(close, 5)
    plot(fast, "#22c55e", 2, 0, "Fast")
    if crossover(close, fast) {
      shape(low, "arrowUp", "#22c55e", 10, "BUY")
      label("BUY", "below", "#16a34a", "#fff", 12, "pill", "700", "italic")
    }
    box(time[10], time, highest(high, 10), lowest(low, 10), "#2563eb", "#60a5fa", 0.10, "hatch")
    polyline(time[6], low[6], time[3], high[3], time, close, "#f59e0b", 2, "dots")
    hline(close, "#64748b", 1, 1)
    bg("#1d4ed8", 0.04)
    barcolor("#22c55e", 0.08)
    table("topRight", 0, 0, "CoreSpirit", "rgba(15,23,42,.88)", "#fff", 12)
    table("topRight", 1, 0, "Expressive", "rgba(15,23,42,.88)", "#22c55e", 11)
  `;

  it('compiles the v23 visual primitives', () => {
    const result = compileCoreSpirit(source, 'visual-v23');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const kinds = result.ir?.entry.instructions.filter(x => x.op === 'emit').map(x => x.kind) || [];
    expect(kinds).toEqual(expect.arrayContaining(['polyline','hline','bg','barcolor','table','box','shape','label']));
  });

  it('emits stable persistent objects and per-bar visuals', () => {
    const result = executeCoreSpirit(source, bars, 'visual-v23');
    expect(result.diagnostics.filter(d => !d.startsWith('bar'))).toHaveLength(0);
    const boxes = result.outputs.filter(x => x.kind === 'box');
    const polylines = result.outputs.filter(x => x.kind === 'polyline');
    const backgrounds = result.outputs.filter(x => x.kind === 'background');
    const tables = result.outputs.filter(x => x.kind === 'table');
    expect(boxes.length).toBeGreaterThan(0);
    expect(new Set(boxes.map(x => x.id)).size).toBe(1);
    expect(polylines.length).toBeGreaterThan(0);
    expect(backgrounds.length).toBe(bars.length);
    expect(tables.length).toBe(bars.length * 2);
    expect(new Set(tables.map(x => x.id)).size).toBe(2);
  });
});
