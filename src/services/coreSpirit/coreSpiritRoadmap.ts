/**
 * CoreSpirit stages 1–53: architecture contract and release gates.
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
      { id: 'cs15-no-pine-lockin', statement: 'No requirement makes CoreSpirit emulate Pine semantics.', automated: false },
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
    nonGoals: ['PineScript compatibility as a design target', 'a wizard-only programming model', 'a second editor runtime'],
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
      { id: 'cs59-professional', statement: 'Level 3 can expose typed data, multi-symbol, multi-timeframe, custom visual geometry, external models, event handlers and performance controls while preserving the same execution substrate.', automated: false },
      { id: 'cs59-same-language', statement: 'Authoring level is a discoverability/presentation classification, not a grammar fork or alternate runtime.', automated: true },
      { id: 'cs59-upgrade-path', statement: 'A program can grow from Level 1 to Level 3 by adding declarations and type detail rather than rewriting into another language.', automated: false },
      { id: 'cs59-capability-boundary', statement: 'Professional access increases expressiveness and inspection, not broker/network/filesystem authority; sandbox and host policy remain authoritative.', automated: true },
    ],
    nonGoals: ['a beginner-only interpreter', 'an advanced-only DSL', 'professional mode as a broker bypass', 'locking features to visual wizard states'],
  }
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
  if (CORE_SPIRIT_STAGES.length !== 59) errors.push('CoreSpirit roadmap must contain exactly 59 stages');
  return errors;
}
