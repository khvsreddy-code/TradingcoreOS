# TradingCoreOS Indicator Dependency Graph Architecture

## Purpose

Move indicator execution from independent study-by-study calculation toward a shared dependency graph. Repeated mathematical primitives are computed once per dataset/revision/compute window and then consumed by multiple indicators.

## Canonical graph

```text
OHLCV
  │
  ├── source(close / hlc3 / ...)
  │       ├── EMA / SMA
  │       ├── WMA → HMA
  │       ├── RSI
  │       └── VWAP
  │
  └── true-range
          └── ATR
                ├── Keltner Channels
                └── Supertrend

EMA fast ───────┐
EMA slow ───────┼──→ MACD → signal EMA

SMA ─────────────────→ Bollinger Bands
rolling high/low ────→ Donchian Channels
```

The dependency planner is explicit through `buildIndicatorDependencyGraph()`. Worker evaluation uses a dataset/revision cache so two studies requesting the same primitive do not recompute it.

## Cache identity

```text
broker:symbol:timeframe
        + revision
        + compute window
        + mathematical node key
```

Presentation metadata is intentionally excluded from mathematical cache identity. Changing a color, line width, line style, opacity, legend visibility or similar display setting must reuse the calculation and only update chart presentation.

## Worker ownership

```text
ChartComputeCoordinator
        ↓
shared indicator worker pool (≤ 2)
        ↓
IndicatorDependencyGraph cache
        ↓
primitive nodes + composite results
```

The worker cache is revision-scoped and window-aware. A partial result from one viewport cannot leak into another viewport for the same dataset revision.

## Compute window

The chart renderer may retain substantially more history than it sends to a worker. `selectIndicatorComputeWindow()` centers the worker input around the logical viewport with bounded warmup bars and a hard 10,000-candle ceiling.

This is an execution optimization, not a semantic request to truncate the `HistoryStore`.

## Indicator appearance contract

Indicator configuration contains renderer-neutral appearance metadata:

```text
primary color
signal color
upper color
lower color
line width 1–6
line style solid / dotted / dashed
opacity 0.15–1
```

The appearance editor is available from the chart's Indicators menu and the Indicators page. Style changes persist through the existing `saveIndicators()` path and do not invalidate mathematical computation caches.

## Future graph extensions

Additional reusable nodes can be added without changing the host contract: directional movement/ADX, rolling highest/lowest, standard deviation, stochastic smoothing, volume transforms, and fused multi-output indicators.

## v106 graph depth + linear rolling kernels — 2026-09-29

The dependency graph now models transitive base dependencies explicitly. Composite nodes must expose their upstream source/base nodes even when a user did not separately request the intermediate study:

```text
source → SMA → Bollinger
source → EMA → Keltner
TR → ATR → Keltner / Supertrend
source → EMA(fast/slow) → MACD → signal EMA
source → WMA → HMA
```

`buildIndicatorDependencyGraph()` now returns a deterministic topological order and rejects cycles. This makes the graph a real execution plan rather than only a documentation structure.

Two hot rolling kernels were also tightened:

- WMA uses a rolling-sum / rolling-weight recurrence instead of rescanning every period window.
- Donchian highest/lowest uses monotonic deques with head indices instead of nested period scans.
- Bollinger variance uses rolling sum and sum-of-squares instead of slicing and reducing each window.

These changes preserve the indicator formulas while making repeated dependency evaluation closer to O(n) for the rolling primitives.

## v106 indicator presentation contract

Indicator math and indicator presentation are separate data. The renderer applies persisted style metadata without invalidating the dependency graph:

```text
math identity:
  kind + inputs + periods + multipliers + source

presentation identity:
  color(s) + line width + line style + opacity + display flags
```

The chart Indicators menu provides schema-driven editing for primary, signal, upper/lower colors, line width, line style and opacity. The persisted indicator configuration remains the single source of truth, while the schema defines how those values are presented.

## v107 incremental execution lane — 2026-09-29

The v106 dependency graph remains the canonical **snapshot planning** model. v107 adds a separate stateful execution lane for forming-bar updates so the graph's reusable mathematical definitions can be consumed without replaying the historical dataset on every tick.

```text
snapshot / history change
        ↓
 dependency graph plan
        ↓
 linear seed + graph result
        ↓
 resident incremental state
        ↓
 replace / append tail update
```

The current incremental runtime keeps one state object per active normalized indicator configuration. This is deliberate for safety during the first stateful rollout: it prevents accidental double-updates when multiple configured indicators happen to represent the same mathematical node. The dependency graph continues to own cross-indicator node sharing for snapshot evaluation.

The long-term convergence target is a single node-addressed incremental state store keyed by the same canonical mathematical node identifiers used by the dependency graph. Until that convergence is implemented, the two lanes are required to remain numerically equivalent and are checked through parity tests.

### v107 reset contract

An incremental state must be discarded and reseeded when any of the following occurs:

```text
configuration signature changed
forming-bar timestamp changed during replace
append timestamp is not strictly newer
worker state was lost/recycled
```

A reset is correctness-first. The coordinator sends one full seed payload; ordinary forming ticks remain bar-only afterward.

### v107 compute identity

Mathematical identity remains:

```text
kind + source + periods + multipliers + model inputs
```

The forming candle's current OHLCV tuple is an execution-state input, not a new CoreSpirit language construct. Presentation metadata remains outside the mathematical identity.
