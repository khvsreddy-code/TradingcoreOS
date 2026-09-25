/**
 * CoreSpirit stages 1–16: architecture contract and release gates.
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
    id: 7, name: 'Tiny standard library', kind: 'foundation',
    goal: 'Keep a small, documented core of reliable primitives and separate platform extensions.', dependencies: [1, 3, 4],
    gates: [
      { id: 'cs7-size', statement: 'Core standard-library surface remains intentionally small (30 primitives in v1).', automated: true },
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
    ],
  },
];

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
  if (CORE_SPIRIT_STAGES.length !== 16) errors.push('CoreSpirit roadmap must contain exactly 16 stages');
  return errors;
}
