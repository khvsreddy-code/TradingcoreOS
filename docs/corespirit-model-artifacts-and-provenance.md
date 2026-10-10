# CoreSpirit research and immutable model artifacts

## Execution boundary

CoreSpirit chart/runtime execution is for **inference only**. It must not fit models, update learned weights, or perform dataset-scale training in a candle/tick callback.

```text
CoreScript source
  -> compiler + semantic checks
  -> immutable research artifact (source hash + IR + feature graph)
  -> explicit research/training worker or remote training backend
  -> immutable model artifact (weights + metrics + full provenance)
  -> content hash / model version
  -> load by name or exact hash
  -> inference-only prediction on the live chart
  -> signal -> automation -> risk engine -> order intent -> broker
```

The new `modelArtifacts.ts` module implements the artifact/provenance and hash-pinned inference foundation. It deliberately does not train inside `CoreSpiritRuntime`; training is supplied through an injected worker/backend and the inference factory receives a sealed artifact. A production adapter should use durable server-side storage and a dedicated job queue/worker rather than the included in-memory store.

## Provenance manifest

Every sealed model includes:

- SHA-256 of the exact CoreScript source.
- Compiler version and CoreSpirit IR version.
- Feature-graph hash.
- Immutable dataset version and inclusive/exclusive convention for the requested training interval (dataset adapters must define this consistently).
- Training date range, parameters, and random seed.
- Model implementation/backend and dependency versions.
- Model weights, validation metrics, creation time, and content-derived SHA-256 artifact hash.

Canonical serialization sorts object keys and rejects non-finite numbers; hashing fails closed if WebCrypto is unavailable. The sealing function checks source/compiler/IR/feature-graph agreement between the research artifact and training manifest. The loader verifies the artifact hash before returning an inference handle pinned to that exact hash. A published model name cannot be repointed to a different hash in the in-memory implementation; use versioned names such as `nifty-regime-v7` and retain old hashes for replay.

## API workflow

The compiler integration should pass its successful output into `createResearchArtifact`. A separate training job consumes that research artifact and an immutable dataset snapshot. When training completes, the worker calls `sealModelArtifact` with the weights, metrics and complete `ModelProvenance`, then persists the result using `ModelArtifactStore`.

```ts
const research = await createResearchArtifact({
  name: 'nifty-regime-v7',
  source: coreScriptSource,
  compilerVersion: CORESPIRIT_COMPILER_VERSION,
  irVersion: CORESPIRIT_IR_VERSION,
  featureGraph,
  ir: compiled.ir,
});

// Runs in a research worker, never the realtime chart callback:
const artifact = await sealModelArtifact({
  research,
  provenance: {
    sourceHash: research.sourceHash,
    compilerVersion: research.compilerVersion,
    irVersion: research.irVersion,
    featureGraphHash: research.featureGraphHash,
    datasetVersion: 'NIFTY_5M@2025-12-31:v4',
    trainingRange: { from: '2018-01-01', to: '2025-12-31' },
    trainingParameters: { epochs: 20, learningRate: 0.001 },
    randomSeed: 42,
    modelImplementation: 'gaussian-hmm-v1',
    backend: 'cpu',
    dependencyVersions: { corespirit: CORESPIRIT_COMPILER_VERSION },
  },
  weights: trainedWeights,
  metrics: validationMetrics,
});
await durableStore.put(artifact);

// Chart startup/refresh loads a fixed model hash; predict() has no train() method.
const model = await loadModelForInference(
  durableStore,
  artifact.hash,
  createInferenceAdapter,
);
const prediction = await model.predict(latestFeatureRow);
```

## Production hardening requirements

- Persist artifacts and manifests in durable storage with unique hash constraints, access control, retention and audit logs.
- Execute training in a bounded worker/job queue with cancellation, resource quotas, progress telemetry and isolated dependencies.
- Pin dataset snapshots and record timezone/session handling, corporate-action adjustments, missing-data policy and feature warm-up rules.
- Validate out-of-sample and walk-forward results; record transaction costs, slippage, leakage checks and metric definitions.
- Treat artifact loading as a trust boundary: verify hashes/signatures, schema versions, model implementation compatibility and input feature schema before inference.
- Never let a model artifact submit orders. Predictions flow through CoreSpirit signals and the TradingCoreOS automation/risk/order-intent boundary.

The included in-memory store is intended for tests and development. It is not durable across reloads and is not a substitute for the production database/worker adapter. The new contract verifies hash identity, provenance mismatch rejection, invalid training-range rejection, immutable naming, and inference hash pinning.