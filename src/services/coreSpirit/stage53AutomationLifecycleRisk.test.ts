import { parseCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { createAutomationLifecycle, transitionAutomationLifecycle } from './automationLifecycle';
import { CoreSpiritAutomationOrchestrator } from './automationPipeline';
import type { CoreSpiritStrategyEvent } from './strategyContract';

(async () => {

const compiler = new CoreSpiritCompiler();

const scriptCompile = compiler.compile(parseCoreSpirit('buy(1)'), 'script-buy', { layer: 'script' });
if (!scriptCompile.diagnostics.some(d => d.code === 'CAPABILITY_ORDER_INTENTS')) {
  throw new Error('script layer allowed buy(); indicator/script must stop at signal boundary');
}

const automationCompile = compiler.compile(parseCoreSpirit('buy(2, "entry", 0.9)'), 'automation-buy', { layer: 'automation' });
if (!automationCompile.ir) throw new Error('automation buy() should compile into stable IR');

const runtime = new CoreSpiritRuntime({ sourceId: 'automation-buy', layer: 'automation', executionMode: 'historical' });
runtime.loadProgram({ version: 1, id: 'automation-buy', source: 'buy(2, "entry", 0.9)', ast: parseCoreSpirit('buy(2, "entry", 0.9)') });
const outputs = runtime.executeBar({
  timestamp: '2026-09-26T10:00:00.000Z',
  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 1000,
}).outputs;
const intent = outputs.find(x => x.kind === 'orderIntent');
if (!intent || intent.kind !== 'orderIntent' || intent.side !== 'long') throw new Error('automation buy() must create an order intent, not a broker order');

let lifecycle = createAutomationLifecycle('stage53', 1);
lifecycle = transitionAutomationLifecycle(lifecycle, 'VALIDATE', 'user', 'validated', 2);
lifecycle = transitionAutomationLifecycle(lifecycle, 'ENTER_PAPER', 'user', 'paper', 3);

const executionCount = { value: 0 };
const event: CoreSpiritStrategyEvent = {
  id: 'event:53', strategyId: 'stage53', kind: 'entry', direction: 'long', positionId: 'stage53:long',
  barIndex: 1, timestamp: 4, symbol: 'TEST', timeframe: '1m', reason: 'contract test',
};

const paperAutomation = new CoreSpiritAutomationOrchestrator(
  { evaluate: async intent => ({ orderIntentId: intent.id, allowed: true, reason: 'risk ok', approvedQuantity: 1 }) },
  { authorize: async () => ({ allowed: true, policyId: 'paper', reason: 'policy ok' }) },
  { submit: async () => { executionCount.value++; return { accepted: true, executionId: 'exec:53' }; } },
  { allowLiveExecution: true, maxQuantityPerIntent: 10, automationId: 'stage53', lifecycle },
);
const paperResult = await paperAutomation.handleStrategyEvent(event, 1, 5);
if (paperResult.execution) throw new Error('PAPER lifecycle must not submit a broker execution');
if (executionCount.value !== 0) throw new Error('risk/policy boundary leaked execution in PAPER');

lifecycle = transitionAutomationLifecycle(lifecycle, 'ARM', 'user', 'ready', 6);
lifecycle = transitionAutomationLifecycle(lifecycle, 'ACTIVATE_LIVE', 'user', 'explicit live activation', 7);
const liveAutomation = new CoreSpiritAutomationOrchestrator(
  { evaluate: async intent => ({ orderIntentId: intent.id, allowed: true, reason: 'risk ok', approvedQuantity: 1 }) },
  { authorize: async () => ({ allowed: true, policyId: 'live-policy', reason: 'policy ok' }) },
  { submit: async () => { executionCount.value++; return { accepted: true, executionId: 'exec:53-live' }; } },
  { allowLiveExecution: true, maxQuantityPerIntent: 10, automationId: 'stage53', lifecycle },
);
const liveResult = await liveAutomation.handleStrategyEvent(event, 1, 8);
if (!liveResult.execution?.accepted) throw new Error('LIVE lifecycle should permit execution after risk and policy approval');
if (Number(executionCount.value) !== 1) throw new Error('execution gateway should be called exactly once after approval');

const armedForSystemCheck = transitionAutomationLifecycle(transitionAutomationLifecycle(createAutomationLifecycle('stage53-system', 9), 'VALIDATE', 'user', 'validated', 10), 'ARM', 'user', 'ready', 11);
try {
  transitionAutomationLifecycle(armedForSystemCheck, 'ACTIVATE_LIVE', 'system', 'forbidden live activation', 12);
  throw new Error('system actor was allowed to activate LIVE');
} catch (error) {
  if (!String(error).includes('explicit user or policy actor')) throw error;
}

console.log('STAGE53_AUTOMATION_LIFECYCLE_RISK_OK');
})().catch(error => { console.error(error); throw error; });
