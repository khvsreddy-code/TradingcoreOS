# CoreSpirit — language and scripting

CoreSpirit is TradingCoreOS's native language for indicators, models, visuals and automation.

## Compiler model

```
source → CST/tokens → normalized AST → semantic model → IR → one VM/reactive runtime
```

Users write CoreSpirit; they do not need to write IR or renderer code.

## Foundations

### DATA
```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")
```

### LET
```corespirit
let fast = ema(close, 20)
let slow = ema(close, 50)
let spread = fast - slow
```

### WHEN / IF
```corespirit
when close > fast
  show marker(high, "above", "breakout")

if close > slow
  show line(fast)
```

### SHOW
SHOW publishes renderer-neutral visual intent: series, line, marker, label, box, zone, fill, level, background and related visual primitives.

### MODEL / AUTOMATE
MODEL consumes a model artifact. AUTOMATE declares automation intent. Broker authority remains outside the numeric VM.

## Common built-ins

```
ema(source, length)
sma(source, length)
rsi(source, length)
atr(length)
highest(source, length)
lowest(source, length)
change(source)
pctchange(source)
zscore(source, length)
normalize(source, length)
median(source, length)
```

Context helpers include `market()` and `timeframe()`.

## Indicator example

```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")

let basis = ema(close, 20)
let deviation = atr(14)
let upper = basis + deviation * 2
let lower = basis - deviation * 2

when close > upper
  show marker(high, "above", "breakout")

show line(basis, "Basis", "#7c5cff", 2)
show line(upper, "Upper", "#94a3b8", 1)
show line(lower, "Lower", "#94a3b8", 1)
```

## Settings

Indicator parameters can be number, integer, decimal, boolean, enum, color, source, timeframe, symbol, session, price, duration or string.

Parameters can publish default, min/max/step, group, tooltip, dependency, visibility and validation.

Appearance-only changes must not trigger mathematical recomputation.

## Authoring rules

1. Name calculations with LET.
2. Prefer built-ins over manual rolling loops.
3. Keep visual declarations separate from numeric calculations.
4. Keep scripts deterministic for replay.
5. Declare multi-symbol/timeframe dependencies explicitly.
6. Do not make indicators or models broker authorities.

## Performance

A compatible chain such as:

```
close → EMA → difference → normalization → signal
```

is executed as one chronological traversal with bounded state. Eligibility comes from the semantic dependency graph, not regex/source-text discovery.

## Stateful math is part of CoreSpirit's execution contract

CoreSpirit built-ins lower to stateful kernels whenever the operation has bounded rolling state. The canonical kernel family is:

```
RollingSum · RollingMean · RollingVariance
RollingMin · RollingMax · RollingMedian
EMA · Wilder · ATR · VWAP
```

Ring buffers retain the bounded input state. Monotonic deques handle rolling extrema. Running sums and sums-of-squares handle mean/variance. Exact rolling median uses dual heaps with delayed deletion; percentile/rank operations use the ordered multiset. These primitives let a historical pass remain approximately O(N) for fixed-period indicators instead of repeatedly creating and scanning windows.

Authoring rule: prefer the built-in/stateful primitive over hand-written `slice()/Math.max()/Math.min()/reduce()/sort()` loops.

## Causal dirty spans

Every CoreSpirit prepared artifact can expose its maximum causal lookback. When older chart history is prepended, Vela supplies an exact dirty timeline and CoreSpirit executes only the affected range plus the required causal warmup. The resulting model carries the same dirty span into Vela's range patch layer.

```
history prepend
  → dirty.from / dirty.to
  → maxLookback warmup
  → CoreSpirit range execution
  → renderer-neutral model
  → replace-range patch
```

A full historical re-run remains the compatibility path for operations without a valid bounded causal range.

## v129 — bounded indicator state

CoreSpirit rolling mathematics now uses bounded state machines rather than period-window reconstruction. Sums/means use running aggregates, variance maintains running moments, extrema use monotonic deques, median/percentile use ordered state, and EMA/Wilder/ATR/WMA/VWAP retain incremental state.

The legacy indicator compatibility surface was rewritten to remove repeated `slice`, `reduce`, sort and spread max/min patterns. Full-history callers should use the vector/fused path or the new `*Series` helpers.

`seriesVector.ts` remains a deduplication target because it still carries private fused-state implementations even though those implementations are bounded and linear.


## v130 — canonical kernel ownership

The CoreSpirit fused executor is now strictly an orchestration layer over the canonical stateful kernel module. Rolling sum/mean/variance, extrema, median/percentile, WMA, EMA/Wilder, change and persistence state are not reimplemented inside `seriesVector.ts`.

This is an execution invariant, not merely a style preference: one kernel definition means one set of numerical semantics, one replacement model for forming candles, and one place to optimize allocation/state behavior.
