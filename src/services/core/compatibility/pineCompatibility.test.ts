import { translatePineToCoreSpirit } from './pineCompatibility';
import { CoreSpiritRuntime } from '../../coreSpirit/runtime';

const sample = `
//@version=5
indicator("CoreTrend", overlay=true)
length = input.int(14, "Length")
ema = ta.ema(close, length)
fast = ta.sma(close, 5)
plot(ema, title="EMA", color=color.blue)
plotshape(ta.crossover(close, ema), title="Cross")
alertcondition(ta.crossunder(close, ema), title="Down", message="cross")
`;

const result = translatePineToCoreSpirit(sample, 'pine-compat-test');
if (!result.supported) throw new Error(`Pine translation failed: ${result.diagnostics.map(d => d.message).join('; ')}`);
if (!result.program || !result.compilation?.ir) throw new Error('Translated Pine did not produce CoreSpirit program/IR');
if (!result.normalizedSource.includes('let length = 14')) throw new Error('input.int default was not translated');
if (result.normalizedSource.includes('ta.')) throw new Error('Pine namespace remained after normalization');

const rejected = translatePineToCoreSpirit('//@version=5\nstrategy("x")\nstrategy.entry("L", strategy.long)', 'pine-reject-test');
if (rejected.supported || !rejected.diagnostics.some(d => /strategy scripts/.test(d.message))) throw new Error('Unsupported strategy Pine was not rejected');

const runtimeSource = `//@version=5
indicator("Cross")
fast = ta.sma(close, 2)
plotshape(ta.crossover(close, fast))`;
const runtimeTranslation = translatePineToCoreSpirit(runtimeSource, 'pine-runtime-test');
if (!runtimeTranslation.program) throw new Error('Runtime translation missing program');
const runtime = new CoreSpiritRuntime({ sourceId: 'pine-runtime-test' });
runtime.loadProgram(runtimeTranslation.program);
const bars = [1, 2, 1.5, 3].map((close, i) => ({ timestamp: String(1_700_000_000 + i * 60), open: close, high: close + 0.1, low: close - 0.1, close, volume: 100 }));
const execution = bars.flatMap(bar => runtime.executeBar(bar).outputs);
if (!execution.some(output => output.kind === 'marker')) throw new Error('Translated crossover did not produce a marker');

console.log('PINE_COMPATIBILITY_TEST=PASS');
