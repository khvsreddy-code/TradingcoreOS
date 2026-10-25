# CoreSpirit AI-native architecture

This document describes the code-backed AI boundaries. It intentionally distinguishes implemented host APIs from future CoreScript syntax.

## Three separate intelligence surfaces

### 1. AI-assisted CoreScript authoring

The authenticated CoreSpirit Copilot routes provide JSON generation and a server-sent-events endpoint at `/generate/stream`. Stream events are:

- `status`: phase information.
- `delta`: provider text chunks; these are untrusted model output, not a valid program or a validated patch.
- `complete`: structured draft/report including source, summary, assumptions, test ideas, backtest scenarios, review diff, safety metadata, compiler diagnostics and artifact provenance.
- `error`: a bounded error response when the stream has already started.

The editor shows the streaming text as a candidate and does not mutate source until the user chooses **Apply reviewed draft**. The candidate is pinned to the original editor text/version and chart identity. If either changes before apply, the candidate is rejected rather than overwriting newer work.

After explicit apply, existing independent gates remain in force: local compiler/IR diagnostics, capability sandbox checks, compiler artifact hash equality, and isolated read-only replay against the current chart/history fingerprint. This flow does not run orders. Generated tests and backtest scenarios are plans only; their presence is not evidence that a test or backtest ran.

Compiler repair is opt-in and bounded to one retry. It receives the first compiler diagnostics and returns a complete revised candidate. The retry is recompiled; there is no open-ended agent loop.

Draft artifacts hash the source and base source, request hash, model, symbol/timeframe, compiler/runtime versions, diagnostic/test/scenario hashes, compiled artifact hash where valid, repair attempt count, and the versioned knowledge entries supplied to the model. Persistence is private and user-scoped through `corespirit_copilot_drafts`; if that migration has not been applied or storage is unavailable, generation can return a draft with `persisted: false`. Stored history is a review record, not a grant to execute an old artifact.

### 2. User-authored quantitative/ML research

CoreSpirit's existing research/model lifecycle remains the place for typed model declarations, training jobs, immutable dataset/model artifacts, feature-schema checks, chronological holdout separation, lookahead/leakage validation and audited release decisions. These checks are not delegated to a text model.

A reusable strategy-output evaluator lives in `src/services/coreSpirit/outOfSampleEconomics.ts`. It checks chronological holdout boundaries, confirmed/non-overlapping outcome intervals and immutable dataset/model hashes, then computes compounded gross/after-cost/net return, turnover, drawdown, transaction-cost/slippage drag and optional frequency-aware annualization. Stability is measured over complete windows and explicitly returns `insufficient-windows` where evidence is too thin. This evaluator is not yet wired into the existing unsupervised HMM/regime-model promotion flow; an explicit strategy-position mapping is needed before those metrics can gate model release.

Research evaluation should make train/validation/test windows and feature availability times explicit. Prediction accuracy is not tradability evidence: turnover, transaction costs/slippage, drawdown and stability should be considered where the evaluation backend computes those results. The Copilot knowledge index deliberately does not invent results or mark missing measurements as passes.

A separate read-only feature-quality monitor now lives in `src/services/coreSpirit/modelDrift.ts`. It pins reports to the model artifact and feature-schema hashes, compares a confirmed historical baseline with a later observation window using baseline-derived PSI bins, reports missing/non-finite values, excludes developing/unconfirmed/forecast rows from drift scoring, and returns `insufficient-evidence` when sample requirements are not met. Critical thresholds produce blockers in the report, but the monitor does not train, promote, or route trades. It is a pure monitoring primitive; a production scheduler, durable telemetry store, alert delivery, and model-promotion policy integration must be wired separately before describing it as live drift monitoring.

### 3. Asynchronous generative AI invocation

CoreScript now recognizes `requires ai.invoke` as a declared, system-level capability. The `POST /invoke` host API:

1. Parses a bounded request (source, compiler artifact hash, prompt, JSON context, output-token limit).
2. Recompiles source on the server, validates artifact integrity and checks that the compiled source requires `ai.invoke`.
3. Validates the compiled capability set against the server automation sandbox.
4. Requires distributed Redis coordination; fail-closed rate windows and a per-user active-job lease apply before enqueue.
5. Enqueues `corespirit_ai_invoke` onto the background queue, separate from candle evaluation.
6. The worker repeats source compilation, artifact/hash, capability, lease and fingerprint checks before calling the provider with a timeout and output-token limit.
7. Results are content-addressed by the model version and canonical input fingerprint, cached briefly, and tagged `ready`, `unavailable` or `stale`. Old results are projected as stale by the job-read endpoint.

The editor also exposes an **Async AI Invocation** host-API harness. It compiles the supplied automation source in the automation layer, asks for an explicit user submission, polls `/api/jobs/:id`, and labels the returned result. This is a manual integration harness; it does not feed a result back into a running CoreScript program.

The current invocation API returns **advisory text data only**. It marks the result `executable: false` and `mayCreateOrderIntent: false`. It never compiles model output, invokes a broker, or changes account state. Order intents, risk validation and broker routing remain host-controlled.

## Important runtime limit

The capability and asynchronous host job boundary is implemented; the full native expression/event resolver is not yet implemented. In particular, an example such as:

```corescript
requires ai.invoke
```

declares the capability, but `ai.request(...)` or an `ai.result(...)` poll expression is **not** currently a supported CoreScript standard-library builtin. Do not place synchronous remote model calls in per-candle code or historical backtests. A future language binding should submit bounded work, consume a validated job result on a later event/revision, represent pending/unavailable/stale explicitly, and bind the result to the current artifact/input fingerprint.

## Versioned searchable knowledge

The Copilot knowledge search uses the canonical standard-library and namespace registries rather than hand-maintained function names alone. Its version string includes the CoreScript language contract and current compiler/runtime versions. Curated safety entries point to the normative language spec, standard-library metadata and model-provenance documentation. Copilot requests include only the top-ranked bounded entries, and the version plus matching entry IDs are included in artifact provenance.

Search results explain what the registered primitive declares; they do not imply that every item is supported in every target layer. Compiler diagnostics, artifact validation and the sandbox remain authoritative.

## Configuration and operational notes

- The existing server-side Gemini/Google key is required; no provider secrets are sent to the browser.
- AI invocation also requires configured Upstash Redis REST credentials. Missing coordination configuration disables invocation rather than falling back to process-local counters.
- The current shared route limiter and the AI invocation Redis budgets are separate layers.
- Rate windows, prompt/context/output limits, provider timeout, concurrency lease and cache freshness are centralized in `src/services/coreSpirit/aiInvocation.ts`.
- Apply `supabase/migrations/20261025090000_corespirit_copilot_drafts.sql` to enable durable Copilot artifact history.
- This document and the contracts describe the intended safety envelope; they are not a substitute for running unit/contract tests and a production build after the changes.
