/**
 * CoreSpirit stages 1–184: architecture contract and release gates.
 * This file is intentionally data-first so tooling can render the roadmap,
 * check dependencies, and keep the language/runtime roadmap in sync.
 */
export type CoreSpiritStageKind = 'foundation' | 'runtime' | 'compiler' | 'tooling' | 'platform' | 'governance';
export type CoreSpiritGate = {
  id: string;
  statement: string;
  automated: boolean;
};
export type CoreSpiritStage = {
  id: number;
  name: string;
  kind: CoreSpiritStageKind;
  goal: string;
  dependencies: readonly number[];
  gates: readonly CoreSpiritGate[];
  nonGoals?: readonly string[];
};

export const CORE_SPIRIT_STAGES: readonly CoreSpiritStage[] = [
  {
    id: 1, name: 'Language foundation', kind: 'foundation',
    goal: 'Freeze a small grammar, stable AST shape, typed names, source spans, and diagnostics.', dependencies: [],
    gates: [
      { id: 'cs1-lexer', statement: 'Lexer is deterministic and all tokens have source positions.', automated: true },
      { id: 'cs1-ast', statement: 'AST golden snapshots are stable and source spans are preserved.', automated: true },
      { id: 'cs1-types', statement: 'Scalar and series types are explicit and assignability is tested.', automated: true },
      { id: 'cs1-diagnostics', statement: 'Syntax/name/type errors include stable machine-readable codes and source locations.', automated: true },
    ],
  },
  {
    id: 2, name: 'Series runtime', kind: 'runtime',
    goal: 'Define the single history model for series<T>, indexing, warmup, NA, and current-bar semantics.', dependencies: [1],
    gates: [
      { id: 'cs2-index', statement: 'series[0] is current bar and positive indices move into confirmed history.', automated: true },
      { id: 'cs2-future', statement: 'Negative/future indexing is rejected.', automated: true },
      { id: 'cs2-warmup', statement: 'Missing history has one canonical NA/null representation.', automated: true },
      { id: 'cs2-owner', statement: 'Indicators do not implement their own history cursor.', automated: false },
    ],
  },
  {
    id: 3, name: 'Indicator runtime', kind: 'runtime',
    goal: 'Provide one deterministic primitive indicator engine consumed by every execution environment.', dependencies: [2],
    gates: [
      { id: 'cs3-native', statement: 'Core indicators resolve through one registry/engine.', automated: true },
      { id: 'cs3-math', statement: 'The same primitive math is reused by CoreSpirit, chart, replay, and backtest hosts.', automated: false },
      { id: 'cs3-state', statement: 'Stateful indicators support snapshot/restore and realtime rollback.', automated: true },
      { id: 'cs3-pure-math', statement: 'Primitive indicator math is side-effect free outside runtime-owned state.', automated: true },
      { id: 'cs3-abi', statement: 'Every native indicator has an explicit ABI descriptor and minimum lookback.', automated: true },
    ],
  },
  {
    id: 4, name: 'IR + VM', kind: 'compiler',
    goal: 'Compile source to a validated executable IR artifact; production execution consumes IR, not AST nodes.', dependencies: [1, 2, 3],
    gates: [
      { id: 'cs4-ir', statement: 'AST-to-IR output obeys the stable opcode contract.', automated: true },
      { id: 'cs4-artifact', statement: 'Artifacts have deterministic checksums and explicit IR/runtime versions.', automated: true },
      { id: 'cs4-vm', statement: 'The VM does not need AST dispatch in its production execution path.', automated: false },
      { id: 'cs4-validation', statement: 'Optimized IR is revalidated before artifact creation.', automated: true },
      { id: 'cs4-debug-map', statement: 'Executable instructions retain stable source/AST mapping references.', automated: true },
    ],
  },
  {
    id: 5, name: 'Historical vs realtime semantics', kind: 'runtime',
    goal: 'Make developing-bar execution transactional: snapshot, evaluate revisions, rollback, commit.', dependencies: [2, 3, 4],
    gates: [
      { id: 'cs5-revision', statement: 'Every realtime bar revision is explicitly identifiable.', automated: true },
      { id: 'cs5-rollback', statement: 'Rollback restores state exactly to the pre-bar confirmed checkpoint.', automated: true },
      { id: 'cs5-commit', statement: 'Commit creates the only confirmed state for the developing bar.', automated: true },
      { id: 'cs5-equivalence', statement: 'Committed realtime results equal historical results for the same confirmed bars.', automated: true },
      { id: 'cs5-output-rollback', statement: 'Provisional scene/output state is replaced on rollback and does not accumulate duplicate logical objects.', automated: true },
      { id: 'cs5-revision-contract', statement: 'Each developing-bar revision records a deterministic revision checksum.', automated: true },
    ],
  },
  {
    id: 6, name: 'Runtime-native indicators', kind: 'runtime',
    goal: 'Make indicator implementations independent of chart/backtest/replay consumers.', dependencies: [3, 5],
    gates: [
      { id: 'cs6-single-engine', statement: 'No consumer-specific primitive EMA/SMA/RSI implementation is introduced.', automated: false },
      { id: 'cs6-determinism', statement: 'Identical inputs and state produce identical indicator outputs.', automated: true },
      { id: 'cs6-revision-safe', statement: 'Stateful indicators revert correctly on realtime rollback.', automated: true },
    ],
  },
  {
    id: 7, name: 'Small semantic core', kind: 'foundation',
    goal: 'Keep a small, documented core of reliable primitives and separate platform extensions.', dependencies: [1, 3, 4],
    gates: [
      { id: 'cs7-size', statement: 'Core semantic builtin surface remains intentionally small (30 primitives); larger capabilities live in extensions.', automated: true },
      { id: 'cs7-runtime', statement: 'Every core primitive has a deterministic runtime implementation or compile-time contract.', automated: true },
      { id: 'cs7-extension', statement: 'Platform-specific capabilities live outside the core library.', automated: true },
    ],
    nonGoals: ['300-function mega-library', 'broker APIs', 'AI generation APIs in the core language'],
  },
  {
    id: 8, name: 'Compiler pipeline', kind: 'compiler',
    goal: 'Separate lexing, parsing, name resolution, type checking, semantic validation, IR lowering, and optimization.', dependencies: [1, 4, 7],
    gates: [
      { id: 'cs8-ast-golden', statement: 'Source-to-AST has golden tests.', automated: true },
      { id: 'cs8-ir-golden', statement: 'AST-to-IR has golden tests.', automated: true },
      { id: 'cs8-exec', statement: 'IR-to-execution has deterministic tests.', automated: true },
      { id: 'cs8-safe-opt', statement: 'Optimization preserves trading/runtime semantics.', automated: true },
    ],
  },
  {
    id: 9, name: 'Stable IR contract', kind: 'compiler',
    goal: 'Treat executable IR as a versioned VM ABI suitable for caching, persistence, debugging, replay, and workers.', dependencies: [4, 8],
    gates: [
      { id: 'cs9-version', statement: 'IR format/version is explicit and validated.', automated: true },
      { id: 'cs9-source-map', statement: 'IR retains source mapping for debugger tooling.', automated: true },
      { id: 'cs9-validation', statement: 'Invalid IR cannot become an executable artifact.', automated: true },
    ],
  },
  {
    id: 10, name: 'CoreSpirit replay', kind: 'runtime',
    goal: 'Execute immutable datasets through executable artifacts and prove repeated runs are deterministic.', dependencies: [5, 9],
    gates: [
      { id: 'cs10-repeat', statement: 'Same artifact + same dataset produces identical output/state/trace checksums.', automated: true },
      { id: 'cs10-trace', statement: 'Replay captures per-bar trace/checksum data.', automated: true },
      { id: 'cs10-first-divergence', statement: 'Replay tooling can identify the first divergent bar when runs differ.', automated: false },
    ],
  },
  {
    id: 11, name: 'Debugger', kind: 'tooling',
    goal: 'Inspect a selected candle through source, AST, IR, runtime state, and outputs without creating a second executor.', dependencies: [8, 9, 10],
    gates: [
      { id: 'cs11-frame', statement: 'Debugger frames preserve bar/time/symbol/timeframe/revision/confirmation.', automated: true },
      { id: 'cs11-map', statement: 'IR/source-map references can be resolved to source spans.', automated: true },
      { id: 'cs11-observer', statement: 'Debugger is observational and does not fork runtime semantics.', automated: false },
    ],
  },
  {
    id: 12, name: 'Signal boundary', kind: 'platform',
    goal: 'Keep CoreSpirit output at signal/intent boundaries; TradingCoreOS risk and execution own orders.', dependencies: [7, 9, 10, 11],
    gates: [
      { id: 'cs12-signal', statement: 'CoreSpirit can emit typed signals with stable identity and timestamps.', automated: true },
      { id: 'cs12-no-broker', statement: 'CoreSpirit runtime has no direct broker submission API.', automated: true },
      { id: 'cs12-audit', statement: 'Signals can be traced into downstream order-intent objects without changing CoreSpirit semantics.', automated: true },
    ],
  },
  {
    id: 13, name: 'Future strategy model', kind: 'platform',
    goal: 'Add declarative entry/exit/position events that become risk-reviewed order intents outside the VM.', dependencies: [5, 9, 12],
    gates: [
      { id: 'cs13-event', statement: 'Strategy events are immutable and carry strategy/position/bar identity.', automated: true },
      { id: 'cs13-intent', statement: 'Events can be transformed into order intents without broker access.', automated: true },
      { id: 'cs13-risk', statement: 'Risk approval is a downstream platform decision.', automated: false },
      { id: 'cs13-no-bypass', statement: 'Strategy/automation code can only create intents; broker submission remains host-controlled after risk/policy.', automated: true },
    ],
  },
  {
    id: 14, name: 'Killer example', kind: 'governance',
    goal: 'Use one end-to-end EMA + RSI program as the canonical CoreSpirit acceptance fixture.', dependencies: [1, 3, 5, 7, 9, 10, 11, 12, 13],
    gates: [
      { id: 'cs14-compile', statement: 'The canonical source compiles to a stable artifact.', automated: true },
      { id: 'cs14-modes', statement: 'Historical, replay, realtime, and committed outputs converge for fixed data.', automated: true },
      { id: 'cs14-debug', statement: 'The selected-bar debugger can explain the example from source through output.', automated: false },
      { id: 'cs14-signal', statement: 'Signals stop at the strategy/risk boundary.', automated: true },
    ],
  },
  {
    id: 15, name: 'Explicit non-goals', kind: 'governance',
    goal: 'Prevent scope drift while the runtime contracts stabilize.', dependencies: [1, 7, 12, 13],
    gates: [
      { id: 'cs15-no-language-lockin', statement: 'CoreSpirit is TCO-owned and does not emulate an external scripting language.', automated: false },
      { id: 'cs15-no-ai-core', statement: 'AI generation remains outside the deterministic language runtime.', automated: false },
      { id: 'cs15-no-broker', statement: 'Direct broker control remains outside the language.', automated: true },
      { id: 'cs15-sandbox', statement: 'VM execution is quota-limited and capability-gated.', automated: true },
    ],
  },
  {
    id: 16, name: 'Release roadmap', kind: 'governance',
    goal: 'Gate future work by architectural exit criteria rather than feature count.', dependencies: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    gates: [
      { id: 'cs16-contract-first', statement: 'New language/runtime features must add a contract and conformance test before UI exposure.', automated: false },
      { id: 'cs16-single-runtime', statement: 'Historical, replay, realtime, backtest, and chart execution share CoreSpirit semantics.', automated: false },
      { id: 'cs16-stage-gates', statement: 'A stage is complete only when its required gates are green.', automated: true },
      { id: 'cs16-lifecycle', statement: 'Every automation has an explicit lifecycle and LIVE is never inferred from an enabled flag.', automated: true },
      { id: 'cs16-risk-boundary', statement: 'No indicator/model/strategy runtime path can submit directly to a broker.', automated: true },
    ],
  },
  {
    id: 17, name: 'IDE/runtime convergence', kind: 'tooling',
    goal: 'Make the editor, chart, replay inspector and explainability surface projections of the same executable artifact and runtime.', dependencies: [11, 12, 16],
    gates: [
      { id: 'cs17-one-artifact', statement: 'IDE execution consumes the same validated artifact shape used by replay.', automated: true },
      { id: 'cs17-latest-run', statement: 'Older asynchronous IDE runs cannot overwrite newer runtime state.', automated: true },
      { id: 'cs17-explain', statement: 'Signals expose structured provenance and control-plane decisions without changing execution semantics.', automated: true },
      { id: 'cs17-paper-safe', statement: 'IDE automation preview cannot submit a broker execution request.', automated: true },
    ],
  },
  {
    id: 18, name: 'Platform architecture', kind: 'platform',
    goal: 'Freeze the trading-system-centric platform boundary: one language/compiler/IR/VM, one canonical trading model, and one renderer-neutral scene graph with host adapters for research, execution modes, risk and brokers.', dependencies: [4, 9, 10, 12, 13, 16, 17],
    gates: [
      { id: 'cs18-neutral-data', statement: 'CoreSpirit owns neutral market-data contracts and does not import broker-domain market types.', automated: true },
      { id: 'cs18-one-vm', statement: 'Historical, replay and realtime hosts execute the same validated artifact through the same VM.', automated: true },
      { id: 'cs18-signal-engine', statement: 'VM signal outputs normalize into immutable, sequenced, deduplicable signal envelopes.', automated: true },
      { id: 'cs18-execution-adapter', statement: 'Broker connectivity exists only behind a host-owned execution adapter contract.', automated: true },
      { id: 'cs18-dependency-direction', statement: 'Language, VM, signal and automation layers cannot directly depend on broker adapters.', automated: true },
      { id: 'cs18-canonical-model', statement: 'Market/feed inputs adapt into one broker-neutral canonical trading model before entering higher-level runtime services.', automated: true },
      { id: 'cs18-scene-graph', statement: 'Legacy visual outputs and advanced semantic visuals converge into one persistent renderer-neutral scene graph.', automated: true },
      { id: 'cs18-interaction-serialization', statement: 'Visual interactions are serializable action references rather than executable callback closures.', automated: true },
    ],
  },

  {
    id: 19, name: 'Language-driven interactive UI', kind: 'platform',
    goal: 'Let indicators define deterministic panels and controls that compile into runtime UI state and host-resolved action references.', dependencies: [8, 9, 17, 18],
    gates: [
      { id: 'cs19-member-call', statement: 'Member-call syntax compiles through the same compiler and IR pipeline.', automated: true },
      { id: 'cs19-ui-state', statement: 'Panel/control definitions are serializable UI state owned by the runtime.', automated: true },
      { id: 'cs19-host-actions', statement: 'User actions resolve through declarative action IDs; no DOM/function closures enter the VM.', automated: true },
      { id: 'cs19-realtime', statement: 'Developing-bar UI state rolls back with the same realtime transaction boundary.', automated: true },
    ],
  },
  {
    id: 20, name: 'Data-rich visual metadata', kind: 'platform',
    goal: 'Promote visual metadata to a typed scene concern so chart objects expose inspectable trading facts rather than only pixels.', dependencies: [18, 19],
    gates: [
      { id: 'cs20-metadata', statement: 'Visual nodes can carry normalized scalar metadata independent of renderer styling.', automated: true },
      { id: 'cs20-inspection', statement: 'Metadata-bearing visuals automatically expose serializable inspect actions.', automated: true },
      { id: 'cs20-compat', statement: 'Legacy visual objects continue to adapt through the same scene builder.', automated: true },
    ],
  },
  {
    id: 21, name: 'Exploration surfaces', kind: 'tooling',
    goal: 'Expose runtime UI state and visual metadata through the IDE, hover inspector, replay and audit surfaces.', dependencies: [17, 19, 20],
    gates: [
      { id: 'cs21-editor', statement: 'The IDE can display live runtime UI state alongside the scene graph.', automated: false },
      { id: 'cs21-hover', statement: 'Metadata inspection is available without mutating trading/runtime state.', automated: false },
    ],
  },
  {
    id: 22, name: 'Trading-system convergence', kind: 'platform',
    goal: 'Make visuals, UI, signals, research and execution projections of one canonical trading runtime rather than separate script products.', dependencies: [18, 19, 20, 21],
    gates: [
      { id: 'cs22-one-runtime', statement: 'UI, visuals and trading outputs originate from the same validated artifact and execution context.', automated: true },
      { id: 'cs22-no-bypass', statement: 'Interactive UI cannot submit broker orders or mutate account state directly.', automated: true },
      { id: 'cs22-serializable', statement: 'Scene, UI state and interaction references are serializable for replay/debugging.', automated: true },
    ],
  },
  {
    id: 23, name: 'Advanced visual data model', kind: 'platform',
    goal: 'Represent heatmaps, liquidity fields, depth, volume profiles, footprints, structure graphs, probability surfaces, regimes, model fields, trade paths and replay traces without coupling CoreSpirit to a renderer.', dependencies: [18, 20, 22],
    gates: [
      { id: 'cs23-high-dimensional', statement: 'Advanced visual payloads have renderer-neutral contracts for grids, depth, profiles, graphs and paths.', automated: true },
      { id: 'cs23-validation', statement: 'Advanced visual payloads are quota-limited, finite and structurally valid before entering the scene graph.', automated: true },
      { id: 'cs23-scene-bridge', statement: 'Advanced visual objects adapt into the existing persistent scene graph without creating a second renderer/runtime.', automated: true },
      { id: 'cs23-renderer-agnostic', statement: 'CoreSpirit contracts contain no Canvas, SVG, WebGL/WebGPU or native renderer objects.', automated: true },
    ],
  },
  {
    id: 24, name: 'Realtime visual engine', kind: 'platform',
    goal: 'Turn scene state transitions into incremental visual patches with revision, rollback, commit and patch coalescing semantics suitable for realtime trading charts and replay.', dependencies: [5, 18, 22, 23],
    gates: [
      { id: 'cs24-diff', statement: 'A visual revision emits added/updated/removed node patches rather than a full-scene redraw.', automated: true },
      { id: 'cs24-transaction', statement: 'Developing-bar visual state supports begin/apply/commit/rollback with the same revision model as runtime state.', automated: true },
      { id: 'cs24-stable-identity', statement: 'Stable visual IDs preserve object identity across realtime revisions.', automated: true },
      { id: 'cs24-coalesce', statement: 'Multiple patches can be coalesced without leaving stale add/update/remove operations.', automated: true },
      { id: 'cs24-host-neutral', statement: 'The realtime engine is renderer-neutral; GPU/browser/native application happens only in the host renderer.', automated: true },
    ],
  },
  {
    id: 25, name: 'Declarative visual language', kind: 'platform',
    goal: 'Describe semantic visual state through renderer-neutral constructors so the runtime owns state while hosts own rendering strategy.', dependencies: [20, 23, 24],
    gates: [
      { id: 'cs25-semantic-state', statement: 'CoreSpirit can express visual state as stable semantic specifications rather than renderer commands.', automated: true },
      { id: 'cs25-no-renderer', statement: 'Declarative visual contracts contain no DOM, Canvas, WebGL/WebGPU or renderer callback objects.', automated: true },
      { id: 'cs25-realtime', statement: 'Declarative visual state participates in realtime snapshot, rollback and commit semantics.', automated: true },
      { id: 'cs25-compat', statement: 'Legacy visual outputs continue to flow through the same scene graph and renderer adapters.', automated: true },
    ],
  },
  {
    id: 26, name: 'Visual applications', kind: 'platform',
    goal: 'Let CoreSpirit declare a complete trading workspace composed of charts, panels, overlays, research surfaces and serializable interaction bindings.', dependencies: [19, 21, 22, 25],
    gates: [
      { id: 'cs26-workspace', statement: 'A visual application is represented as a serializable workspace manifest rather than imperative UI code.', automated: true },
      { id: 'cs26-host-projection', statement: 'Web, desktop, replay and future workspace hosts can project the same app manifest.', automated: true },
      { id: 'cs26-no-broker-bypass', statement: 'Workspace actions remain declarative references and cannot call broker execution directly.', automated: true },
      { id: 'cs26-one-runtime', statement: 'Visual applications remain projections of the same CoreSpirit artifact/runtime rather than a second language runtime.', automated: true },
      { id: 'cs26-target-negotiation', statement: 'Applications can declare supported execution targets and required host features without changing the executable language/VM.', automated: true },
    ],
  },
  {
    id: 27, name: 'Execution targets', kind: 'platform',
    goal: 'Run the same CoreSpirit artifact across chart, replay, backtest, scanner, alert, server, automation and research targets with explicit capability profiles.', dependencies: [4, 9, 16, 18, 26],
    gates: [
      { id: 'cs27-one-language', statement: 'Execution targets select host capabilities; they do not create separate languages, compilers, IRs or VMs.', automated: true },
      { id: 'cs27-capability-profile', statement: 'Each execution target has an explicit machine-checkable capability profile.', automated: true },
      { id: 'cs27-runtime-guard', statement: 'The VM rejects target-incompatible operations even when the artifact is valid.', automated: true },
      { id: 'cs27-artifact-reuse', statement: 'The same artifact checksum can be hosted by multiple execution targets.', automated: true },
    ],
  },
  {
    id: 28, name: 'Native scanner', kind: 'platform',
    goal: 'Make universe scanning a first-class host execution environment with typed candidate emission, deterministic ranking and pluggable worker scheduling.', dependencies: [2, 3, 9, 12, 27],
    gates: [
      { id: 'cs28-universe', statement: 'A scanner receives an immutable universe of provider-neutral datasets instead of reaching directly into a broker API.', automated: true },
      { id: 'cs28-candidate', statement: 'scan.emit produces typed candidate outputs with stable IDs, scores and metadata.', automated: true },
      { id: 'cs28-ranking', statement: 'Candidate aggregation is deterministic and ties are resolved by stable symbol/ID ordering.', automated: true },
      { id: 'cs28-scheduler', statement: 'Scanner scheduling is a host abstraction that can use local batches, Web Workers or Worker Threads without changing the VM ABI.', automated: true },
      { id: 'cs28-no-visual', statement: 'Scanner execution has no visual/UI capability by default.', automated: true },
    ],
  },
  {
    id: 29, name: 'Multi-environment trading programming', kind: 'platform',
    goal: 'Make execution target selection a standard platform concept spanning chart, replay, backtest, scanner, alert, server, automation and research.', dependencies: [22, 27, 28],
    gates: [
      { id: 'cs29-common-artifact', statement: 'Target selection occurs after compilation at the host layer.', automated: true },
      { id: 'cs29-mode-observability', statement: 'Run identity exposes target, artifact checksum, dataset and symbol so target choice is observable.', automated: true },
      { id: 'cs29-docs', statement: 'The canonical CoreSpirit document records target capabilities and version changes without spawning version-specific Markdown files.', automated: true },
    ],
  },

  {
    id: 30, name: 'Multi-symbol computation', kind: 'platform',
    goal: 'Make relationships between instruments first-class through provider-neutral market references, synchronized data access and explicit cross-symbol capability gates.', dependencies: [18, 27, 28, 29],
    gates: [
      { id: 'cs30-market-ref', statement: 'CoreSpirit can express market("NIFTY").close and market references can be stored in locals without a second runtime.', automated: true },
      { id: 'cs30-sync', statement: 'Cross-symbol samples are aligned to one base execution clock and never accept future samples.', automated: true },
      { id: 'cs30-stale', statement: 'Hosts can enforce a maximum staleness policy for cross-symbol inputs.', automated: true },
      { id: 'cs30-series', statement: 'Indicators can consume historical series supplied by another symbol through the same IR call mechanism.', automated: true },
      { id: 'cs30-no-broker', statement: 'Multi-symbol access uses CoreSpirit-owned contracts; the VM still has no broker/network authority.', automated: true },
    ],
  },
  {
    id: 31, name: 'Native multi-timeframe data', kind: 'runtime',
    goal: 'Make timeframe references first-class with explicit synchronization and confirmed-sample defaults that prevent look-ahead.', dependencies: [2, 3, 18, 29, 30],
    gates: [
      { id: 'cs31-timeframe-ref', statement: 'CoreSpirit can express timeframe(\"1D\").close and store timeframe references as typed runtime values.', automated: true },
      { id: 'cs31-sync', statement: 'Higher-timeframe values synchronize against the base bar clock rather than using an independent execution cursor.', automated: true },
      { id: 'cs31-no-lookahead', statement: 'Developing/future higher-timeframe samples are excluded by default and future timestamps are rejected.', automated: true },
      { id: 'cs31-indicators', statement: 'Indicators can consume synchronized higher-timeframe series through the existing call/IR ABI.', automated: true },
      { id: 'cs31-history', statement: 'The multi-timeframe host can provide historical samples without adding a second series engine.', automated: true },
    ],
  },
  {
    id: 32, name: 'Strict external model ABI', kind: 'platform',
    goal: 'Define one semantic model contract for Python, C++, Rust, WASM, ONNX and remote models with typed features, market context, predictions, confidence, metadata, provenance and resource limits.', dependencies: [8, 18, 27, 29],
    gates: [
      { id: 'cs32-one-abi', statement: 'External model implementations share one CoreSpirit semantic manifest and request/result contract.', automated: true },
      { id: 'cs32-typed-input', statement: 'Model features have explicit names, dtypes and shapes and are validated before execution.', automated: true },
      { id: 'cs32-output', statement: 'Prediction, optional confidence, metadata, checksums and state tokens are explicitly represented.', automated: true },
      { id: 'cs32-determinism', statement: 'Models must declare deterministic=true and stateful models must be rollback-safe.', automated: true },
      { id: 'cs32-isolation', statement: 'Model adapters own process/network/runtime capabilities; the VM receives only typed model data.', automated: true },
    ],
  },
  {
    id: 33, name: 'External model orchestration', kind: 'platform',
    goal: 'Make Python research and native/portable model runtimes cooperating host capabilities rather than competitors to CoreSpirit, with target-aware inference and quota enforcement.', dependencies: [27, 28, 29, 32],
    gates: [
      { id: 'cs33-target', statement: 'Model inference is allowed only on execution targets whose capability profile includes model-inference.', automated: true },
      { id: 'cs33-adapters', statement: 'Python, C++, Rust, WASM, ONNX and remote adapter contracts map into the same semantic model interface.', automated: true },
      { id: 'cs33-python', statement: 'The Python research client can orchestrate registered model inference without embedding the production VM.', automated: true },
      { id: 'cs33-quotas', statement: 'Inference is bounded by call, input and output quotas and every request receives a deterministic checksum.', automated: true },
      { id: 'cs33-no-execution-bypass', statement: 'Model inference cannot create broker orders or bypass signal, automation, risk or policy boundaries.', automated: true },
    ],
  },
  {
    id: 34, name: 'AI model semantics', kind: 'platform',
    goal: 'Make AI a typed semantic model kind on top of the strict external-model ABI, with structured direction/probability/regime/confidence outputs and host-owned model handles.', dependencies: [32, 33],
    gates: [
      { id: 'cs34-ai-kind', statement: 'AI is represented as a model kind/profile, not a second language, compiler or VM.', automated: true },
      { id: 'cs34-structured-output', statement: 'AI predictions normalize into typed direction, probability, confidence, optional regime and class probabilities.', automated: true },
      { id: 'cs34-host-handle', statement: 'AI model loading remains a host orchestration concern over the same external-model registry and quotas.', automated: true },
      { id: 'cs34-no-authority', statement: 'AI prediction data cannot directly approve risk, activate LIVE, or submit broker orders.', automated: true },
    ],
  },
  {
    id: 35, name: 'Model visualization and explanation surfaces', kind: 'platform',
    goal: 'Project structured model predictions into renderer-neutral probability surfaces, model fields and regime bands so the visual layer becomes an explanation surface without becoming a decision engine.', dependencies: [5, 23, 25, 34],
    gates: [
      { id: 'cs35-probability-surface', statement: 'Structured AI probabilities can be projected into the existing probabilitySurface visual kind.', automated: true },
      { id: 'cs35-model-field', statement: 'Direction, probability, confidence and model provenance can be represented as a serializable modelField scene spec.', automated: true },
      { id: 'cs35-regime', statement: 'AI regime output can project into a renderer-neutral regimeBand with confidence.', automated: true },
      { id: 'cs35-explanation-only', statement: 'Model visuals are observational/explanatory and have no execution authority.', automated: true },
      { id: 'cs35-one-scene', statement: 'Model explanation visuals enter the existing declarative visual scene graph and realtime patch engine.', automated: true },
    ],
  },
  {
    id: 36, name: 'Explainable automation', kind: 'platform',
    goal: 'Make every automation decision queryable as a deterministic, immutable chain from signal through lifecycle, risk, policy and execution authority.', dependencies: [13, 14, 15, 16, 34],
    gates: [
      { id: 'cs36-record', statement: 'Every automation result can produce a versioned explanation record keyed by intent and event identity.', automated: true },
      { id: 'cs36-authority', statement: 'Explanation records include the execution-authority path and authority checksum without granting new execution power.', automated: true },
      { id: 'cs36-facts', statement: 'Signal facts, risk facts, policy facts and execution disposition remain structured rather than free-form prose only.', automated: true },
      { id: 'cs36-store', statement: 'Automation explanations can be retained and queried independently of the broker execution adapter.', automated: true },
    ],
  },
  {
    id: 37, name: 'Visual debugger experience', kind: 'tooling',
    goal: 'Make any chart point inspectable as a deterministic execution trace linking source location, IR instructions, runtime state, outputs and signal explanation.', dependencies: [10, 11, 18, 24, 36],
    gates: [
      { id: 'cs37-trace', statement: 'The runtime can optionally capture per-instruction trace values without changing production execution semantics when tracing is disabled.', automated: true },
      { id: 'cs37-bar', statement: 'A debugger session can inspect an arbitrary historical/replay bar from the same executable artifact and market dataset.', automated: true },
      { id: 'cs37-source', statement: 'Selected instructions resolve back to CoreSpirit source-map locations for editor highlighting.', automated: true },
      { id: 'cs37-explanation', statement: 'Signal explanations and decision facts can be inspected at the same selected bar.', automated: true },
      { id: 'cs37-chart-click', statement: 'A host chart click can request a debug-bar inspection without giving the chart or debugger execution authority.', automated: true },
    ],
  },

  {
    id: 38, name: 'Visual compiler graph', kind: 'compiler',
    goal: 'Compile one CoreSpirit source program into a semantic dependency graph, ordered execution graph and renderer-neutral visual graph while preserving the existing stable IR/VM contract.', dependencies: [18, 25, 26, 35, 37],
    gates: [
      { id: 'cs38-semantic-graph', statement: 'The compiler emits a serializable semantic dependency graph with source locations, dependencies, inputs and effect classification.', automated: true },
      { id: 'cs38-execution-graph', statement: 'The execution graph preserves the CoreSpirit IR instruction order and side-effect barriers.', automated: true },
      { id: 'cs38-visual-graph', statement: 'Visual, UI, signal and automation outputs are projected into one renderer-neutral visual/output graph.', automated: true },
      { id: 'cs38-one-ir', statement: 'Graph metadata is attached to the existing executable artifact; it does not create a second compiler or VM.', automated: true },
    ],
  },
  {
    id: 39, name: 'Reactive runtime', kind: 'runtime',
    goal: 'Use the compiled dependency graph to reuse unaffected pure computations while preserving stateful semantics, transactional rollback, deterministic output emission and authority boundaries.', dependencies: [5, 18, 24, 37, 38],
    gates: [
      { id: 'cs39-dirty-propagation', statement: 'Changed market inputs invalidate only the affected pure dependency subgraph plus required stateful nodes.', automated: true },
      { id: 'cs39-cache', statement: 'Unaffected pure instruction results can be reused from the previous revision without changing observable outputs.', automated: true },
      { id: 'cs39-effects', statement: 'Set-local, control-flow, visual, signal, automation and other effects execute in deterministic order even when upstream values were reused.', automated: true },
      { id: 'cs39-rollback', statement: 'Reactive caches are never allowed to leak speculative state across realtime rollback/commit boundaries.', automated: true },
      { id: 'cs39-observability', statement: 'Runtime exposes reactive recompute/reuse statistics for the debugger and performance inspection without granting extra trading authority.', automated: true },
    ],
  },


  {
    id: 40, name: 'Numerical execution planner', kind: 'runtime',
    goal: 'Make CPU/WASM/GPU acceleration a host-planning concern over the same Core IR, with workload estimation, batching, deterministic eligibility and hybrid pure-work offload.', dependencies: [27, 28, 30, 31, 38, 39],
    gates: [
      { id: 'cs40-backend-neutral', statement: 'CoreSpirit models CPU, WASM and GPU as interchangeable numerical backends behind a host planner; no backend becomes a language primitive.', automated: true },
      { id: 'cs40-determinism', statement: 'A deterministic request cannot select a backend that does not declare deterministic execution.', automated: true },
      { id: 'cs40-batch', statement: 'Large symbol × timeframe × bar workloads are converted into bounded deterministic batches.', automated: true },
      { id: 'cs40-hybrid', statement: 'When effects/state exist, pure numerical nodes may be assigned to an accelerator while ordered effect nodes remain on CPU.', automated: true },
      { id: 'cs40-fallback', statement: 'CPU remains the semantic fallback when no alternate backend is available or eligible.', automated: true },
    ],
  },
  {
    id: 41, name: 'Capability-based sandbox', kind: 'runtime',
    goal: 'Make resource and platform authority an explicit allow-list so CoreSpirit code can receive only granted capabilities and cannot express raw OS, broker, filesystem, process or unrestricted network powers.', dependencies: [15, 18, 27, 40],
    gates: [
      { id: 'cs41-allow-list', statement: 'Sandbox capabilities are explicitly granted and are the intersection of program-layer and execution-target authority.', automated: true },
      { id: 'cs41-dangerous-absent', statement: 'Raw network, filesystem, arbitrary process, native-call, broker-credential and direct-account capabilities are not expressible through the sandbox API.', automated: true },
      { id: 'cs41-quotas', statement: 'Instruction, data-request, model-call, visual-node and compute-unit limits are enforced per revision.', automated: true },
      { id: 'cs41-accelerator', statement: 'WASM/GPU compute requires an explicit compute capability and never grants broker/network/account authority.', automated: true },
      { id: 'cs41-host-owned', statement: 'The sandbox constrains CoreSpirit while leaving actual OS/driver/process/network implementation to the host.', automated: true },
    ],

  },
  {
    id: 42, name: 'CoreSpirit v1 converged runtime', kind: 'runtime',
    goal: 'Freeze the first end-state runtime contract: one executable artifact travels through reactive execution, renderer-neutral scene projection and deterministic replay, while hosts remain adapters rather than alternate runtimes.',
    dependencies: [10, 18, 39, 41],
    gates: [
      { id: 'cs42-one-artifact', statement: 'Historical, replay and realtime v1 sessions are built around the same validated executable artifact and existing VM.', automated: true },
      { id: 'cs42-reactive', statement: 'The v1 runtime exposes the existing reactive engine as the single execution/reuse substrate; it does not introduce a second evaluator.', automated: true },
      { id: 'cs42-scene', statement: 'Run outputs can be projected into the persistent renderer-neutral scene graph and realtime revisions produce transactional visual patches.', automated: true },
      { id: 'cs42-replay', statement: 'Replay verification compares repeated artifact + dataset execution through the existing replay host and yields a deterministic acceptance record.', automated: true },
      { id: 'cs42-host-neutral', statement: 'The v1 runtime contains orchestration only; clock/data/rendering/model/network/broker implementations remain host capabilities.', automated: true },
    ],
    nonGoals: ['full GPU/WASM production adapters', 'broker execution inside CoreSpirit', 'a second VM or alternate evaluator'],
  },
  {
    id: 43, name: 'Programmable visual coordinate system', kind: 'platform',
    goal: 'Make visual placement and coordinate spaces first-class scene semantics: chart areas, panels, side panels, time/bar/price/percentage/screen/normalized coordinates, ranges, relative bar anchors, rich geometry and custom visuals.', dependencies: [25, 26, 39, 42],
    gates: [
      { id: 'cs43-plot-placement', statement: 'plot can target a semantic area, conditional visibility and optional numeric range without changing legacy plot behavior.', automated: true },
      { id: 'cs43-coordinate-spaces', statement: 'CoreSpirit exposes validated time, bar, price, percentage, screen and normalized coordinate spaces through serializable point contracts.', automated: true },
      { id: 'cs43-rich-geometry', statement: 'Point-based line/box/polygon geometry and relative bar text placement enter the same scene graph as legacy visuals.', automated: true },
      { id: 'cs43-custom-visual', statement: 'Custom visual payloads are renderer-neutral, serializable and area-addressable.', automated: true },
      { id: 'cs43-scene-preservation', statement: 'Placement, geometry and relative-position metadata survive scene construction, validation, diffing and realtime-compatible identity rules.', automated: true },
      { id: 'cs43-host-neutral', statement: 'Coordinate contracts contain no DOM, Canvas, WebGL/WebGPU or device-specific handles; coordinate resolution remains host-owned.', automated: true },
    ],
  },

  {
    id: 44, name: 'Core language unification', kind: 'compiler',
    goal: 'Keep the external language surface pleasant while preventing feature-specific mini-languages: surface conveniences, direct calls and namespaced members must converge through shared registries into the same parser, compiler, stable IR and VM.',
    dependencies: [18, 38, 42, 43],
    gates: [
      { id: 'cs44-small-core', statement: 'The executable parser grammar remains the small core language; feature additions do not require a new parser sub-language merely to describe outputs or host capabilities.', automated: true },
      { id: 'cs44-surface-registry', statement: 'Concise surface spellings are implemented as registered source transforms rather than feature-specific logic scattered through the compiler pipeline.', automated: true },
      { id: 'cs44-call-registry', statement: 'Direct callable output semantics and namespaced member call contracts are described once and consumed by semantic analysis and lowering.', automated: true },
      { id: 'cs44-no-compiler-allowlist', statement: 'Compiler emission lowering does not maintain a second hard-coded list of visual/strategy/event function names; emit kinds come from the shared call contracts.', automated: true },
      { id: 'cs44-editor-convergence', statement: 'Editor member completion uses the same member registry as semantic analysis and lowering so the language service cannot invent a divergent mini-language.', automated: true },
      { id: 'cs44-one-ir', statement: 'All surface forms converge into the same AST/IR/VM contract; syntax sugar cannot create an alternate execution path.', automated: true },
    ],
    nonGoals: ['named-argument parser syntax', 'a second AST for strategy/visual declarations', 'renderer-specific language keywords'],
  },

  {
    id: 45, name: 'Six-concept language surface', kind: 'compiler',
    goal: 'Reduce the user mental model to DATA, LET, WHEN, SHOW, MODEL and AUTOMATE while keeping the executable grammar and VM unchanged underneath. Concise WHEN/SHOW forms lower into core syntax; MODEL/AUTOMATE declarations become stable artifact metadata plus existing callable semantics.',
    dependencies: [1, 8, 18, 44],
    gates: [
      { id: 'cs45-six-concepts', statement: 'The documented user mental model contains exactly DATA, LET, WHEN, SHOW, MODEL and AUTOMATE.', automated: true },
      { id: 'cs45-when', statement: 'WHEN source blocks lower deterministically to existing if control flow, including quoted incoming event names for automation.', automated: true },
      { id: 'cs45-show', statement: 'SHOW source forms lower to the single Core IR show emission kind and then to renderer-neutral visual scene objects.', automated: true },
      { id: 'cs45-declarations', statement: 'MODEL and AUTOMATE declarations are captured as serializable metadata on the same executable artifact rather than introducing a second AST or VM.', automated: true },
      { id: 'cs45-event-boundary', statement: 'Incoming automation events are host-resolved through an explicit event resolver; event queries never become signal emission or broker authority.', automated: true },
      { id: 'cs45-one-language', statement: 'All six concepts converge through the existing lexer/parser/AST/Core IR/VM path; no concept introduces a feature-specific executor.', automated: true },
      { id: 'cs45-editor', statement: 'The editor presents the six concepts as the primary language vocabulary while retaining implementation call/member completion as an expert surface.', automated: true },
    ],
    nonGoals: ['a second parser grammar for models or automation', 'direct model-process access from the VM', 'direct broker execution from AUTOMATE syntax', 'named-argument syntax', 'general-purpose function declarations'],
  },
  {
    id: 46, name: 'Universal SHOW visual primitive', kind: 'compiler',
    goal: 'Make SHOW the primary visual language concept with one Visual IR emission path, while retaining plot/geometry calls as compatibility and advanced APIs. Infer common coordinate spaces from concise source forms and preserve explicit coordinate escapes for advanced users.',
    dependencies: [43, 45],
    gates: [
      { id: 'cs46-show-ir', statement: 'All user-facing SHOW forms compile to the single Core IR show emission kind rather than plot/line/box-specific emission kinds.', automated: true },
      { id: 'cs46-show-series', statement: 'SHOW series forms support price/chart areas, named panels and conditional WHEN projection without introducing another runtime.', automated: true },
      { id: 'cs46-show-geometry', statement: 'SHOW line/resistance/support/box forms produce existing renderer-neutral geometry and scene objects.', automated: true },
      { id: 'cs46-show-zone', statement: 'SHOW zone expresses a price-domain region without fabricating hidden time coordinates; viewport/domain intent remains serializable.', automated: true },
      { id: 'cs46-coordinate-inference', statement: 'Bracket coordinate pairs infer normalized space for common 0..1 literals and time/price space otherwise; explicit point(..., space) remains available.', automated: true },
      { id: 'cs46-same-scene', statement: 'Universal SHOW output enters the existing scene graph and remains subject to the same diff, rollback, quota and renderer-neutral validation contracts.', automated: true },
      { id: 'cs46-surface-simple', statement: 'Editor primary completion does not require users to learn the advanced visual function family; SHOW is the primary visual entry point.', automated: true },
    ],
    nonGoals: ['removing compatibility visual APIs', 'device-coordinate transforms inside the VM', 'a second visual executor', 'implicit coordinate mixing', 'renderer-specific syntax in the language'],
  },


  {
    id: 47, name: 'Universal SHOW surface + coordinate inference', kind: 'compiler',
    goal: 'Make SHOW the complete user-facing visual vocabulary for common projections while centralizing conservative coordinate inference before execution; advanced coordinate constructors remain escape hatches, not required syntax.',
    dependencies: [43, 45, 46],
    gates: [
      { id: 'cs47-one-show', statement: 'Value, line, box, zone and signal visual forms all enter one SHOW semantic emission path; plot/line/box/zone remain implementation compatibility APIs.', automated: true },
      { id: 'cs47-inference', statement: 'Coordinate inference is centralized, deterministic and explicit before runtime: 0..1 literal pairs infer normalized, bar-index-leading pairs infer bar, other geometry defaults to time/price.', automated: true },
      { id: 'cs47-bracket', statement: 'Bracketed pairs with nested indexing/calls are parsed structurally rather than with a renderer-specific mini-parser.', automated: true },
      { id: 'cs47-modifiers', statement: 'SHOW area and conditional modifiers are lowered as semantic placement/control-flow data rather than scene graph fields in source syntax.', automated: true },
      { id: 'cs47-one-ir', statement: 'SHOW continues to compile to one Core IR show emission kind and one runtime semantic projection path.', automated: true },
      { id: 'cs47-no-device', statement: 'Coordinate inference does not introduce device coordinates, viewport handles or renderer behavior into the VM.', automated: true },
    ],
    nonGoals: ['named-argument visual grammar', 'renderer-specific coordinate syntax', 'a second visual evaluator'],
  },
  {
    id: 48, name: 'Scene graph encapsulation', kind: 'platform',
    goal: 'Make the renderer-neutral scene graph a compiler/runtime implementation detail. User-facing runtime results expose visual summaries and transactional updates instead of layers, panes, z-indexes, nodes, parents or graph topology.',
    dependencies: [18, 22, 24, 46, 47],
    gates: [
      { id: 'cs48-public-summary', statement: 'Primary CoreSpirit runtime APIs expose visual summaries/checksums/counts rather than Scene Graph nodes.', automated: true },
      { id: 'cs48-realtime-summary', statement: 'Realtime revisions expose opaque visual update summaries while commit/rollback remains synchronized with the private scene transaction.', automated: true },
      { id: 'cs48-no-scene-barrel', statement: 'The primary CoreSpirit API does not export Scene Graph builder/engine implementation symbols.', automated: true },
      { id: 'cs48-host-boundary', statement: 'Renderer hosts may consume internal scene state through dedicated adapters without making scene topology part of the language mental model.', automated: false },
      { id: 'cs48-serializable', statement: 'Public visual summaries remain deterministic, serializable and sufficient for replay/debugger status without exposing renderer topology.', automated: true },
    ],
    nonGoals: ['removing the internal renderer-neutral scene graph', 'removing advanced visual host adapters', 'device coordinates in CoreSpirit'],
  },

  {
    id: 49, name: 'Declarative MODEL surface', kind: 'compiler',
    goal: 'Make MODEL a compact user-facing declaration for registered and external model bindings while keeping typed ABI, adapters, state/rollback semantics, quotas and capability security behind the language surface.',
    dependencies: [18, 44, 45, 48],
    gates: [
      { id: 'cs49-binding', statement: 'MODEL declarations support compact registry bindings (`use "model-id"`) and explicit host implementation bindings such as `use python "path"` without embedding the external runtime in the VM.', automated: true },
      { id: 'cs49-io-schema', statement: 'MODEL input/output declarations are captured as stable surface metadata, including optional scalar/series field types, and do not create a second executable AST or model runtime.', automated: true },
      { id: 'cs49-reference', statement: 'Qualified model outputs such as `Regime.confidence` lower to the existing core expression model and are statically checked against declared model outputs and declared output types when present.', automated: true },
      { id: 'cs49-editor', statement: 'MODEL output members are discoverable through the same editor/member completion contract as other language members.', automated: true },
      { id: 'cs49-runtime-bridge', statement: 'Runtime model output reads use an optional host-owned resolver boundary that receives the model binding as opaque metadata; no filesystem, process, network or broker access is introduced into CoreSpirit.', automated: true },
      { id: 'cs49-show', statement: 'SHOW can project a whole model result through the universal visual primitive rather than requiring a model-specific visual API.', automated: true },
      { id: 'cs49-abi-hidden', statement: 'The user-facing MODEL syntax does not expose ABI versions, transport details, quotas, adapter classes or rollback tokens; those remain platform contracts.', automated: false },
    ],
    nonGoals: ['embedding Python in the VM', 'automatic filesystem execution of model paths', 'a second model evaluator', 'model-specific renderer syntax', 'direct model access to broker/account authority'],
  },

  {
    id: 50, name: 'Declarative AUTOMATE surface', kind: 'compiler',
    goal: 'Make AUTOMATE a compact declarative language concept. Human-facing order actions, lifecycle routing and common stop/target sizing syntax lower into the existing order-intent path without exposing risk, policy or broker mechanics.',
    dependencies: [18, 44, 45, 49],
    gates: [
      { id: 'cs50-automate-surface', statement: 'AUTOMATE supports compact when + order syntax while retaining one core parser and one executable artifact.', automated: true },
      { id: 'cs50-order-shorthand', statement: 'order long/short/exit shorthand lowers deterministically to the canonical order intent surface.', automated: true },
      { id: 'cs50-order-block', statement: 'Structured order: blocks with side, risk/quantity, stop and target lower to the same canonical order intent.', automated: true },
      { id: 'cs50-atr-shorthand', statement: 'Common `1.5 atr` and explicit `atr(14)` protective-level expressions normalize through the normal expression grammar.', automated: true },
      { id: 'cs50-lifecycle-hidden', statement: 'Automation lifecycle and risk/policy/execution mechanics remain platform internals rather than source-language requirements.', automated: true },
      { id: 'cs50-editor', statement: 'Editor completion presents order as the primary AUTOMATE action and retains entry/exit/buy/sell as compatibility APIs.', automated: true },
    ],
    nonGoals: ['direct broker commands in CoreSpirit', 'automatic live activation from source', 'a second automation runtime', 'feature-specific parser grammar'],
  },
  {
    id: 51, name: 'Universal ORDER intent', kind: 'platform',
    goal: 'Unify entry, exit, buy and sell at the semantic boundary into one structured order intent carrying direction, sizing policy and protective levels, while preserving the mandatory RISK -> POLICY -> EXECUTION host authority chain.',
    dependencies: [14, 18, 50],
    gates: [
      { id: 'cs51-one-intent', statement: 'Canonical user-facing order forms emit exactly one Core IR orderIntent kind.', automated: true },
      { id: 'cs51-sizing', statement: 'Order intent distinguishes quantity, riskPercent and all sizing without silently converting risk budgets into quantities inside the VM.', automated: true },
      { id: 'cs51-protection', statement: 'Stop and target values are carried as intent data and remain subject to risk/policy validation.', automated: true },
      { id: 'cs51-flat', statement: '`order exit all` is represented as a flat/close semantic intent and is not hard-coded as a sell command.', automated: true },
      { id: 'cs51-risk-chain', statement: 'Universal order intents still require risk approval, policy authorization and host-owned execution before any broker request.', automated: true },
      { id: 'cs51-legacy-compat', statement: 'Legacy entry/exit/buy/sell calls remain compatible mappings to order intent so prior artifacts do not gain a second execution meaning.', automated: true },
    ],
    nonGoals: ['broker-specific order verbs in the language', 'bypassing risk with quantity or risk syntax', 'moving execution authority into the VM'],
  },
  {
    id: 52, name: 'Universal EVENT emission and routing', kind: 'platform',
    goal: 'Collapse signal, alert, webhook and host notification emission into one immutable EVENT boundary. Sources emit a named event; destination routing remains declarative metadata and host-owned dispatch.',
    dependencies: [12, 45, 50, 51],
    gates: [
      { id: 'cs52-emit', statement: '`emit "NAME"` compiles to one Core IR event emission kind; legacy signal/alert/webhook calls remain compatibility mappings.', automated: true },
      { id: 'cs52-route', statement: 'route declarations and emit-to blocks attach serializable event destinations without executable routing logic in the VM.', automated: true },
      { id: 'cs52-fanout', statement: 'A single immutable event can fan out deterministically to webhook, notification, alert and automation destinations through a host-owned router.', automated: true },
      { id: 'cs52-no-network', statement: 'Event routing cannot open sockets or invoke a broker/network API from CoreSpirit; destination handlers remain host capabilities.', automated: true },
      { id: 'cs52-replay', statement: 'Event identity includes stable source/run/bar/timestamp/payload identity and is replay-safe.', automated: true },
    ],
    nonGoals: ['direct HTTP from CoreSpirit', 'one API per destination', 'broker execution through event emission'],
  },
  {
    id: 53, name: 'WHEN as the central reactive construct', kind: 'compiler',
    goal: 'Make WHEN the one source-level reactive control construct. Market transitions, named events, fills, model thresholds and webhook inputs all converge into ordinary expressions or the host event resolver.',
    dependencies: [5, 10, 12, 49, 52],
    gates: [
      { id: 'cs53-one-when', statement: 'WHEN source blocks lower through the existing core conditional path rather than introducing a second reactive executor.', automated: true },
      { id: 'cs53-event-forms', statement: 'Named events, bar closes, fills, price-enter-zone and webhook event forms normalize to event(...) queries through one event-surface contract.', automated: true },
      { id: 'cs53-expression-forms', statement: 'Expression-driven WHEN conditions such as model output thresholds and crossovers remain ordinary CoreSpirit expressions.', automated: true },
      { id: 'cs53-host-resolve', statement: 'Event truth is supplied by an explicit host resolver and cannot implicitly perform side effects.', automated: true },
      { id: 'cs53-replay', statement: 'The same WHEN semantics are usable across historical/replay/realtime execution with host-provided event state.', automated: true },
      { id: 'cs53-surface-simple', statement: 'Users do not need separate alert/webhook/signal/event-trigger grammars to express reactive behavior.', automated: true },
    ],
    nonGoals: ['a seventh top-level block concept named EVENT', 'separate execution engines per event source', 'implicit asynchronous callbacks inside the VM'],
  },
  {
    id: 54, name: 'Composable language surfaces', kind: 'compiler',
    goal: 'Make indicator values, MODEL outputs, events, WHEN conditions, AUTOMATE blocks and ORDER intents composable through one serializable semantic graph while preserving the existing compiler/IR/VM and host authority boundaries.', dependencies: [45, 49, 51, 52, 53],
    gates: [
      { id: 'cs54-graph', statement: 'Surface metadata carries a serializable composition graph describing producers, consumers and semantic edges without creating a second evaluator.', automated: true },
      { id: 'cs54-model-when', statement: 'Typed MODEL outputs can feed ordinary expressions and WHEN conditions through the existing expression grammar.', automated: true },
      { id: 'cs54-event-when', statement: 'Named EVENT emissions can feed central WHEN conditions without event-specific execution.', automated: true },
      { id: 'cs54-automation-order', statement: 'WHEN can trigger AUTOMATE and AUTOMATE can produce canonical ORDER intent without bypassing risk/policy/execution authority.', automated: true },
      { id: 'cs54-one-runtime', statement: 'Composition remains metadata over the same validated artifact, IR and VM rather than introducing feature-specific runtimes.', automated: true },
    ],
    nonGoals: ['a second reactive executor', 'implicit broker access', 'runtime execution from composition metadata'],
  },
  {
    id: 55, name: 'Progressive simplicity', kind: 'tooling',
    goal: 'Make the simplest CoreSpirit programs extremely small while allowing users to grow from one-line SHOW to indicators, WHEN, MODEL and AUTOMATE without changing languages or execution semantics.', dependencies: [44, 45, 46, 50, 54],
    gates: [
      { id: 'cs55-one-line', statement: '`show ema(close, 20)` compiles through the same core pipeline as advanced programs.', automated: true },
      { id: 'cs55-reactive', statement: '`when crossesAbove(fast, slow): emit "LONG"` lowers to the same crossover, conditional and EVENT contracts used by advanced source.', automated: true },
      { id: 'cs55-progression', statement: 'The editor examples progress from value -> show -> reactive event -> model -> automation -> deployment without introducing a beginner-only evaluator.', automated: true },
      { id: 'cs55-chart-deploy', statement: 'The chart-side editor remains a fast Create -> Compile -> Deploy workflow over the same executable artifact.', automated: false },
      { id: 'cs55-blue-ui', statement: 'CoreSpirit/chart product chrome uses the blue product accent while trading semantic colors remain independent.', automated: false },
    ],
    nonGoals: ['external-language compatibility as a design target', 'a wizard-only programming model', 'a second editor runtime'],
  },
  {
    id: 56, name: 'Standard library discoverability', kind: 'tooling',
    goal: 'Organize the existing standard library around human-facing discovery groups without changing executable builtin semantics or inflating the core registry.',
    dependencies: [34, 44, 45, 55],
    gates: [
      { id: 'cs56-catalog', statement: 'The standard library has a stable human-facing catalog with ordered groups for Price, Math, Trend, Momentum, Volatility, Structure, Market, Models, Visual, Events, Data and State.', automated: true },
      { id: 'cs56-core-count', statement: 'Discoverability metadata does not change the executable core primitive count or create duplicate runtime implementations.', automated: true },
      { id: 'cs56-editor', statement: 'Language-service completions present the discoverability groups in a predictable order and keep advanced compatibility visuals secondary to SHOW.', automated: true },
      { id: 'cs56-no-fake-builtins', statement: 'Functions without runtime contracts are not advertised as executable builtins merely because they are desirable catalog entries.', automated: true },
    ],
    nonGoals: ['inflating the core primitive registry', 'adding unimplemented indicators as fake builtins', 'a second completion registry'],
  },
  {
    id: 57, name: 'Readable surface syntax', kind: 'compiler',
    goal: 'Use readable source forms aggressively where they map cleanly to existing semantics: crossing operators use `a crossesAbove b` / `a crossesBelow b`, market references read as `market("NIFTY").close`, and the compiler remains the sole semantic lowering path.',
    dependencies: [44, 45, 54, 56],
    gates: [
      { id: 'cs57-crosses', statement: '`a crossesAbove b` and `a crossesBelow b` lower deterministically to crossover(a, b) and crossunder(a, b) through the existing surface normalization path.', automated: true },
      { id: 'cs57-data-members', statement: 'market/timeframe references expose standard OHLCV/time member completion and continue to execute through the existing __member_get ABI.', automated: true },
      { id: 'cs57-hover', statement: 'Editor hover and completion descriptions teach readable syntax while documenting its canonical lowering target.', automated: true },
      { id: 'cs57-one-language', statement: 'Readable syntax remains source sugar over the existing parser/IR/VM path; no operator runtime or data-reference runtime is introduced.', automated: true },
    ],
    nonGoals: ['custom infix operators beyond the approved readability aliases', 'replacing the canonical crossover functions internally', 'exposing request plumbing to beginners'],
  },
  {
    id: 58, name: 'Compiler complexity absorption', kind: 'compiler',
    goal: 'Make the compiler absorb architectural complexity on behalf of authors: one source artifact is normalized into one semantic dependency model, then projected into visual, event, model, automation and execution views before lowering to the stable IR consumed by the single VM.',
    dependencies: [39, 42, 43, 54, 55, 57],
    gates: [
      { id: 'cs58-one-semantic-model', statement: 'AST, semantic graph, dependency graph and feature-specific projections are compiler views of the same source program rather than independent runtimes.', automated: false },
      { id: 'cs58-deterministic-lowering', statement: 'Equivalent source forms lower to the same canonical semantic and IR representation regardless of whether the user writes beginner-friendly or explicit syntax.', automated: true },
      { id: 'cs58-source-maps', statement: 'Compiler outputs retain source locations so advanced IR/runtime inspection remains possible without exposing IR concepts in ordinary authoring.', automated: true },
      { id: 'cs58-reactive-plan', statement: 'Reactive dependency/invalidation planning remains deterministic and is consumed by the existing runtime rather than a feature-specific scheduler.', automated: true },
      { id: 'cs58-optimization-safe', statement: 'Compiler optimizations preserve observable CoreSpirit semantics, event identity, replay determinism and authority boundaries.', automated: false },
      { id: 'cs58-no-leak', statement: 'Execution targets, host capabilities, broker transports, renderers and risk-policy plumbing are not required source-language concepts.', automated: true },
    ],
    nonGoals: ['a public AST/IR language', 'per-feature compilers', 'parallel evaluators', 'automatic host capability escalation'],
  },
  {
    id: 59, name: 'Progressive authoring levels', kind: 'tooling',
    goal: 'Define three authoring levels—Simple, Advanced and Professional—as progressive presentation and capability profiles over the same CoreSpirit language, compiler, IR and VM rather than separate languages.',
    dependencies: [45, 49, 54, 55, 56, 57, 58],
    gates: [
      { id: 'cs59-simple', statement: 'Level 1 supports short SHOW and WHEN programs such as `show ema(close, 20)` and `when close crossesAbove ema(close, 20): emit "LONG"` through the canonical pipeline.', automated: true },
      { id: 'cs59-advanced', statement: 'Level 2 exposes MODEL facts and composable reactive conditions without requiring users to learn ABI, IR, transport or execution mechanics.', automated: false },
      { id: 'cs59-professional', statement: 'Level 3 can expose typed data, multi-symbol, multi-timeframe, reusable component contracts, custom visual geometry, external models, event handlers, execution targets and performance controls while preserving the same execution substrate.', automated: false },
      { id: 'cs59-same-language', statement: 'Authoring level is a discoverability/presentation classification, not a grammar fork or alternate runtime.', automated: true },
      { id: 'cs59-upgrade-path', statement: 'A program can grow from Level 1 to Level 3 by adding declarations and type detail rather than rewriting into another language.', automated: false },
      { id: 'cs59-capability-boundary', statement: 'Professional access increases expressiveness and inspection, not broker/network/filesystem authority; sandbox and host policy remain authoritative.', automated: true },
    ],
    nonGoals: ['a beginner-only interpreter', 'an advanced-only DSL', 'professional mode as a broker bypass', 'locking features to visual wizard states'],
  },
  {
    id: 60, name: 'Reusable semantic components and pipelines', kind: 'compiler',
    goal: 'Allow any validated composition graph to become a reusable typed component or pipeline with explicit execution/state metadata, without creating a second language, evaluator or runtime.',
    dependencies: [54, 58, 59],
    gates: [
      { id: 'cs60-component-contract', statement: 'Reusable components expose stable typed input/output ports, deterministic/stateful metadata and source identity.', automated: true },
      { id: 'cs60-execution-profile', statement: 'Reusable component contracts can declare execution class, latency/cost, cacheability, parallelism and backend eligibility without introducing source-language keywords.', automated: true },
      { id: 'cs60-state-profile', statement: 'Stateful reusable components can declare bar/window/session/external lifecycle plus snapshot and rollback requirements.', automated: true },
      { id: 'cs60-materialization', statement: 'Validated composition graphs can be materialized and registered as reusable typed components at the host/compiler boundary.', automated: true },
      { id: 'cs60-pipeline', statement: 'Pipelines validate stage-to-stage port compatibility and collapse to the same executable graph substrate.', automated: true },
      { id: 'cs60-no-runtime-fork', statement: 'Component and pipeline metadata does not execute independently of the canonical CoreSpirit artifact and VM.', automated: true },
    ],
    nonGoals: ['a second component interpreter', 'feature-specific graph evaluators', 'broker authority inside reusable components'],
  },
  {
    id: 61, name: 'Execution planning and hot/warm/cold lanes', kind: 'runtime',
    goal: 'Plan executable nodes by latency, effect, state and cost so realtime work stays isolated from warm reactive work and cold research workloads.',
    dependencies: [39, 40, 58, 60],
    gates: [
      { id: 'cs61-lanes', statement: 'Semantic/execution nodes carry deterministic hot/warm/cold lane metadata.', automated: true },
      { id: 'cs61-barriers', statement: 'Effect and authority nodes remain execution barriers and cannot be accelerated as pure compute.', automated: true },
      { id: 'cs61-planner', statement: 'Execution plans expose batches, accelerator assignments, lanes and cache identity without changing source semantics.', automated: true },
    ],
    nonGoals: ['automatic GPU execution without host capability', 'moving broker/risk authority into workers', 'a second runtime scheduler'],
  },
  {
    id: 62, name: 'Incremental compilation and artifact caching', kind: 'compiler',
    goal: 'Reuse unchanged syntax and cached executable artifacts so local source edits do not pay the full parse/compile cost when the program or artifact already exists.',
    dependencies: [9, 38, 58, 61],
    gates: [
      { id: 'cs62-ast-reuse', statement: 'Incremental AST parsing structurally reuses unchanged nodes and reports reuse counts.', automated: true },
      { id: 'cs62-compile-cache', statement: 'Identical normalized source for the same source id reuses a bounded LRU compile result.', automated: true },
      { id: 'cs62-artifact-identity', statement: 'Artifact cache keys include compiler version, IR version, source identity and semantic identity.', automated: true },
      { id: 'cs62-canonical-hash', statement: 'Equivalent object key order cannot produce different fast artifact checksums.', automated: true },
    ],
    nonGoals: ['a second compiler', 'silent semantic changes during cache reuse', 'unbounded browser memory growth'],
  },
  {
    id: 63, name: 'Realtime backpressure and render coalescing', kind: 'runtime',
    goal: 'Decouple market-data packet frequency from UI render frequency through external stores, frame coalescing and incremental developing-bar calculations.',
    dependencies: [24, 39, 61, 62],
    gates: [
      { id: 'cs63-react', statement: 'High-frequency market ticks do not require one React state update per packet in the terminal/workspace path.', automated: true },
      { id: 'cs63-chart', statement: 'Realtime chart renderer mutations are coalesced by key onto animation frames without changing candle reconciliation semantics.', automated: true },
      { id: 'cs63-calculation', statement: 'Realtime EMA/RSI/ATR developing-bar previews are incremental rather than repeated O(window) recalculations.', automated: true },
      { id: 'cs63-history', statement: 'Historical transport uses shared in-flight requests, stale-while-revalidate behavior and a bounded browser cache.', automated: true },
    ],
    nonGoals: ['dropping market data silently', 'reducing visible history merely to improve rendering', 'React as the market-data authority'],
  },
  {
    id: 64, name: 'Universal data lineage and package contracts', kind: 'platform',
    goal: 'Make complex composition inspectable and reusable by exposing generic value lineage plus validated package/component manifests over the same semantic graph.',
    dependencies: [54, 58, 60, 62],
    gates: [
      { id: 'cs64-lineage', statement: 'Semantic graph values can be projected to a renderer-neutral lineage graph and traced backwards by dependency edges.', automated: true },
      { id: 'cs64-package', statement: 'Package manifests declare components, versions, dependencies and capabilities and validate before registry admission.', automated: true },
      { id: 'cs64-authoring', statement: 'Simple/Advanced/Professional presentation profiles change discoverability and inspection, not semantic execution.', automated: true },
    ],
    nonGoals: ['remote package execution by default', 'untrusted package capability escalation', 'a separate plugin language'],
  },
  {
    id: 65, name: 'Measured performance budgets and reusable workers', kind: 'runtime',
    goal: 'Make latency budgets observable and reuse worker execution contexts so expensive CoreSpirit work moves off the main thread without creating a worker per request.',
    dependencies: [61, 63, 64],
    gates: [
      { id: 'cs65-budget', statement: 'Runtime records hot/bar, hot/tick and batch execution measurements against explicit budgets.', automated: true },
      { id: 'cs65-worker-pool', statement: 'Chart/background CoreSpirit worker execution reuses a bounded worker pool with validated result envelopes.', automated: true },
      { id: 'cs65-observability', statement: 'Reactive and performance metrics remain observational and cannot become hidden execution authority.', automated: true },
    ],
    nonGoals: ['unbounded worker creation', 'moving authority boundaries into workers', 'treating telemetry as trading logic'],
  },
  {
    id: 66, name: 'CoreSpirit complexity absorber', kind: 'compiler',
    goal: 'Keep the six-concept source surface stable while internal semantic, component, model-ABI, dependency, execution, reactive and backend layers absorb arbitrary system complexity.',
    dependencies: [54, 58, 60, 64, 65],
    gates: [
      { id: 'cs66-surface', statement: 'CoreSpirit source remains centered on DATA, LET, WHEN, SHOW, MODEL and AUTOMATE.', automated: true },
      { id: 'cs66-hidden-layers', statement: 'A compiled artifact can expose internal complexity-layer metadata without adding source keywords.', automated: true },
      { id: 'cs66-authority', statement: 'Complexity absorption never expands broker, filesystem, network or process authority.', automated: true },
    ],
    nonGoals: ['a second evaluator', 'source-level backend directives', 'authority escalation through components'],
  },
  {
    id: 67, name: 'Namespaced standard library architecture', kind: 'compiler',
    goal: 'Scale CoreSpirit discoverability through qualified namespaces that resolve into the existing builtin/component registries rather than multiplying syntax or runtime implementations.',
    dependencies: [56, 57, 58, 66],
    gates: [
      { id: 'cs67-aliasing', statement: 'Qualified library calls lower to canonical existing builtins or explicitly registered components.', automated: true },
      { id: 'cs67-catalog', statement: 'Catalog-only capabilities can be documented without being falsely executable.', automated: true },
      { id: 'cs67-no-duplication', statement: 'No namespace owns a duplicate mathematical/runtime implementation.', automated: true },
    ],
    nonGoals: ['duplicating the 30-primitive core', 'namespace-specific runtimes', 'mandatory namespace qualification'],
  },
  {
    id: 68, name: 'Model ABI to semantic component convergence', kind: 'platform',
    goal: 'Project strict MODEL ABI manifests into the same typed semantic component vocabulary so models compose with indicators and reusable graphs without a second programming model.',
    dependencies: [32, 34, 49, 60, 66],
    gates: [
      { id: 'cs68-model-contract', statement: 'Validated model manifests can produce typed semantic component contracts with backend, state and capability metadata.', automated: true },
      { id: 'cs68-rollback', statement: 'Stateful model components carry explicit snapshot/rollback requirements.', automated: true },
      { id: 'cs68-authority', statement: 'Model component projection does not grant broker or arbitrary host authority.', automated: true },
    ],
    nonGoals: ['embedding Python in the VM', 'making model transport syntax part of CoreSpirit', 'automatic trust of external model packages'],
  },
  {
    id: 69, name: 'Deep composable graph closure', kind: 'compiler',
    goal: 'Make nested components, multi-output values, pipelines and reusable graph boundaries retain types, lineage and execution metadata from source through IR and runtime.',
    dependencies: [54, 60, 62, 66, 68],
    gates: [
      { id: 'cs69-nested', statement: 'Component outputs can feed other components without requiring source-level pipeline syntax.', automated: true },
      { id: 'cs69-lineage', statement: 'Nested component composition preserves dependency lineage and reusable boundary ports.', automated: true },
      { id: 'cs69-incremental', statement: 'Component identity participates in compilation/cache invalidation boundaries.', automated: true },
    ],
    nonGoals: ['unbounded higher-order functions', 'hidden dynamic code generation', 'a second graph evaluator'],
  },
  {
    id: 70, name: 'Progressive authoring depth without language forks', kind: 'compiler',
    goal: 'Make Simple, Advanced and Professional authoring levels expose progressively deeper inspection and composition surfaces while converging on one language, compiler, IR and runtime.',
    dependencies: [55, 59, 64, 66, 67, 69],
    gates: [
      { id: 'cs70-one-language', statement: 'All authoring levels compile through the same CoreSpirit frontend/IR/runtime path.', automated: true },
      { id: 'cs70-discovery', statement: 'Advanced exposes namespace/component composition while Professional exposes contracts, IR, runtime and backend inspection.', automated: true },
      { id: 'cs70-authority', statement: 'Authoring-level visibility changes do not change execution authority.', automated: true },
    ],
    nonGoals: ['separate syntaxes per level', 'professional-only semantics', 'UI toggles that silently change broker authority'],
  },

  {
    id: 71, name: 'First-class dense series representation', kind: 'runtime',
    goal: 'Make numeric series a first-class execution object with dense typed storage, explicit missing-value semantics and zero-copy typed-array reuse where the host already owns compatible buffers.', dependencies: [31, 32, 63, 70],
    gates: [
      { id: 'cs71-series-buffer', statement: 'Numeric series execution can consume Float64Array without copying when the input is already a compatible typed buffer.', automated: true },
      { id: 'cs71-missing', statement: 'Vector kernels use a deterministic missing-value sentinel and preserve warm-up semantics at the series boundary.', automated: true },
      { id: 'cs71-language', statement: 'The source language remains the same; dense representation is a runtime/compiler concern.', automated: true },
    ],
    nonGoals: ['forcing every series into a dense buffer', 'renderer-owned series memory', 'changing historical indexing semantics'],
  },
  {
    id: 72, name: 'Vector operator execution contracts', kind: 'compiler',
    goal: 'Describe vectorizability, fusion eligibility and execution strategy in builtin contracts so the planner can optimize from semantics instead of maintaining a second hard-coded operator list.', dependencies: [7, 67, 71],
    gates: [
      { id: 'cs72-contract', statement: 'Series-capable builtins declare vectorizable, fusible and execution-strategy metadata.', automated: true },
      { id: 'cs72-stateful', statement: 'Stateful series operators such as EMA/RMA can be vectorizable without being incorrectly marked fusible.', automated: true },
      { id: 'cs72-single-runtime', statement: 'Vector metadata selects execution paths over the same canonical builtin semantics; it does not create a second indicator implementation.', automated: true },
    ],
    nonGoals: ['duplicating indicator math in the planner', 'GPU-only semantics', 'requiring vector syntax in CoreSpirit'],
  },
  {
    id: 73, name: 'Pure series operation fusion planner', kind: 'compiler',
    goal: 'Discover maximal safe chains of pure series operations across transparent LET/local aliases and expose them as single-pass execution groups.', dependencies: [69, 71, 72],
    gates: [
      { id: 'cs73-aliases', statement: 'Fusion follows transparent move/setLocal aliases without requiring source-level pipeline syntax.', automated: true },
      { id: 'cs73-fanout', statement: 'A series node with multiple semantic consumers is not illegally fused when doing so would remove a required intermediate value.', automated: true },
      { id: 'cs73-maximal', statement: 'A safe chain such as SMA → STDEV → ZSCORE is represented as one maximal fusion group.', automated: true },
    ],
    nonGoals: ['fusing effectful nodes', 'fusing stateful EMA/RMA semantics', 'dynamic code generation'],
  },
  {
    id: 74, name: 'Single-pass fused series kernels', kind: 'runtime',
    goal: 'Execute fused pure-series groups chronologically with bounded rolling workspace and only the final dense output allocation, avoiding full-length intermediate arrays.', dependencies: [71, 72, 73],
    gates: [
      { id: 'cs74-one-pass', statement: 'A multi-operation series group executes in one chronological pass over the source buffer.', automated: true },
      { id: 'cs74-intermediate', statement: 'Fused groups allocate no full intermediate series buffers; stage state stays bounded by operation lookback.', automated: true },
      { id: 'cs74-shape', statement: 'Fused execution preserves source length and warm-up/missing-value shape.', automated: true },
    ],
    nonGoals: ['guaranteeing O(1) memory for every mathematical operator', 'replacing the scalar fallback', 'renderer-specific kernels'],
  },
  {
    id: 75, name: 'Fusion-aware backend planning', kind: 'runtime',
    goal: 'Make series fusion visible to the execution planner so CPU/WASM/GPU backends receive an optimization-ready workload description while the CPU semantic path remains the fallback.', dependencies: [24, 65, 73, 74],
    gates: [
      { id: 'cs75-plan', statement: 'Execution plans include validated series-fusion groups and explain when single-pass kernels are eligible.', automated: true },
      { id: 'cs75-backends', statement: 'Fusion groups declare backend eligibility independently from host availability.', automated: true },
      { id: 'cs75-fallback', statement: 'Unavailable WASM/GPU backends fall back to canonical CPU semantics without changing results.', automated: true },
    ],
    nonGoals: ['automatic browser GPU use before capability validation', 'moving broker/authority work to compute backends', 'silent backend-dependent semantics'],
  },
  {
    id: 76, name: 'Series fusion conformance and performance contract', kind: 'governance',
    goal: 'Lock vector/fusion semantics with executable regression tests before broader adoption in the runtime batch path.', dependencies: [71, 72, 73, 74, 75],
    gates: [
      { id: 'cs76-contract', statement: 'First-class series, operation fusion and backend metadata contracts pass deterministic focused tests.', automated: true },
      { id: 'cs76-safety', statement: 'Stateful or effectful chains remain unfused under the conformance suite.', automated: true },
      { id: 'cs76-observable', statement: 'Fusion remains an execution optimization; source semantics, IR shape and output contracts remain stable.', automated: true },
    ],
    nonGoals: ['claiming full production benchmark parity before representative workloads are measured', 'removing the canonical scalar executor'],
  },

  {
    id: 77, name: 'Canonical shared consumer plane', kind: 'platform',
    goal: 'Make one symbol/timeframe market timeline the ownership authority for chart, indicator, model and derived consumers.', dependencies: [71, 76],
    gates: [
      { id: 'cs77-one-plane', statement: 'A timeline key resolves to one canonical MarketDataStore within the host registry.', automated: true },
      { id: 'cs77-borrow', statement: 'Consumer bindings borrow typed market views rather than owning copied market history.', automated: true },
      { id: 'cs77-revision', statement: 'Consumers observe canonical revision and dirty-range metadata as the invalidation authority.', automated: true },
    ],
    nonGoals: ['worker shared memory as a prerequisite', 'removing legacy compatibility adapters', 'duplicating data stores per feature'],
  },
  {
    id: 78, name: 'Indicator history ownership contract', kind: 'runtime',
    goal: 'Move indicator execution toward read-only canonical inputs with derived outputs and state owned by the indicator domain.', dependencies: [72, 77],
    gates: [
      { id: 'cs78-input', statement: 'Canonical indicator bindings expose timeline-aligned typed series views.', automated: true },
      { id: 'cs78-output', statement: 'IndicatorStore owns derived output columns while market history remains canonical.', automated: true },
      { id: 'cs78-compat', statement: 'Legacy candle-array adapters remain explicit compatibility boundaries.', automated: true },
    ],
    nonGoals: ['rewriting every legacy indicator implementation at once', 'indicator-specific history stores'],
  },
  {
    id: 79, name: 'Model feature view convergence', kind: 'platform',
    goal: 'Bind model features directly to canonical numeric columns and a canonical timeline before tensor materialization.', dependencies: [68, 77],
    gates: [
      { id: 'cs79-view', statement: 'Model feature bindings can borrow canonical typed series columns without duplicating timeline storage.', automated: true },
      { id: 'cs79-timeline', statement: 'Model feature metadata retains the canonical timeline key and revision.', automated: true },
      { id: 'cs79-authority', statement: 'Feature binding does not add model execution authority.', automated: true },
    ],
    nonGoals: ['forcing every external model transport to zero-copy immediately', 'embedding external runtimes in CoreSpirit'],
  },
  {
    id: 80, name: 'Multi-consumer data-plane convergence', kind: 'runtime',
    goal: 'Extend canonical data ownership semantics to structure, liquidity, order flow, replay and scanner consumers.', dependencies: [77, 78, 79],
    gates: [
      { id: 'cs80-registry', statement: 'Canonical consumer identity is inspectable by kind and stable id.', automated: true },
      { id: 'cs80-derived', statement: 'Derived domains do not own duplicate timestamp columns.', automated: true },
      { id: 'cs80-replay', statement: 'Future replay/scanner consumers have the same canonical binding seam as chart/indicator/model consumers.', automated: true },
    ],
    nonGoals: ['one global dataset across unrelated symbols', 'cross-symbol timeline conflation'],
  },
  {
    id: 81, name: 'Renderer-neutral chart data engine', kind: 'platform',
    goal: 'Separate canonical market access, chart-specific data orchestration and rendering so chart consumers do not depend on renderer APIs.', dependencies: [77, 80],
    gates: [
      { id: 'cs81-data', statement: 'ChartDataEngine resolves canonical data and exposes typed views without owning duplicate market history.', automated: true },
      { id: 'cs81-renderer', statement: 'Chart data contracts contain no Vela NativeRenderer objects.', automated: true },
      { id: 'cs81-bindings', statement: 'Chart data can bind indicator/model feature views from the same plane.', automated: true },
    ],
    nonGoals: ['replacing Vela NativeRenderer in this stage', 'chart UI inside the data engine'],
  },
  {
    id: 82, name: 'Renderer-neutral chart interaction engine', kind: 'platform',
    goal: 'Own pointer, gesture, pan/zoom and semantic hit testing outside React and concrete renderer APIs.', dependencies: [81],
    gates: [
      { id: 'cs82-pointer', statement: 'Pointer and wheel/pinch interactions are represented by renderer-neutral events.', automated: true },
      { id: 'cs82-hit', statement: 'Scene bounds can be hit-tested without renderer object references.', automated: true },
      { id: 'cs82-ui-separation', statement: 'Interaction state is independent from React component state.', automated: true },
    ],
    nonGoals: ['DOM event ownership inside CoreSpirit', 'renderer-specific gesture semantics'],
  },
  {
    id: 83, name: 'Chart viewport and scale system', kind: 'platform',
    goal: 'Create renderer-neutral viewport and coordinate transforms for time, price, volume, percent and logarithmic chart modes.', dependencies: [81, 82],
    gates: [
      { id: 'cs83-viewport', statement: 'Pan, zoom and pixel-width state are represented without Vela NativeRenderer APIs.', automated: true },
      { id: 'cs83-scales', statement: 'Time/price transforms are reversible within numeric precision for supported modes.', automated: true },
      { id: 'cs83-shared-axis', statement: 'Chart panes can share a common time coordinate contract.', automated: true },
    ],
    nonGoals: ['renderer-specific autoscaling heuristics', 'claiming production parity yet'],
  },
  {
    id: 84, name: 'Retained semantic chart scene and layers', kind: 'platform',
    goal: 'Represent chart primitives as stable retained semantic nodes organized into deterministic data/indicator/structure/drawing/interaction layers.', dependencies: [18, 23, 81, 83],
    gates: [
      { id: 'cs84-stable', statement: 'Scene nodes retain stable identities across revisions.', automated: true },
      { id: 'cs84-layers', statement: 'Layer ordering is explicit and renderer-neutral.', automated: true },
      { id: 'cs84-hit-metadata', statement: 'Interactive nodes can expose serializable bounds for semantic hit testing.', automated: true },
    ],
    nonGoals: ['imperative WebGL drawing commands in CoreSpirit', 'DOM-owned chart primitives'],
  },
  {
    id: 85, name: 'Chart rendering coordinator', kind: 'runtime',
    goal: 'Coordinate retained scenes, panes and scales with concrete rendering backends without moving chart semantics into the renderer.', dependencies: [83, 84],
    gates: [
      { id: 'cs85-coordinator', statement: 'ChartRenderingEngine owns the renderer-neutral rendering boundary.', automated: true },
      { id: 'cs85-panes', statement: 'Price and volume panes share the engine model and can be extended with custom panes.', automated: true },
      { id: 'cs85-backends', statement: 'Vela NativeRenderer and native renderers remain replaceable host backends.', automated: true },
    ],
    nonGoals: ['activating native renderer in production'],
  },
  {
    id: 86, name: 'Multi-pane chart model', kind: 'platform',
    goal: 'Make price, volume, oscillator, order-flow and custom visual panes explicit engine entities with independent scales and scenes.', dependencies: [83, 84, 85],
    gates: [
      { id: 'cs86-registry', statement: 'Panes have stable ids, kinds, height ratios, scenes and scale models.', automated: true },
      { id: 'cs86-time', statement: 'Pane time coordinates derive from one chart timeline contract.', automated: true },
      { id: 'cs86-extensible', statement: 'New pane kinds can be added without changing the CoreSpirit language surface.', automated: true },
    ],
    nonGoals: ['pane-specific duplicate market stores'],
  },
  {
    id: 87, name: 'ChartCore platform facade', kind: 'runtime',
    goal: 'Make existing ChartCore a compatibility facade over the deeper data, viewport, scene and rendering architecture.', dependencies: [81, 83, 85, 86],
    gates: [
      { id: 'cs87-facade', statement: 'ChartCore delegates storage and rendering to the deeper chart-engine contracts.', automated: true },
      { id: 'cs87-compat', statement: 'Existing ChartCore callers continue to work during the migration.', automated: true },
      { id: 'cs87-react-free', statement: 'ChartCore remains independent from React/workspace component state.', automated: true },
    ],
    nonGoals: ['removing compatibility APIs immediately'],
  },
  {
    id: 88, name: 'Native chart parity migration gate', kind: 'governance',
    goal: 'Define the production gate that native rendering must satisfy before it can replace Vela NativeRenderer.', dependencies: [82, 83, 84, 85, 86, 87],
    gates: [
      { id: 'cs88-visual', statement: 'Native renderer passes candle, indicator, drawing, marker and multi-pane visual parity tests.', automated: true },
      { id: 'cs88-interaction', statement: 'Native renderer passes viewport, crosshair, pan/zoom and hit-testing parity tests.', automated: true },
      { id: 'cs88-history', statement: 'Native renderer sustains required high-history workloads without regressions.', automated: true },
      { id: 'cs88-production', statement: 'Full typecheck, build, deployment and realtime validation pass before production activation.', automated: true },
    ],
    nonGoals: ['premature production migration', 'calling the current WebGL2 foundation TradingView-class'],
  },


  {
    id: 89, name: 'Canonical chart viewport state', kind: 'platform',
    goal: 'Make visible bars, pixels-per-bar, price domain, zoom, scroll and device-pixel ratio the single renderer-neutral viewport state.', dependencies: [83, 87],
    gates: [
      { id: 'cs89-state', statement: 'Viewport state exposes firstVisibleBar, lastVisibleBar, pixelsPerBar, priceMin, priceMax, zoom, scroll, pixelWidth and devicePixelRatio.', automated: true },
      { id: 'cs89-clamp', statement: 'Viewport updates clamp safely to the canonical market length without renderer APIs.', automated: true },
    ],
    nonGoals: ['renderer-specific viewport state'],
  },
  {
    id: 90, name: 'Fast bar/pixel transform kernel', kind: 'runtime',
    goal: 'Cache the affine bar-index/pixel transform so hot-path coordinate conversion avoids allocations and repeated division setup.', dependencies: [89],
    gates: [
      { id: 'cs90-forward', statement: 'barIndex to x uses cached first-bar, scroll and pixels-per-bar state.', automated: true },
      { id: 'cs90-inverse', statement: 'x to fractional barIndex is reversible within numeric precision.', automated: true },
    ],
    nonGoals: ['price transform ownership in the viewport module'],
  },
  {
    id: 91, name: 'Viewport interaction mathematics', kind: 'platform',
    goal: 'Make pan, zoom, resize and anchor-preserving navigation deterministic and independent from React or renderer APIs.', dependencies: [82, 89, 90],
    gates: [
      { id: 'cs91-pan', statement: 'Pixel and bar panning preserve fractional scroll state and clamp at data edges.', automated: true },
      { id: 'cs91-zoom', statement: 'Zoom preserves the chosen anchor location within numeric precision.', automated: true },
      { id: 'cs91-resize', statement: 'Resize recomputes pixels-per-bar without changing the logical visible range unexpectedly.', automated: true },
    ],
    nonGoals: ['gesture recognizer UI implementation'],
  },
  {
    id: 92, name: 'Dedicated time scale engine', kind: 'platform',
    goal: 'Own timestamp-to-display-coordinate and inverse time mapping outside the renderer.', dependencies: [81, 89, 90],
    gates: [
      { id: 'cs92-time', statement: 'Time scale binds the canonical Float64Array timeline without candle-object materialization.', automated: true },
      { id: 'cs92-search', statement: 'Timestamp lookup uses ordered timeline search and supports fractional interpolation when safe.', automated: true },
    ],
    nonGoals: ['renderer-specific date labels'],
  },
  {
    id: 93, name: 'Session calendar and timezone contract', kind: 'platform',
    goal: 'Make timezone, trading-day, holiday and session-window semantics injectable into the time scale.', dependencies: [92],
    gates: [
      { id: 'cs93-timezone', statement: 'Time scale accepts an explicit IANA timezone rather than assuming browser local time.', automated: true },
      { id: 'cs93-calendar', statement: 'Trading-day and session-window callbacks can identify closed dates and special sessions.', automated: true },
    ],
    nonGoals: ['embedding a global exchange holiday database in the chart engine'],
  },
  {
    id: 94, name: 'Compressed non-trading time mapping', kind: 'platform',
    goal: 'Support continuous, compressed and session-compressed time coordinates so weekends, holidays and session gaps need not consume chart width.', dependencies: [92, 93],
    gates: [
      { id: 'cs94-compressed', statement: 'Compressed mode maps bar sequences without wall-clock gap allocation.', automated: true },
      { id: 'cs94-session', statement: 'Session-compressed mode can retain a deterministic configured inter-session gap.', automated: true },
      { id: 'cs94-reverse', statement: 'Compressed coordinate-to-time mapping is reversible for supported timeline positions.', automated: true },
    ],
    nonGoals: ['inventing bars for missing market data'],
  },
  {
    id: 95, name: 'Multi-timeframe timeline mapping', kind: 'platform',
    goal: 'Make timeframe duration explicit to the time scale so multiple intraday and higher timeframe timelines can share coordinate semantics.', dependencies: [92, 94],
    gates: [
      { id: 'cs95-timeframe', statement: 'Timeframe strings resolve to deterministic durations for interpolation safety.', automated: true },
      { id: 'cs95-mtf', statement: 'Time scale contracts do not require one fixed timeframe to perform timestamp mapping.', automated: true },
    ],
    nonGoals: ['aggregating raw bars into higher timeframes inside the scale engine'],
  },
  {
    id: 96, name: 'Dedicated price scale engine', kind: 'platform',
    goal: 'Own linear, logarithmic, percent and indexed price transforms with cached coefficients.', dependencies: [83, 89],
    gates: [
      { id: 'cs96-modes', statement: 'Linear, log, percent and indexed price transforms are reversible within numeric precision.', automated: true },
      { id: 'cs96-cache', statement: 'Hot-path price transforms use cached forward and inverse coefficients.', automated: true },
    ],
    nonGoals: ['tick label formatting in the renderer'],
  },
  {
    id: 97, name: 'Price autoscale and lock policy', kind: 'platform',
    goal: 'Separate automatic visible-domain calculation from manual domains and locked user scales.', dependencies: [96],
    gates: [
      { id: 'cs97-auto', statement: 'Auto scale computes a visible high/low domain with deterministic padding.', automated: true },
      { id: 'cs97-manual', statement: 'Manual domains remain stable until explicitly changed.', automated: true },
      { id: 'cs97-lock', statement: 'Locked domains ignore non-forced auto/domain updates.', automated: true },
    ],
    nonGoals: ['renderer-specific scale animation'],
  },
  {
    id: 98, name: 'Shared pane time-scale coordination', kind: 'platform',
    goal: 'Make all chart panes consume one viewport/time coordinate authority while allowing independent vertical scales.', dependencies: [86, 92, 96],
    gates: [
      { id: 'cs98-time', statement: 'Price, volume and oscillator panes derive horizontal coordinates from one chart timeline/viewport contract.', automated: true },
      { id: 'cs98-y', statement: 'Pane-specific vertical domains remain independent from the shared time axis.', automated: true },
    ],
    nonGoals: ['duplicating market timelines per pane'],
  },
  {
    id: 99, name: 'Viewport and scale transform conformance gate', kind: 'governance',
    goal: 'Prove forward/inverse transforms, session compression and interaction anchoring before the native renderer consumes them as production primitives.', dependencies: [90, 91, 94, 97, 98],
    gates: [
      { id: 'cs99-roundtrip', statement: 'Representative bar, time and price transforms round-trip within defined numeric tolerances.', automated: true },
      { id: 'cs99-regression', statement: 'Legacy chart scale/viewport contracts remain compatible through the facade.', automated: true },
    ],
    nonGoals: ['claiming native renderer parity'],
  },
  {
    id: 100, name: 'Chart viewport and scale migration gate', kind: 'governance',
    goal: 'Freeze the viewport and scale contracts as the renderer-independent coordinate foundation for native chart migration.', dependencies: [99],
    gates: [
      { id: 'cs100-api', statement: 'Chart consumers can access viewport/time/price transforms without importing Vela NativeRenderer.', automated: true },
      { id: 'cs100-production', statement: 'Full typecheck, build, realtime and interaction validation remain prerequisites for native production activation.', automated: true },
    ],
    nonGoals: ['removing Vela NativeRenderer from production at this stage'],
  },

  {
    id: 101, name: 'Renderer-neutral drawing API', kind: 'platform',
    goal: 'Provide first-class point, path and anchored drawing creation/control methods without exposing Vela NativeRenderer APIs.', dependencies: [88, 100],
    gates: [
      { id: 'cs101-create', statement: 'Single-point, multipoint and anchored creation resolve to the canonical CoreDrawing model.', automated: true },
      { id: 'cs101-control', statement: 'Drawing lookup, update, visibility, selection, locking, z-order and removal use the same API.', automated: true },
    ],
    nonGoals: ['copying TradingView source or API implementations'],
  },
  {
    id: 102, name: 'Semantic drawing tool catalog', kind: 'platform',
    goal: 'Represent drawing tools as declarative interaction/geometry contracts with point counts, coordinate spaces and categories.', dependencies: [101],
    gates: [
      { id: 'cs102-catalog', statement: 'Tool definitions specify interaction type, coordinate space, point cardinality and semantic category.', automated: true },
      { id: 'cs102-validation', statement: 'Creation validates tool point requirements before a drawing enters the store.', automated: true },
    ],
    nonGoals: ['implementing every advanced geometry renderer in one stage'],
  },
  {
    id: 103, name: 'Drawing lifecycle and control state', kind: 'runtime',
    goal: 'Make drawing visibility, selection, lock state, z-order, groups and undo/redo explicit state rather than UI conventions.', dependencies: [101, 102],
    gates: [
      { id: 'cs103-state', statement: 'Visible, selectionEnabled, locked, zIndex and groupId survive normalization and persistence.', automated: true },
      { id: 'cs103-history', statement: 'Mutations remain undo/redo compatible through the canonical drawing store.', automated: true },
    ],
    nonGoals: ['renderer-owned drawing state'],
  },
  {
    id: 104, name: 'Data and viewport anchored drawings', kind: 'platform',
    goal: 'Support drawings tied to market time/price coordinates and drawings fixed to normalized pane coordinates.', dependencies: [101, 103],
    gates: [
      { id: 'cs104-data', statement: 'Data drawings store only canonical time/price anchors.', automated: true },
      { id: 'cs104-viewport', statement: 'Viewport-anchored drawings use normalized 0..1 positions without inventing market timestamps.', automated: true },
    ],
    nonGoals: ['mixing coordinate spaces inside one anchor'],
  },
  {
    id: 105, name: 'Drawing interaction state machine', kind: 'runtime',
    goal: 'Translate pointer/click sequences into validated drawing drafts and committed point sets independently from React or renderers.', dependencies: [102, 103, 104],
    gates: [
      { id: 'cs105-draft', statement: 'Tool activation and point accumulation are deterministic and renderer-independent.', automated: true },
      { id: 'cs105-finish', statement: 'A draft commits only when its declared point contract is satisfied.', automated: true },
    ],
    nonGoals: ['tool-specific UI dialogs'],
  },
  {
    id: 106, name: 'Drawing hit testing and snapping boundary', kind: 'runtime',
    goal: 'Keep semantic hit testing, handle selection and data-coordinate snapping above the rendering backend.', dependencies: [100, 105],
    gates: [
      { id: 'cs106-hit', statement: 'Selection uses semantic screen-space tolerance and respects visibility/selection/lock state.', automated: true },
      { id: 'cs106-snap', statement: 'Data-point snapping uses renderer-neutral coordinate conversion.', automated: true },
    ],
    nonGoals: ['GPU-specific hit buffers'],
  },
  {
    id: 107, name: 'Renderer-neutral chart navigation API', kind: 'platform',
    goal: 'Expose spacing, horizontal offset, visible range, coordinate conversion and navigation gating without leaking renderer APIs.', dependencies: [100],
    gates: [
      { id: 'cs107-navigation', statement: 'Consumers can control time spacing and visible range through TradingCore chart contracts.', automated: true },
      { id: 'cs107-conversion', statement: 'Time/X and price/Y conversions are available through the same renderer-neutral API.', automated: true },
      { id: 'cs107-gating', statement: 'Pan/zoom enablement is enforced before navigation mutations are applied.', automated: true },
    ],
    nonGoals: ['removing Vela NativeRenderer as the current production backend'],
  },
  {
    id: 108, name: 'Gesture-to-navigation controller', kind: 'platform',
    goal: 'Translate pointer drag, wheel and pinch gestures into the navigation API without React state churn.', dependencies: [91, 107],
    gates: [
      { id: 'cs108-pan', statement: 'Pointer movement produces viewport pan deltas through the canonical navigation contract.', automated: true },
      { id: 'cs108-zoom', statement: 'Wheel/pinch operations preserve an explicit zoom anchor and respect zoom gating.', automated: true },
    ],
    nonGoals: ['renderer-specific event listeners in the core layer'],
  },
  {
    id: 109, name: 'Production navigation adapter', kind: 'platform',
    goal: 'Map the renderer-neutral navigation contract to Vela NativeRenderer while keeping its API private to the production adapter.', dependencies: [107, 108],
    gates: [
      { id: 'cs109-bridge', statement: 'Production chart consumers use ChartController methods rather than importing Vela NativeRenderer for navigation.', automated: true },
      { id: 'cs109-fallback', statement: 'Native chart navigation can consume the same contract without the production adapter.', automated: true },
    ],
    nonGoals: ['copying vendor drawing internals'],
  },
  {
    id: 110, name: 'Drawing scene adapter boundary', kind: 'platform',
    goal: 'Map canonical drawings into retained scene nodes so rendering can switch backends without changing drawing semantics.', dependencies: [106, 109],
    gates: [
      { id: 'cs110-scene', statement: 'Drawing identity, z-order and visibility survive data-to-scene projection.', automated: true },
      { id: 'cs110-backend', statement: 'Scene projection does not import Vela NativeRenderer types.', automated: true },
    ],
    nonGoals: ['full parity rendering for every advanced tool'],
  },
  {
    id: 111, name: 'Drawing and navigation persistence/events', kind: 'platform',
    goal: 'Provide stable save/load and event semantics for drawing and navigation state across sessions and replay.', dependencies: [103, 107, 110],
    gates: [
      { id: 'cs111-events', statement: 'Create, update, move, visibility, selection and removal changes have deterministic event types.', automated: true },
      { id: 'cs111-persistence', statement: 'Persisted drawings remain compatible across v1/v2 stored collections.', automated: true },
    ],
    nonGoals: ['server-side collaborative editing'],
  },
  {
    id: 112, name: 'Drawing and interaction parity gate', kind: 'governance',
    goal: 'Freeze the renderer-neutral interaction/drawing contracts only after production and native paths demonstrate equivalent semantics.', dependencies: [101, 106, 109, 110, 111],
    gates: [
      { id: 'cs112-drawing', statement: 'Creation, editing, selection, lock, z-order, delete and persistence semantics match across supported renderers.', automated: false },
      { id: 'cs112-navigation', statement: 'Pan, zoom, visible-range and coordinate conversion semantics match across supported renderers.', automated: false },
      { id: 'cs112-production', statement: 'Vela NativeRenderer remains the production backend until full interaction parity and production build validation are proven.', automated: true },
    ],
    nonGoals: ['forcing native renderer activation at v97'],
  },


  {
    id: 113, name: 'Indicator configuration contract', kind: 'platform',
    goal: 'Give every chart indicator a persistent, renderer-neutral settings contract covering inputs, styling, display and visibility.', dependencies: [7, 97, 100],
    gates: [
      { id: 'cs113-settings', statement: 'Indicator configuration contains explicit display settings without changing primitive calculation semantics.', automated: true },
      { id: 'cs113-persist', statement: 'Indicator settings survive workspace save/load with stable defaults.', automated: true },
    ],
  },
  {
    id: 114, name: 'Shared indicator settings surface', kind: 'tooling',
    goal: 'Use one settings model for indicator configuration surfaces rather than duplicating per-page controls.', dependencies: [113],
    gates: [
      { id: 'cs114-shared', statement: 'Indicator page and live indicator dock consume the same configuration model.', automated: true },
      { id: 'cs114-sections', statement: 'Inputs, Style and Display are distinct settings groups.', automated: true },
    ],
  },
  {
    id: 115, name: 'Editable indicator source templates', kind: 'platform',
    goal: 'Expose starter CoreSpirit source for native indicators without making source editing mandatory.', dependencies: [7, 113],
    gates: [
      { id: 'cs115-template', statement: 'Supported indicators expose deterministic starter CoreSpirit source.', automated: true },
      { id: 'cs115-native-boundary', statement: 'Unsupported/native-only indicators remain explicitly identified instead of receiving fabricated implementations.', automated: true },
    ],
  },
  {
    id: 116, name: 'Indicator source studio', kind: 'tooling',
    goal: 'Provide an in-product source editor for indicator code with compile, reset, copy and save actions.', dependencies: [115, 114],
    gates: [
      { id: 'cs116-editor', statement: 'Users can edit and inspect the complete indicator source snapshot.', automated: true },
      { id: 'cs116-compile', statement: 'Save/publish paths compile source through the canonical CoreSpirit compiler.', automated: true },
    ],
  },
  {
    id: 117, name: 'User indicator draft persistence', kind: 'platform',
    goal: 'Persist user-authored indicator drafts and immutable source versions through the existing CoreSpirit persistence layer.', dependencies: [116, 9],
    gates: [
      { id: 'cs117-version', statement: 'Every saved edit creates an immutable script version with source hash and compile status.', automated: true },
      { id: 'cs117-owner', statement: 'Draft persistence is owner-scoped by authenticated user identity.', automated: true },
    ],
  },
  {
    id: 118, name: 'Public indicator publication contract', kind: 'platform',
    goal: 'Define metadata, source snapshot and visibility needed to publish an indicator safely.', dependencies: [117],
    gates: [
      { id: 'cs118-metadata', statement: 'Publication stores title, description, tags, category, license, author and source snapshot.', automated: true },
      { id: 'cs118-version-lock', statement: 'A publication points to a concrete immutable CoreSpirit script version.', automated: true },
    ],
  },
  {
    id: 119, name: 'Public indicator RLS boundary', kind: 'security',
    goal: 'Allow anonymous discovery only for explicitly published public indicators while keeping draft ownership private.', dependencies: [118, 15],
    gates: [
      { id: 'cs119-public-read', statement: 'Anonymous reads can only see published public indicator rows.', automated: true },
      { id: 'cs119-owner-write', statement: 'Only the owning authenticated user can create/update/archive their publication rows.', automated: true },
    ],
  },
  {
    id: 120, name: 'Indicator preview asset storage', kind: 'platform',
    goal: 'Store optional user-provided indicator cover images in a dedicated public asset bucket with owner-scoped writes.', dependencies: [119],
    gates: [
      { id: 'cs120-storage', statement: 'Indicator covers use a dedicated bucket and owner-scoped upload/update/delete policy.', automated: true },
      { id: 'cs120-types', statement: 'Unsupported file types and excessive file sizes are rejected client-side before upload.', automated: true },
    ],
  },
  {
    id: 121, name: 'Public indicator explore catalog', kind: 'platform',
    goal: 'Provide a public browse surface for user-authored indicators with cards, previews and metadata.', dependencies: [118, 119, 120],
    gates: [
      { id: 'cs121-grid', statement: 'Public explore renders image/preview, title, description, author and metadata from the publication contract.', automated: true },
      { id: 'cs121-anonymous', statement: 'The catalog remains available without authentication.', automated: true },
    ],
  },
  {
    id: 122, name: 'Public indicator source inspection', kind: 'tooling',
    goal: 'Make the published CoreSpirit source inspectable and copyable from the public indicator detail surface.', dependencies: [121],
    gates: [
      { id: 'cs122-source', statement: 'Published source snapshots are displayed without requiring workspace access.', automated: true },
      { id: 'cs122-copy', statement: 'Users can copy published CoreSpirit source without changing the stored publication.', automated: true },
    ],
  },
  {
    id: 123, name: 'Indicator catalog discovery controls', kind: 'tooling',
    goal: 'Add search, category, open-source and sort controls without changing publication semantics.', dependencies: [121],
    gates: [
      { id: 'cs123-search', statement: 'Catalog search covers title, author, description, category and tags.', automated: true },
      { id: 'cs123-filter', statement: 'Category and open-source filters map directly to publication fields.', automated: true },
    ],
  },
  {
    id: 124, name: 'User publication workflow', kind: 'platform',
    goal: 'Connect indicator settings, source studio and publication metadata into one authenticated authoring flow.', dependencies: [114, 116, 117, 118, 121],
    gates: [
      { id: 'cs124-flow', statement: 'A user can add/edit an indicator, save source, add metadata and publish without a separate scripting system.', automated: true },
      { id: 'cs124-auth', statement: 'Publishing requires an authenticated owner context.', automated: true },
    ],
  },
  {
    id: 125, name: 'Community usage telemetry', kind: 'platform',
    goal: 'Track public views and indicator installs through bounded server-side counters.', dependencies: [119, 121],
    gates: [
      { id: 'cs125-views', statement: 'Published public rows can increment view counts through a constrained RPC.', automated: true },
      { id: 'cs125-installs', statement: 'Published public rows can increment install counts through a constrained RPC.', automated: true },
    ],
  },
  {
    id: 126, name: 'Shareable indicator URLs', kind: 'platform',
    goal: 'Give each public indicator a stable slug-based route suitable for direct sharing.', dependencies: [121, 122],
    gates: [
      { id: 'cs126-slug', statement: 'Each published indicator receives a stable unique slug.', automated: true },
      { id: 'cs126-route', statement: 'Direct slug routes resolve to the correct public source snapshot without authentication.', automated: true },
    ],
  },
  {
    id: 127, name: 'Public route authentication boundary', kind: 'security',
    goal: 'Ensure public indicator exploration is never redirected into the authenticated workspace merely because the visitor is anonymous.', dependencies: [119, 126],
    gates: [
      { id: 'cs127-anon-route', statement: 'The public explore route bypasses protected workspace redirect logic.', automated: true },
      { id: 'cs127-no-privilege', statement: 'Public browsing does not grant draft or owner mutation privileges.', automated: true },
    ],
  },
  {
    id: 128, name: 'Indicator workspace integration', kind: 'platform',
    goal: 'Expose settings, source editing and community publishing directly from the authenticated indicator workspace and live indicator dock.', dependencies: [114, 116, 124],
    gates: [
      { id: 'cs128-settings', statement: 'Active indicators expose the shared settings surface.', automated: true },
      { id: 'cs128-source', statement: 'Active and newly added indicators can open their editable starter source where supported.', automated: true },
      { id: 'cs128-community', statement: 'Workspace provides direct navigation to the public community catalog.', automated: true },
    ],
  },
  {
    id: 129, name: 'Indicator community security and documentation contract', kind: 'governance',
    goal: 'Document source visibility, ownership, storage, publication and capability boundaries for user-authored indicators.', dependencies: [119, 120, 124, 127],
    gates: [
      { id: 'cs129-docs', statement: 'CoreSpirit and indicator documentation describe the public source contract and ownership boundary.', automated: true },
      { id: 'cs129-secret', statement: 'Authoring UI explicitly warns users not to place credentials or secrets in public source.', automated: true },
    ],
    nonGoals: ['anonymous editing', 'automatic broker execution from public source'],
  },
  {
    id: 130, name: 'User-authored indicator community migration gate', kind: 'governance',
    goal: 'Freeze the first public indicator-authoring/explore architecture only after compiler, persistence, RLS, routing and UI contracts are all proven together.', dependencies: [122, 123, 124, 125, 126, 127, 128, 129],
    gates: [
      { id: 'cs130-end-to-end', statement: 'The authoring path can compile, save, version and publish a CoreSpirit indicator through the documented flow.', automated: false },
      { id: 'cs130-public', statement: 'Anonymous visitors can discover and inspect published source without gaining mutation access.', automated: false },
      { id: 'cs130-native', statement: 'Vela NativeRenderer remains the production backend; the community layer does not depend on renderer internals.', automated: true },
    ],
    nonGoals: ['copying TradingView source or implementation', 'automatic publication of uncompiled source'],
  },
  {
    id: 131, name: 'Indicator definition schema ABI', kind: 'platform',
    goal: 'Give every indicator a serializable, versioned definition that describes identity, editable settings, layout, outputs, capabilities and visualization boundaries without coupling the editor to implementation code.', dependencies: [113, 128],
    gates: [
      { id: 'cs131-schema', statement: 'IndicatorSettingsSchema validates identity, sections, fields, defaults, dependencies and capabilities.', automated: true },
      { id: 'cs131-serializable', statement: 'A schema can round-trip through JSON without executable functions or renderer objects.', automated: true },
    ],
    nonGoals: ['renderer-specific settings APIs', 'arbitrary executable UI schemas'],
  },
  {
    id: 132, name: 'Universal indicator settings editor', kind: 'tooling',
    goal: 'Render Inputs, Style, Display, Behavior, Alerts and Visualization settings from the published schema rather than indicator-kind conditionals.', dependencies: [131],
    gates: [
      { id: 'cs132-universal', statement: 'The shared settings panel contains no indicator-specific field list or kind switch for editable settings.', automated: true },
      { id: 'cs132-fields', statement: 'Integer, number, range, select, color, boolean and text fields map from schema metadata to controls.', automated: true },
    ],
  },
  {
    id: 133, name: 'Schema-driven visibility and complexity levels', kind: 'tooling',
    goal: 'Allow schemas to declare conditional fields and advanced controls while keeping the default authoring surface small.', dependencies: [132],
    gates: [
      { id: 'cs133-visible', statement: 'visibleWhen dependencies hide/show fields from declared state paths without kind-specific UI code.', automated: true },
      { id: 'cs133-advanced', statement: 'Advanced fields can be collapsed behind one universal editor control.', automated: true },
    ],
  },
  {
    id: 134, name: 'Schema-driven workspace normalization', kind: 'runtime',
    goal: 'Normalize persisted indicator settings against schema defaults and paths so newly introduced settings migrate without hand-written per-indicator code.', dependencies: [131, 133],
    gates: [
      { id: 'cs134-defaults', statement: 'Missing schema-declared fields receive their declared defaults during normalization.', automated: true },
      { id: 'cs134-nested', statement: 'Nested paths such as display.opacity and display.precision persist without replacing sibling values.', automated: true },
    ],
  },
  {
    id: 135, name: 'Indicator publication schema snapshot', kind: 'platform',
    goal: 'Publish the exact settings schema plus resolved values alongside the immutable CoreSpirit source snapshot.', dependencies: [124, 131],
    gates: [
      { id: 'cs135-public', statement: 'indicator_publications.indicator_settings contains schemaVersion, schema, identity/layout/output metadata and resolved values.', automated: true },
      { id: 'cs135-compat', statement: 'Legacy flat setting keys remain available in the publication snapshot while the schema projection is added.', automated: true },
    ],
  },
  {
    id: 136, name: 'CoreSpirit indicator schema bridge', kind: 'compiler',
    goal: 'Allow a CoreSpirit-authored indicator to publish its own settings schema without changing the CoreSpirit grammar or creating a second script language.', dependencies: [131, 135],
    gates: [
      { id: 'cs136-source', statement: 'CoreSpirit publication metadata can carry a validated settings schema for a user-authored indicator.', automated: true },
      { id: 'cs136-language', statement: 'No new scripting grammar or vendor-specific keyword is required for settings declaration.', automated: true },
    ],
  },
  {
    id: 137, name: 'Multi-output indicator visualization contract', kind: 'platform',
    goal: 'Represent multi-output studies as stable named outputs so the host and renderer can distinguish primary, signal, band and marker outputs without changing calculation semantics.', dependencies: [131],
    gates: [
      { id: 'cs137-output-id', statement: 'Published indicator definitions retain stable output names across versions.', automated: true },
      { id: 'cs137-renderer-neutral', statement: 'Output metadata contains no Vela-specific series objects or API types.', automated: true },
    ],
  },
  {
    id: 138, name: 'Pane and scale host contract', kind: 'platform',
    goal: 'Move pane and scale intent into the indicator schema so layout decisions are data-driven and host-controlled.', dependencies: [131, 137],
    gates: [
      { id: 'cs138-pane', statement: 'Schemas declare default and allowed pane modes.', automated: true },
      { id: 'cs138-scale', statement: 'Schemas declare default and allowed scales without importing renderer APIs.', automated: true },
    ],
  },
  {
    id: 139, name: 'Behavior and alert capability boundary', kind: 'governance',
    goal: 'Make behavior and alert sections explicit capabilities instead of silently treating every setting as executable host authority.', dependencies: [131, 138],
    gates: [
      { id: 'cs139-capabilities', statement: 'Schemas distinguish declared behavior/alert capabilities from sections that are not implemented.', automated: true },
      { id: 'cs139-side-effects', statement: 'Indicator settings contain no broker destination, credentials or direct side-effect authority.', automated: true },
    ],
  },
  {
    id: 140, name: 'Renderer-neutral indicator style patches', kind: 'runtime',
    goal: 'Apply setting edits as small keyed patches so style/display changes do not recreate indicator execution state unnecessarily.', dependencies: [134, 137, 138],
    gates: [
      { id: 'cs140-patch', statement: 'Nested schema writes update only the declared path and preserve unrelated settings.', automated: true },
      { id: 'cs140-reactive', statement: 'Live chart recomputation observes the complete schema-derived settings fingerprint.', automated: true },
    ],
  },
  {
    id: 141, name: 'Vela schema-to-render projection', kind: 'platform',
    goal: 'Translate indicator output/style/layout metadata into the TCO render packet before it crosses into Vela.', dependencies: [137, 138, 140],
    gates: [
      { id: 'cs141-boundary', statement: 'React/CoreSpirit feature modules remain unaware of Vela types while the adapter consumes schema-derived render intent.', automated: true },
      { id: 'cs141-packet', statement: 'Style and output changes can be applied without replacing the canonical indicator calculation contract.', automated: true },
    ],
  },
  {
    id: 142, name: 'External scripting ecosystem removal gate', kind: 'governance',
    goal: 'Keep the CoreSpirit product boundary free of retired external scripting translators, runtimes, compatibility manifests and import catalogs.', dependencies: [130, 136],
    gates: [
      { id: 'cs142-language', statement: 'Current source/docs do not expose an external scripting compatibility product path.', automated: true },
      { id: 'cs142-community', statement: 'Community indicator distribution resolves to CoreSpirit source/version artifacts only.', automated: true },
    ],
  },
  {
    id: 143, name: 'Single Vela renderer boundary gate', kind: 'governance',
    goal: 'Keep Vela as the sole production chart backend behind TCO-owned chart contracts.', dependencies: [141],
    gates: [
      { id: 'cs143-vendor', statement: 'Direct vendor imports are confined to the two TCO Vela adapter implementation files.', automated: true },
      { id: 'cs143-backend', statement: 'The production backend policy resolves only to vela-native.', automated: true },
    ],
  },
  {
    id: 144, name: 'Vela attribution and upstream notice gate', kind: 'governance',
    goal: 'Preserve upstream Vela license and attribution requirements as a build/release invariant rather than a documentation-only promise.', dependencies: [143],
    gates: [
      { id: 'cs144-notice', statement: 'vendor/vela retains LICENSE and NOTICE files in released source.', automated: true },
      { id: 'cs144-attribution', statement: 'The native Vela attribution path remains enabled unless an equivalent visible host notice is implemented and tested.', automated: true },
    ],
  },
  {
    id: 145, name: 'Schema-driven indicator architecture migration gate', kind: 'governance',
    goal: 'Freeze the schema-driven indicator system only after workspace, live chart, publication and Vela projection use the same versioned metadata contract.', dependencies: [135, 136, 140, 141, 142, 143, 144],
    gates: [
      { id: 'cs145-editor', statement: 'All production indicator settings surfaces use the universal schema renderer.', automated: true },
      { id: 'cs145-public', statement: 'Public indicator artifacts persist schema + resolved values next to immutable CoreSpirit source/version identity.', automated: true },
      { id: 'cs145-runtime', statement: 'Nested settings changes trigger deterministic indicator/render updates without breaking existing workspace state.', automated: false },
    ],
    nonGoals: ['runtime execution of arbitrary untrusted public source', 'renderer-specific scripting syntax'],
  },
  {
    id: 146, name: 'First-class programmable indicator artifact', kind: 'platform',
    goal: 'Make an indicator a first-class CoreSpirit executable artifact that carries its compiled program, typed component contract, settings schema and domain projections as one immutable object.', dependencies: [9, 136, 145],
    gates: [
      { id: 'cs146-artifact', statement: 'A CoreSpirit indicator component contains an executable artifact and deterministic source checksum.', automated: true },
      { id: 'cs146-contract', statement: 'The indicator is represented as component kind indicator rather than a parallel indicator runtime.', automated: true },
      { id: 'cs146-safety', statement: 'Published/user source is not automatically granted host or broker authority by becoming an indicator artifact.', automated: true },
    ],
  },
  {
    id: 147, name: 'Typed indicator public port model', kind: 'compiler',
    goal: 'Give programmable indicators stable typed input/output ports so one indicator can be composed into another without special indicator syntax.', dependencies: [146, 69],
    gates: [
      { id: 'cs147-inputs', statement: 'Canonical data inputs are projected into typed component input ports.', automated: true },
      { id: 'cs147-outputs', statement: 'Indicator outputs have stable IDs, names, roles and types.', automated: true },
      { id: 'cs147-member', statement: 'Multi-output indicator values remain addressable through the existing component member path.', automated: true },
    ],
  },
  {
    id: 148, name: 'Declarative indicator lifecycle contract', kind: 'platform',
    goal: 'Describe inputs, calculation, state, events, plots, visuals, alerts and metadata as projections of one CoreSpirit program graph.', dependencies: [146, 147],
    gates: [
      { id: 'cs148-sections', statement: 'Indicator artifacts expose inputs, calculation, state, events, plots, visuals, alerts and metadata without introducing a second evaluator.', automated: true },
      { id: 'cs148-state', statement: 'State lifecycle remains explicit and aligns with snapshot/rollback requirements for developing bars.', automated: true },
      { id: 'cs148-render', statement: 'Visual projections remain renderer-neutral until they cross the TCO Vela adapter boundary.', automated: true },
    ],
  },
  {
    id: 149, name: 'Indicator computation identity contract', kind: 'runtime',
    goal: 'Keep source/artifact/calculation identity distinct from settings presentation identity so an indicator can be restyled without invalidating mathematical state.', dependencies: [146, 148, 140],
    gates: [
      { id: 'cs149-compute', statement: 'Indicator source/artifact identity is sufficient to address compiled calculation state.', automated: true },
      { id: 'cs149-appearance', statement: 'Appearance metadata is not included in the indicator component calculation identity.', automated: true },
      { id: 'cs149-incremental', statement: 'Incremental eligibility is derived from state/determinism metadata instead of from renderer settings.', automated: true },
    ],
  },
  {
    id: 150, name: 'Reusable indicator composition', kind: 'compiler',
    goal: 'Allow a first-class indicator component to participate in ordinary CoreSpirit component composition, including nested and multi-output indicators.', dependencies: [147, 149, 69],
    gates: [
      { id: 'cs150-nested', statement: 'Indicator component outputs can feed registered components through the existing invocation validation path.', automated: true },
      { id: 'cs150-lineage', statement: 'Nested indicator composition preserves component/node lineage for dependency and diagnostic inspection.', automated: true },
      { id: 'cs150-runtime', statement: 'Composition does not introduce an indicator-specific VM or evaluator.', automated: true },
    ],
  },
  {
    id: 151, name: 'Declarative plot/event projection', kind: 'runtime',
    goal: 'Project SHOW, event and alert emissions from indicator IR into stable domain descriptors so plots and events are data, not ad-hoc UI callbacks.', dependencies: [148, 150],
    gates: [
      { id: 'cs151-plots', statement: 'Plot descriptors retain source instruction and stable output IDs.', automated: true },
      { id: 'cs151-events', statement: 'Event/alert descriptors retain event kind and source instruction without embedding broker or renderer calls.', automated: true },
      { id: 'cs151-visuals', statement: 'Visual descriptors are explicitly renderer-neutral.', automated: true },
    ],
  },
  {
    id: 152, name: 'Indicator metadata as optional declaration sugar', kind: 'language',
    goal: 'Keep any future `indicator "Name"` declaration as authoring sugar over the existing artifact/component model rather than creating a second indicator language.', dependencies: [148, 151],
    gates: [
      { id: 'cs152-sugar', statement: 'A future indicator declaration maps to the existing component/artifact contract without changing VM semantics.', automated: false },
      { id: 'cs152-source', statement: 'Indicator calculation remains ordinary DATA/LET/WHEN/SHOW composition beneath the metadata declaration.', automated: false },
    ],
    nonGoals: ['a second indicator grammar', 'renderer-specific indicator syntax'],
  },
  {
    id: 153, name: 'Trusted authored indicator registration boundary', kind: 'security',
    goal: 'Permit trusted/native/local authored indicators to register as executable components while keeping public untrusted source behind explicit compile/runtime admission controls.', dependencies: [146, 150],
    gates: [
      { id: 'cs153-register', statement: 'Indicator registry admission validates the component contract before registration.', automated: true },
      { id: 'cs153-public', statement: 'Public publication remains source-visible and sandboxed; publication alone does not register executable host authority.', automated: true },
      { id: 'cs153-authority', statement: 'Indicator registration never creates broker, filesystem or arbitrary network capabilities.', automated: true },
    ],
  },
  {
    id: 154, name: 'First-class programmable indicator release gate', kind: 'governance',
    goal: 'Freeze the first-class programmable indicator architecture only after artifact identity, ports, lifecycle projections, composition, appearance isolation and safety boundaries are covered by contracts.', dependencies: [146, 147, 148, 149, 150, 151, 153],
    gates: [
      { id: 'cs154-contract', statement: 'The first-class indicator component contract and runtime behavior checks pass.', automated: true },
      { id: 'cs154-build', statement: 'The production Vite build resolves all TCO chart facade runtime exports without legacy renderer symbol leakage.', automated: true },
      { id: 'cs154-docs', statement: 'CoreSpirit architecture, scripting, composability, indicator and repair tracker documentation describe the same first-class model.', automated: true },
    ],
  },
  {
    id: 155, name: 'Universal indicator parameter ABI', kind: 'platform',
    goal: 'Promote calculation parameters into a first-class serializable ABI shared by CoreSpirit indicator artifacts, settings schemas, workspace state and public publications.', dependencies: [131, 146, 154],
    gates: [
      { id: 'cs155-types', statement: 'The parameter ABI supports number, integer, decimal, boolean, enum, color, source, timeframe, symbol, session, price, duration and string types.', automated: true },
      { id: 'cs155-boundary', statement: 'Parameter definitions remain serializable metadata and never contain executable UI callbacks or renderer objects.', automated: true },
      { id: 'cs155-identity', statement: 'Calculation snapshots are derived from declared parameters rather than presentation sections.', automated: true },
    ],
  },
  {
    id: 156, name: 'Universal parameter constraints and authoring metadata', kind: 'tooling',
    goal: 'Give every parameter a common constraint and discovery vocabulary so the editor can render rich controls without indicator-kind branching.', dependencies: [155, 132],
    gates: [
      { id: 'cs156-constraints', statement: 'Parameters can declare min, max, step, default, group, tooltip, placeholder and declarative validation metadata.', automated: true },
      { id: 'cs156-editor', statement: 'The universal settings editor renders the declared parameter kinds through one schema path.', automated: true },
      { id: 'cs156-values', statement: 'Parameter values are validated against the same schema used to render them.', automated: true },
    ],
  },
  {
    id: 157, name: 'Conditional parameter dependency graph', kind: 'compiler',
    goal: 'Treat settings as a dependency graph rather than a flat form, with bounded boolean conditions that control parameter visibility and applicability.', dependencies: [156, 133],
    gates: [
      { id: 'cs157-operators', statement: 'Dependencies support equality, inequality, numeric comparisons, membership, truthiness and bounded AND/OR/NOT composition.', automated: true },
      { id: 'cs157-safety', statement: 'Dependencies reference only declared safe parameter paths and reject self-dependencies and excessive nesting.', automated: true },
      { id: 'cs157-runtime', statement: 'Visibility is evaluated from current persisted values without executing arbitrary schema code.', automated: true },
    ],
  },
  {
    id: 158, name: 'Resolved parameter state and migration runtime', kind: 'runtime',
    goal: 'Resolve defaults, visibility and validation into one deterministic parameter state that can be reused by the editor, workspace and publication pipeline.', dependencies: [155, 156, 157, 134, 135],
    gates: [
      { id: 'cs158-resolve', statement: 'Missing values resolve from parameter defaults while preserving existing sibling values.', automated: true },
      { id: 'cs158-state', statement: 'Resolved parameter state reports values, visible paths, validation errors and overall validity deterministically.', automated: true },
      { id: 'cs158-public', statement: 'Public settings snapshots retain parameter definitions and resolved parameter state beside immutable source/artifact identity.', automated: true },
    ],
  },
  {
    id: 159, name: 'Universal parameter system release gate', kind: 'governance',
    goal: 'Freeze the parameter/dependency architecture only after component ABI, universal rendering, validation, conditional visibility, migration and computation isolation are contract-covered.', dependencies: [155, 156, 157, 158, 149],
    gates: [
      { id: 'cs159-contract', statement: 'Universal parameter and conditional settings contract tests pass.', automated: true },
      { id: 'cs159-isolation', statement: 'Appearance changes remain renderer-only and parameter changes are classified through computation identity.', automated: true },
      { id: 'cs159-docs', statement: 'CoreSpirit parameter, indicator, scripting and repair documentation describe one universal parameter/dependency model.', automated: true },
    ],
  },
  {
    id: 160, name: 'Universal parameter dependency graph', kind: 'compiler',
    goal: 'Promote parameter visibility and enablement dependencies into a validated graph with typed conditions, safe paths and cycle detection.', dependencies: [157, 158],
    gates: [
      { id: 'cs160-typed', statement: 'Conditional operators are validated against the declared target parameter domain.', automated: true },
      { id: 'cs160-cycle', statement: 'Dependency cycles are rejected before the schema reaches the universal editor.', automated: true },
      { id: 'cs160-state', statement: 'Resolved parameter state exposes deterministic visible and enabled maps.', automated: true },
    ],
  },
  {
    id: 161, name: 'Universal preset ABI', kind: 'platform',
    goal: 'Represent factory, script-embedded, template, personal, workspace and community indicator presets as immutable serializable parameter snapshots.', dependencies: [155, 158],
    gates: [
      { id: 'cs161-scope', statement: 'Preset scopes are explicit and non-executable.', automated: true },
      { id: 'cs161-identity', statement: 'Factory/template preset IDs are deterministic across renders and sessions.', automated: true },
      { id: 'cs161-serialization', statement: 'Preset payloads and profile envelopes round-trip through JSON validation.', automated: true },
    ],
  },
  {
    id: 162, name: 'Profile-scoped preset persistence', kind: 'runtime',
    goal: 'Persist personal/workspace preset collections using isolated profile keys while retaining local fallback behavior.', dependencies: [161],
    gates: [
      { id: 'cs162-isolation', statement: 'Preset storage keys are isolated by user and workspace context.', automated: true },
      { id: 'cs162-stack', statement: 'Factory/script/workspace/personal layers resolve into one deterministic parameter value set.', automated: true },
    ],
  },
  {
    id: 163, name: 'Semantic series value domains', kind: 'language',
    goal: 'Distinguish scalar and series values by semantic domain so price, volume, time and duration carry meaning beyond the structural number type.', dependencies: [154, 159],
    gates: [
      { id: 'cs163-domains', statement: 'Core market fields infer series<price>, series<volume> and series<time> semantic types.', automated: true },
      { id: 'cs163-metadata', statement: 'Semantic values can carry symbol, timeframe, unit, currency, precision and scale metadata.', automated: true },
      { id: 'cs163-declared', statement: 'CoreSpirit accepts explicit semantic scalar and series type annotations.', automated: true },
    ],
  },
  {
    id: 164, name: 'Semantic domain arithmetic validation', kind: 'compiler',
    goal: 'Reject domain-invalid arithmetic such as price + volume while allowing scalar-number broadcasting and valid ratio/difference operations.', dependencies: [163],
    gates: [
      { id: 'cs164-invalid', statement: 'price + volume produces a compiler diagnostic before IR generation.', automated: true },
      { id: 'cs164-valid', statement: 'price - price, price + number and price / price remain valid semantic operations.', automated: true },
      { id: 'cs164-time', statement: 'time + duration is valid while time + time is rejected.', automated: true },
    ],
  },
  {
    id: 165, name: 'Semantic type tooling surface', kind: 'tooling',
    goal: 'Expose semantic series types through CoreSpirit completions and type information so editor feedback matches compiler behavior.', dependencies: [163, 164],
    gates: [
      { id: 'cs165-completion', statement: 'Market series completions advertise semantic types.', automated: true },
      { id: 'cs165-info', statement: 'Type information reports series<price>, series<volume> and series<time> for built-in series.', automated: true },
    ],
  },
  {
    id: 166, name: 'Presets and semantic types release gate', kind: 'governance',
    goal: 'Freeze the universal parameter/preset and semantic-series architecture only after serialization, dependency, compiler and editor boundaries are covered.', dependencies: [160, 161, 162, 163, 164, 165],
    gates: [
      { id: 'cs166-contracts', statement: 'Parameter, preset and semantic-series contracts pass.', automated: true },
      { id: 'cs166-docs', statement: 'Current CoreSpirit docs and repair tracker describe the same parameter/dependency/preset/type model.', automated: true },
    ],
  },

  {
    id: 167, name: 'Universal preset source and template ABI', kind: 'platform',
    goal: 'Allow indicators to publish factory, script-embedded, declarative template and community preset definitions as validated serializable data rather than UI branches.', dependencies: [161, 166],
    gates: [
      { id: 'cs167-template', statement: 'Indicators can publish validated declarative presetTemplates with parameter overrides and stable IDs.', automated: true },
      { id: 'cs167-community', statement: 'Community presets are read-only in the local editor and are accepted only when their indicator/schema identity matches.', automated: true },
      { id: 'cs167-serial', statement: 'Preset values contain only serializable parameter data; no executable callbacks are admitted.', automated: true },
    ],
  },
  {
    id: 168, name: 'Deterministic preset layer resolution', kind: 'runtime',
    goal: 'Resolve Factory → Script → Workspace → Personal layers deterministically while exposing which layer supplied the effective preset values.', dependencies: [167],
    gates: [
      { id: 'cs168-order', statement: 'Layer precedence is explicit and stable: factory, script, workspace, personal.', automated: true },
      { id: 'cs168-latest', statement: 'Multiple personal/workspace candidates resolve by deterministic updatedAt/id ordering.', automated: true },
      { id: 'cs168-report', statement: 'Resolution returns effective values, applied preset IDs and per-layer identity.', automated: true },
    ],
  },
  {
    id: 169, name: 'Profile-scoped preset persistence', kind: 'runtime',
    goal: 'Persist presets and active profile data with user/workspace isolation and bounded profile size.', dependencies: [162, 168],
    gates: [
      { id: 'cs169-scope', statement: 'Profile writes reject mismatched user/workspace scope and factory/script presets are not locally writable.', automated: true },
      { id: 'cs169-active', statement: 'An active profile envelope can round-trip through JSON and carry activePresetByIndicator metadata.', automated: true },
      { id: 'cs169-limit', statement: 'Profiles are bounded to 128 presets and malformed entries are ignored or rejected deterministically.', automated: true },
    ],
  },
  {
    id: 170, name: 'Universal preset editor lifecycle', kind: 'ui',
    goal: 'Keep preset save/apply behavior inside the generic parameter editor so indicator-specific React branches never return.', dependencies: [169, 166],
    gates: [
      { id: 'cs170-editor', statement: 'The universal editor renders and applies presets using the parameter ABI only.', automated: true },
      { id: 'cs170-save', statement: 'Personal/workspace saves route through the canonical preset service and active profile persistence.', automated: true },
      { id: 'cs170-hidden', statement: 'Conditional visibility/enabled state remains derived from the resolved parameter state after preset application.', automated: true },
    ],
  },
  {
    id: 171, name: 'Semantic series algebra', kind: 'language',
    goal: 'Make scalar/series semantic domains first-class in the compiler while retaining the existing structural VM type system.', dependencies: [163, 170],
    gates: [
      { id: 'cs171-atoms', statement: 'CoreSpirit distinguishes number, price, volume, time, duration, boolean and string semantic atoms.', automated: true },
      { id: 'cs171-series', statement: 'Core market values infer series<price>, series<volume> and series<time> domains.', automated: true },
      { id: 'cs171-metadata', statement: 'Semantic values carry optional symbol, timeframe, unit, currency, precision and scale metadata.', automated: true },
    ],
  },
  {
    id: 172, name: 'Semantic comparison and declaration compatibility', kind: 'compiler',
    goal: 'Reject semantic comparison and declaration mismatches that structural number compatibility would otherwise allow.', dependencies: [171],
    gates: [
      { id: 'cs172-compare', statement: 'Cross-domain ordered comparisons such as price > volume produce a semantic compiler diagnostic.', automated: true },
      { id: 'cs172-equality', statement: 'Equality/inequality comparisons remain permitted only for compatible domains or explicit generic numeric values.', automated: true },
      { id: 'cs172-declare', statement: 'Explicit semantic declarations are checked against inferred semantic domains and metadata compatibility.', automated: true },
    ],
  },
  {
    id: 173, name: 'Domain-aware standard-library signatures', kind: 'compiler',
    goal: 'Give common indicator/statistical functions semantically meaningful signatures, plus explicit domain-conversion primitives when authors intentionally erase or change a domain.', dependencies: [172],
    gates: [
      { id: 'cs173-price', statement: 'ATR/true-range/VWAP outputs retain a price semantic domain.', automated: true },
      { id: 'cs173-stat', statement: 'RSI and analogous normalized oscillators expose a numeric/percent semantic domain.', automated: true },
      { id: 'cs173-source', statement: 'Source-preserving rolling functions retain the input series domain where mathematically meaningful.', automated: true },
      { id: 'cs173-conversion', statement: 'Explicit toNumber/toPrice/toVolume/toTime/toDuration/toCurrency conversions are registered as pure semantic escape hatches and do not weaken implicit arithmetic rules.', automated: true },
    ],
  },
  {
    id: 174, name: 'Semantic metadata propagation', kind: 'compiler',
    goal: 'Preserve domain metadata through series indexing, market/timeframe references and valid arithmetic so multi-symbol/timeframe programs retain meaning.', dependencies: [171, 173],
    gates: [
      { id: 'cs174-index', statement: 'Indexing a series yields the same semantic atom as a scalar value with preserved relevant metadata.', automated: true },
      { id: 'cs174-reference', statement: 'market(symbol).close and timeframe(tf).close carry symbol/timeframe metadata.', automated: true },
      { id: 'cs174-arithmetic', statement: 'Valid arithmetic carries compatible symbol/timeframe metadata without silently discarding semantic units.', automated: true },
    ],
  },
  {
    id: 175, name: 'Semantic type tooling and diagnostics', kind: 'tooling',
    goal: 'Expose the same semantic types and domain diagnostics to CoreSpirit completions and editor type information.', dependencies: [172, 174],
    gates: [
      { id: 'cs175-complete', statement: 'Editor completions expose semantic series domains for canonical market fields.', automated: true },
      { id: 'cs175-info', statement: 'Type information reports domain-aware series types instead of generic series<number> where metadata is known.', automated: true },
      { id: 'cs175-diagnostics', statement: 'Semantic arithmetic/comparison diagnostics share stable diagnostic codes with the compiler.', automated: true },
    ],
  },
  {
    id: 176, name: 'Presets and semantic typing release gate', kind: 'governance',
    goal: 'Freeze the universal parameter/preset and domain-aware series architecture only when serialization, dependency safety, deterministic dependency resolution, runtime isolation, compiler semantics and tooling agree.', dependencies: [167, 168, 169, 170, 171, 172, 173, 174, 175],
    gates: [
      { id: 'cs176-contracts', statement: 'Preset, profile, parameter dependency and semantic series contracts pass.', automated: true },
      { id: 'cs176-noninterference', statement: 'Preset/parameter changes do not reintroduce appearance-driven indicator recomputation or bypass TCO capability boundaries.', automated: true },
      { id: 'cs176-docs', statement: 'Current CoreSpirit and repair documentation describes one parameter, preset, dependency and semantic type architecture.', automated: true },
    ],
  },

  {
    id: 177, name: 'Parameter value-domain ABI', kind: 'platform',
    goal: 'Make every universal parameter kind carry executable value-domain validation before it can enter workspace state, presets or runtime configuration.', dependencies: [159, 170],
    gates: [
      { id: 'cs177-domain', statement: 'Universal kinds reject structurally incorrect values and enforce numeric, enum, color, timeframe, symbol, session and duration domain rules.', automated: true },
      { id: 'cs177-defaults', statement: 'Schema defaults pass the same validator used for persisted and preset values.', automated: true },
      { id: 'cs177-no-ui', statement: 'Value-domain validation has no dependency on React or editor components.', automated: true },
    ],
  },
  {
    id: 178, name: 'Incremental parameter dependency graph', kind: 'compiler',
    goal: 'Compile parameter dependencies into forward and reverse graphs so a parameter edit can identify only the transitive affected settings.', dependencies: [160, 177],
    gates: [
      { id: 'cs178-order', statement: 'Dependency evaluation order is deterministic and cycle-safe.', automated: true },
      { id: 'cs178-reverse', statement: 'Reverse dependent lookup returns the transitive affected parameter paths.', automated: true },
      { id: 'cs178-fail', statement: 'Malformed dependency trees fail closed and never execute arbitrary predicates.', automated: true },
    ],
  },
  {
    id: 179, name: 'Conditional settings state machine', kind: 'runtime',
    goal: 'Treat visible/enabled parameter state as resolved runtime configuration derived from default-hydrated values, not ad-hoc component conditions.', dependencies: [158, 178],
    gates: [
      { id: 'cs179-default-state', statement: 'Default-only dependency chains resolve correctly before persisted values exist.', automated: true },
      { id: 'cs179-state', statement: 'Each field has deterministic visible/enabled/error state.', automated: true },
      { id: 'cs179-editor', statement: 'The universal editor consumes resolved state and contains no indicator-kind-specific conditional branch.', automated: true },
    ],
  },
  {
    id: 180, name: 'Deterministic preset/profile selection', kind: 'runtime',
    goal: 'Make selected profile presets participate in effective configuration resolution while preserving Factory → Script → Workspace → Personal precedence.', dependencies: [168, 169, 179],
    gates: [
      { id: 'cs180-selection', statement: 'activePresetByIndicator selects a matching workspace/personal preset when present.', automated: true },
      { id: 'cs180-fallback', statement: 'Unselected layers fall back to deterministic latest-by-updatedAt/id resolution.', automated: true },
      { id: 'cs180-lineage', statement: 'Effective configuration reports the selected preset IDs per layer.', automated: true },
    ],
  },
  {
    id: 181, name: 'Preset portability and reconciliation ABI', kind: 'platform',
    goal: 'Make presets and profiles portable JSON artifacts with canonical fingerprints for safe import/export and change reconciliation.', dependencies: [167, 169, 180],
    gates: [
      { id: 'cs181-json', statement: 'Preset/profile serialization contains data only and round-trips through schema validation.', automated: true },
      { id: 'cs181-fingerprint', statement: 'Profile fingerprints are deterministic across object key ordering.', automated: true },
      { id: 'cs181-scope', statement: 'Imported profile scope is checked against active user/workspace context before persistence.', automated: true },
    ],
  },
  {
    id: 182, name: 'Semantic dimensional algebra', kind: 'language',
    goal: 'Treat price, volume, time, duration, currency and unitless number as distinct semantic domains for scalar and series values.', dependencies: [171, 172, 174],
    gates: [
      { id: 'cs182-domain', statement: 'Implicit cross-domain arithmetic is rejected except for explicitly defined dimension-preserving operations.', automated: true },
      { id: 'cs182-derived', statement: 'Valid products/ratios derive meaningful domains such as price × volume → currency and time − time → duration.', automated: true },
      { id: 'cs182-metadata', statement: 'Symbol/timeframe metadata is retained where the operation remains semantically meaningful.', automated: true },
    ],
  },
  {
    id: 183, name: 'Explicit semantic conversion ABI', kind: 'compiler',
    goal: 'Provide a small pure conversion surface for intentional domain changes without weakening implicit semantic validation.', dependencies: [173, 182],
    gates: [
      { id: 'cs183-conversions', statement: 'toNumber/toPrice/toVolume/toTime/toDuration/toCurrency are registered, typed and pure.', automated: true },
      { id: 'cs183-explicit', statement: 'Explicit conversion can make an otherwise invalid domain operation intentional.', automated: true },
      { id: 'cs183-host', statement: 'Conversions add no broker, network, filesystem or other host capability.', automated: true },
    ],
  },
  {
    id: 184, name: 'Universal configuration and semantic typing release gate', kind: 'governance',
    goal: 'Freeze the v114 parameter/preset/dependency/type architecture only when editor, persistence, compiler, runtime and capability boundaries agree.', dependencies: [177, 178, 179, 180, 181, 182, 183],
    gates: [
      { id: 'cs184-contracts', statement: 'Parameter, conditional, preset/profile, semantic-series and build-annotation contracts pass.', automated: true },
      { id: 'cs184-noninterference', statement: 'Configuration changes remain outside mathematical indicator recomputation unless a declared computation parameter changes.', automated: true },
      { id: 'cs184-docs', statement: 'Current docs, release manifest and repair tracker describe the same v114 architecture and validation status.', automated: true },
    ],
  },

]

export function getCoreSpiritStage(id: number): CoreSpiritStage | undefined {
  return CORE_SPIRIT_STAGES.find(stage => stage.id === id);
}

export function validateCoreSpiritRoadmap(): string[] {
  const errors: string[] = [];
  const ids = new Set(CORE_SPIRIT_STAGES.map(stage => stage.id));
  for (const stage of CORE_SPIRIT_STAGES) {
    for (const dep of stage.dependencies) {
      if (!ids.has(dep)) errors.push(`stage ${stage.id} depends on missing stage ${dep}`);
      if (dep >= stage.id) errors.push(`stage ${stage.id} has non-previous dependency ${dep}`);
    }
  }
  if (CORE_SPIRIT_STAGES.length !== 184) errors.push('CoreSpirit roadmap must contain exactly 184 stages');
  return errors;
}
