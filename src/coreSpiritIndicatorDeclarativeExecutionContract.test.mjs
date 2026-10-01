import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (v,m) => { if (!v) throw new Error(m); };
const src = read('src/services/coreSpirit/coreSpiritIndicatorComponent.ts');
for (const token of [
  'CoreSpiritIndicatorDeclaration',
  'CoreSpiritIndicatorInput',
  'runCoreSpiritIndicatorComponent',
  'createCoreSpiritIndicatorRealtimeHost',
  'CoreSpiritHistoricalExecutionHost',
  'CoreSpiritRealtimeExecutionHost',
  'requestedOutputs',
  'unknown public output',
  'unregister(id: string): boolean',
  'indicator.declaration.calculation !== indicator.calculation',
  'indicator.declaration.parameters !== indicator.parameters',
]) assert(src.includes(token), `declarative/executable indicator contract missing '${token}'`);
assert(src.includes("coreSpiritComponentRegistry.unregister(id)"), 'indicator unregister must clean the semantic component registry');
assert(src.includes("kind: 'indicator' as const"), 'declaration must retain indicator kind');
console.log('TCO_V112_INDICATOR_DECLARATIVE_EXECUTION_CONTRACT_OK');
