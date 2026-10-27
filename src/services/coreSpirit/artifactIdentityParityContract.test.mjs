import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { buildCoreSpiritArtifactLookupIdentity } from './artifactLookupIdentity.ts';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache.ts';

const source = CORESPIRIT_LUXALGO_SMC_SOURCE;
const sourceId = 'corespirit-artifact-identity-parity';
const options = { layer: 'script' };
const lookup = buildCoreSpiritArtifactLookupIdentity(source, sourceId, options);
const compiled = compileCoreSpirit(source, sourceId, options);

assert.ok(compiled.artifact?.abi, 'CoreSpirit compiler must produce a formal executable artifact');
assert.equal(
  compiled.artifact.abi.semanticHash,
  lookup.semanticHash,
  'artifact semantic hash must exactly match the cache lookup identity',
);
assert.equal(compiled.artifact.abi.normalizedHash, lookup.normalizedHash,
  'artifact normalized hash must match the normalized source used for cache lookup');

const cached = await loadOrCompileCoreSpiritArtifact(source, sourceId, {
  ...options,
  backend: 'worker-vm',
});
assert.equal(cached.abi.semanticHash, lookup.semanticHash,
  'the persistent cache/active-chart path must accept the freshly compiled artifact');
assert.equal(cached.abi.artifactHash, compiled.artifact.abi.artifactHash,
  'cache handoff must preserve the exact compiled artifact identity');

console.log('CORESPIRIT_ARTIFACT_SEMANTIC_IDENTITY_PARITY_OK');
