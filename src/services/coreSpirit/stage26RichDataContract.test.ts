import { compileCoreSpirit, makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import { getCoreSpiritEditorSnapshot, getCoreSpiritHover } from './languageService';

const bars = Array.from({ length: 8 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, i)).toISOString(),
  open: 100+i, high: 102+i, low: 99+i, close: 101+i, volume: 1000+i*10,
}));

describe('CoreSpirit v26 rich data / granular execution contract', () => {
  it('exposes quote, intrabar and footprint row data without giving the VM network access', () => {
    const source = `
      b = bid()
      a = ask()
      rows = footprintRows()
      r = footprintRowDelta(0)
      n = intrabarCount("1")
      d = intrabarDelta("1")
      plot(b)
      plot(a)
      plot(r)
      plot(d)
    `;
    const compiled = compileCoreSpirit(source, 'v26-data');
    expect(compiled.diagnostics.filter(d => d.severity==='error')).toHaveLength(0);
    const runtime = new CoreSpiritRuntime({ dataResolver: {
      market: () => ({ bid:100, ask:101, spread:1, mid:100.5 }),
      intrabars: () => [{timestamp:1,close:100,volume:10,delta:2},{timestamp:2,close:101,volume:12,delta:-1}],
      footprint: () => ({timestamp:2,buyVolume:70,sellVolume:50,delta:20,rows:[{price:100,buyVolume:40,sellVolume:20,delta:20,totalVolume:60}]})
    }});
    const result=runtime.executeIr(compiled.ir!, bars);
    expect(result.diagnostics.filter(x=>!x.startsWith('bar'))).toHaveLength(0);
    expect(result.outputs.filter(x=>x.kind==='series').length).toBeGreaterThan(0);
  });

  it('supports historical tick execution and editor snapshots', () => {
    const source='plot(close);';
    const runtime=new CoreSpiritRuntime({ executionMode:'historicalTick' });
    runtime.loadProgram(makeCoreSpiritProgram(source,'v26-ticks'));
    const results=runtime.executeHistoricalTicks([
      {timestamp:Date.now(),price:101,volume:2},
      {timestamp:Date.now()+1,price:102,volume:3},
    ], bars[0]);
    expect(results).toHaveLength(2);
    expect(results[0].state.barState.isConfirmed).toBe(true);
    const snapshot=getCoreSpiritEditorSnapshot('let x = ema(close, 20)\nplot(x)');
    expect(snapshot.formatted).toContain('plot(x)');
    expect(snapshot.tokens.length).toBeGreaterThan(0);
    expect(getCoreSpiritHover('footprintRowDelta')?.detail).toContain('market');
  });
});
