# CoreSpirit 1–12 implementation audit and production gap closure

This is an implementation map, not a claim that every research capability is production-complete. The work is additive and does not redesign the TradingCoreOS workspace or chart UI.

## 1–12 audit

| # | Requirement | Current implementation / boundary |
|---|---|---|
| 1 | Consolidate CoreSpirit architecture | The compiler/runtime pipeline and architecture contracts remain authoritative. This change adds lifecycle code without introducing a second VM or chart engine. |
| 2 | One native Vela chart/rendering path | Existing Vela integration, scene graph, incremental patches and chart data contracts are unchanged. No UI/layout redesign. |
| 3 | Vela terminal shell | Existing terminal-shell integration remains in place. |
| 4 | Streaming, visible range, inputs and props | Existing Vela/CoreSpirit capability contracts remain in place. |
| 5 | Avoid duplicate historical/live startup execution | Existing single-pass startup and latest-wins refresh contracts remain in place. |
| 6 | Per-kernel state snapshots | Existing kernel snapshot store remains in place. The new HMM snapshot is specifically for sealed learned parameters, not a replacement for runtime rollback snapshots. |
| 7 | Unify value kinds | Existing CoreScript value/type contracts remain in place. |
| 8 | Progressive beginner/trader/quant/system authoring | Existing unified language and authoring-level contracts remain in place. |
| 9 | Typed quant values and shape checking | Existing scalar/series/vector/matrix/tensor/model/prediction/distribution typing remains in place. Artifact manifests now preserve a JSON-safe feature graph and IR. |
| 10 | HMM and quant primitives | The bounded Gaussian HMM supports 2–12 states, up to 16 features and at most 1,024 observations. It now exports a versioned trained-state snapshot and restores it for inference without fitting. |
| 11 | Separate training from live inference | Authenticated research compilation, immutable dataset snapshots, queued background HMM training, durable model artifacts, run status, hash-pinned inference APIs, bounded OHLCV feature materialization, and a lifecycle-surface parser/lowering step. The train/save/loadModel directives are control-plane declarations; they are not executed as live chart-VM statements. Chart runtime HMM fitting is disabled by default; research-mode execution must be opted into explicitly. |
| 12 | Complete artifact provenance | Model SHA-256 covers schema version, immutable save-as model name, provenance, normalized weights and metrics. The hash excludes publication time so identical sealed content is reproducible. Provenance includes source/compiler/IR/feature graph/dataset/range/parameters/seed/implementation/backend/dependencies. Name-based lookup is verified and resolves to the immutable hash before runtime binding. |

## Lifecycle now available

1. Compile and persist a research artifact: POST /api/corespirit/research
2. Persist a content-hashed dataset snapshot and enqueue a training run: POST /api/corespirit/training-runs. If the CoreScript train directive names a supported market dataset and the request contains neither rows nor bars, the API fetches that user's authenticated FYERS history before queuing.
3. Poll the owner-scoped run: GET /api/corespirit/training-runs/:runId
4. Fetch one verified immutable model artifact: GET /api/corespirit/models/:hash
5. Run a forward-only single-step prediction: POST /api/corespirit/models/:hash/predict

All routes require a valid TradingCoreOS/Supabase bearer session. Research artifacts, dataset snapshots, training runs and model artifacts are owner-scoped. Artifact and dataset tables are append-only; publish a new versioned model name instead of overwriting an existing model. The background job contains snapshot IDs, not a large mutable copy of the dataset.

## Request contracts

Research compilation:

~~~json
{
  "name": "nifty-regime-v7",
  "source": "model regime: HMM<float> {\n  states = 3\n  emission = gaussian\n  covariance = diagonal\n}\nfeatures = dataset(\"returns\", pctchange(close), \"volatility\", atr(20))\nstate = hmmDecode(\"regime\", features)",
  "featureNames": ["returns", "volatility"]
}
~~~

Training request (timestamps are epoch milliseconds; rows must be chronological, finite, and within the requested range):

~~~json
{
  "researchArtifactId": "<id returned by research compilation>",
  "featureNames": ["returns", "volatility"],
  "trainingRange": { "from": "2025-01-01", "to": "2025-12-31" },
  "randomSeed": 42,
  "trainingParameters": { "fitEvery": 64, "fitIterations": 3 },
  "rows": [
    { "timestamp": 1735689600000, "values": [-0.01, 0.02] }
  ]
}
~~~

The API currently requires 12–1,024 rows and 1–16 features. The row in the example is illustrative only; a real request must include the minimum row count. Dataset identity is computed by one shared validator/hash function over the dataset name, data source, exact feature names, rows and training range; the background worker recomputes this identity before fitting. The HMM initializer is deterministic today; the seed is recorded for lineage but does not currently introduce randomness into this algorithm. To use automatic FYERS history, keep the dataset in the CoreScript train directive and omit rows/bars from the training request; a connected FYERS session is required.

The single-step inference API takes a model SHA-256, a feature vector and an epoch-millisecond timestamp strictly after the model's training range. It rejects in-sample timestamps to avoid accidental look-ahead leakage:

~~~json
{ "timestamp": 1767225900000, "features": [-0.003, 0.014] }
~~~

The inference handle exposes only prediction, verifies the stored artifact hash before execution and does not expose training methods. For chart use, fetch the artifact once with GET /api/corespirit/models/:hash, then use fetchCoreSpiritHMMArtifact from src/services/coreSpirit/modelArtifactClient.ts to verify and hydrate a per-runtime HMM instance. For the persistent web-worker chart path, pass the binding once when the model is selected:

~~~ts
const loaded = await fetchCoreSpiritHMMArtifact(modelHash, session.access_token);
await runCoreSpiritInWorker(source, bars, sourceId, {
  contextKey: chartContextKey,
  datasetVersion,
  hmmArtifacts: [loaded.toWorkerBinding()],
});
~~~

The worker installs the immutable model snapshot in its existing runtime and updates it only when the model binding changes. It does not fetch an artifact or call the single-step API for every candle; that would add network latency to the hot path. Developing-bar revisions are handled by rolling the HMM posterior back to the state before that timestamp and recomputing the prediction, rather than conditioning twice on a revised candle.

## Operational requirements

- Apply the migration 20261010120000_corespirit_model_artifact_lifecycle.sql before enabling these routes in an environment. This PR only adds the migration; it does not mutate a live database.
- Supabase server-side configuration is required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). Client-supplied user IDs are never trusted.
- The existing Vercel Queue/background-job service must be configured and running. Training never runs in a request handler or candle callback.
- The first built-in trainer is deliberately Gaussian HMM only. Other families must register an explicit bounded training adapter; this route does not pretend to train arbitrary Python/ONNX/GPU models.
- HMM declarations support explicit ordered labels such as `stateLabels = ["bear", "range", "bull"]`. Labels are validated against the declared state count, persisted inside the sealed HMM state, and restored for chart inference; they are author-supplied names for latent states, not an automatic claim that the model has discovered semantically correct bull/bear regimes.
- The training API accepts precomputed finite feature rows, OHLCV candle snapshots, or a named market dataset. Named datasets use the connected user's FYERS session and strict SYMBOL_TIMEFRAME resolution (for example NIFTY_5M, BANKNIFTY_15M, NSE:RELIANCE-EQ_1D, or SENSEX_1W); the provider uses the existing authenticated FYERS request gate, bounded date windows, and rejects oversized ranges instead of silently truncating. The feature materializer evaluates a safe allowlist (OHLCV fields, returns, SMA/EMA/RSI/ATR and volume z-score), enforces chronological candles and date bounds, uses pre-range candles only for indicator warm-up, drops warm-up rows, and rejects unsupported expressions instead of evaluating arbitrary JavaScript. The built-in HMM still accepts at most 1,024 usable observations and 16 features; multi-year intraday ranges will be rejected unless they fit that cap, not silently downsampled.
- Research sources may now include declarative model artifact/train/save/loadModel directives. A dedicated lifecycle-surface parser validates these directives and lowers research source to the existing CoreSpirit compiler; model/feature declarations still use the one authoritative compiler/IR/VM. Training range and save-as metadata are persisted in the research graph, and save-as names flow into the sealed artifact identity. On chart deployment, the existing chart runner detects loadModel, obtains the current authenticated session, fetches and verifies the named artifact once, validates the source feature schema against the sealed model, lowers model.predict/model.probability to the existing model(name) ABI, and passes the hash-pinned binding into the persistent worker. The worker resolves the same model by internal alias, immutable artifact name, or SHA-256, including its fallback execution path. train/save remain control-plane operations; they are never executed in the live chart callback.
- WASM SIMD/GPU execution is not enabled by this change. Existing backend-dispatch contracts should not be mistaken for proof that every kernel has a production WASM/GPU implementation.
- Model predictions still flow through the existing signal → automation → risk engine → order intent → broker boundary. This API never submits an order.

## Validation checklist

The PR registers a lifecycle contract that compiles CoreScript, trains a bounded synthetic HMM in a research/test context, seals and restores it, checks prediction probabilities and feature-shape rejection, verifies tamper detection, and asserts that default chart execution refuses to fit a model. CI and deployment must still be checked on the final commit; a registered contract is not the same as a passing run.
