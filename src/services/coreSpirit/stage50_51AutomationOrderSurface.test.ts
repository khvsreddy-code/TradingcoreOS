import { normalizeCoreSpiritAutomationSource } from './automationSurface';
import { normalizeCoreSpiritSource, describeCoreSpiritSurface } from './surfaceForms';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { CORE_SPIRIT_LANGUAGE_CONCEPTS } from './languageConcepts';
import { CoreSpiritAutomationOrchestrator } from './automationPipeline';
import { createAutomationLifecycle, transitionAutomationLifecycle } from './automationLifecycle';

function assertIncludes(text: string, fragment: string, message: string) {
  if (!text.includes(fragment)) throw new Error(message + `\nExpected: ${fragment}\nActual:\n${text}`);
}

function contextTimestamp() { return 1780000000000; }

export async function runStage50_51AutomationOrderSurfaceContract() {
  const source = `
automate "Momentum":
  when long:
    order long 1% risk
    stop 1.5 atr
    target 3 atr

  when "FLAT":
    order:
      side: exit
      quantity: all
`;
  const normalizedAutomation = normalizeCoreSpiritAutomationSource(source);
  assertIncludes(normalizedAutomation, 'order("long", "risk", 1, 1.5 * atr(14), 3 * atr(14));', 'risk order did not collect stop/target modifiers');
  assertIncludes(normalizedAutomation, 'order("exit", "all", 0, null, null);', 'exit-all order did not lower to universal intent');

  const normalized = normalizeCoreSpiritSource(source);
  if (/\bentry\s*\(|\bexit\s*\(|\bbuy\s*\(|\bsell\s*\(/i.test(normalized)) throw new Error('canonical AUTOMATE surface unexpectedly lowered to legacy action concepts');
  const parsed = new CoreSpiritParser(normalized).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d => d.message).join('; '));
  const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'stage50_51:automation', { layer: 'automation', surface: describeCoreSpiritSurface(source) });
  if (!compiled.ir) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  const orderEmits = compiled.ir.entry.instructions.filter(i => i.op === 'emit' && i.kind === 'orderIntent');
  if (orderEmits.length !== 2) throw new Error(`expected 2 canonical orderIntent emits, got ${orderEmits.length}`);

  const runtime = new CoreSpiritRuntime({ sourceId:'stage50_51:automation', layer:'automation', executionMode:'historical', eventResolver:name => name === 'LONG' });
  runtime.loadProgram({ version:1, id:'stage50_51:automation', source:normalized, ast:parsed.ast, surface:describeCoreSpiritSurface(source) });
  const outputs = runtime.executeBar({ timestamp:'2026-09-27T09:00:00Z', open:100, high:102, low:99, close:101, volume:1000 }).outputs;
  const intent = outputs.find(output => output.kind === 'orderIntent');
  if (!intent || intent.kind !== 'orderIntent') throw new Error('canonical order did not create an order intent');
  if (intent.side !== 'long' || intent.sizing?.kind !== 'riskPercent' || intent.sizing.value !== 1) throw new Error('risk order intent shape is incorrect');
  if (!('sizing' in intent) || intent.sizing?.kind !== 'riskPercent') throw new Error('canonical intent lost sizing semantics');
  const compiledOrder = compiled.ir.entry.instructions.find(i => i.op === 'emit' && i.kind === 'orderIntent');
  if (!compiledOrder || compiledOrder.op !== 'emit' || compiledOrder.args.length < 6) throw new Error('canonical order intent did not retain stop/target operands in IR');

  const lifecycle0 = createAutomationLifecycle('stage50_51-live', Date.now());
  const lifecycle1 = transitionAutomationLifecycle(lifecycle0, 'VALIDATE', 'user', 'validated', lifecycle0.history[0]?.timestamp + 1 || Date.now());
  const lifecycle2 = transitionAutomationLifecycle(lifecycle1, 'ENTER_PAPER', 'user', 'paper', lifecycle1.history.at(-1)!.timestamp + 1);
  const lifecycle3 = transitionAutomationLifecycle(lifecycle2, 'ARM', 'user', 'armed', lifecycle2.history.at(-1)!.timestamp + 1);
  const lifecycle4 = transitionAutomationLifecycle(lifecycle3, 'ACTIVATE_LIVE', 'user', 'live', lifecycle3.history.at(-1)!.timestamp + 1);
  let riskSawSizing = false;
  let submittedSide = '';
  const orchestrator = new CoreSpiritAutomationOrchestrator(
    { evaluate: async order => { riskSawSizing = order.sizing?.kind === 'riskPercent' && order.sizing.value === 1; return { orderIntentId: order.id, allowed: true, reason: 'risk budget available', approvedQuantity: 2 }; } },
    { authorize: async () => ({ allowed: true, policyId: 'stage50_51', reason: 'policy allowed' }) },
    { submit: async request => { submittedSide = request.side; return { accepted: true, executionId: 'stage50_51:execution' }; } },
    { allowLiveExecution: true, maxQuantityPerIntent: 10, automationId: 'stage50_51-live', lifecycle: lifecycle4 },
  );
  const automationResult = await orchestrator.handleRuntimeOrderIntent(intent, 'NSE:NIFTY50', contextTimestamp(), 'NSE:NIFTY50:position');
  if (!riskSawSizing || submittedSide !== 'buy' || !automationResult.execution?.accepted) throw new Error('canonical order did not traverse the risk/policy/execution authority chain');

  const automationMeta = describeCoreSpiritSurface(source).declarations.find(d => d.kind === 'automation');
  if (!automationMeta || automationMeta.kind !== 'automation' || automationMeta.triggers.length !== 2) throw new Error('automation declaration metadata regressed');

  if (!lifecycle4 || !CORE_SPIRIT_LANGUAGE_CONCEPTS.includes('AUTOMATE')) throw new Error('automation concept/lifecycle contract missing');

  console.log('STAGE50_51_AUTOMATION_ORDER_SURFACE_OK');
  return 'STAGE50_51_AUTOMATION_ORDER_SURFACE_OK';
}

runStage50_51AutomationOrderSurfaceContract().catch(error => { throw error; });
