import { compileCoreSpirit, makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import { getCoreSpiritCompletions, getCoreSpiritSignature, formatCoreSpiritSource } from './languageService';
import { buildCoreSpiritFootprint } from './footprintAdapter';

const bars = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, i)).toISOString(),
  open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100.5 + i * 0.12, volume: 1000 + i * 10,
}));

describe('CoreSpirit v25 data/execution/editor contract', () => {
  it('compiles richer data and footprint primitives', () => {
    const source = `
      ext = request("NSE:NIFTY", "5", "close")
      micro = lowerTf("1", "close")
      delta = footprintDelta()
      imbalance = depthImbalance()
      plot(delta)
      if imbalance > 0.5 { signal("DEPTH") }
    `;
    const result = compileCoreSpirit(source, 'data-v25');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.ir?.entry.instructions.filter(x => x.op === 'call').map(x => x.name)).toEqual(expect.arrayContaining(['request','lowerTf','footprintDelta','depthImbalance']));
  });

  it('uses host-provided cross-symbol and footprint data without network access in the VM', () => {
    const source = `
      ext = request("NSE:NIFTY", "5", "close")
      d = footprintDelta()
      p = predict(-0.1, ext, 0.01, d, 0.02)
      plot(p)
    `;
    const program = compileCoreSpirit(source, 'data-v25').ir!;
    const runtime = new CoreSpiritRuntime({ sourceId:'data-v25', symbol:'NSE:NIFTY', timeframe:'5', dataResolver: {
      request: () => ({ value: 123.4, source: 'test', symbol: 'NSE:NIFTY', timeframe: '5' }),
      footprint: () => ({ timestamp: Date.now(), buyVolume: 700, sellVolume: 500, delta: 200, poc: 101, vah: 102, val: 99, rows: [{ price:101, buyVolume:700, sellVolume:500 }] }),
    }});
    const result = runtime.executeIr(program, bars);
    expect(result.diagnostics.filter(d => !d.startsWith('bar'))).toHaveLength(0);
    expect(result.outputs.some(x => x.kind === 'series')).toBe(true);
  });

  it('supports granular tick execution and editor ergonomics', () => {
    const runtime = new CoreSpiritRuntime({ symbol:'NSE:NIFTY', timeframe:'1', executionMode:'realtime' });
    const compiled = compileCoreSpirit('plot(close);').ir!;
    runtime.loadProgram(makeCoreSpiritProgram('plot(close);', 'tick-v25'));
    void compiled;
    const result = runtime.executeTick({ timestamp: Date.now(), price: 101.2, volume: 10 }, bars[0]);
    expect(result.state.barState.isRealtime).toBe(true);
    expect(getCoreSpiritCompletions('footprint').map(x => x.label)).toEqual(expect.arrayContaining(['footprintDelta','footprintPoc']));
    expect(getCoreSpiritSignature('request')).toContain('request');
    expect(formatCoreSpiritSource('if true {\nplot(close)\n}')).toContain('  plot(close)');
    const footprint = buildCoreSpiritFootprint([{ timestamp: Date.now(), price: 100, volume: 10, ask: 100 }, { timestamp: Date.now()+1, price: 99, volume: 6, bid: 99 }], 1);
    expect(footprint?.delta).toBe(4);
    expect(footprint?.rows?.length).toBe(2);
  });
});
