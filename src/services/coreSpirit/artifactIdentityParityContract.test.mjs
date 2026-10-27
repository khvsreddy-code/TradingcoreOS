import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { buildCoreSpiritArtifactLookupIdentity } from './artifactLookupIdentity.ts';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache.ts';
import { coreSpiritComponentRegistry } from './coreSpiritComponents.ts';
import { compileCoreSpiritArtifactOffThread } from './coreSpiritCompilerClient.ts';

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


const unrelatedComponent = {
  version: 1,
  id: 'unused-registry-probe',
  name: 'unusedRegistryProbe',
  kind: 'component',
  inputs: [{ name: 'input', type: { kind: 'series', element: 'scalar' }, required: true }],
  outputs: [{ name: 'value', type: { kind: 'series', element: 'scalar' }, required: true }],
  nodeIds: ['unused-registry-probe:input', 'unused-registry-probe:output'],
  dependencies: [],
  deterministic: true,
  stateful: false,
  capabilities: [],
};

coreSpiritComponentRegistry.register(unrelatedComponent);
try {
  const workerParitySourceId = 'corespirit-worker-registry-parity';
  const noisyMainLookup = buildCoreSpiritArtifactLookupIdentity(source, workerParitySourceId, options);
  const workerStyleLookup = buildCoreSpiritArtifactLookupIdentity(source, workerParitySourceId, {
    ...options,
    components: [],
  });
  assert.equal(
    noisyMainLookup.semanticHash,
    workerStyleLookup.semanticHash,
    'unreferenced UI-only component registrations must not change an ordinary script identity',
  );

  const componentCallSource = `indicator("Registry Probe") { overlay: true }
let probe = unusedRegistryProbe(close)`;
  const withReferencedComponent = buildCoreSpiritArtifactLookupIdentity(componentCallSource, workerParitySourceId, {
    ...options,
    components: [unrelatedComponent],
  });
  const withoutReferencedComponent = buildCoreSpiritArtifactLookupIdentity(componentCallSource, workerParitySourceId, {
    ...options,
    components: [],
  });
  assert.notEqual(
    withReferencedComponent.semanticHash,
    withoutReferencedComponent.semanticHash,
    'a component called by the source must remain part of its semantic identity',
  );

  const workerCompiled = await loadOrCompileCoreSpiritArtifact(source, workerParitySourceId, {
    ...options,
    backend: 'worker-vm',
    compileInWorker: async (input, id, compileOptions) => {
      // Simulate the worker realm not receiving an unrelated UI-thread registration.
      coreSpiritComponentRegistry.unregister(unrelatedComponent.id);
      try {
        return await compileCoreSpiritArtifactOffThread(input, id, compileOptions);
      } finally {
        coreSpiritComponentRegistry.register(unrelatedComponent);
      }
    },
  });
  assert.equal(
    workerCompiled.abi.semanticHash,
    noisyMainLookup.semanticHash,
    'worker compilation must accept the same source identity despite unrelated registry drift',
  );
} finally {
  coreSpiritComponentRegistry.unregister(unrelatedComponent.id);
}

console.log('CORESPIRIT_ARTIFACT_SEMANTIC_IDENTITY_PARITY_OK');
