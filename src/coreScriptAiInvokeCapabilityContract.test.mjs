import assert from 'node:assert/strict';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import {
  createCoreSpiritSandbox,
  validateCoreScriptCapabilitiesAgainstSandbox,
  validateCoreSpiritSandboxArchitecture,
} from './services/coreSpirit/capabilitySandbox.ts';
import { detectCoreSpiritAuthoringLevel } from './services/coreSpirit/coreSpiritAuthoring.ts';

const source = `
requires ai.invoke, market.tick

on market.tick:
    signal "AI_REQUEST_PENDING"
`;

const compiled = compileCoreSpirit(source, 'ai-invoke-capability-contract', { layer: 'automation' });
const errors = compiled.diagnostics.filter(item => item.severity === 'error');
assert.deepEqual(errors, [], errors.map(item => item.message).join('\n'));
assert.ok(compiled.ir, 'AI invocation source must compile to the canonical CoreScript IR');
assert.ok(compiled.artifact, 'AI invocation source must produce an integrity-bound artifact');
assert.ok(compiled.ir.requiredCapabilities.includes('ai.invoke'),
  'the compiler must derive ai.invoke from the canonical source declaration');
assert.ok(compiled.ir.requiredCapabilities.includes('market.tick'));
assert.equal(detectCoreSpiritAuthoringLevel(source), 'system',
  'ai.invoke is a system/automation surface rather than a beginner or chart-only feature');

const serverAutomation = createCoreSpiritSandbox({ layer: 'automation', target: 'server' });
assert.deepEqual(
  validateCoreScriptCapabilitiesAgainstSandbox(serverAutomation, compiled.ir.requiredCapabilities),
  [],
  'the server automation lane should permit explicitly declared ai.invoke when other capabilities are authorized',
);

const chartScript = createCoreSpiritSandbox({ layer: 'script', target: 'chart' });
assert.ok(
  validateCoreScriptCapabilitiesAgainstSandbox(chartScript, compiled.ir.requiredCapabilities)
    .some(message => message.includes("'ai.invoke'")),
  'a chart script must not get the AI invocation capability, even when its source declares it',
);

for (const target of ['replay', 'backtest', 'scanner', 'alert']) {
  const sandbox = createCoreSpiritSandbox({
    layer: target === 'backtest' ? 'strategy' : 'script',
    target,
  });
  assert.ok(
    validateCoreScriptCapabilitiesAgainstSandbox(sandbox, ['ai.invoke']).length > 0,
    'ai.invoke must be denied by the ' + target + ' target',
  );
}
assert.deepEqual(validateCoreSpiritSandboxArchitecture(), [],
  'the architecture guard must enforce the server-only AI lane');

console.log('CORESCRIPT_AI_INVOKE_CAPABILITY_CONTRACT_OK');
