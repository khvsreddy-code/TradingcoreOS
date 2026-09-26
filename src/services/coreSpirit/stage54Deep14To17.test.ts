import { parseCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { CoreSpiritAutomationOrchestrator } from './automationPipeline';
import { createAutomationLifecycle, transitionAutomationLifecycle } from './automationLifecycle';
import { CoreSpiritEditorModel } from './editorModel';
import { buildSignalExplanation, CoreSpiritExplainabilityStore } from './explainability';
import { validateExecutionAuthority } from './executionAuthority';

(async () => {
  const compiler = new CoreSpiritCompiler();
  const blocked = compiler.compile(parseCoreSpirit('buy(1)'), 'indicator-buy', { layer: 'script' });
  if (!blocked.diagnostics.some(x => x.code === 'CAPABILITY_ORDER_INTENTS')) throw new Error('script buy bypassed execution boundary');
  const modelBlocked = compiler.compile(parseCoreSpirit('buy(1)'), 'model-buy', { layer: 'model' });
  if (!modelBlocked.diagnostics.some(x => x.code === 'CAPABILITY_ORDER_INTENTS')) throw new Error('model buy bypassed execution boundary');

  const automation = compiler.compile(parseCoreSpirit('buy(2, "entry", 0.9)'), 'automation-buy', { layer: 'automation' });
  if (!automation.ir) throw new Error('automation buy did not compile');
  const runtime = new CoreSpiritRuntime({ sourceId: 'automation-buy', layer: 'automation', executionMode: 'historical' });
  runtime.loadProgram({ version: 1, id: 'automation-buy', source: 'buy(2, "entry", 0.9)', ast: parseCoreSpirit('buy(2, "entry", 0.9)') });
  const out = runtime.executeBar({ timestamp: '2026-09-26T10:00:00Z', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 });
  const intent = out.outputs.find(x => x.kind === 'orderIntent');
  if (!intent || intent.kind !== 'orderIntent') throw new Error('automation buy did not create order intent');

  let lifecycle = createAutomationLifecycle('stage54', 1);
  lifecycle = transitionAutomationLifecycle(lifecycle, 'VALIDATE', 'user', 'validated', 2);
  lifecycle = transitionAutomationLifecycle(lifecycle, 'ENTER_PAPER', 'user', 'paper preview', 3);
  const calls = { executions: 0 };
  const event = { id: 'signal54', strategyId: 'stage54', kind: 'entry' as const, direction: 'long' as const, positionId: 'stage54:long', barIndex: 4, timestamp: 4, symbol: 'TEST', timeframe: '1m', reason: 'EMA crossed RSI > 50' };
  const paper = new CoreSpiritAutomationOrchestrator(
    { evaluate: intent => ({ orderIntentId: intent.id, allowed: true, reason: 'portfolio exposure 1.2%; proposed risk 0.25%', approvedQuantity: 1 }) },
    { authorize: async () => ({ allowed: true, policyId: 'paper-policy', reason: 'paper policy approved' }) },
    { submit: async () => { calls.executions++; return { accepted: true }; } },
    { allowLiveExecution: true, maxQuantityPerIntent: 10, automationId: 'stage54', lifecycle },
  );
  const paperResult = await paper.handleStrategyEvent(event, 1, 5);
  if (paperResult.execution || calls.executions !== 0) throw new Error('paper lifecycle reached broker execution');
  if (paperResult.explainability.finalDecision.status !== 'APPROVED') throw new Error('paper explainability did not preserve approval state');

  lifecycle = transitionAutomationLifecycle(lifecycle, 'ARM', 'user', 'arming', 6);
  lifecycle = transitionAutomationLifecycle(lifecycle, 'ACTIVATE_LIVE', 'user', 'explicit live activation', 7);
  const live = new CoreSpiritAutomationOrchestrator(
    { evaluate: intent => ({ orderIntentId: intent.id, allowed: true, reason: 'portfolio exposure 1.2%; proposed risk 0.25%', approvedQuantity: 1 }) },
    { authorize: async () => ({ allowed: true, policyId: 'live-policy', reason: 'policy approved' }) },
    { submit: async () => { calls.executions++; return { accepted: true, executionId: 'exec54' }; } },
    { allowLiveExecution: true, maxQuantityPerIntent: 10, automationId: 'stage54', lifecycle },
  );
  const liveResult = await live.handleStrategyEvent(event, 1, 8);
  if (!liveResult.execution?.accepted || Number(calls.executions) !== 1) throw new Error('live execution path failed');
  if (!liveResult.authority.history.some(x => x.stage === 'RISK')) throw new Error('authority history omitted risk');
  if (!liveResult.authority.history.some(x => x.stage === 'POLICY' && x.disposition === 'READY_FOR_EXECUTION')) throw new Error('authority history omitted policy approval');
  if (validateExecutionAuthority(liveResult.authority).length) throw new Error(`live authority invalid: ${validateExecutionAuthority(liveResult.authority).join('; ')}`);
  const traceStages = liveResult.explainability.decisionTrace.map(step => step.stage);
  if (!(['SIGNAL', 'LIFECYCLE', 'RISK', 'POLICY', 'EXECUTION'] as const).every(stage => traceStages.includes(stage))) throw new Error('explainability trace is missing a control-plane stage');

  const editor = new CoreSpiritEditorModel('let x = 1');
  const compile = editor.compile();
  if (!compile.ir) throw new Error('IDE editor failed its compile contract');
  const store = new CoreSpiritExplainabilityStore();
  const explanation = buildSignalExplanation({ signalId: 's54', sourceId: 'ide', runId: 'run54', symbol: 'TEST', timeframe: '1m', barIndex: 10, timestamp: 10, type: 'LONG', reason: 'EMA20 crossed EMA50', facts: [{ id: 'rsi', label: 'RSI', value: 67.2, category: 'indicator' }] });
  store.record(explanation);
  if (store.latest()?.reason !== 'EMA20 crossed EMA50') throw new Error('explainability store failed');
  console.log('STAGE54_DEEP_14_17_OK');
})().catch(error => { console.error(error); throw error; });
