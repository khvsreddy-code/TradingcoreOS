import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritVisualDebuggerSession } from './visualDebugger';
import { CoreSpiritAutomationExplainabilityStore, buildAutomationExplanationRecord } from './explainability';
import { createExecutionAuthority, appendExecutionAuthorityRecord, validateExecutionAuthority } from './executionAuthority';
import { CoreSpiritAutomationOrchestrator } from './automationPipeline';

(async () => {
const source = `
let fast = ema(close, 3)
let slow = ema(close, 5)
let r = rsi(close, 5)
let trend = fast > slow
plot fast
plot slow
if crossover(fast, slow) and r > 50 {
  signal "LONG"
}
`;

const compiler = new CoreSpiritCompiler();
const compiled = compiler.compile(parseCoreSpirit(source), 'stage71', { layer: 'script' });
if (!compiled.ir || !compiled.artifact) throw new Error('stage71 compiler failed');

const bars = [
  { timestamp:'2026-09-26T10:00:00.000Z', open:100, high:101, low:99, close:100, volume:1000 },
  { timestamp:'2026-09-26T10:01:00.000Z', open:100, high:102, low:99, close:101, volume:1100 },
  { timestamp:'2026-09-26T10:02:00.000Z', open:101, high:104, low:100, close:103, volume:1400 },
  { timestamp:'2026-09-26T10:03:00.000Z', open:103, high:106, low:102, close:105, volume:1600 },
  { timestamp:'2026-09-26T10:04:00.000Z', open:105, high:108, low:104, close:107, volume:1800 },
];

const debuggerSession = new CoreSpiritVisualDebuggerSession({
  artifact: compiled.artifact,
  bars,
  symbol: 'NIFTY',
  timeframe: '1m',
  sourceText: source,
});
const snapshot = debuggerSession.inspectBar(4);
if (snapshot.selectedBarIndex !== 4) throw new Error('visual debugger selected wrong bar');
if (!snapshot.frames[0]?.ir || snapshot.executionPath.length < 4 || snapshot.frames[0].state.length < 6) throw new Error('visual debugger did not capture IR/state');
if (!snapshot.sourceHighlight?.line) throw new Error('visual debugger did not resolve source highlight');
if (!snapshot.traceChecksum) throw new Error('visual debugger trace checksum missing');

const authority = createExecutionAuthority({
  intentId:'intent:71', sourceId:'strategy:71', sourceLayer:'strategy', automationId:'auto:71', lifecycleState:'LIVE', side:'buy', quantity:1, createdAt:1,
});
const riskApproved = appendExecutionAuthorityRecord(authority, { stage:'RISK', disposition:'RISK_APPROVED', timestamp:2, reason:'risk approved', actor:'risk-engine' });
const policyApproved = appendExecutionAuthorityRecord(riskApproved, { stage:'POLICY', disposition:'READY_FOR_EXECUTION', timestamp:3, reason:'policy approved', actor:'policy-engine' });
const submitted = appendExecutionAuthorityRecord(policyApproved, { stage:'EXECUTION', disposition:'SUBMITTED', timestamp:4, reason:'host accepted', actor:'execution-host' });
if (validateExecutionAuthority(submitted).length) throw new Error('authority path should be explainable and valid');

const store = new CoreSpiritAutomationExplainabilityStore();
const record = buildAutomationExplanationRecord({
  automationId:'auto:71', intentId:'intent:71', eventId:'event:71', signalId:'signal:71', sourceId:'strategy:71', programChecksum:compiled.artifact.checksum,
  symbol:'NIFTY', timeframe:'1m', barIndex:4, timestamp:new Date(bars[4].timestamp).getTime(),
  decisionTrace:[{ id:'risk', stage:'RISK', status:'APPROVED', label:'Risk engine', reason:'risk approved' }],
  finalDecision:{ label:'Execution', status:'SUBMITTED', reason:'host accepted' }, authorityChecksum: 'authority:71',
});
store.record(record);
if (store.get('intent:71')?.explanationChecksum !== record.explanationChecksum) throw new Error('automation explanation was not stored');

const orchestrator = new CoreSpiritAutomationOrchestrator(
  { evaluate: () => ({ orderIntentId: 'intent:orch', allowed: true, reason: 'risk approved', approvedQuantity: 1 }) },
  { authorize: async () => ({ allowed: true, policyId: 'policy:test', reason: 'policy approved' }) },
  { submit: async () => ({ accepted: false, reason: 'test execution host' }) },
  { allowLiveExecution: false, maxQuantityPerIntent: 5, automationId: 'auto:orchestrator' },
);
const automationResult = await orchestrator.handleStrategyEvent({
  id:'event:orch', strategyId:'strategy:orch', kind:'entry', direction:'long', positionId:'pos:orch', barIndex:4,
  timestamp:new Date(bars[4].timestamp).getTime(), symbol:'NIFTY', timeframe:'1m', reason:'LONG signal', metadata:{ programChecksum: compiled.artifact.checksum },
}, 1, 10);
if (!orchestrator.getExplainability(automationResult.intent.id)) throw new Error('automation result was not retained in explainability store');

console.log('STAGE71_72_AUTOMATION_EXPLAINABILITY_VISUAL_DEBUGGER_OK');

})().catch(error => { console.error(error); throw error; });
