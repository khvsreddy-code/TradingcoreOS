# CoreSpirit Stages 1–16 — Deep Architecture Contract

## 1. Language foundation
Freeze the grammar and AST before feature growth. Every diagnostic carries a stable code and source span. The parser should be independently testable and AST snapshots should be golden fixtures.

## 2. Series runtime
`series<T>` is the center of the language. One history cursor owns `series[0]`, positive history offsets, warmup/NA, and current-bar semantics. Indicator implementations never invent a second indexing system.

## 3. Indicator runtime
One native indicator engine owns the math and state model. Chart, replay, realtime, and backtest hosts consume the same primitive implementations.

## 4. IR + VM
Source compiles to a small instruction set. The production VM executes validated IR, not arbitrary AST nodes. Artifacts are deterministic and sandboxed.

## 5. Historical vs realtime
A developing realtime bar is transactional. Each revision starts from the last confirmed checkpoint; prior revisions are rolled back; the final revision is committed exactly once. Confirmed historical semantics are the reference.

## 6. Runtime-native indicators
Indicators expose deterministic functions over canonical series state. Stateful primitives must snapshot/restore correctly and may not maintain hidden UI-specific state.

## 7. Tiny standard library
Keep the v1 core at 30 primitives. Extensions remain separately classified. Reliability means every primitive has a type contract, runtime implementation, warmup behavior, realtime behavior, and tests.

## 8. Compiler pipeline
Every phase is testable independently: lexer → parser → AST → name resolution → type checking → semantic validation → IR → optimization → artifact. Golden tests protect AST and IR boundaries.

## 9. Stable IR contract
IR has an explicit version/format, opcode contract, source map, lookback, and deterministic artifact identity. Any optimization must preserve observable trading semantics.

## 10. Replay
Replay consumes an immutable dataset and an executable artifact. A repeated run must produce structurally identical outputs, final state, and execution trace. Per-bar checksums identify the first divergence later.

## 11. Debugger
Debugger data is observational. A selected candle can be explained through source → AST reference → IR instruction → runtime values/state → outputs. The debugger must never become a second execution engine.

## 12. Signal boundary
CoreSpirit emits signals/strategy events. Risk, policy, order intent, venue selection, broker APIs, and account mutation are platform concerns outside the VM.

## 13. Strategy model
`strategy`, `entry`, and `exit` describe declarative intent. Strategy events are immutable and carry strategy/position identity. Downstream systems translate events into order intents after risk checks.

## 14. Killer example
The EMA + RSI example is a certification fixture, not merely a tutorial. It must compile, replay deterministically, behave correctly through realtime revision/rollback/commit, render on the chart, explain itself in the debugger, and terminate at the signal/risk boundary.

## 15. Non-goals
Do not optimize for Pine compatibility, a giant library, AI-generated execution, direct brokers, complex visual builders, a marketplace, or arbitrary user code. The language remains small, deterministic, and sandboxed.

## 16. Roadmap governance
A stage is done only when its gates are green. Feature count never overrides an unstable contract. New language/runtime capabilities require: a semantic definition, compiler/type behavior, runtime behavior, replay/realtime tests, debugger visibility, and a documented compatibility decision.

### Release ordering

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16`

The dependency graph is encoded in `coreSpiritRoadmap.ts` so tooling can validate that later stages do not silently bypass earlier contracts.
