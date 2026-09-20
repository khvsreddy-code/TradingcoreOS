import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';

const bars = Array.from({ length: 25 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, i)).toISOString(),
  open: 100 + i * 0.2, high: 102 + i * 0.2, low: 99 + i * 0.2, close: 101 + i * 0.25, volume: 1000 + i * 20,
}));

describe('CoreSpirit v24 model + automation contract', () => {
  const source = `
    fast = ema(close, 5)
    momentum = change(close, 3)
    p = predict(-1.2, momentum, 0.25, rsi(close, 5), 0.015)
    plot(p, "#a78bfa", 2, 0, "Prediction")
    if p > 0.65 {
      entry(true, "long", p, close - atr(5), close + atr(5), "MODEL-LONG")
      label("MODEL", "above", "#7c3aed", "#fff", 11, "pill", "700", "normal")
    }
    if p < 0.35 { exit(true, "MODEL-EXIT") }
  `;

  it('compiles custom prediction and entry/exit intents', () => {
    const result = compileCoreSpirit(source, 'model-v24');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const kinds = result.ir?.entry.instructions.filter(x => x.op === 'emit').map(x => x.kind) || [];
    expect(kinds).toEqual(expect.arrayContaining(['entry','exit','label','plot']));
  });

  it('executes predictions without granting the VM direct broker access', () => {
    const result = executeCoreSpirit(source, bars, 'model-v24');
    expect(result.diagnostics.filter(d => !d.startsWith('bar'))).toHaveLength(0);
    const intents = result.outputs.filter(x => x.kind === 'orderIntent');
    expect(intents.length).toBeGreaterThan(0);
    expect(intents.every(x => x.kind === 'orderIntent' && x.confidence >= 0 && x.confidence <= 1)).toBe(true);
  });
});
