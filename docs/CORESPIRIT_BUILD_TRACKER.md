# CoreSpirit Build Tracker

> Living implementation truth for CoreSpirit.
>
> `docs/CORESPIRIT.md` is the stable architecture brain. This file records what is actually built, what has been verified, what remains incomplete, and the next concrete work.

## Current release

**Release:** CoreSpirit v78 — P0 source provenance / source-map hardening

**Tracker state:** restored as a first-class project document.

**Architecture document:** `docs/CORESPIRIT.md`

**Machine release record:** `CORESPIRIT_V78_MANIFEST.json`

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
- [x] First-class visual placement: chart/panel/side-panel/floating areas with explicit visibility and axis-range metadata
- [x] First-class coordinate spaces: time, bar, price, percentage, screen and normalized
- [x] Source-level coordinate inference for common `[time,price]` and normalized 0..1 coordinate pairs
- [x] Point-based line/box/polygon geometry with same-space validation
- [x] Relative bar anchors (`above_bar`, `below_bar`, `at_bar`) and panel/screen text placement
- [x] Structured custom visual payloads with semantic coordinate placement
- [x] Shared callable/member registry for semantic analysis, lowering and editor member completion
- [x] Registered surface-syntax transforms with the core parser kept small
- [x] Six-concept language vocabulary: DATA, LET, WHEN, SHOW, MODEL and AUTOMATE
- [x] Universal EVENT emission with declarative routing to webhook/notification/alert/automation destinations
- [x] Central WHEN normalization for named events, bar-close/fill/zone/webhook sources and expression-driven conditions
- [x] Composable surface graph connecting indicator/model/event/WHEN/AUTOMATE/ORDER/SHOW contracts
- [x] Progressive-simple syntax contract from one-line SHOW through reactive events and automation
- [x] Blue product UI accent across TradingCoreOS chrome while trading semantic colors remain independent
- [x] Executable WHEN indentation/colon surface lowering to core if/event control flow
- [x] Universal SHOW surface lowering to one Core IR `show` emission kind and existing scene objects
- [x] Centralized SHOW coordinate inference helper with structural bracket parsing and explicit inference reasons
- [x] Public visual projection summary boundary that hides Scene Graph nodes/topology from the primary runtime API
- [x] MODEL and AUTOMATE declaration metadata attached to the same executable IR artifact
- [x] Universal ORDER intent surface: direction + sizing + stop/target lower to one order-intent path
- [x] Universal ORDER intent surface: direction + sizing + stop/target lower to one order-intent path
- [x] Host-resolved `event("name")` query for automation WHEN triggers
- [x] Language-service concept vocabulary surfaced as the primary user mental model
- [x] Advanced visual API completions are secondary to SHOW, while compatibility access remains available
- [x] Compiler emission lowering sourced from builtin descriptors rather than a duplicate allow-list
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
- [x] Declarative MODEL surface with compact registry bindings and host implementation bindings (`use`, `use python`, etc.)
- [x] MODEL input/output declarations captured as serializable artifact metadata
- [x] Optional MODEL input/output field types (`number`, `string`, `boolean`, `series<number>`) with conservative `unknown` fallback
- [x] MODEL output member completion from the same language-service surface contract
- [x] Qualified model-output references lowered through the existing expression/IR pipeline
- [x] Host-owned model output resolver boundary with opaque binding metadata and no filesystem/process/network authority in the VM
- [x] Universal SHOW projection of a whole model result without a model-specific visual primitive
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
- [x] Numerical execution planner for CPU/WASM/GPU host placement
- [x] Deterministic backend eligibility and CPU fallback
- [x] Bounded symbol × timeframe × bar workload batching
- [x] Hybrid pure-work accelerator placement with CPU effect barriers
- [x] Capability-based sandbox with explicit safe allow-list and resource quotas
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
- [ ] Rich named-argument syntax; current examples use canonical positional forms
- [ ] Formal user-defined function/declaration syntax; keep the core grammar small until the function model is specified
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
| Scene Graph → primary language/runtime API | internal compiler/runtime concern; public API exposes summaries only | ✅ |
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
| GPU/WASM backend → broker/risk/policy authority | forbidden; compute placement only | ✅ |
| Sandbox → raw network/filesystem/process/native/broker capabilities | not expressible | ✅ |
| Accelerator selection → semantic language behavior | forbidden; host planner only | ✅ |
| Multi-symbol/timeframe access → broker API inside VM | forbidden; contextual host resolver only | ✅ |
| Automation event input → hidden signal emission | forbidden; explicit host-resolved event query only | ✅ |
| MODEL/AUTOMATE declaration → second runtime | forbidden; metadata + existing model/order-intent contracts only | ✅ |

## Stage tracker

**Status legend:** ✅ implemented and verified; ◐ architecture defined / implementation staged.

| Stage | Name | Status |
|---:|---|---|
| 1 | Language foundation | ✅ |
| 2 | Series runtime | ✅ |
| 3 | Indicator runtime | ✅ |
| 4 | IR + VM | ✅ |
| 5 | Historical vs realtime semantics | ✅ |
| 6 | Runtime-native indicators | ✅ |
| 7 | Small semantic core | ✅ |
| 8 | Compiler pipeline | ✅ |
| 9 | Stable IR contract | ✅ |
| 10 | CoreSpirit replay | ✅ |
| 11 | Debugger | ✅ |
| 12 | Signal boundary | ✅ |
| 13 | Future strategy model | ✅ |
| 14 | Killer example | ✅ |
| 15 | Explicit non-goals | ✅ |
| 16 | Release roadmap | ✅ |
| 17 | IDE/runtime convergence | ✅ |
| 18 | Platform architecture | ✅ |
| 19 | Language-driven interactive UI | ✅ |
| 20 | Data-rich visual metadata | ✅ |
| 21 | Exploration surfaces | ✅ |
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
| 36 | Explainable automation | ✅ |
| 37 | Visual debugger experience | ✅ |
| 38 | Visual compiler graph | ✅ |
| 39 | Reactive runtime | ✅ |
| 40 | Numerical execution planner | ✅ |
| 41 | Capability-based sandbox | ✅ |
| 42 | CoreSpirit v1 converged runtime | ✅ |
| 43 | Programmable visual coordinate system | ✅ |
| 44 | Core language unification | ✅ |
| 45 | Six-concept language surface | ✅ |
| 46 | Universal SHOW visual primitive | ✅ |
| 47 | Universal SHOW surface + coordinate inference | ✅ |
| 48 | Scene graph encapsulation | ✅ |
| 49 | Declarative MODEL surface | ✅ |
| 50 | Declarative AUTOMATE surface | ✅ |
| 51 | Universal ORDER intent surface | ✅ |
| 52 | Universal EVENT emission and routing | ✅ |
| 53 | WHEN as the central reactive construct | ✅ |
| 54 | Composable language surfaces | ✅ |
| 55 | Progressive simplicity | ✅ |
| 56 | Standard library discoverability | ✅ |
| 57 | Readable surface syntax | ✅ |
| 58 | Compiler complexity absorption | ◐ |
| 59 | Progressive authoring levels | ◐ |

| 49 | Declarative MODEL surface | compiler | 18, 44, 45, 48 | ✅ |

### Stage 49 — Declarative MODEL surface

The user-facing model language is intentionally small. `MODEL` declares a binding plus an input/output interface; the strict ABI and adapter ecosystem remain below the language boundary.

| Gate | Status | Evidence |
|---|---|---|
| Compact registry binding | ✅ | `use "model-id"` captured as registry binding metadata |
| Host implementation binding | ✅ | `use python "path"` captured without granting filesystem authority |
| Stable input/output schema | ✅ | `input:` / `output:` declarations attach to executable artifact metadata |
| Model output references | ✅ | `Regime.confidence` lowers to `model("Regime").confidence` and is statically checked |
| Host output bridge | ✅ | `CoreSpiritModelOutputResolver` is optional and host-owned |
| Universal SHOW integration | ✅ | `show Regime` uses the existing `show` IR path |
| ABI hidden from source mental model | ✅/governance | Source contains no ABI/transport/adapter/rollback syntax |

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
- [x] `STAGE67_68_EXTERNAL_MODEL_ABI_OK`
- [x] `STAGE69_70_AI_MODEL_VISUALIZATION_OK`
- [x] `STAGE71_72_AUTOMATION_EXPLAINABILITY_VISUAL_DEBUGGER_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE43_VISUAL_COORDINATE_SYSTEM_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`

### Documentation governance restoration

- [x] `CORESPIRIT.md` contains stable architecture plus concise version history; detailed implementation status stays in the tracker.
- [x] `CORESPIRIT_BUILD_TRACKER.md` is restored as the living implementation/status record.
- [x] `CORESPIRIT_V73_MANIFEST.json` is the current machine release record; older manifests remain immutable release records.
- [x] No version-specific CoreSpirit architecture/tracker Markdown files are required or introduced; version history stays concise in CORESPIRIT.md while implementation truth stays here.


## v71 deeper architecture synthesis — #13–#18

The v71 work is treated as one language-design system rather than six unrelated improvements. The goal is to make the source language smaller, clearer and more composable **without** weakening the architecture below it.

### Public language versus internal machinery

The author-facing layer should remain:

```text
DATA / LET / WHEN / SHOW / MODEL / AUTOMATE
```

Everything below is an implementation/service concern unless inspection is explicitly requested:

```text
source
  ↓
normalization
  ↓
AST / semantic analysis
  ↓
stable IR
  ↓
reactive VM
  ↓
capability-gated hosts
  ├── data
  ├── visuals
  ├── models
  ├── automation
  └── controlled execution
```

No public shorthand may bypass this chain.

### #13–#14: composition plus progressive simplicity

Composition is the structural rule; simplicity is the authoring strategy:

```text
value / indicator ──→ SHOW
        │
        ├──────────→ WHEN ──→ AUTOMATE ──→ ORDER INTENT
        │                ↑
        └──────────→ MODEL / MODEL OUTPUT
EVENT ──────────────→ WHEN
```

The composition graph is descriptive metadata over the same executable artifact. It is not an evaluator, scheduler or second runtime.

Progressive examples must all converge on that same artifact:

```corespirit
show ema(close, 20)
```

then:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
show fast, slow
```

then:

```corespirit
when fast crossesAbove slow:
    emit "LONG"
```

then, when automation is needed:

```corespirit
automate:
    when "LONG":
        order long 1% risk
```

Each step introduces one new semantic idea while preserving one runtime.

### #15–#16: complexity firewall plus invisible superpowers

The platform keeps difficult mechanisms because trading software needs them, but does not require the author to program those mechanisms directly. The firewall therefore has two halves:

```text
HIDDEN FROM AUTHOR
IR / renderer / transport / broker / planner / risk plumbing / lifecycle mechanics

PROTECTED UNDERNEATH
one IR / one VM / replay / reactivity / sandbox / typed model ABI / broker boundary
```

A proposed language feature is not ready for promotion when it requires users to learn infrastructure vocabulary, creates a parallel executor, or weakens a protected authority boundary.

### #17: standard library as a product surface

The runtime registry and the human discovery catalog have different jobs:

| Layer | Job |
|---|---|
| Semantic core | Small, stable primitives with deterministic contracts |
| Extension library | Broader platform capability without core-language inflation |
| Discovery catalog | Human ordering, grouping, descriptions and progressive disclosure |
| Compatibility/member registry | Existing advanced names and host/namespace contracts |

Current counts are:

```text
30 semantic core primitives
80 extension / compatibility capabilities
110 registered callables in the combined registry
```

The catalog must never become a promise of functionality that the compiler/runtime cannot execute. That is why unsupported desired functions remain future candidates rather than fake builtins.

### #18: readable syntax as a lowering discipline

Readable syntax is accepted only when it is pure source sugar over an existing semantic path:

```text
a crossesAbove b
       ↓
crossover(a, b)
       ↓
existing condition semantics
```

And data references follow the same rule:

```text
market("NIFTY").close
       ↓
typed market reference + member access
       ↓
existing host-owned data resolver
```

The editor, compiler, diagnostics and hover surfaces must agree on the same spelling and the same lowering. Readability therefore improves the language without fragmenting the implementation.

### v71 website visual contract

The product accent is blue across active TradingCoreOS UI surfaces. Trading semantics are independent:

```text
BLUE   product identity / active state / positive-state accents
RED    negative / destructive / sell-state semantics
AMBER  caution / attention
PURPLE specialized or analytical roles
```

This is a visual token policy, not a runtime semantic change. Third-party brand artwork may retain its own official colors.


## Historical lineage reconciliation

This release deliberately uses the supplied pre-v45 CoreSpirit archive as a source of architectural truth. The old versioned Markdown files are **inputs to consolidation**, not additional active documentation. The result remains the two-document split:

- `docs/CORESPIRIT.md` — stable architecture brain.
- `docs/CORESPIRIT_BUILD_TRACKER.md` — living implementation truth.
- `CORESPIRIT_Vxx_MANIFEST.json` — machine release records.

### Historical source material consumed

- `CORESPIRIT_HISTORY.md`
- `CORESPIRIT_LAYERED_PLATFORM_V40.md`
- `CORESPIRIT_MODEL_AUTOMATION.md`
- `CORESPIRIT_PROJECT_TASKS.md`
- `CORESPIRIT_STAGES_1_16_DEEP.md`
- `CORESPIRIT_STAGES_10_13_DEEP.md`
- `CORESPIRIT_STAGES_13_14_DEEP.md`
- `CORESPIRIT_STAGES_46_47_DEEP.md`
- `CORESPIRIT_V28_DATA_VISUAL_CONTRACT.md`
- `CORESPIRIT_V30_RELEASE_NOTES.md`
- `CORESPIRIT_V31_CHART_DATA_FIX.md`
- `CORESPIRIT_V32_TIME_SERIES_CHART_CONTRACT.md`
- `CORESPIRIT_V33_REALTIME_INDICATOR_CONTRACT.md`
- `CORESPIRIT_V34_STDLIB_COMPILER_CONTRACT.md`
- `CORESPIRIT_V35_DEEP_STEPS_5_6_7_8.md`
- `CORESPIRIT_V36_IR_REPLAY_IMPLEMENTATION.md`
- `CORESPIRIT_V39_DEEP_1_16.md`
- `CORESPIRIT_V39_VERIFICATION.md`
- `CORESPIRIT_V41_DEEP_STAGES_1_2.md`
- `CORESPIRIT_V42_VISUAL_IDENTITY_AND_STAGES_3_4_5.md`
- `CORESPIRIT_V43_RENDERER_EVENT_BUS_IMPLEMENTATION.md`
- `CORESPIRIT_V37_MANIFEST.json` through `CORESPIRIT_V45_MANIFEST.json`

### Recovered historical contracts now reflected in the current build

- [x] v13–v20 market-history lifecycle, stale-response protection, cancellation, timezone/state-retention controls, parser recovery, type checks, quotas, indicator kernel and stable call/output identity were reconciled into the runtime invariants.
- [x] v21–v23 visual evolution (styled plots, labels, boxes, bands, fills, gradients, arrows, symbols, heatmaps, polylines, levels, tables and persistent visual reconciliation) is represented by the current scene graph and visual patch engine.
- [x] v24–v26 deterministic prediction, broker-neutral entry/exit intent, provider-neutral data requests, tick execution, footprint/intrabar contracts and host-side transport boundaries are represented by current model/data/execution contracts.
- [x] v27–v29 data planning, batching, editor language-service boundaries, semantic tooling, cached compilation and editor/runtime separation are represented by the current compiler/IDE architecture.
- [x] v30–v31 language freeze, scalar/series typing, future-index rejection, type-aware tooling, source maps, runtime checkpoints and target-based history loading are reflected in current language/runtime contracts.
- [x] v32–v36 explicit execution frames, canonical series cursor, realtime transactions, native indicator ABI, 30-primitive core, compiler pipeline, stable IR, artifact identity and deterministic replay are current invariants.
- [x] v37–v39 deterministic replay, observational debugger, immutable signal boundary, strategy/killer example and dependency-gated roadmap are retained and extended by later stages.
- [x] v40–v43 capability layers, persistent visual identity, renderer ABI and native event bus are retained and extended.
- [x] v45 model invocation, Python research and signal-to-automation remain the direct foundation for v55–v58 model/AI/reactive work.

### Recovered historical backlog reconciliation

The old master task file also contains a useful "adopt / improve / do not copy blindly" backlog. Those items are reconciled here instead of being reintroduced as a second roadmap.

| Historical item | Current interpretation |
|---|---|
| `once`, strict boolean/lazy evaluation, collections, loops, richer UDT/member syntax | **Open language ergonomics.** These belong in the existing compiler/IR roadmap and must not create a second execution engine. |
| Dynamic symbol/timeframe requests | **Implemented and extended.** v54 provides typed `market()` / `timeframe()` references with explicit alignment and look-ahead rules. |
| Bid/ask/spread/mid and lower-timeframe/intrabar access | **Implemented at the contract layer.** Host adapters still own real feed acquisition and session-specific semantics. |
| Footprint rows, heatmaps and rich object visuals | **Implemented as provider-neutral data/visual contracts.** Feed-native aggressor semantics and production viewport virtualization remain host work. |
| Session/calendar awareness | **Still open.** Exchange-specific sessions, trading-day identity and calendar resets need a dedicated host/data contract. |
| Editor completions, diagnostics, formatting, symbols, source maps, hot reload, Monaco adapter | **Foundation implemented.** Full browser/E2E validation and production dependency-backed editor validation remain open. |
| Command palette, profiler, richer packages/libraries | **Future tooling/product work.** They must sit above the same language-service/IR contract. |
| Alerts, webhooks, model results and execution events | **Integrated into the event/automation architecture.** Network delivery remains host-owned. |
| Separate Pine import/translation architecture | **Deliberately not adopted as an internal architecture.** A future bridge may translate into CoreSpirit source/IR, but Pine semantics do not define CoreSpirit internals. |
| Hot reload / atomic swap | **Historical foundation retained.** Reactive graph and artifact identity now constrain future implementations so stale builds cannot replace the active artifact. |
| Full reference-value indicator corpus | **Still open.** Mathematical definitions are centralized; broad external reference parity is not claimed complete. |
| Persistent VM artifact migration/version compatibility | **Still open.** Current artifacts are versioned and checksummed; migration across incompatible persisted artifacts needs an explicit policy. |

### Historical status reconciliation

Old "not claimed complete" items are not blindly carried forward. Current truth comes from the active 59-stage roadmap and tests.

**Superseded by later implementation:** rich visual primitives, persistent visual identity, renderer-neutral scene ABI, realtime visual transactions, model orchestration, multi-symbol/MTF alignment, structured AI semantics, explainability, visual debugging, visual compiler graphs and reactive scheduling.

**Still genuinely open:** complete exchange/session-calendar semantics, full reference-value indicator corpus, persistent executable-artifact migration compatibility, production worker scheduling/backpressure for large scans, production renderer/browser E2E coverage, and replacing model callback/reference adapters with all production transports.

### Historical manifest integrity

The following supplied historical manifests are retained unchanged in the current tree and verified byte-for-byte against the historical archive:

`CORESPIRIT_V37_MANIFEST.json`, `CORESPIRIT_V38_MANIFEST.json`, `CORESPIRIT_V39_MANIFEST.json`, `CORESPIRIT_V40_MANIFEST.json`, `CORESPIRIT_V41_MANIFEST.json`, `CORESPIRIT_V42_MANIFEST.json`, `CORESPIRIT_V43_MANIFEST.json`, `CORESPIRIT_V45_MANIFEST.json`.

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
- [x] `STAGE67_68_EXTERNAL_MODEL_ABI_OK`
- [x] `STAGE69_70_AI_MODEL_VISUALIZATION_OK`
- [x] `STAGE71_72_AUTOMATION_EXPLAINABILITY_VISUAL_DEBUGGER_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] Focused CoreSpirit TypeScript check passes.
- [x] Roadmap validated historically at 31 stages; the current roadmap has advanced beyond that snapshot.


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
- [x] Historical v56 roadmap validated at 35 stages; the current roadmap later advanced through the 39-, 41- and now 42-stage releases.

## v59 implementation record

### Historical consolidation

- [x] Reconciled the supplied CoreSpirit historical archive from the early foundation through v45 into the current architecture and tracker.
- [x] Folded historical stage contracts 1–16, rich data/visual contracts, realtime/indicator contracts, compiler/IR/replay contracts, layered platform contracts, renderer/event contracts, and model/research/automation contracts into the active documentation.
- [x] Confirmed historical manifests v37–v45 are byte-for-byte identical between the supplied archive and the current tree.
- [x] Preserved the current v58 runtime/code unchanged; this release is documentation/lineage consolidation rather than a new execution-stage implementation.
- [x] Kept unrelated product repair/API Markdown outside the CoreSpirit architecture docs; those documents remain subsystem-specific rather than being mixed into the CoreSpirit architecture brain.

### v59 verification

- [x] Historical source inventory matches the supplied CoreSpirit pre-v45 archive.
- [x] Historical manifest byte-for-byte checks pass for v37–v45.
- [x] `docs/CORESPIRIT.md` contains the recovered lineage and invariant reconciliation.
- [x] `docs/CORESPIRIT_BUILD_TRACKER.md` contains the consumed-source index, recovered contracts and current open-gap reconciliation.
- [x] No additional version-specific CoreSpirit Markdown file is introduced.
- [x] Roadmap remains at the then-current 39 execution stages; v59 does not invent a new stage merely for documentation consolidation.

## v60 implementation record

### Numerical execution planner (#23)

- [x] Added `executionPlanner.ts` with CPU/WASM/GPU backend profiles.
- [x] Workload estimate uses compiled semantic graph dimensions: symbols × timeframes × bars × pure instructions.
- [x] Large workloads are converted into bounded deterministic batches.
- [x] Deterministic plans exclude backends that do not advertise deterministic execution.
- [x] Hybrid plans assign pure numerical nodes to an accelerator and retain effect/state nodes on the ordered CPU runtime.
- [x] CPU remains the semantic fallback when alternate backends are unavailable or below threshold.
- [x] The planner does not execute GPU/WASM work; backend execution remains host-owned.

### Capability sandbox (#24)

- [x] Added `capabilitySandbox.ts` with explicit program-layer/target/host-grant intersection.
- [x] CPU/WASM/GPU compute requires explicit capability grants; defaults remain CPU-only.
- [x] Raw network, filesystem, arbitrary process, native call, broker credential, direct broker and direct account capabilities are absent from the sandbox vocabulary.
- [x] Per-revision instruction, data-request, model-call, visual-node, compute-unit and GPU-memory quotas are enforceable.
- [x] Accelerator capability never grants additional trading authority.
- [x] Runtime kernel can receive the same sandbox as a shared platform boundary.

### v60 verification

- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] Focused TypeScript check passes for planner, sandbox and roadmap.
- [x] Existing multi-symbol/MTF, model/AI, explainability/debugger and reactive contracts remain unchanged.
- [x] Roadmap validates at 41 stages.

## v61 implementation record

### CoreSpirit v1 converged runtime

- [x] Added `coreSpiritV1Runtime.ts` as an orchestration facade over the existing compiler, Core IR/VM, execution hosts, replay contract, reactive runtime and visual scene graph.
- [x] Historical and replay execution consume the same validated executable artifact; the v1 layer does not introduce a second evaluator.
- [x] Replay runtime identity is stable (`source + dataset`) so run-specific metadata cannot make repeated deterministic replays diverge.
- [x] v1 run results expose reactive recompute/reuse/effect statistics from the existing runtime.
- [x] Historical/replay outputs project into the persistent renderer-neutral scene graph with stable scene identity and checksums.
- [x] Realtime v1 sessions join the existing realtime execution host to the existing transactional visual engine: revise → scene diff/patch → commit/rollback.
- [x] Signal projection remains downstream and broker-neutral; v1 orchestration does not add execution authority.
- [x] `assertCoreSpiritV1Determinism()` delegates to the established replay verifier rather than creating a new execution path.

### v61 verification

- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] Focused TypeScript check passes for v1 runtime, execution hosts, replay and scene integration.
- [x] Deterministic replay regression found and fixed: replay hosts now receive a stable run ID instead of a time-generated run ID.
- [x] Roadmap validates at 42 stages.
- [x] v60 planner/sandbox, v73–v74 reactive/visual graph, model/AI, explainability/debugger and multi-symbol/MTF regression contracts remain source-compatible.

## v62 implementation record

### Programmable visual coordinate system (#25)

- [x] Added `visualCoordinates.ts` as the renderer-neutral placement contract.
- [x] Added semantic chart areas (`price`, `volume`, `indicator`, `custom`) plus named `panel`, `sidePanel` and `floatingArea` destinations.
- [x] Added coordinate spaces `time`, `bar`, `price`, `percentage`, `screen` and `normalized`.
- [x] Added first-class visual ranges and visibility metadata so plot placement is semantic state rather than renderer-side hiding.
- [x] Preserved the existing one-argument `plot(value)` path while adding typed plot placement through area/condition/range arguments.
- [x] Added point-based line/box/polygon geometry while retaining legacy time/price compatibility projections.
- [x] Added relative bar anchors `above_bar`, `below_bar` and `at_bar`.
- [x] Added screen/panel text placement and coordinate-aware custom visuals.
- [x] Added same-coordinate-space validation for line, box and polygon geometry to prevent ambiguous host transforms.
- [x] Preserved visual placement and geometry in the persistent scene graph and output dispatcher.
- [x] Kept renderer/device transforms host-owned; CoreSpirit never receives DOM/canvas/WebGL/WebGPU/native renderer handles.

### v62 verification

- [x] `STAGE43_VISUAL_COORDINATE_SYSTEM_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] Focused TypeScript check passes for visual coordinates, runtime, compiler, semantic analysis and scene graph.
- [x] v1 runtime, reactive graph, numerical planner and capability sandbox regression contracts remain compatible.
- [x] Historical v62 verification recorded a 43-stage roadmap at that release; the active v73 roadmap now contains 59 stages.

## Next concrete work

Historical reconciliation is complete; v1 runtime convergence is now implemented. The next concrete work is host/product maturation below.

### v1 boundary now locked

- [x] One executable artifact across historical/replay/realtime hosts
- [x] Reactive runtime remains the only execution/reuse substrate
- [x] Renderer-neutral scene graph remains the only semantic visual model
- [x] Deterministic replay remains the acceptance/truth surface
- [x] Broker/risk/policy authority remains outside CoreSpirit



### Priority 1 — language ergonomics

Add first-class records, lists, iteration, scan blocks, ranking expressions, and explicit developing-timeframe policy syntax that lower to the same stable IR/VM. Do not create another parser or runtime.

### Priority 2 — production scanner scheduling

Add worker-based execution with explicit concurrency, cancellation, quotas, backpressure, deterministic result collection, and failure isolation.

### Priority 3 — advanced visual production backends

Implement host renderers for the highest-value visual primitives while keeping CoreSpirit renderer-neutral. Use the v62 area/coordinate/geometry contract as the sole semantic input; do not add renderer-specific placement syntax to the language.

### Priority 4 — production validation

Run the complete application build in an environment with installed frontend dependencies, then add end-to-end browser/replay/live-host validation.

### Priority 5 — production model adapters

Replace callback/reference adapters with production transports for Python model workers, C++/Rust RPC, WASM runtimes, ONNX Runtime and remote model services; keep the same strict ABI and contract tests.

### Priority 6 — production AI explanation pipeline

Connect live/replay model results to persisted model explanation scenes, add calibrated multi-class probability surfaces, and expose provenance/feature context through the IDE inspector without moving any risk or execution authority into the model layer.

### Priority 5 — production compute backends

Implement actual CPU/WASM/GPU host adapters behind the planner. Keep the planner stable while adding device-specific backends, numerical parity tests, cancellation, memory accounting and scheduler integration.

## Change policy

1. Update `docs/CORESPIRIT.md` only when architecture/invariants/design truth changes.
2. Update this tracker whenever implementation status, verification, known gaps, or next work changes.
3. Keep release manifests machine-readable and concise.
4. Do not create `CORESPIRIT_Vxx.md` or additional tracker Markdown files.
5. Every new stage must identify its acceptance test and whether it changes architectural truth.
6. Multi-symbol and multi-timeframe changes must specify synchronization and look-ahead behavior explicitly before language/API expansion.
7. New model backends must implement the strict semantic ABI before entering the supported backend set; Python remains research/orchestration infrastructure rather than a second CoreSpirit runtime.
8. Explainability/debugging must remain observational: trace, inspect and source highlighting may read runtime evidence but may not mutate the trading authority path.
9. Historical CoreSpirit Markdown is mined into the two canonical documents; do not reintroduce legacy version-specific CoreSpirit Markdown when incorporating older design history.
10. Historical release manifests remain immutable machine records; when a historical manifest is reconciled, verify it against the supplied source before relying on it.
11. Acceleration backends must not change semantic authority: GPU/WASM placement can optimize pure computation, but risk, policy, execution and broker access remain host-owned boundaries.
12. New CoreSpirit capabilities must be added to the explicit sandbox vocabulary and tested for layer/target intersection; never infer OS or network capability from a compute backend.
13. New visual primitives must express placement and coordinate semantics in the renderer-neutral scene model; host renderers own viewport/device transforms and must not require CoreSpirit-specific device handles.


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
- [x] Roadmap validates at 42 stages.

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
- [x] Roadmap validates at 42 stages.

## v58 next concrete work

1. Add persisted execution-trace storage for replay sessions so debugger frames can be reopened without rerunning the prefix.
2. Add multi-bar trace comparison and a visual “why did this change?” diff between two bars/revisions.
3. Add direct chart signal/object hit-testing so a click on a signal or visual object jumps to the exact related explanation/IR source location.
4. Implement production CPU/WASM/GPU adapters behind the v60 planner, with numerical parity and deterministic-profile tests.
4. Add browser end-to-end validation for chart click → debugger panel → source highlight.


## v63 implementation record

### Core language unification

- [x] Added `callContract.ts` with shared IR emission-kind and namespaced-call contracts.
- [x] Extended builtin descriptors with `emitKind` so direct output/event lowering has one source of truth.
- [x] Added `memberRegistry.ts` for UI, visual, app and scanner member contracts, including call names, arity, return types, action argument positions and scan-candidate emission.
- [x] Refactored `compiler.ts` to consume builtin/member descriptors instead of maintaining a second hard-coded emission list and namespace lowering table.
- [x] Refactored `semanticAnalyzer.ts` to consume the same member registry for arity and return-type contracts.
- [x] Refactored `languageService.ts` member completion to consume the shared registry.
- [x] Added `surfaceForms.ts`; `syntax.ts` is now a generic executor over registered surface transforms.
- [x] Preserved the existing concise source forms used by historical strategy and visual examples.
- [x] Kept the executable parser grammar unchanged in scope: declarations, expressions, calls, members, indexing and control flow.
- [x] Added `stage44LanguageUnification.test.ts`.

### v63 verification

- [x] `STAGE44_LANGUAGE_UNIFICATION_OK`
- [x] `STAGE43_VISUAL_COORDINATE_SYSTEM_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] `STAGE61_CORESPIRIT_DOC_SPLIT_OK`
- [x] Focused TypeScript compilation passes for the unification path.
- [x] Roadmap validates at 44 stages.

### v63 boundary

The v63 work does **not** claim named arguments, user-defined functions, a new declaration grammar, or a second AST. Those remain separate language-design decisions and are intentionally not introduced as incidental syntax additions.


## v63 next concrete work

1. Keep new language additions contract-first: expand the shared callable/member descriptors before touching parser or editor code.
2. Consider a data-driven argument-schema layer so more semantic argument validation can move out of feature-specific analyzer branches.
3. Treat named arguments and user-defined functions as explicit language-design milestones rather than incidental syntax sugar.


## v64 implementation record

### Six-concept language surface

- [x] Added `languageConcepts.ts` defining the six-user-concept vocabulary: DATA, LET, WHEN, SHOW, MODEL and AUTOMATE.
- [x] Kept the executable parser grammar unchanged; the six concepts are semantic categories over the existing grammar, not a second parser.
- [x] Extended `surfaceForms.ts` with structural `WHEN` lowering from indentation/colon syntax to the existing `if` control-flow form.
- [x] Added quoted-event `WHEN "NAME":` lowering to `event("NAME")`, separating event consumption from signal emission.
- [x] Added `SHOW values on area` lowering so multiple values project into the existing visual scene/placement contract without making `show` a second plotting runtime.
- [x] Added stable surface declaration metadata for `indicator`, `model` and `automate` declarations.
- [x] Attached the surface metadata to the existing Core IR artifact, preserving deterministic serialization and the one-artifact model.
- [x] Added an explicit host `eventResolver` to the runtime so automation event input stays host-owned and replayable instead of being synthesized by the VM.
- [x] Surfaced the six concepts in editor completions as the primary user vocabulary while retaining implementation-level callable/member completion for advanced users.
- [x] Kept MODEL implementation behind the existing host-owned model ABI; the declaration records features/predictions but does not invent a second in-VM model engine.
- [x] Kept AUTOMATE behind the existing order-intent/risk/policy boundary; declarative source does not gain broker credentials or direct execution authority.

### v64 verification

- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] `STAGE44_LANGUAGE_UNIFICATION_OK`
- [x] `STAGE43_VISUAL_COORDINATE_SYSTEM_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] `STAGE61_CORESPIRIT_DOC_SPLIT_OK`
- [x] Focused TypeScript compilation passes for the six-concept surface, runtime event input and IR metadata path.
- [x] Roadmap validates at 45 stages.

### v64 boundary

The v64 surface intentionally simplifies the user vocabulary without claiming every abbreviated prose form is already executable. In particular, `MODEL` declaration metadata does not itself replace a host model transport, and richer prose actions such as `buy 1% risk` or `stop atr(14) * 1.5` remain candidates for a future order-intent surface milestone. The current executable AUTOMATE path uses existing canonical order-intent calls such as `buy(...)`.

## v64 next concrete work

1. Add a data-driven argument-schema registry so semantic validation can move out of feature-specific analyzer branches.
2. Define the minimal semantic MODEL output binding contract so `predict regime` can connect directly to host model results without adding model runtime syntax.
3. Define the minimal risk-oriented AUTOMATE order specification (`quantity`, `% risk`, stop, target) as structured order-intent fields rather than ad hoc command syntax.
4. Add source-level concept-aware formatting and quick fixes (`show` ↔ `plot`, `when` ↔ `if`) without introducing a second grammar.


## v65 implementation record

### Universal SHOW visual primitive

- [x] Added `show` as a dedicated Core IR emission kind rather than lowering SHOW through `plot`, `line`, `box` or `zone` emission kinds.
- [x] Added the `show` builtin contract to the shared builtin registry; the compiler therefore emits one canonical visual instruction.
- [x] Runtime `show` lowers into existing renderer-neutral series, line, box, zone and signal-label objects, so the scene graph remains the visual authority.
- [x] Preserved `plot()` and the richer visual call family as compatibility/advanced APIs rather than removing them.
- [x] Kept SHOW conditional behavior as ordinary WHEN/control-flow semantics plus a visual emission, not a second conditional renderer.

### Coordinate inference

- [x] Added source-level inference for bracket pairs.
- [x] `[time, price]`-shaped pairs lower to explicit `point(..., "time")`.
- [x] Numeric 0..1 pairs lower to explicit normalized points.
- [x] Explicit `point(..., space)` remains the advanced escape hatch.
- [x] Existing same-space geometry validation remains mandatory after inference.
- [x] Price-domain SHOW zones carry viewport/domain intent without inventing hidden time coordinates.
- [x] Named panels/areas are parsed before generic chart-area suffixes so `in panel "Momentum"` remains unambiguous.

### Surface-pipeline unification

- [x] `syntax.ts` is now a single delegating normalization boundary; the structural surface implementation lives in `surfaceForms.ts`.
- [x] This removes the remaining duplicate line-by-line surface normalizer identified by the language review.
- [x] The six-concept model remains semantic rather than becoming six independent parser grammars.

### v65 verification

- [x] `STAGE46_UNIVERSAL_SHOW_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] `STAGE44_LANGUAGE_UNIFICATION_OK`
- [x] `STAGE43_VISUAL_COORDINATE_SYSTEM_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] `STAGE61_CORESPIRIT_DOC_SPLIT_OK`
- [x] Focused TypeScript compilation passes for the universal SHOW path and existing convergence contracts.
- [x] Roadmap validates at 46 stages.

### v65 boundary

v65 does not remove advanced visual APIs, add device coordinates to the VM, or claim that every possible natural-language visual sentence is executable. Coordinate inference is deliberately conservative; when source shape is ambiguous, advanced users can use explicit `point(..., space)`.

## v65 next concrete work

1. Add a structured SHOW argument schema so style, visibility, range and interaction metadata can be expressed consistently without growing ad hoc syntax.
2. Add scene-level snapshot/golden tests for inferred coordinates and visual identity across historical/realtime rollback.
3. Add browser renderer tests proving time/normalized/screen placement maps through the host transform without leaking device coordinates into CoreSpirit.


## v66 implementation record

### Universal SHOW surface + coordinate inference (#5, #6)

- [x] Added `visualSurface.ts` as the shared semantic boundary for SHOW coordinate inference.
- [x] Coordinate pairs are parsed structurally, including indexed expressions and nested calls; inference no longer lives as duplicated ad hoc logic inside individual visual forms.
- [x] `0..1` numeric literal pairs infer normalized coordinates.
- [x] `bar_index`/bar-leading x expressions infer bar coordinates.
- [x] Other geometry pairs conservatively infer time/price coordinates.
- [x] SHOW continues to lower to one Core IR `show` emission kind and one runtime visual projection path.
- [x] Advanced `point(..., space)` remains the explicit escape hatch when inference is ambiguous.

### Scene Graph encapsulation (#7)

- [x] Added `visualProjection.ts` as the public visual boundary.
- [x] Primary v1 runtime results now expose visual summaries/checksums/counts rather than Scene Graph nodes.
- [x] Realtime revisions expose opaque visual-update summaries rather than scene diffs/patch topology.
- [x] Realtime commit/rollback still uses the private Scene Graph transaction internally.
- [x] Removed Scene Graph builder/engine/workspace-runtime exports from the primary CoreSpirit barrel; internal modules remain host/compiler implementation details.
- [x] Kept explicit coordinate contracts available as an advanced API without exposing Scene Graph topology.

### v66 verification

- [x] `STAGE47_UNIVERSAL_SHOW_SURFACE_OK`
- [x] `STAGE48_SCENE_GRAPH_ENCAPSULATION_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] Roadmap validates at 48 stages.
- [x] Focused TypeScript compilation passes for SHOW surface/inference, v1 runtime, projection boundary and regression gates.

### v66 boundary

v66 does **not** remove the internal Scene Graph or renderer adapters. It changes the product boundary: users describe visual intent with SHOW, while the compiler/runtime owns scene construction, identity, layering, pane assignment, parentage, z-order, interaction metadata and renderer-facing topology.

## v66 next concrete work

1. Add a structured SHOW modifier schema for range, visibility, style and interaction intent without exposing Scene Graph fields.
2. Add browser renderer conformance for inferred time/bar/normalized coordinates and host-side device transforms.
3. Add semantic visual references so expressions such as `show liquidityZones` can project existing typed visual sources without introducing a second visual language.


## v67 implementation record

### Declarative MODEL surface

- [x] Added `modelSurface.ts` as the MODEL-specific surface projection layer.
- [x] Added compact registry binding syntax: `use "model-id"`.
- [x] Added host implementation bindings: `use python`, `use cpp`, `use rust`, `use wasm`, `use onnx`, `use remote`.
- [x] Added structured `input:` / `output:` declarations with optional field types.
- [x] Preserved compatibility `features` / `predict` vocabulary in artifact metadata without making it the primary mental model.
- [x] Added qualified output normalization: `Regime.confidence` → `model("Regime").confidence`.
- [x] Added static validation against declared model outputs.
- [x] Added typed output checking when the declaration provides a field type.
- [x] Added editor completion for `Regime.<output>` from the declarative MODEL declaration.
- [x] Added `model()` and `__model_get` to the existing Core IR/runtime path; no second evaluator was introduced.
- [x] Added the host resolver boundary; the resolver receives the opaque model binding but the VM does not interpret implementation locators.
- [x] Added whole-model `show Regime` projection through the existing universal SHOW primitive.
- [x] Kept the strict external model ABI, adapters, deterministic/state/rollback rules, quotas and target capability checks underneath the source language.

### v67 verification

- [x] `STAGE49_DECLARATIVE_MODEL_SURFACE_OK`
- [x] `STAGE67_68_EXTERNAL_MODEL_ABI_OK`
- [x] `STAGE69_70_AI_MODEL_VISUALIZATION_OK`
- [x] `STAGE48_SCENE_GRAPH_ENCAPSULATION_OK`
- [x] `STAGE47_UNIVERSAL_SHOW_SURFACE_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] `STAGE44_LANGUAGE_UNIFICATION_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] Focused TypeScript compilation passes for the declarative MODEL surface and model regressions.
- [ ] Full documentation-governance TypeScript execution remains environment-limited because this working environment does not provide `@types/node`; the governance conditions are verified by the source-level assertions in `stage61SingleCoreSpiritDoc.test.ts`.

### v67 boundary

- MODEL syntax is declarative metadata plus normal expressions; it is not a model scripting language inside the VM.
- `use python "..."` records an opaque host implementation locator. The VM never opens that path or spawns the implementation.
- ABI versions, transport selection, adapter classes, model state tokens and quotas remain host/runtime contracts.
- The strict model ABI remains authoritative for actual external inference.
- CoreSpirit may expose model values and visuals but does not grant models broker, account, network or filesystem authority.

## v67 next concrete work

1. Bind DATA / LET values automatically to declared MODEL inputs through the strict ABI feature schema.
2. Resolve logical model locators to immutable host-side model versions before execution and include that resolution in artifact/replay identity.
3. Add model-result memoization per bar/revision so repeated `Regime.confidence` reads do not cause duplicate host inference.
4. Add deterministic replay goldens for model input checksums, output checksums and rollback-safe state-token transitions.



## v68 implementation record

### Declarative AUTOMATE surface (#9)

- [x] Added `automationSurface.ts` as the user-facing AUTOMATE normalization layer.
- [x] Added concise `order long <size>` / `order short <size>` / `order exit all` forms.
- [x] Added structured `order:` blocks with `side`, `risk`, `quantity`, `stop` and `target` fields.
- [x] Added common ATR shorthand normalization (`1.5 atr` → `1.5 * atr(14)`) through ordinary expression syntax.
- [x] Added direction shorthand normalization for `when long`, `when short` and `when flat` inside AUTOMATE.
- [x] Kept lifecycle, risk, policy and execution authority below the language boundary.

### Universal ORDER intent (#10)

- [x] Added one canonical `orderIntent` Core IR emission kind.
- [x] Added `CoreSpiritOrderSizing` with `quantity`, `riskPercent` and `all` semantics.
- [x] Order intent carries optional stop/target protection as structured data.
- [x] `riskPercent` is not silently converted to a quantity by the VM; the risk engine remains authoritative.
- [x] `all` is a semantic flatten/close intent rather than a hard-coded sell command.
- [x] Added runtime-to-automation conversion so the existing host-owned automation pipeline can consume canonical runtime intents without duplicating the risk/policy/execution path.
- [x] Kept `entry`, `exit`, `buy` and `sell` as compatibility mappings for existing artifacts; they are no longer the primary language vocabulary.
- [x] Expanded strategy/execution contracts to carry universal intent direction/sizing while preserving host execution authority.

### v68 verification

- [x] `STAGE50_51_AUTOMATION_ORDER_SURFACE_OK`
- [x] `STAGE49_DECLARATIVE_MODEL_SURFACE_OK`
- [x] `STAGE48_SCENE_GRAPH_ENCAPSULATION_OK`
- [x] `STAGE47_UNIVERSAL_SHOW_SURFACE_OK`
- [x] `STAGE46_UNIVERSAL_SHOW_OK`
- [x] `STAGE45_SIX_CONCEPT_LANGUAGE_OK`
- [x] `STAGE44_LANGUAGE_UNIFICATION_OK`
- [x] `STAGE42_CORESPIRIT_V1_RUNTIME_OK`
- [x] `STAGE73_74_VISUAL_COMPILER_REACTIVE_OK`
- [x] `STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK`
- [x] Historical v69 validation recorded 51 stages; the active v73 roadmap now contains 59 stages.

### v68 boundary

`order` is a proposal, not an execution primitive. The language may express direction, sizing policy and protection, but the VM cannot approve risk, select a venue, activate live execution or access broker credentials. Universal order intent remains an immutable data boundary into the host-owned RISK → POLICY → EXECUTION path.


## v68 next concrete work

1. Bind declarative `order` protection expressions to typed risk-engine inputs without resolving broker-specific behavior in the VM.
2. Add deterministic order-intent replay goldens covering riskPercent, quantity, all/flat, stop and target across rollback/commit revisions.
3. Add editor diagnostics and completion for structured `order:` fields and the concise `order <direction> <size>` form.
4. Replace remaining user-facing entry/exit/buy/sell examples with `order` in the canonical CoreSpirit examples while preserving legacy compatibility fixtures.


## Stage 52–53 contract map

- **52 | Universal EVENT emission and routing** — one immutable event emission with host-owned destination fan-out; legacy alert/webhook/signal surfaces remain compatibility paths.
- **53 | WHEN as the central reactive construct** — one reactive construct for market, model, lifecycle, zone, webhook and named-event sources; all lower through the existing conditional/runtime path.

## v69 implementation record

### Universal EVENT boundary (#11)

- [x] Added `eventSurface.ts` as the single normalization boundary for `emit`, event-trigger shorthand and route declarations.
- [x] Added canonical `event` Core IR emission kind.
- [x] Added runtime `event` output objects carrying stable identity, event name and declared destinations.
- [x] Added serializable event-route metadata to surface metadata and executable IR.
- [x] Added deterministic `CoreSpiritEventRouter` for host-owned webhook, notification, alert and automation destination handlers.
- [x] Kept destination handlers outside the VM; no raw network or broker operation is introduced.
- [x] Added native `coreSpirit.event` event-envelope creation through the existing Event Bus.
- [x] Kept legacy `signal`, `alert` and `webhook` APIs as compatibility mappings rather than creating a second event architecture.
- [x] Added event batches to the converged v1 runtime.

### Central WHEN (#12)

- [x] Moved event-name normalization into the shared event surface contract.
- [x] `when "NAME"` lowers to the existing `event("NAME")` expression.
- [x] `when bar closes`, `when fill`, `when price enters zone` and `when webhook "NAME"` lower to named host-event queries.
- [x] Expression-driven WHEN forms such as model thresholds and crossovers remain ordinary CoreSpirit expressions.
- [x] Event truth is supplied through the host `eventResolver`; the VM performs no external event detection.
- [x] Realtime/replay continue to use existing transactional conditional execution.
- [x] No event-source-specific executor or parser was introduced.

### v69 verification

- [x] `STAGE52_53_EVENT_WHEN_OK`
- [x] Focused TypeScript compilation passes for event surface, event routing, runtime, compiler and event engine.
- [x] Existing model, automation/order, SHOW/visual, reactive and sandbox source contracts remain present.
- [x] Roadmap validates at 53 stages.

### v69 boundary

- `emit` creates an immutable event; it does not send anything by itself.
- Routes are declarative metadata; hosts decide whether a webhook, notification, alert or automation destination is actually available and authorized.
- `when` is a control construct, not a callback API.
- External event sources such as fills and webhooks are detected by hosts and exposed through the event resolver.
- CoreSpirit does not gain raw network, filesystem, process or broker authority through EVENT.

## v69 next concrete work

1. Add explicit event payload schemas so `when` can optionally inspect immutable event fields without creating destination-specific grammars.
2. Add route-level capability/quota accounting for high-volume event fan-out while keeping routing outside the VM.
3. Add deterministic event-ledger replay goldens covering emit, dedupe, routing and rollback/commit behavior.
4. Add editor completion for known event names and destination targets from host-provided catalogs.

## v70 implementation record

### Composability (#13)

- [x] Added `composability.ts` as a serializable composition-contract layer over the existing surface metadata.
- [x] Added composition nodes for indicator, model, event, condition, automation, order-intent and SHOW/value surfaces.
- [x] Added composition relations for value/event flow, model-to-condition flow, condition-to-automation triggering, automation-to-order routing and visual projection.
- [x] Kept the graph descriptive; it does not introduce a second runtime or evaluator.
- [x] Preserved the existing EVENT → WHEN → AUTOMATE → ORDER host authority boundary.

### Progressive simplicity (#14)

- [x] Added a contract test proving the one-line `show ema(close, 20)` path.
- [x] Added a contract test for `fast/slow` + `show` + `when crossesAbove(...)` + `emit` progression.
- [x] Kept concise syntax as normalization into the existing parser/AST/IR/VM pipeline.
- [x] Preserved MODEL typed outputs and AUTOMATE canonical `order` semantics.
- [x] Kept the existing right-side chart editor and deploy workflow; v70 changes its product accent to blue.

### v70 verification target

- `STAGE54_55_COMPOSABILITY_OK`
- Existing v69 event/when contract
- Existing v68 automation/order contract
- Existing v67 model contract
- Existing runtime/replay/IR contracts

## v70 architectural deepening — #15 complexity firewall + #16 invisible superpowers

This documentation pass deepens the user-facing architecture without adding a new language/runtime release. The implementation remains v70; the change clarifies what is deliberately **not** part of the user's conceptual burden and what must remain protected underneath.

### #15 — Remove implementation mechanics from the public mental model

- [x] Explicit IR concepts are treated as compiler/inspection details, not ordinary authoring concepts.
- [x] Execution-target mechanics remain host/deployment concerns rather than source-language infrastructure.
- [x] Scene-node and renderer mechanics remain behind `SHOW` and the renderer-neutral scene contract.
- [x] Host capabilities remain sandbox/host concerns rather than general-purpose source handles.
- [x] Broker connectivity remains outside CoreSpirit source and VM authority.
- [x] Model transport/adapters remain behind the typed MODEL ABI.
- [x] Webhook delivery remains behind EVENT routing and host delivery.
- [x] Automation lifecycle mechanics remain platform governance beneath declarative `AUTOMATE`.
- [x] Coordinate spaces remain implicit for ordinary visuals and explicit only when genuinely needed.
- [x] Visual patch/diff mechanics remain runtime implementation details.
- [x] CPU/GPU/WASM selection and execution-planner details remain infrastructure concerns.
- [x] Risk-policy plumbing remains downstream of order intent and outside the language's direct authority.

The public vocabulary remains:

```text
DATA / LET / WHEN / SHOW / MODEL / AUTOMATE
```

EVENT remains a shared runtime boundary/value rather than a seventh top-level authoring block.

### #16 — Preserve the invisible superpowers

The following are explicitly protected architectural invariants:

- [x] VM → broker forbidden.
- [x] MODEL → broker forbidden.
- [x] INDICATOR → broker forbidden.
- [x] Risk and policy remain authoritative before execution.
- [x] Visual semantics remain renderer-neutral.
- [x] Deterministic replay remains a truth/acceptance surface.
- [x] One stable IR and one VM remain the execution substrate.
- [x] Reactive execution remains the single dependency/invalidation substrate.
- [x] Capability sandbox remains authoritative over external powers.
- [x] External models converge on one typed semantic ABI.

### Complexity-firewall acceptance criteria

Future language proposals must be checked for vocabulary growth, implementation leakage, second-runtime risk, authority-boundary erosion, replay determinism, capability escalation and unnecessary transport exposure.

The design rule is:

> **Remove complexity from the author's mental model, not from the architecture that protects the author.**

### Verification posture

This pass is documentation/governance only. No new evaluator, parser, IR, VM, broker adapter, renderer runtime or model runtime was introduced. Existing v70 composability/progressive-simplicity contracts remain the implementation baseline.



## v71 implementation record — #17 standard library discoverability + #18 readable syntax

### Standard library discoverability

- [x] Added a separate human-facing library catalog grouped into Price, Math, Trend, Momentum, Volatility, Structure, Market, Models, Visual, Events, Data and State.
- [x] Preserved the established executable core primitive count; catalog metadata does not alter the canonical runtime registry.
- [x] Kept advanced host/data and visual capabilities discoverable without promoting them into the semantic core.
- [x] Explicitly refused to advertise unsupported desired functions such as `roc` and `stoch` until their deterministic runtime contracts exist.
- [x] Updated language-service completion ordering to follow the catalog rather than raw registry order.

### Readable syntax

- [x] `a crossesAbove b` lowers to canonical `crossover(a, b)` through the existing surface-normalization path.
- [x] `a crossesBelow b` lowers to canonical `crossunder(a, b)` through the existing surface-normalization path.
- [x] Editor completion and hover now teach the readable crossing forms while documenting canonical lowering.
- [x] `market("NIFTY").close` / named market references expose OHLCV/time member completion through the existing data-reference ABI.
- [x] No second parser, operator runtime, data runtime, IR or VM was introduced.

### Website color normalization

- [x] Product UI green/emerald/teal accent residues were normalized to the blue product family across active website components.
- [x] Design-system token names now use `primaryBlue` rather than the stale `primaryEmerald` naming.
- [x] Chart positive/up visual roles previously rendered green are now blue; negative/down roles remain red.
- [x] CoreSpirit editor/deploy chrome remains blue and consistent with the website-level product accent.

### v71 verification targets

- [x] `STAGE56_57_STDLIB_READABILITY_OK` focused contract.
- [x] Core executable stdlib is explicitly kept at 30 semantic primitives; the larger supported ecosystem remains in extension contracts and the discoverability catalog.
- [x] Readable crossing syntax normalization passes.
- [x] Market-reference member completion passes.
- [x] Blue/green source scan reviewed for active UI residues.
- [ ] Full Vite production build remains unclaimed when dependencies are absent from the archive.

## v72 architectural deepening — #19 declarative configuration + #20 one-file application model

This release deepens the language model without creating a new runtime. The focus is on reducing **imperative setup** and allowing the user to describe a complete trading application in one source artifact.

### #19 — Declarative configuration

- [x] Established the architectural rule that indicator/model/automation configuration should be represented as declaration metadata rather than setup API calls.
- [x] Defined examples for `indicator "Momentum"` configuration, model `source`, and automation `mode`.
- [x] Defined deterministic defaulting, declaration-local scope, pre-execution validation and replay-stable configuration semantics.
- [x] Preserved host authority: automation mode is descriptive policy metadata; it does not activate live broker execution inside the VM.
- [x] Kept renderer, broker, transport, GPU/WASM, execution-target and capability details outside ordinary configuration vocabulary.

### #20 — One-file application model

- [x] Defined `app "Nifty Momentum":` as an authoring/composition envelope over the existing language concepts.
- [x] Defined the target one-file composition of inputs, calculations, MODEL, SHOW, WHEN, EVENT and AUTOMATE/ORDER intent.
- [x] Defined semantic compiler splitting as dependency construction over one artifact, not independent scripts or multiple evaluators.
- [x] Preserved one language → one compiler → one stable IR → one VM.
- [x] Preserved the existing EVENT → WHEN → AUTOMATE → ORDER and RISK → POLICY → EXECUTION boundaries.
- [x] Defined acceptance criteria for source locations, typed configuration, replay, editor completion and deployment of one complete artifact.

### v72 design status

The #19/#20 material is an architectural contract and target surface. The exact `app` shorthand and full nested configuration parser are **not claimed as implemented merely by this documentation pass**. Existing v71 language normalization remains the executable baseline until dedicated compiler contracts are added.

### v72 UI correction — right-side black treatment

The previous blue pass changed green accents but retained several near-black right-side panels. This release corrects that specific issue rather than treating accent replacement as sufficient.

- [x] Right-side order/positions surfaces in the public workspace preview are now blue-tinted navy surfaces rather than near-black blocks.
- [x] The homepage hero's right-side order panel is now part of the same blue/navy surface hierarchy.
- [x] Right-side CoreSpirit/chart docks retain readable dark contrast but no longer use the old pure-black-looking surface treatment where the visual role calls for a panel surface.
- [x] Remaining black values used for SVG/grid masks, drop shadows, terminal depth and accessibility contrast are structural and are not treated as UI accent colors.
- [x] Remaining official third-party brand colors are not rewritten merely to force a single palette.

The visual hierarchy is now:

```text
BLUE / NAVY
  product identity
  active controls
  right-side panels / docks
  positive live state where appropriate

RED
  negative / destructive trading semantics

PURPLE / AMBER / NEUTRAL
  specialized semantic roles

BLACK
  only structural depth, shadows, masks or non-UI technical rendering
```

### v72 implementation boundary

No new evaluator, parser runtime, IR, VM or broker authority was introduced for this documentation/design pass. The actual declarative `app` implementation should be added as a dedicated future compiler stage with conformance tests rather than quietly turning the documentation examples into an unverified second syntax system.

## v73 architectural deepening — #21 compiler complexity absorption + #22 progressive authoring levels

### #21 — Compiler should do the hard work

- [x] Defined AST, semantic graph and dependency graph as compiler representations of one source program, not parallel execution models.
- [x] Defined visual, EVENT/WHEN, MODEL and AUTOMATE views as projections of the same semantic dependency structure.
- [x] Locked one canonical lowering route to the existing stable Core IR and single VM.
- [x] Made equivalent readable/explicit syntax a convergence requirement, e.g. `a crossesAbove b` → `crossover(a, b)`.
- [x] Kept source maps available for deep inspection while hiding IR mechanics from ordinary authoring.
- [x] Made deterministic reactive dependency planning part of compiler output rather than a feature-specific scheduler.
- [x] Defined optimization as semantics-preserving transformation only; optimization cannot alter event identity, replay, model meaning, SHOW semantics or risk/policy authority.
- [x] Preserved the complexity firewall: execution targets, renderers, transport, host capabilities, broker mechanics and risk-policy plumbing remain internal.

### #22 — Three authoring levels

- [x] Defined Level 1 — Simple for short SHOW/WHEN programs.
- [x] Defined Level 2 — Advanced for composable calculations, MODEL facts and richer reactive logic.
- [x] Defined Level 3 — Professional for typed data, multi-symbol, multi-timeframe, external models, custom visual geometry, event handlers, performance controls and deep inspection.
- [x] Kept all three levels on the same language/compiler/IR/VM substrate.
- [x] Defined authoring level as a tooling/discoverability profile rather than a grammar fork.
- [x] Defined authoring level as independent from security/capability authority.
- [x] Defined progressive upgrade: Level 1 programs should grow by adding semantic detail, not by rewriting into another DSL.

### UI palette correction — black remains primary

The previous v72 visual correction over-corrected the panel surfaces toward blue/navy. That is not the intended product identity.

The intended hierarchy is now:

```text
BLACK
  primary application background
  panels / cards / workspace chrome
  chart surfaces

BLUE
  primary accent
  active controls
  focus states
  selected states
  CoreSpirit identity

RED
  negative / destructive / down-state trading semantics

PURPLE / AMBER / NEUTRAL
  specialized semantic roles
```

- [x] Restored black/near-black as the primary UI surface family.
- [x] Kept blue as the product accent instead of green/emerald/teal.
- [x] Removed the blue/navy replacement of primary right-side panel surfaces introduced by v72.
- [x] Kept subtle charcoal differentiation between cards and the base background rather than turning major surfaces blue.
- [x] Preserved blue accent on CoreSpirit editor/deploy controls.
- [x] Preserved red for negative/destructive trading semantics.
- [x] Kept structural black where technical rendering requires it.

### v73 implementation boundary

The #21/#22 architecture is primarily a compiler/tooling contract in this release. It does not create a second evaluator, alternate IR or professional-only runtime. The exact full one-file `app` sugar from v72 remains a staged compiler feature rather than being silently claimed as complete.

### v73 verification target

- roadmap contains exactly 59 stages and all dependencies point backward;
- readable syntax still lowers through the existing normalization path;
- existing composability, model, automation/order and EVENT/WHEN contracts remain intact;
- standard-library core count remains unchanged;
- source scan confirms primary UI surfaces are black/near-black with blue accents and no v72 blue/navy panel conversion leftovers.



## v74 development cycle — #23/#24 CoreSpirit Language Simplification

This release does not add roadmap stage 60. The active roadmap remains 59 stages. v74 treats #23 and #24 as a cross-cutting reduction/consolidation cycle over the existing architecture.

### #23 — OS improvement priorities

The priority map is based on author burden and semantic convergence, not the number of remaining subsystems.

#### P0 — reduce public complexity

- [ ] Simplify authoring where equivalent forms require too much ceremony.
- [ ] Make the compiler the sole place where source sugar is unified into one semantic dependency model.
- [ ] Keep `show` as the primary user-facing visual abstraction; renderer and scene mechanics remain hidden.
- [x] Keep `when` + `emit` as the universal event boundary.
- [x] Keep automation centered on intent + risk, with broker/risk/policy plumbing outside the language runtime.

#### P1 — improve the authoring experience

- [ ] Compact MODEL consumption and typed model-field discovery.
- [ ] Make editor completion teach Simple CoreSpirit before implementation details.
- [ ] Expand diagnostics so the compiler explains inferred semantics and normalization in user terms.
- [x] Preserve deterministic replay as an artifact property.
- [ ] Close the remaining session/calendar semantic gap.
- [ ] Finish production-renderer end-to-end validation.
- [ ] Add production scanner scheduling, quotas, cancellation and deterministic backpressure.

#### P2/P3 — expand only after consolidation

- [ ] Expand indicator/reference-value coverage.
- [ ] Add versioned artifact migration compatibility.
- [ ] Profile before advanced GPU optimization.
- [ ] Add new syntax only when repeated real authoring friction justifies it.

### #24 — reduction cycle instead of another giant stage

- [x] Declared the 59-stage roadmap mature enough to pause structural accumulation.
- [x] Defined the reduction workflow: inventory → canonical meaning → compiler normalization → editor → diagnostics → replay/regression → retire redundant forms.
- [x] Kept one language → one compiler → one stable IR → one VM.
- [x] Kept one reactive runtime rather than simple/advanced/professional evaluators.
- [x] Kept authoring levels as presentation/discoverability profiles, not grammar forks.
- [ ] Inventory duplicate public syntax and choose canonical forms.
- [ ] Add conformance tests proving readable and explicit forms converge.
- [ ] Add migration checks before retiring persisted source forms.

### v74 Supabase persistence repair

The live Supabase project was inspected directly. `public.user_settings` existed and its authenticated RLS policies were already correct, but the `authenticated` role had no table privileges. That prevented the browser PostgREST client from exposing the table and produced the observed 404.

Applied migration: `20260927055419_grant_authenticated_user_owned_table_access`.

Authenticated table access was added for the browser-facing user-owned tables already consumed by the client: `user_settings`, `profiles`, `workspace_layouts` and `workspace_layout_library`. Existing RLS policies remain the row-level authority, and no anonymous DML access was added.

Post-migration verification confirmed `authenticated` SELECT/INSERT/UPDATE privileges on `public.user_settings`, and the PostgREST schema was reloaded.


## v75 architecture direction — #25/#26 target syntax + #1 source-of-truth compiler

v75 continues the v74 reduction cycle. It does not add roadmap stage 60; the active roadmap remains 59 stages.

### #25 — target language contract

Minimal public vocabulary:

```text
let
when
if
show
emit
model
automate
```

Expressions such as `ema()`, `rsi()`, `atr()`, `market()` and `timeframe()` provide the computational vocabulary. The design goal is a small grammar with a large compositional ecosystem. New keywords should be rare and should only represent genuinely new semantic categories.

### #26 — ultimate one-file application contract

The target is one `app` program combining configuration, data, calculations, models, visuals, WHEN/EVENT behavior and AUTOMATE intent. Its internal dependency, visual, event, model and automation views remain compiler projections over one semantic program and lower to the existing IR/VM path.

The complete Nifty AI Momentum example is documented as a target syntax contract, not as a claim that every final shorthand line is already accepted by the current parser.

### #1 — compiler source-of-truth consolidation

Desired pipeline:

```text
SOURCE → TOKENS/CST → NORMALIZED AST → SEMANTIC MODEL → IR → OPTIMIZED IR → RUNTIME
```

Some current compatibility/surface utilities still inspect source strings separately from the canonical parser. v75 therefore defines an incremental migration: normalize once at the compiler boundary; retain source spans; derive semantic metadata from AST + analysis; refactor composition/surface metadata and editor tooling to consume the same semantic model; then retire redundant source scanners.

CST is authoring fidelity, AST is normalized language meaning, the semantic model is resolved program meaning, and IR is deterministic execution. None becomes a second runtime.

### v75 acceptance criteria

- [x] Minimal target language vocabulary defined.
- [x] One-file application contract defined without a new runtime.
- [x] Single compiler source-of-truth pipeline defined.
- [x] CST/AST/semantic-model/IR responsibilities separated.
- [ ] Composition metadata consumes canonical semantic data.
- [ ] Surface metadata consumes canonical semantic data.
- [ ] Completion and diagnostics consume the same semantic model.
- [ ] Equivalent source forms prove equivalent semantic/IR identities.
- [ ] Redundant source-string scanners are retired where possible.


## v76 implementation record — compiler source-of-truth + CST-aware normalization

v76 is a hardening/consolidation release. It does not add roadmap stage 60. The active roadmap remains 59 stages.

### Built

- Added `src/services/coreSpirit/surfaceCst.ts`.
- Added token-aware readable crossing normalization using the existing CoreSpirit lexer.
- Removed `crossesAbove` / `crossesBelow` from the legacy regex transform list.
- Added protected compatibility transformation so remaining line/regex helpers cannot rewrite strings or comments.
- Added `src/services/coreSpirit/compilerPipeline.ts` as the canonical source-to-semantics gateway.
- Added `CoreSpiritCompiler.compileSource()` so source compilation can begin from that gateway instead of requiring callers to construct an AST independently.
- Routed editor diagnostics and type lookup through the canonical compilation unit.
- Exported the new normalization/pipeline contracts from `src/services/coreSpirit/index.ts`.
- Added `stage76CstPipeline.test.ts` covering nested expressions, functional crossing syntax, strings/comments and canonical source-unit normalization.

### Architectural result

```text
SOURCE
  ↓
LEXER / CST-aware surface boundary
  ↓
NORMALIZED SOURCE
  ↓
PARSER / AST
  ↓
SEMANTIC ANALYSIS
  ↓
IR
  ↓
VM
```

The remaining regex layer is compatibility infrastructure only. It is no longer the place to add new language semantics.

### Still open

- [ ] Move SHOW/WHEN/INPUT/automation/model surface transforms from line regexes to token/AST transforms incrementally.
- [ ] Build the full canonical semantic-program model consumed by diagnostics, completion, composition graphs and debugger views.
- [ ] Remove remaining source-string metadata scanners after equivalent AST/semantic data exists.
- [ ] Prove equivalent surface forms yield equivalent normalized AST/semantic fingerprints.
- [ ] Add parser-aware preservation for all source trivia needed by formatter/refactor tooling.

### Verification note

The new Stage 76 fixture is intended as a focused contract. Full application/Vite build status remains dependent on the deployment dependency environment.


## v77 implementation record — semantic composability redesign

v77 continues the existing 59-stage reduction/consolidation cycle. It does not add roadmap stage 60.

### #1 — source-of-truth architecture

- [x] Existing lexer/parser confirmed as the language foundation.
- [x] Canonical source compilation unit established in v76.
- [x] Semantic dependency graph added as a source-level semantic projection.
- [x] Composition tooling now consumes AST + semantic result + explicit surface declarations.
- [ ] Link every IR node to a stable semantic entity ID.
- [ ] Migrate execution/reactive/visual/debug graph views to semantic IDs.

### #3 — normalization boundary

- [x] Readable crossing normalization remains token-aware.
- [x] Strings/comments are protected from legacy compatibility transforms.
- [x] New language semantics are prohibited from the regex compatibility list.
- [ ] Move remaining SHOW/WHEN/INPUT/model/automation shorthand transforms to AST/token-aware transforms.
- [ ] Retire the protected regex layer incrementally after equivalent AST transforms exist.

### #4 — composability redesign

Previous state:

\`\`\`text
source text
   ↓
identifier regex
   ↓
guessed relationships
\`\`\`

v77 state:

\`\`\`text
source
  ↓
normalized AST
  ↓
semantic analysis
  ↓
semantic dependency graph
  ↓
composition projection
\`\`\`

Added:

\`\`\`text
src/services/coreSpirit/semanticDependencyGraph.ts
\`\`\`

The graph resolves semantic entities including:

\`\`\`text
data sources
symbols / values
models
model outputs
conditions
events
visuals
automations
order intents
\`\`\`

and relations:

\`\`\`text
depends-on
emits
triggers
renders
contains
\`\`\`

The composability engine in:

\`\`\`text
src/services/coreSpirit/composability.ts
\`\`\`

now projects this semantic graph instead of scanning identifiers with regular expressions.

### Regression coverage

Added:

\`\`\`text
src/services/coreSpirit/stage77SemanticComposability.test.ts
\`\`\`

The fixture specifically proves:

- \`close\` in an actual expression creates a data dependency.
- \`"hello close"\` does not create a data dependency.
- \`market("NIFTY").close\` preserves data-reference semantics.
- \`regime = model("Regime")\` followed by \`regime.confidence\` resolves to the same model entity.
- model output feeds a condition.
- a condition triggers an emitted event.
- composition validation sees only real graph nodes/edges.

### Model alias consistency

v77 also aligns semantic analysis and compilation for model aliases.

\`\`\`corespirit
regime = model("Regime")
when regime.confidence > 0.8:
    emit "LONG"
\`\`\`

The semantic analyzer records the model binding and the compiler preserves the model-reference register so member access remains an actual MODEL output lookup.

### Architecture status

The semantic graph is now the source-level authority for composability. The existing IR graph remains execution-specific. The next migration should connect IR nodes to semantic identities rather than independently reconstructing source meaning.

### Verification boundary

The focused semantic-composability regression is the primary v77 contract. Full application/Vite build verification remains deployment-environment dependent.


### v77 refinement — automation ownership boundary

The semantic graph deliberately models the runtime dependency chain that can be proven from normalized AST semantics. For a named AUTOMATE container, event triggers are explicit surface declarations, while order intents are semantic action nodes. The current normalized AST does not yet preserve exact container ownership for every order intent, so v77 does not fabricate an `AUTOMATION → ORDER` edge. The next migration should preserve declaration ownership during normalization so that container-level projections can be produced from the same semantic graph without lexical guessing.


## v78 implementation record — P0 source provenance / source-map hardening

v78 continues the existing 59-stage reduction/consolidation cycle. No roadmap stage 60 is added.

### #1 / #3 / #4 consolidation carried forward

- [x] Source compilation has a canonical source-to-semantics gateway.
- [x] Readable crossing normalization uses the existing lexer.
- [x] Legacy regex normalization is compatibility-only and protected from strings/comments.
- [x] Composability derives from semantic entities rather than lexical identifier scans.
- [x] Model/data aliases preserve semantic entity identity.

### #5 — instruction-origin tracking

Previous state:

\`\`\`text
AST node index
      ↓
approximate instruction index
      ↓
source map
\`\`\`

v78 state:

\`\`\`text
AST node
   ↓
compiler emission
   ↓
IR instruction { origin: ... }
   ↓
optimizer preserves origin
   ↓
optimized IR
   ↓
source map regenerated from instructions
\`\`\`

Added to the IR contract:

\`\`\`text
origin.sourceNodeId
origin.start
origin.end
origin.line
origin.column
\`\`\`

Added:

\`\`\`text
coreSpiritSourceMapFromInstructions(...)
\`\`\`

The compiler now attaches origin metadata at instruction emission rather than reconstructing ownership later. The old unused \`mark()\` helper and AST-index source-map construction are removed from the compiler path.

### Optimizer contract

The constant-folding optimizer now preserves instruction origins when replacing:

\`\`\`text
unary → const
binary → const
move  → const
\`\`\`

The optimizer also regenerates the source map from its actual output instruction sequence. This removes the pre-optimization index-staleness problem.

### IR validation

The IR contract validates provenance shape when \`origin\` is present without breaking existing version-1 artifacts that may not contain it.

### Semantic graph integration

The IR-derived semantic graph now reads the instruction's direct \`origin\` first and only falls back to the source map when necessary. It no longer assumes the nearest earlier source-map entry owns an instruction.

### Regression coverage

Added:

\`\`\`text
src/services/coreSpirit/stage78SourceMapOrigins.test.ts
\`\`\`

The contract covers:

- one AST construct producing multiple IR instructions;
- model member lowering;
- IF/WHEN control-flow origins;
- event/body origins;
- optimizer-preserved origin metadata;
- one source-map entry per origin-bearing optimized instruction;
- source-map entries agreeing with instruction origins.

### #5 acceptance boundary

\`\`\`text
No instruction-index guessing
No pre-optimization source-map authority
No downstream lexical ownership reconstruction
Every compiler instruction has provenance
Every optimization replacement preserves provenance
\`\`\`

### Remaining provenance work

- [ ] Introduce stable semantic-node IDs independent of only source spans where refactors require identity continuity.
- [ ] Carry semantic entity IDs alongside sourceNodeId on IR instructions.
- [ ] Preserve merged provenance when an optimization combines multiple source-originated operations into one instruction.
- [ ] Expose origin data to debugger/profiler/replay UI.
- [ ] Add end-to-end source-map tests after every future IR optimization pass.
