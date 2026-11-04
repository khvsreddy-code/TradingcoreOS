import assert from 'node:assert/strict';

import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { classifyCoreSpiritValueKind } from './services/coreSpirit/coreSpiritExecutionModel.ts';
import { analyzeCoreSpiritAuthoringSource, detectCoreSpiritAuthoringLevel } from './services/coreSpirit/coreSpiritAuthoring.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritColumnarHistory } from './services/coreSpirit/columnarMarketData.ts';
import { createTcoVelaTerminalOptions, TCO_VELA_TERMINAL_TOPOLOGY } from './services/core/chart/tcoVelaTerminal.ts';
import { createTcoVelaDataProvider } from './TcoVelaDataProvider.ts';

assert.equal(TCO_VELA_TERMINAL_TOPOLOGY.shell, 'VelaWorkspace');
assert.ok(TCO_VELA_TERMINAL_TOPOLOGY.sharedSurface.includes('topbar'));
assert.ok(!TCO_VELA_TERMINAL_TOPOLOGY.sharedSurface.includes('bottombar'));

const velaOptions = createTcoVelaTerminalOptions({
  layout:'4',
  symbol:'NSE:NIFTY50-INDEX',
  timeframe:'5',
  storage: undefined,
  createDataProvider: createTcoVelaDataProvider,
  createCoreSpiritEngine: () => { throw new Error('contract-only factory must not be invoked'); },
  resolveIndicatorManifest: () => [],
});
assert.equal(velaOptions.bottombar, false);
assert.equal(velaOptions.defaultLanguage, 'corespirit');
assert.equal(velaOptions.live, true);

const engine = new CoreSpiritVelaEngine();
assert.deepEqual(engine.capabilities, {
  streaming:true,
  visibleRange:true,
  inputs:true,
  props:true,
});

const columnar = new CoreSpiritColumnarHistory();
columnar.append({
  timestamp:'2026-10-08T09:15:00Z',
  open:100,
  high:101,
  low:99,
  close:100.5,
  volume:1000,
});
columnar.replaceLast({
  timestamp:'2026-10-08T09:15:00Z',
  open:100,
  high:102,
  low:99,
  close:101.5,
  volume:1200,
});
assert.equal(columnar.length, 1);
assert.equal(columnar.close[0], 101.5);
assert.equal(columnar.volume[0], 1200);

for (const [type, expected] of [
  ['series<float>', 'series'],
  ['feature<number>', 'feature'],
  ['featureSet<number>', 'featureSet'],
  ['prediction<number>', 'prediction'],
  ['forecast<number>', 'forecast'],
  ['distribution<number>', 'distribution'],
  ['modelArtifact<number>', 'modelArtifact'],
  ['trainingData<number>', 'trainingData'],
  ['experiment<number>', 'experiment'],
  ['dataset<number>', 'dataset'],
  ['order-intent', 'order-intent'],
]) assert.equal(classifyCoreSpiritValueKind(type), expected);

assert.equal(detectCoreSpiritAuthoringLevel('order("long", 1)'), 'trader');
assert.equal(detectCoreSpiritAuthoringLevel('model alpha: XGBoost<float> {\n    inputs: close\n    target: forward_return(close, 3)\n}'), 'quant');
assert.equal(analyzeCoreSpiritAuthoringSource(`requires market.tick, automation\non market.tick:\n    signal "TICK"\nautomate "notify":\n    automation.notify("tick")`, 'automation').level, 'system');

const beginner = compileCoreSpirit(`
indicator "EMA Cross"
fast = ema(close, 20)
slow = ema(close, 50)
when fast crossesAbove slow:
    show line(fast)
`, 'architecture-beginner');
assert.ok(!beginner.diagnostics.some(item => item.severity === 'error'), beginner.diagnostics.map(item => item.message).join('; '));
assert.equal(beginner.ir?.language, 'CoreScript');
assert.equal(beginner.ir?.authoringLevel, 'beginner');

const trader = compileCoreSpirit(`
indicator "Strategy"
fast = ema(close, 20)
slow = ema(close, 50)
when fast crossesAbove slow:
    order("long", 1)
`, 'architecture-trader', { layer:'strategy' });
assert.ok(!trader.diagnostics.some(item => item.severity === 'error'), trader.diagnostics.map(item => item.message).join('; '));
assert.equal(trader.ir?.authoringLevel, 'trader');

const systemMissing = compileCoreSpirit(`
on market.tick:
    signal "TICK"
`, 'architecture-system-missing', { layer:'automation' });
assert.ok(systemMissing.diagnostics.some(item => item.severity === 'error' && item.code === 'CAPABILITY_REQUIRED'));

const system = compileCoreSpirit(`
requires market.tick, automation
on market.tick:
    signal "TICK"
automate "notify":
    automation.notify("tick")
`, 'architecture-system', { layer:'automation' });
assert.ok(!system.diagnostics.some(item => item.severity === 'error'), system.diagnostics.map(item => item.message).join('; '));
assert.equal(system.ir?.authoringLevel, 'system');
assert.equal(system.ir?.languagePolicy?.language, 'CoreScript');
assert.ok(system.ir?.requiredCapabilities?.includes('market.tick'));
assert.ok(system.ir?.requiredCapabilities?.includes('automation'));

const runtime = new CoreSpiritRuntime({
  symbol:'NSE:NIFTY50-INDEX',
  timeframe:'5m',
  sourceId:'architecture-runtime',
});
if (!beginner.ir) throw new Error('Beginner CoreScript did not produce executable IR.');
runtime.loadIr(beginner.ir);
runtime.executeIr(beginner.ir, [
  {timestamp:'2026-10-08T09:15:00Z',open:100,high:101,low:99,close:100,volume:1000},
  {timestamp:'2026-10-08T09:20:00Z',open:100,high:102,low:99,close:101,volume:1100},
]);
assert.ok(runtime.getKernelStateSnapshots().length >= 1);

const runtimeSystem = new CoreSpiritRuntime({
  symbol:'NSE:NIFTY50-INDEX',
  timeframe:'5m',
  sourceId:'architecture-system-runtime',
  layer:'automation',
  executionTarget:'automation',
});
if (!system.ir) throw new Error('System automation CoreScript did not produce executable IR.');
runtimeSystem.loadIr(system.ir);

console.log('CORESPIRIT_ARCHITECTURE_1_TO_8_PRODUCTION_CONTRACT_OK');
