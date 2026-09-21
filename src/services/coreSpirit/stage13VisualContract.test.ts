import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const source = `
fast = ema(close, 3)
plot(fast, "#22c55e", 3, 0, "Fast")
label("BUY", "below", "#16a34a", "#ffffff", 12, "pill")
labelAt(high, "HIGH", "price", "#111827", "#ffffff", 11, "box")
`;

const parsed = new CoreSpiritParser(source).parseDetailed();
if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(x => x.message).join('; '));
const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'visual-contract');
if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));

const bars: HistoricalCandle[] = Array.from({length: 6}, (_, i) => ({
  timestamp: String(1700000000 + i * 300), open: 100+i, high: 102+i, low: 99+i, close: 101+i, volume: 1000+i,
}));
const runtime = new CoreSpiritRuntime({sourceId:'visual-contract', symbol:'NIFTY', timeframe:'5m'});
const result = runtime.executeIr(compiled.ir, bars);
if (!result.outputs.some(o => o.kind === 'series')) throw new Error('plot output missing');
if (!result.outputs.some(o => o.kind === 'label')) throw new Error('label output missing');
