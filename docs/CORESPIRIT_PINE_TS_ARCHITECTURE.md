# CoreSpirit: PineTS-informed series runtime and authoring

**Reference reviewed:** [LuxAlgo/PineTS](https://github.com/LuxAlgo/PineTS), upstream main commit `11aafe8833ce89d6511b3a78c07e5b58115f779a` (2026-10-13). PineTS documents a transpiler/runtime split, a per-run context, forward-chronological storage with current-bar-first history access, incremental bar execution and plain output series. This file records how those ideas map onto CoreSpirit; it is not a plan to replace CoreScript with Pine Script.

## Architecture mapping

| PineTS concept | CoreSpirit implementation | Rule to preserve |
|---|---|---|
| Transpiler passes and scope analysis | `compiler.ts`, `compilerPipeline.ts`, `parser.ts`, `nameResolver.ts`, `semanticAnalyzer.ts` | Parse and resolve to typed IR; do not run generated user JavaScript directly. |
| Per-execution context and series history | `seriesEngine.ts`, `seriesRegistry.ts`, `executionContext.ts`, `runtime.ts` | Keep per-bar history semantics explicit and state isolated by program/market/timeframe. |
| Current bar at offset 0; prior bars at positive offsets | `CoreSpiritSeriesEngine.value(field, offset)` and the typed Series Registry | (field[0]) is current; (field[1]) is the immediately previous bar. Negative offsets are rejected as future/lookahead access. |
| Incremental processing of each new or revised bar | `dirtyGraph.ts`, `incrementalCompiler.ts`, `reactiveEngine.ts`, `coreComputeScheduler.ts` | A live update should invalidate only affected dependency nodes; a correction to the active candle replaces its value rather than appending a duplicate bar. |
| Explicit plots and strategy outputs | `outputCollector.ts`, `outputDispatcher.ts`, `chartOutputController.ts`, Vela renderer/indicator adapter | Produce data-only plot/signal/drawing outputs; rendering and all broker execution remain host-owned. |
| Repeatable historical execution / streaming state | `replay.ts`, `coreSpiritReplay.worker.ts`, `kernelStateSnapshots.ts`, `artifactAbi.ts` | The same source and confirmed dataset should yield deterministic output checksums; do not treat a developing live bar as confirmed history. |

## CoreScript-specific advantages that stay first-class

CoreSpirit is not a Pine Script compatibility wrapper. Its typed series keep market domain and identity metadata (symbol/timeframe), and its pipeline has an explicit semantic/dependency graph, optimizer, execution plan and controlled backends. Preserve those stronger contracts instead of flattening everything into an untyped JavaScript context.

The canonical path remains:

`CoreScript source → AST → name/semantic resolution → typed IR → dependency graph/optimizer → execution plan → sandboxed VM/kernel → output collector → Vela`.

FYERS data remains an external provider. Indicators emit visual outputs and signals; any actual order must still go through automation, the risk boundary, order intent and the broker adapter.

## PineTS-inspired improvement checklist

1. **Series conformance:** test current/previous-bar indexing, out-of-range lookbacks, confirmed vs developing bars, and rejection of negative offsets.
2. **Execution consistency:** compare historical replay, live-bar replacement, and replay of the same bars using a stable output checksum.
3. **State isolation:** two instances of the same script, with different parameters or market/timeframe contexts, must not share stateful TA/kernel registers.
4. **Output contract:** publish named plot series and signal/drawing events as structured outputs; never require UI code to parse compiler logs.
5. **Authoring experience:** keep Compile, diagnostics, Run on active chart, output inspection and source-to-runtime trace visible together; running must consume the exact validated artifact, not recompile different source later.
6. **Complex research stays native:** HMM/models, typed tensors, feature graphs and multi-backend kernels remain CoreSpirit capabilities, not an imported PineTS language constraint.

## Upstream reference and licensing

- PineTS repository: https://github.com/LuxAlgo/PineTS
- Series model: https://github.com/LuxAlgo/PineTS/blob/main/docs/architecture/runtime/series.md
- Execution cycle: https://github.com/LuxAlgo/PineTS/blob/main/docs/architecture/runtime/execution-flow.md
- Transpiler architecture: https://github.com/LuxAlgo/PineTS/blob/main/docs/architecture/transpiler/index.md

The current PineTS `package.json` declares **AGPL-3.0-only**. TradingCoreOS therefore uses public architecture documentation and its own independent implementation; this update does not bundle or import PineTS runtime code.
