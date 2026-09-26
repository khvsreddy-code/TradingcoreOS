# CoreSpirit Build Tracker

> Living implementation truth for CoreSpirit.
>
> `docs/CORESPIRIT.md` is the stable architecture brain. This file records what is actually built, what has been verified, what remains incomplete, and the next concrete work.

## Current release

**Release:** CoreSpirit v58 — visual compiler graph + reactive runtime

**Tracker state:** restored as a first-class project document.

**Architecture document:** `docs/CORESPIRIT.md`

**Machine release record:** `CORESPIRIT_V57_MANIFEST.json`

**Primary invariant:** one language → one compiler → one stable IR → one VM → multiple host execution environments.

## Current status

### Built and verified

- [x] Language foundation, series runtime, indicator runtime
- [x] Stable Core IR + VM
- [x] Historical/realtime transactional semantics
- [x] Runtime-native indicators and compiler pipeline
- [x] Replay and observational debugger contracts
- [x] Signal boundary and strategy boundary
- [x] Risk-authoritative automation pipeline
- [x] Automation lifecycle: CREATED → VALIDATED → PAPER → ARMED → LIVE → PAUSED → STOPPED
- [x] IDE/runtime convergence
- [x] Structured signal explainability and decision traces
- [x] Canonical trading model
- [x] One VM / many execution hosts
- [x] Broker-owned execution adapters
- [x] Persistent renderer-neutral visual scene graph
- [x] Language-driven interactive UI state
- [x] Data-rich visual metadata and inspection
- [x] Advanced visual data model: heatmaps, liquidity, depth, volume, footprints, structure graphs, probability surfaces, regime bands, model fields, trade paths, replay traces
- [x] Transactional realtime visual engine with diffing, rollback, commit, and patch coalescing
- [x] Declarative visual state lowered into the existing scene graph
- [x] Declarative visual applications/workspaces
- [x] Execution targets: CHART, REPLAY, BACKTEST, SCANNER, ALERT, SERVER, AUTOMATION, RESEARCH
- [x] Native scanner contracts with typed candidates and deterministic ranking
- [x] First-class multi-symbol market references with synchronized cross-symbol data
- [x] First-class multi-timeframe references with confirmed-only alignment and no-lookahead checks
- [x] External historical series consumption for indicators through the existing IR call ABI
- [x] Strict external model semantic profile with typed input/output schemas
- [x] Host-owned model adapters for Python, C++, Rust, WASM, ONNX and remote services
- [x] Target-aware model inference capability and quota enforcement
- [x] Automation explanation records with intent/event identity, facts, decision path and checksums
- [x] Optional per-instruction runtime debugger tracing
- [x] Bar-level visual debugger session with source-map highlighting
- [x] Chart-click-to-debug host event and IDE debugger surface
- [x] Semantic dependency graph emitted from the existing Core IR
- [x] Ordered execution graph with effect barriers
- [x] Visual/output graph linking visuals, UI, signals and automation to source/IR nodes
- [x] Reactive dirty propagation and pure-node cache reuse in the runtime
- [x] Reactive rollback clearing for speculative realtime revisions
- [x] Reactive recompute/reuse/effect statistics exposed to runtime tooling
- [x] Python research-client model orchestration surface
- [x] AI semantic model profile layered over the strict external-model ABI
- [x] Structured AI outputs: direction, probability, confidence, optional regime and class probabilities
- [x] Host-side AI model catalog/handle with explicit-version safety
- [x] Renderer-neutral model explanation surfaces: probabilitySurface, modelField and regimeBand

### Deliberately not claimed as complete

- [ ] Full Vite production build in a fully installed frontend environment
- [ ] True multi-process / multi-worker production scanner scheduling
- [ ] Full block/record/list syntax for every advanced visual and scanner construct
- [ ] Production-grade distributed scanner orchestration
- [ ] Full renderer implementations for every advanced visual backend
- [ ] Final production broker adapters for every supported venue
- [ ] Fully reactive source-level scheduling/graph syntax beyond compiler-derived IR metadata
- [ ] Multi-bar graph diff tooling showing why a value or signal changed between revisions

## Hard architectural boundaries

| Boundary | Rule | Status |
|---|---|---|
| CoreSpirit VM → broker | forbidden | ✅ |
| Indicator/model → order | forbidden | ✅ |
| Automation → broker | intent only; host owns execution | ✅ |
| Risk → policy | risk approval must precede policy | ✅ |
| UI action → broker | forbidden | ✅ |
| Visual object → renderer API | host adapter only | ✅ |
| Visual interaction → arbitrary callback | forbidden; serializable action reference only | ✅ |
| Target selection → new language | forbidden; capability profile only | ✅ |
| Scanner → broker | forbidden; provider-neutral dataset only | ✅ |
| Advanced visual → GPU/DOM object | forbidden inside CoreSpirit | ✅ |
| Realtime visuals → mandatory full redraw | forbidden as semantic requirement | ✅ |
| Cross-symbol data → future sample | forbidden | ✅ |
| Higher-timeframe data → implicit developing sample | forbidden by default | ✅ |
| CoreSpirit → external model process/runtime | forbidden; adapter host only | ✅ |
| Model → broker/risk authority | forbidden | ✅ |
| Stateful external model → non-rollback-safe runtime | forbidden | ✅ |
| Model inference → undeclared market-state access | forbidden | ✅ |
| AI prediction → risk/execution authority | forbidden; structured model fact only | ✅ |
| AI visual explanation → execution authority | forbidden; observational scene projection only | ✅ |
| Multi-symbol/timeframe access → broker API inside VM | forbidden; contextual host resolver only | ✅ |

## Stage tracker

| Stage | Name | Status |
|---:|---|---|
| 1 | Language foundation | ✅ |
| 2 | Series runtime | ✅ |
| 3 | Indicator runtime | ✅ |
| 4 | IR + VM | ✅ |
| 5 | Historical / realtime semantics | ✅ |
| 6 | Runtime-native indicators | ✅ |
| 7 | Tiny standard library | ✅ |
| 8 | Compiler pipeline | ✅ |
| 9 | Stable IR contract | ✅ |
| 10 | Replay | ✅ |
| 11 | Debugger | ✅ |
| 12 | Signal boundary | ✅ |
| 13 | Strategy boundary | ✅ |
| 14 | Killer example | ✅ |
| 15 | Explicit non-goals | ✅ |
| 16 | Release governance | ✅ |
| 17 | IDE/runtime convergence | ✅ |
| 18 | Trading-system platform architecture | ✅ |
| 19 | Language-driven interactive UI | ✅ |
| 20 | Data-rich visual metadata | ✅ |
| 21 | Exploration surfaces | 🟡 foundation |
| 22 | Trading-system convergence | ✅ |
| 23 | Advanced visual data model | ✅ |
| 24 | Realtime visual engine | ✅ |
| 25 | Declarative visual language | ✅ |
| 26 | Visual applications | ✅ |
| 27 | Execution targets | ✅ |
| 28 | Native scanner | ✅ |
| 29 | Multi-environment trading programming | ✅ |
| 30 | Multi-symbol computation | ✅ |
| 31 | Native multi-timeframe data | ✅ |
| 32 | Strict external model ABI | ✅ |
| 33 | External model orchestration | ✅ |
| 34 | AI model semantics | ✅ |
| 35 | Model visualization and explanation surfaces | ✅ |

## Verification record

### Historical regression chain

- [x] `STAGE53_AUTOMATION_LIFECYCLE_RISK_OK`
- [x] `STAGE54_DEEP_14_17_OK`
- [x] `STAGE55_ARCHITECTURE_18_OK`
- [x] `STAGE56_TRADING_SYSTEM_VISUAL_OK`
- [x] `STAGE57_INTERACTIVE_UI_METADATA_OK`
- [x] `STAGE58_ADVANCED_VISUALS_OK`
- [x] `STAGE59_REALTIME_VISUAL_ENGINE_OK`
- [x] `STAGE60_DECLARATIVE_VISUAL_APP_OK`
- [x] `STAGE61_CORESPIRIT_DOC_SPLIT_OK`
- [x] `STAGE62_64_EXECUTION_TARGETS_SCANNER_OK`
- [x] `STAGE65_66_MULTI_SYMBOL_TIMEFRAME_OK`

### Documentation governance restoration

- [x] `CORESPIRIT.md` contains stable architecture plus concise version history; detailed implementation status stays in the tracker.
- [x] `CORESPIRIT_BUILD_TRACKER.md` is restored as the living implementation/status record.
- [x] `CORESPIRIT_V55_MANIFEST.json` is the current machine release record; older manifests remain immutable release records.
- [x] No version-specific CoreSpirit architecture/tracker Markdown files are required or introduced; version history stays concise in CORESPIRIT.md while implementation truth stays here.

## v53 implementation record

### Execution targets

- [x] Target profile contract is orthogonal to program layer.
- [x] CHART, REPLAY, BACKTEST, SCANNER, ALERT, SERVER, AUTOMATION, RESEARCH profiles exist.
- [x] Target-incompatible operations are rejected at the runtime boundary.
- [x] Same validated artifact can be hosted by multiple target profiles.

### Native scanner

- [x] Universe declaration is host-owned.
- [x] Scanner executes the same validated artifact per instrument.
- [x] Candidates are immutable and typed.
- [x] Score/metadata are preserved.
- [x] Ranking uses deterministic stable tie-breaking.
- [x] Scheduler is pluggable; local batching is the reference implementation.
- [x] Scanner never receives broker credentials or arbitrary network access.


## v54 implementation record

### Multi-symbol computation

- [x] `market("SYMBOL")` is a typed CoreSpirit data reference.
- [x] `market("NIFTY").close - market("BANKNIFTY").close` compiles through the same stable call/VM path.
- [x] Cross-symbol samples use a shared base execution timestamp.
- [x] Future samples are rejected.
- [x] Optional max-staleness validation is part of the host contract.
- [x] External symbol history can feed indicator functions without a second series engine.

### Multi-timeframe computation

- [x] `timeframe("1D")` is a typed CoreSpirit data reference.
- [x] `timeframe("1D").close` and local references such as `let daily = timeframe("1D")` are supported.
- [x] Higher-timeframe data defaults to confirmed/last-known alignment.
- [x] Future and developing higher-timeframe samples are excluded by default.
- [x] External timeframe history can feed indicators through the existing IR call ABI.
- [x] Short historical lookbacks can fall back to the existing contextual `request()` host boundary.

### v54 verification

- [x] `STAGE65_66_MULTI_SYMBOL_TIMEFRAME_OK`
- [x] Focused CoreSpirit TypeScript check passes.
- [x] Roadmap validates at 31 stages.


## v55 implementation record

### Strict external model ABI

- [x] `CoreSpiritStrictModelManifest` defines implementation, transport, input schema, output schema, deterministic policy, state/rollback semantics and resource quotas.
- [x] Model features have named dtype/shape contracts and are validated before adapter execution.
- [x] Market-state access is an explicit `read-market-state` capability; undeclared adapters receive only scalar context.
- [x] Prediction, optional confidence, metadata, output checksum, state checksum and next state token are explicit result fields.
- [x] Stateful models are rejected unless `rollbackSafe=true`.

### External model orchestration

- [x] `CoreSpiritExternalModelRegistry` and `CoreSpiritModelOrchestrator` provide one semantic host boundary.
- [x] Python, C++, Rust, WASM, ONNX and remote adapter classes share the same contract.
- [x] Model inference is gated by execution-target capability.
- [x] Input/output and per-bar call quotas are enforced.
- [x] Request checksums bind model identity, run context, features, market state and state token.
- [x] Python research client exposes a model handle without embedding the CoreSpirit VM.
- [x] Model inference remains downstream-neutral: it can inform signals/visuals/research but cannot bypass automation/risk/policy/execution.

### v55 verification

- [x] `STAGE67_68_EXTERNAL_MODEL_ABI_OK`
- [x] `STAGE69_70_AI_MODEL_VISUALIZATION_OK`
- [x] Focused external-model TypeScript check passes.
- [x] Roadmap validates at 33 stages.

## v56 implementation record

### AI model semantics

- [x] AI is represented by `modelKind: "ai"` on the existing strict external-model manifest rather than a new runtime.
- [x] AI output mapping defines direction and optional regime/class-probability metadata keys.
- [x] AI predictions normalize into typed direction, probability, confidence, optional regime and optional class probabilities.
- [x] Invalid AI direction values are rejected rather than silently becoming executable decisions.
- [x] `CoreSpiritAiModelCatalog.load()` provides a host-side AI model handle over the existing registry/orchestrator.

### Model visualization and explanation surfaces

- [x] Structured AI output projects into the existing `probability_surface`, `model_field` and optional `regime_band` declarative visual kinds.
- [x] Generated visuals carry model/version/provenance metadata and serializable inspect actions.
- [x] Model visuals have no risk, policy or execution authority.
- [x] Model explanation visuals remain compatible with the existing scene graph and realtime visual patch engine.

### v56 verification

- [x] `STAGE69_70_AI_MODEL_VISUALIZATION_OK`
- [x] Focused AI/model visualization TypeScript check passes.
- [x] Roadmap validates at 35 stages.

## Next concrete work

### Priority 1 — language ergonomics

Add first-class records, lists, iteration, scan blocks, ranking expressions, and explicit developing-timeframe policy syntax that lower to the same stable IR/VM. Do not create another parser or runtime.

### Priority 2 — production scanner scheduling

Add worker-based execution with explicit concurrency, cancellation, quotas, backpressure, deterministic result collection, and failure isolation.

### Priority 3 — advanced visual production backends

Implement host renderers for the highest-value visual primitives while keeping CoreSpirit renderer-neutral.

### Priority 4 — production validation

Run the complete application build in an environment with installed frontend dependencies, then add end-to-end browser/replay/live-host validation.

### Priority 5 — production model adapters

Replace callback/reference adapters with production transports for Python model workers, C++/Rust RPC, WASM runtimes, ONNX Runtime and remote model services; keep the same strict ABI and contract tests.

### Priority 6 — production AI explanation pipeline

Connect live/replay model results to persisted model explanation scenes, add calibrated multi-class probability surfaces, and expose provenance/feature context through the IDE inspector without moving any risk or execution authority into the model layer.

## Change policy

1. Update `docs/CORESPIRIT.md` only when architecture/invariants/design truth changes.
2. Update this tracker whenever implementation status, verification, known gaps, or next work changes.
3. Keep release manifests machine-readable and concise.
4. Do not create `CORESPIRIT_Vxx.md` or additional tracker Markdown files.
5. Every new stage must identify its acceptance test and whether it changes architectural truth.
6. Multi-symbol and multi-timeframe changes must specify synchronization and look-ahead behavior explicitly before language/API expansion.
7. New model backends must implement the strict semantic ABI before entering the supported backend set; Python remains research/orchestration infrastructure rather than a second CoreSpirit runtime.
8. Explainability/debugging must remain observational: trace, inspect and source highlighting may read runtime evidence but may not mutate the trading authority path.


## v57 implementation record

### Automation explainability (#19)

- [x] Added `CoreSpiritAutomationExplainabilityStore` with bounded retention and lookup by intent/automation.
- [x] Added versioned automation explanation records with event ID, intent ID, program checksum, decision trace, final decision, authority checksum and explanation checksum.
- [x] Reused the existing execution-authority path; explainability remains observational and cannot approve risk or execute orders.
- [x] Structured signal/risk/policy/execution facts remain machine-readable instead of relying on free-form explanation strings.

### Visual debugger (#20)

- [x] Runtime supports optional per-instruction debug tracing via `debugTrace: true`.
- [x] Trace captures PC, opcode, source-map location, result register and scalar result value.
- [x] Added `CoreSpiritVisualDebuggerSession` for deterministic bar-level inspection using the same executable artifact and dataset.
- [x] Debugger exposes bar snapshot, execution path, runtime state, outputs and signal explanations.
- [x] Source-map location is surfaced as an editor highlight target.
- [x] Active chart clicks can emit `TRADINGCORE_CORESPIRIT_DEBUG_BAR` without gaining runtime/execution authority.
- [x] CoreSpirit IDE exposes a Visual Debugger panel and can inspect a selected bar directly.

### v57 verification

- [x] `STAGE71_72_AUTOMATION_EXPLAINABILITY_VISUAL_DEBUGGER_OK`
- [x] Focused TypeScript check passes for runtime tracing, explainability store and debugger session.
- [x] Existing external-model and multi-symbol/MTF contracts remain compatible.
- [x] Roadmap validates at 39 stages.

## v58 implementation record

### Visual compiler (#21)

- [x] Added `semanticGraph.ts` with semantic, execution, visual and reactive graph contracts.
- [x] Compiler attaches graph metadata to the existing validated Core IR artifact.
- [x] Semantic nodes preserve IR instruction order, source-map location, dependencies, source inputs, purity and effect classification.
- [x] Visual graph connects visual/UI/signal/automation outputs back to their dependency nodes.
- [x] Graph metadata is optional on IR, preserving compatibility with older artifacts.

### Reactive runtime (#22)

- [x] Added `reactiveEngine.ts` with changed-input invalidation, downstream dirty propagation and pure-node value caching.
- [x] Runtime integrates reactive reuse into the existing VM without introducing a second executor.
- [x] Stateful/impure operations remain recomputed; effect nodes execute in deterministic order.
- [x] Realtime rollback clears speculative reactive caches before the next revision.
- [x] Runtime exposes recompute/reuse/effect statistics for debugger/performance tooling.

### v58 verification

- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] Focused TypeScript check passes for compiler graphs, runtime reactive scheduling and the new conformance test.
- [x] Prior explainability/debugger, multi-symbol/MTF, external-model ABI and AI visualization contracts remain compatible.
- [x] Roadmap validates at 39 stages.

## v58 next concrete work

1. Add persisted execution-trace storage for replay sessions so debugger frames can be reopened without rerunning the prefix.
2. Add multi-bar trace comparison and a visual “why did this change?” diff between two bars/revisions.
3. Add direct chart signal/object hit-testing so a click on a signal or visual object jumps to the exact related explanation/IR source location.
4. Add browser end-to-end validation for chart click → debugger panel → source highlight.
