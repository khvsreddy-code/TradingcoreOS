# CoreSpirit model research, validation and release controls

## Architecture boundary

CoreSpirit chart/runtime execution is **inference-only**. Fitting model weights and dataset-scale operations run in the background research worker, outside the candle/tick callback.

```text
CoreScript source + feature declarations
    ↓
Compiler + causality/lookahead analysis
    ↓
Immutable research artifact (source, IR, feature graph, safety manifest)
    ↓
Immutable dataset snapshot (canonical hash + decision-time metadata)
    ↓
Chronological train/holdout split
    ↓
Background model fitting on the earlier segment
    ↓
Frozen-state inference on the later holdout segment
    ↓
Immutable model artifact (weights + provenance + validation report)
    ↓
Candidate → explicit validation review → approved release
    ↓
Versioned inference only after the holdout window
    ↓
Signal → automation → risk engine → order intent → broker
```

The model artifact identity includes learned weights, metrics and provenance. Release status is stored separately: approving, revoking or retiring a release does not mutate the immutable artifact. New training produces a new artifact hash; old versions remain addressable for audit/replay. The provenance contract is model-artifact schema **v2**: legacy schema-v1 artifacts without a real chronological holdout, runtime version, and static-safety manifest cannot pass integrity verification or be approved. Retrain them as a new versioned model name; the old release records remain candidates for audit and are not silently grandfathered into production.

## Research and training API

All routes below are mounted under `/api/corespirit` and require the signed-in user's bearer session.

### 1. Compile and save the research artifact

`POST /research` accepts the model name, CoreScript source and ordered `featureNames`. Names must exactly match the feature declarations in the source. CoreSpirit compiles the source and runs causal/repaint analysis. Future-bar access, unqualified/dynamic requests that cannot be verified, unsafe developing data and other blocking temporal findings prevent a research artifact from being admitted.

A research artifact pins the source hash, compiler version, IR version, execution plan and feature-graph hash. The graph also stores the source-safety summary used by the training and release gates.

### 2. Create an immutable dataset snapshot and queue training

`POST /training-runs` accepts `researchArtifactId`, `trainingRange`, matching `featureNames`, `rows`, optional `validationFraction` (default `0.20`, allowed range `0.10–0.40`), `randomSeed`, and simple scalar `trainingParameters`.

Each feature row must have this shape:

```json
{
  "timestamp": 1790000000000,
  "availableAt": 1790000000000,
  "confirmed": true,
  "phase": "historical",
  "values": [0.0012, 0.018]
}
```

- `timestamp` is the decision-time timestamp for the observation (epoch milliseconds).
- `availableAt` is when the features were available to the strategy. The server rejects `availableAt > timestamp`.
- `confirmed` must be `true`, and `phase` must be `historical` or `confirmed`. Developing, realtime, forecast and unconfirmed observations are rejected.
- Feature vectors must have the exact feature count and only finite numbers. Duplicate or out-of-order decision timestamps are rejected. Extra row properties (including embedded labels/outcomes) are rejected.
- Common target/label/future feature names such as `next_bar_return`, `realized_outcome` and `future_close` are rejected by the conservative feature-name leakage guard. Labels are not part of the unsupervised HMM input vector.

The API validates the rows again in the background worker, persists an immutable snapshot and verifies the dataset hash before training. Training requests are capped at 1,024 rows and 16 features. The validation tail must contain at least 12 observations; the earlier training segment must contain at least `max(12, states × 4)` observations. For example, an 80-row dataset with a 20% holdout trains on rows 1–64 and reserves rows 65–80 for validation.

**Important data-integrity distinction:** these checks establish the structure, timing metadata, immutability and hash of the submitted feature snapshot. They do not independently prove that a caller supplied genuine broker values or truthfully described every feature's upstream availability. For production data ingestion, keep feature generation in a trusted server-side/provider path and preserve the original market-data provenance. A SHA-256 hash makes a dataset reproducible; it does not make untrusted source data true.

### 3. Training and holdout evaluation

The background worker re-loads the owner-scoped immutable research artifact and dataset snapshot and verifies their hashes. It fits the Gaussian HMM only on the earlier training segment. It then constructs a fresh HMM from the sealed fitted state and makes forward predictions across the holdout rows. The holdout loop does not fit or update learned parameters.

The artifact provenance includes:

- Exact source, compiler, runtime and IR versions.
- Feature-graph hash and immutable dataset SHA-256.
- `trainingRange` records the timestamp range used to fit model parameters; `validationRange` records the later chronological holdout range used to evaluate/select the model. The two ranges must not overlap.
- Training parameters, deterministic initializer policy, random seed and backend.
- Training and holdout counts, validation state coverage, and min/mean/max holdout posterior confidence.
- Checks for chronology, availability metadata, feature schema, label leakage, dataset hash, static causality and lookahead safety.

The current production training backend is Gaussian HMM. Other model families need their own registered trainer and matching inference adapter; they are not silently routed through the HMM implementation. The recorded `randomSeed` is provenance; the current built-in HMM initializer is deterministic and records that policy explicitly. **It is not a tunable seed for this HMM backend**: changing it alone does not change the fitted model. Do not compare two artifacts as meaningfully different experiments merely because their recorded seed differs; compare the sealed weights, training parameters, feature/data hashes and validation evidence.

The current holdout report measures chronological forward-only inference validity, state coverage and posterior confidence. Posterior confidence is **not** a measure of trading accuracy, calibrated probability of profit, or net strategy return. Before selecting a model for a strategy, run a separate causal strategy evaluation with explicit target/label construction, costs, slippage, order constraints and out-of-sample trade outcomes. Do not promote a model solely because its confidence is high.

`GET /training-runs/:runId` reports queued/running/succeeded/failed status and, once complete, the artifact hash, ranges, validation metrics, safety report and release state.

## Model release lifecycle

`GET /models/:hash` returns the immutable artifact plus its release control. Existing and newly trained artifacts start as `candidate`; training success is **not** production approval.

The CoreSpirit workspace's **Model Release** panel loads an artifact by its exact 64-character hash. It displays train/holdout sample counts, compiler/runtime versions and key temporal-safety findings.

`POST /models/:hash/approval` accepts:

```json
{
  "action": "approve",
  "confirm": true,
  "reason": "Reviewed the temporal split, provenance and validation evidence."
}
```

Actions are `approve`, `revoke` and `retire`. A reason of 8–1,000 characters and `confirm: true` are required. Approval fails closed unless the artifact hash/integrity, chronological holdout size and separation, forward-only evaluation, feature schema, leakage/availability checks, dataset hash, source causality, lookahead checks, and non-degenerate validation state coverage all pass. The database transition is owner-scoped, audited and restricted to the server's `service_role`; public/authenticated database roles cannot invoke it directly. Immutable release events record status changes and the actor/reason.

Revocation prevents **new** inference loads from accepting that release. A model already loaded in an active worker must be stopped/reloaded to observe a subsequent revocation; the current runtime does not poll the release state on every tick. Approval does not authorize trading or bypass TradingCoreOS's automation, risk or broker-order boundaries.

## Validation cutoffs and lookahead protection

There are two different boundaries:

1. **Training end:** the final observation used to fit model parameters.
2. **Validation end:** the final observation used to evaluate/select the model.

The production inference cutoff is the validation end, not merely the training end. The browser loader, worker artifact binding and server-side predict endpoint all reject predictions with timestamps inside the training **or holdout** window. Inference is permitted only at a timestamp strictly after validation has ended. This avoids quietly reusing data used for model selection as if it were a fresh live prediction.

CoreSpirit also analyzes source expressions for future/negative-index access, future-dependent calls, unqualified or dynamically aligned requests, developing higher-timeframe values and repaint/realtime-safety hazards. Unknown safety is not treated as proof of safety. Research artifacts can be inspected, but an unknown/unsafe source cannot pass production approval. The API prediction endpoint and the chart artifact loader both require `status: "approved"` and `approvalChecks.productionEligible: true`.

## Historical replay versus captured-live parity

CoreSpirit exposes a stable replay comparison contract in `src/services/coreSpirit/replayContract.ts`. Before comparing a historical/backtest run with a recorded paper/live run, capture both under the same confirmed-bar decision contract and pin the same program checksum, dataset identity, symbol, timeframe, time bounds and row count.

`compareCoreSpiritExecutionParity(reference, candidate)` validates provenance alignment and compares aggregate artifact/output/state/trace checksums plus each bar's timestamp, output checksum, state checksum and trace checksum. Its report is bounded, includes the full mismatch count, and identifies the divergent bar and field so a discrepancy can be investigated rather than hidden behind a single pass/fail value. The existing deterministic-replay helper now uses this same strict comparison path.

The comparison must use confirmed bars and matching feature-availability semantics; comparing a developing live candle with its later confirmed historical form is not a parity test. Replay remains read-only and suppresses external effects. Passing parity is evidence of execution consistency for that pinned run, not evidence of profitability, trusted market-data provenance, or production approval. A model release must still pass its independent causal, holdout, artifact-integrity and approval gates.

## Reproducibility and audit

- Content-derived SHA-256 binds source, feature graph, dataset version, learned weights, validation report and provenance into the immutable artifact hash.
- Server-side owner checks prevent reading or approving another user's artifact.
- Release decisions are stored separately and do not rewrite model bytes or provenance.
- Hash mismatch, unsupported schema/implementation, invalid feature schema, missing data, overlapping ranges or unavailable persisted state fail closed.
- Prediction output remains an input to strategy logic, never a direct broker command. Any requested trade must still pass the normal signal, automation, risk, execution-intent and broker reconciliation pipeline.

Run `npm run test:contracts`, `npm run typecheck` and `npm run build` after deployment. Do not treat a completed Vite bundle step as proof that the full deployment or an end-to-end broker workflow succeeded.
