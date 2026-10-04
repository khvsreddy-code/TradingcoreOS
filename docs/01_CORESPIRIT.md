# CoreSpirit — language, compiler and execution

CoreSpirit is TradingCoreOS's only user-facing scripting language for indicators, models, visuals and automation.

## Compiler model

```
source
 → CST/tokens
 → normalized AST
 → semantic model
 → IR
 → one reactive VM/runtime
```

Users write CoreSpirit declarations; they do not need to understand IR, renderer internals or broker authority.

## Language foundations

CoreSpirit's small semantic surface is built around:

`DATA / LET / WHEN / SHOW / MODEL / AUTOMATE`

Typed series, dependency graphs, deterministic replay, source maps, capability sandboxing and renderer-neutral visual intent are compiler/runtime concerns.

## Stateful mathematics

The canonical bounded-state layer is:

```
RollingSum
RollingMean
RollingVariance
RollingMin / RollingMax
RollingMedian
RollingPercentile
RollingAbsoluteDeviation
EMA
Wilder
ATR
WMA
VWAP
```

The execution rule is:

> A fixed-period historical calculation must not recreate and rescan the same period-sized window for every bar when an equivalent bounded state machine exists.

Implementation strategy:

| Operation | State | Typical hot-path cost |
|---|---|---:|
| Sum / mean | ring buffer + running sum | O(1) |
| Variance / stdev | running moments | O(1) |
| Min / max | bounded extrema tree for append + forming-bar replacement | O(log P) |
| Median / percentile | ordered statistics | O(log P) expected |
| WMA | running weighted state | O(1) |
| EMA / Wilder | recursive state | O(1) |
| ATR | true-range + Wilder state | O(1) |
| VWAP | session accumulator | O(1) |

A monotonic deque remains the preferred structure for scans that have monotone append semantics, including centered extrema. Forming-bar replacement is different: arbitrary point replacement can invalidate a dominated deque entry, so `RollingMinMax` uses a bounded segment tree.

## Fused execution

Compatible deterministic series chains are executed through one chronological traversal with bounded state and one final output buffer. The semantic dependency graph decides fusion eligibility; regex/source-text discovery is not an execution mechanism.

```
source series
  → stateful stage
  → scalar handoff
  → stateful stage
  → final output
```

The current `seriesVector.ts` still contains a second private fused-state implementation. It is bounded and tested, but deduplication into the canonical kernel layer remains open and is tracked explicitly.

## Indicator authoring

Authors should normally express the mathematical calculation directly:

```corespirit
let basis = ema(close, 20)
let upper = basis + atr(14) * 2
show line(basis)
show line(upper)
```

The compiler/runtime absorbs rolling buffers, incremental state and execution planning.

Manual `slice()`, `reduce()`, repeated `Math.max/min` window scans and `sort()` inside a historical loop are prohibited when a canonical kernel can express the same operation.

## Revisions and forming bars

A forming candle is a replacement, not a new historical bar. Stateful kernels therefore support `append` and semantically valid `replace` operations.

A replacement must update the current state slot without advancing the cursor, then repair any dependent state that observes the changed value.

## Dirty spans

CoreSpirit has a causal lookback model and the chart engine can evaluate a bounded affected range plus warmup. This is implemented on the primary backfill path, but it is **not yet universal across every renderer/model collection and overlay type**.

The target is:

```
history mutation
 → dirty [from,to]
 → causal warmup
 → CoreSpirit range execution
 → renderer-neutral range delta
 → Vela replace-range patch
```

The fallback full recomputation path remains legal when a dependency cannot prove a smaller safe range.

## Performance boundary

The runtime should optimize the user's source without expanding CoreSpirit into a large collection of manual optimization keywords. Stateful kernels, semantic scheduling, dirty ranges and fused execution are compiler/runtime machinery.

## v130 deep kernel pass

- Scalar indicator compatibility helpers now route period work through the canonical stateful kernels rather than reconstructing windows with `slice/reduce/spread`.
- The forming-bar replacement path for `RollingMinMax` is corrected so replacement does not advance the rolling cursor.
- The existing numerical kernel tests continue to serve as parity guards.
- Kernel deduplication between `statefulIndicatorKernel.ts` and `seriesVector.ts` remains explicitly open.

## Authority boundary

Indicator and model computation cannot directly authorize broker execution. Risk and execution authority remain outside the numeric VM.
