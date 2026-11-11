import assert from 'node:assert/strict';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './services/coreSpirit/VERSION.ts';
import { CORE_SCRIPT_LANGUAGE_VERSION } from './services/coreSpirit/coreScriptLanguagePolicy.ts';
import {
  CORE_SPIRIT_COPILOT_KNOWLEDGE_REVISION,
  CORE_SPIRIT_COPILOT_KNOWLEDGE_VERSION,
  searchCoreSpiritCopilotKnowledge,
} from './services/coreSpirit/copilotKnowledge.ts';

assert.equal(
  CORE_SPIRIT_COPILOT_KNOWLEDGE_VERSION,
  `corespirit-knowledge-v${CORE_SPIRIT_COPILOT_KNOWLEDGE_REVISION}:${CORE_SCRIPT_LANGUAGE_VERSION}:${CORE_SPIRIT_COMPILER_VERSION}:${CORE_SPIRIT_RUNTIME_VERSION}`,
  'knowledge provenance must bind the corpus revision to the canonical language, compiler and runtime versions',
);

const ema = searchCoreSpiritCopilotKnowledge('ema', 8);
assert.ok(ema.length > 0, 'standard-library search should return EMA entries');
assert.ok(ema.some(hit => hit.id === 'builtin:ema'), 'built-in search results must be sourced from the canonical standard-library registry');
assert.ok(ema.every(hit => hit.knowledgeVersion === CORE_SPIRIT_COPILOT_KNOWLEDGE_VERSION));
assert.ok(ema.every(hit => hit.sourcePath.length > 0));
assert.ok(ema.every(hit => typeof hit.body === 'string' && hit.body.length > 0));

const lookahead = searchCoreSpiritCopilotKnowledge('lookahead future causality', 6);
assert.ok(lookahead.some(hit => hit.id === 'temporal-lookahead'));
assert.ok(lookahead.some(hit => hit.kind === 'standard-library' && hit.body.includes('Temporal metadata')),
  'the index should expose available temporal-safety fields rather than infer safety from names');

const economics = searchCoreSpiritCopilotKnowledge('out-of-sample turnover transaction cost drawdown', 6);
assert.ok(economics.some(hit => hit.id === 'out-of-sample-economics'));
const asyncAi = searchCoreSpiritCopilotKnowledge('ai.invoke timeout background stale backtest', 6);
assert.ok(asyncAi.some(hit => hit.id === 'async-ai-invocation'));

const bounded = searchCoreSpiritCopilotKnowledge('ema', 100);
assert.ok(bounded.length <= 12, 'search results must be bounded');
assert.deepEqual(searchCoreSpiritCopilotKnowledge('no-such-corespirit-topic', 8), []);
console.log('CORESPIRIT_COPILOT_KNOWLEDGE_CONTRACT_OK');
