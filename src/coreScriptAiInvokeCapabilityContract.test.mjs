import assert from 'node:assert/strict';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import {
  createCoreSpiritSandbox,
  validateCoreScriptCapabilitiesAgainstSandbox,
  validateCoreSpiritSandboxArchitecture,
} from './services/coreSpirit/capabilitySandbox.ts';
import { detectCoreSpiritAuthoringLevel } from './services/coreSpirit/coreSpiritAuthoring.ts';
import { buildCoreSpiritAiInvocationResult, parseCoreSpiritAiInvocationRequest, validateCoreSpiritAiInvocationResult } from './services/coreSpirit/aiInvocation.ts';

const source = `
requires ai.invoke, market.tick

on market.tick:
    signal "AI_REQUEST_PENDING"
`;

const validRequest = parseCoreSpiritAiInvocationRequest({
  source,
  artifactHash: 'a'.repeat(64),
  prompt: 'Summarize this already-available, causal feature context.',
  context: { close: 100, features: [0.1, 0.2] },
  outputTokenLimit: 128,
});
assert.equal(validRequest.outputTokenLimit, 128);

assert.equal(validRequest.context.close, 100);

const resultIdentity = {
  modelVersion: 'test-model-v1',
  artifactHash: 'a'.repeat(64),
  sourceHash: 'b'.repeat(64),
  inputFingerprint: 'c'.repeat(64),
};
const builtResult = buildCoreSpiritAiInvocationResult({
  status: 'ready',
  result: 'advisory only',
  summary: 'A bounded test result.',
  ...resultIdentity,
  createdAt: new Date(1_000).toISOString(),
});
assert.equal(validateCoreSpiritAiInvocationResult(builtResult, resultIdentity, 2_000)?.status, 'ready',
  'a correctly fingerprinted AI result should be visible while fresh');
assert.equal(validateCoreSpiritAiInvocationResult(builtResult, resultIdentity, Date.parse(builtResult.expiresAt))?.status, 'stale',
  'a ready result must become stale at its freshness boundary');
assert.equal(validateCoreSpiritAiInvocationResult({ ...builtResult, result: 'tampered' }, resultIdentity, 2_000), null,
  'result text tampering must fail its output hash');
assert.equal(validateCoreSpiritAiInvocationResult({ ...builtResult, executable: true }, resultIdentity, 2_000), null,
  'an AI response must never be upgraded into an executable artifact');
assert.equal(validateCoreSpiritAiInvocationResult(builtResult, { ...resultIdentity, artifactHash: 'd'.repeat(64) }, 2_000), null,
  'results for another compiled artifact must not be surfaced');
assert.equal(validateCoreSpiritAiInvocationResult({
  ...builtResult,
  expiresAt: new Date(Date.parse(builtResult.expiresAt) + 60_000).toISOString(),
}, resultIdentity, 2_000), null,
  'a stored result must not be able to extend its own freshness lifetime');
const futureResult = buildCoreSpiritAiInvocationResult({
  status: 'ready',
  result: 'future-dated advisory',
  summary: 'Must not be treated as fresh.',
  ...resultIdentity,
  createdAt: new Date(120_000).toISOString(),
});
assert.equal(validateCoreSpiritAiInvocationResult(futureResult, resultIdentity, 2_000), null,
  'future-dated AI results outside the allowed clock-skew window must be rejected');

assert.throws(() => parseCoreSpiritAiInvocationRequest({
  source, artifactHash: 'a'.repeat(64), prompt: 'api_key=supersecretvalue', context: {},
}), /credentials or secret values/);
assert.throws(() => parseCoreSpiritAiInvocationRequest({
  source, artifactHash: 'a'.repeat(64), prompt: 'bounded request', context: { api_key: 'supersecretvalue' },
}), /credentials or secret fields/);
assert.throws(() => parseCoreSpiritAiInvocationRequest({
  source, artifactHash: 'a'.repeat(64), prompt: 'bounded request', context: {}, outputTokenLimit: 2048,
}), /outputTokenLimit/);
assert.throws(() => parseCoreSpiritAiInvocationRequest({
  source, artifactHash: 'not-a-compiler-hash', prompt: 'bounded request', context: {},
}), /64-character compiler artifact hash/);

const compiled = compileCoreSpirit(source, 'ai-invoke-capability-contract', { layer: 'automation' });
const errors = compiled.diagnostics.filter(item => item.severity === 'error');
assert.deepEqual(errors, [], errors.map(item => item.message).join('\n'));
assert.ok(compiled.ir, 'AI invocation source must compile to the canonical CoreScript IR');
assert.ok(compiled.artifact, 'AI invocation source must produce an integrity-bound artifact');
assert.ok(compiled.ir.requiredCapabilities.includes('ai.invoke'),
  'the compiler must derive ai.invoke from the canonical source declaration');
assert.equal(compiled.ir.authoringLevel, 'system', 'the compiled authoring level must classify ai.invoke as a system capability');
assert.equal(compiled.ir.languagePolicy.level, 'system', 'compiler language policy must agree with inferred authoring level');
assert.ok(compiled.ir.languageFeatures.includes('ai-invocation'), 'the compiler must expose the explicit system AI-invocation feature');
assert.ok(compiled.ir.capabilityRequirements.some(item => item.capability === 'ai.invoke'), 'the declared async capability must be visible in compiler provenance');
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
