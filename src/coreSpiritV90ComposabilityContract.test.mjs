import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const language = read('src/services/coreSpirit/languageConcepts.ts');
for (const token of ['DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE']) {
  if (!language.includes(`'${token}'`)) throw new Error(`CoreSpirit six-concept surface regression: ${token}`);
}
for (const banned of ['component\' keyword', 'function keyword', 'pipeline keyword']) {
  if (read('docs/archive/legacy/CORESPIRIT_LEGACY_ARCHITECTURE.md').toLowerCase().includes(banned)) {
    throw new Error(`CoreSpirit composability docs unexpectedly advertise a new surface construct: ${banned}`);
  }
}

const components = read('src/services/coreSpirit/coreSpiritComponents.ts');
for (const token of [
  'CoreSpiritComponentRegistry',
  'resolveCoreSpiritComponent',
  'validateCoreSpiritComponentInvocation',
  'componentResultLanguageType',
  'component callable name',
]) {
  if (!components.includes(token)) throw new Error(`First-class component contract missing: ${token}`);
}
if (!components.includes('const callableNames = [contract.name, ...(contract.aliases ?? [])]')) {
  throw new Error('Component registry registration is not prepared atomically before mutation');
}
if (!components.includes('function compatibleValueType')) throw new Error('Pipeline composition lacks typed compatibility fallback');

const semanticAnalyzer = read('src/services/coreSpirit/semanticAnalyzer.ts');
const compiler = read('src/services/coreSpirit/compiler.ts');
const graph = read('src/services/coreSpirit/semanticDependencyGraph.ts');
const semanticGraph = read('src/services/coreSpirit/semanticGraph.ts');
const runtime = read('src/services/coreSpirit/vm.ts');
for (const [name, source, tokens] of [
  ['semantic analyzer', semanticAnalyzer, ['componentBindings', 'COMPONENT_INVOCATION']],
  ['compiler', compiler, ['componentId', 'componentPure', 'componentStateful', 'componentDeterministic']],
  ['semantic dependency graph', graph, ["kind: 'component'", 'component-call:']],
  ['execution graph', semanticGraph, ['componentId', 'sourceDependents']],
  ['VM runtime', runtime, ['executeComponent', 'componentRegistry']],
]) {
  for (const token of tokens) if (!source.includes(token)) throw new Error(`${name} missing composability integration: ${token}`);
}

const docs = read('docs/archive/legacy/CORESPIRIT_LEGACY_ARCHITECTURE.md');
for (const token of ['simple to learn', 'multi-output', 'CoreSpirit IR', 'execution plan', 'host']) {
  if (!docs.toLowerCase().includes(token.toLowerCase())) throw new Error(`Composability documentation missing '${token}'`);
}

console.log('CORESPIRIT_STAGE90_COMPONENT_COMPOSABILITY_SOURCE_CHECK_OK');
console.log('CORESPIRIT_STAGE90_COMPONENT_REGISTRY_ATOMICITY_CHECK_OK');
