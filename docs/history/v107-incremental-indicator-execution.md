# TradingCoreOS v107 — Incremental Indicator Execution

Date: 2026-09-29

CoreSpirit language/compiler/IR/VM remains **v98**. v107 is a chart-host and indicator-execution performance milestone following the v106 dependency-graph work.

## Why v107 exists

A dataset revision is intentionally coarse-grained: the candle array can remain the same object and keep the same revision while its final forming candle changes. A revision-only indicator cache can therefore return values calculated from an earlier price/volume state.

The former hot path could also repeatedly run period-window operations for each new tick. For a period `p` across `n` bars, patterns such as:

```text
slice(window)
Math.max / Math.min
reduce(...)
```

inside the bar loop behave approximately as O(n × p).

v107 establishes a stateful execution lane:

```text
snapshot → seed state once → worker residency
                                  ↓
forming tick → replace current state/output
new candle   → append one state/output
                                  ↓
                         renderer tail update
```

## Stateful kernel

`src/services/marketData/incrementalIndicatorKernel.ts` contains the reusable building blocks:

| State | Purpose | Typical update cost |
|---|---|---:|
| `RollingMean` | fixed-window mean | O(1) |
| `RollingVariance` | population variance/stddev | O(1) |
| `RollingMinMax` | rolling high/low | O(log p) expected |
| `RollingSum` | positive/negative flow totals | O(1) |
| `RollingAbsoluteDeviation` | exact CCI MAD | O(log p) expected |
| `EMAState` | EMA with seed + recursive tail update | O(1) |
| `WilderState` | RMA/Wilder smoothing | O(1) |
| `ATRState` | true-range + Wilder state | O(1) |
| `WMAState` | append-efficient weighted moving average | O(1) append; O(p) exact replace |
| `VWAPSessionState` | session PV/volume accumulation | O(1) |

Rolling structures support same-bar replacement. This matters because the active candle can change hundreds of times before the next timeframe bucket is opened.

### Exact CCI treatment

CCI cannot derive mean absolute deviation from only `sum` and `sumSquares` without changing the formula. v107 therefore uses an ordered multiset with subtree counts and sums. For current mean `m`, the exact MAD is calculated from the values on each side of `m` without scanning the window.

### WMA replacement caveat

The append recurrence is constant time. Exact replacement of the newest value reconstructs the bounded active window because changing the latest input affects every weighted contribution. This remains bounded to the selected period rather than replaying the entire dataset.

## Standard incremental coverage

The v107 runtime supports:

```text
EMA
SMA
HMA
VWAP
Bollinger Bands
Keltner Channels
Donchian Channels
RSI
MACD
ATR
ADX
Stochastic
CCI
OBV
MFI
Supertrend
Ichimoku Cloud
```

The native batch functions for Bollinger, Donchian, Stochastic, CCI, MFI, HMA and Ichimoku were also refactored to use rolling-state passes. This prevents a slow fallback or legacy caller from immediately reintroducing the same O(n × p) scans.

## Advanced incremental coverage

Six advanced studies now have a stateful path:

```text
Adaptive Ehlers
Fractional EMA Kalman Filter
Trend Pressure
Trend Target Ribbon
Trinity
Neural Weight Oscillator
```

The shared `normalized()` and standard-deviation helpers used by several advanced indicators now run from rolling mean/variance state rather than slicing and reducing each window.

The remaining advanced studies continue to use their existing native batch implementations until their state dependencies can be specified without changing formulas or lifecycle semantics.

## Worker protocol

The indicator worker accepts two execution modes:

```text
mode = snapshot
  candles[] required
  may prime incremental state

mode = incremental
  bar required
  operation = replace | append
  candles[] only when the state must be seeded or resynchronized
```

A worker-resident runtime has a configuration signature. A changed indicator configuration, a forming-bar identity mismatch, or a non-monotonic append marks the state as requiring a reset.

The coordinator responds to reset by sending one full seed payload. Ordinary ticks remain bar-only.

## Worker affinity

Incremental state exists inside an indicator worker. The coordinator therefore pins both the snapshot that primes the state and all subsequent forming-bar requests to the same per-chart incremental affinity key.

```text
chart dataset
     + chart identity
          ↓
   incrementalKey
          ↓
 indicator worker affinity
          ↓
 resident IncrementalIndicatorRuntime
```

This avoids the incorrect assumption that a stateful runtime can be addressed as though it were browser-global state.

## Cache identity and same-bar updates

Snapshot cache identity is now sensitive to the tail candle's OHLCV tuple in addition to dataset revision/window/configuration. This is a correctness safeguard for APIs that still use snapshot execution on a changed forming bar.

The preferred live path bypasses the full snapshot cache entirely:

```text
same timestamp → replace
next timestamp → append
```

## Renderer contract

The calculation worker returns a complete array for a snapshot seed and a one-point patch for an incremental update.

The chart renderer maps those shapes differently:

```text
snapshot      → setData(fullSeries)
incremental   → update(latestPoint)
```

Multi-output studies update all affected outputs together:

```text
MACD       → macd + signal + histogram
Stochastic → %K + %D
Channels   → upper + middle + lower
Supertrend → active direction + whitespace on inactive side
Ichimoku   → tenkan + kijun + spanA + spanB
Ribbon     → fast + mid + slow + targets
```

Legacy studies can still be redrawn, but they no longer force already-primed worker indicator series to be destroyed and recreated on each tick.

## Indicator dialogue UX

The live Indicators dialogue now uses a compact settings gear and `Code` action for each active indicator.

```text
Indicator
  ⚙ settings
  <> code
  hide
  remove
```

The settings panel's header also exposes the same code action. `IndicatorCodeViewer` displays the source registered by `indicatorSourceTemplates.ts`, with copy support.

The viewer is intentionally separate from Indicator Studio. The existing Studio editor remains the source-edit/save workflow; the dialogue action is a fast inspection path.

## Performance model

For `N` historical bars and period `P`:

```text
old rolling-window family:
  approximately O(N × P)

v107 rolling state:
  approximately O(N) for mean/variance/sum/EMA/Wilder/ATR/VWAP
  approximately O(N) amortized for min/max; approximately O(N log P) expected for exact MAD
```

Live behavior changes more dramatically than the historical asymptotic alone suggests:

```text
old tick:
  recompute historical arrays
  allocate mapped output
  replace chart series

v107 tick:
  update state for one bar
  allocate one patch
  update chart tail
```

## Non-interference boundaries

v107 does not change:

- CoreSpirit v98 grammar/compiler/IR/VM semantics.
- Broker execution or risk authority.
- Shared broker:symbol realtime subscription ownership.
- Chart-local viewport/drawing ownership.
- Terminal dock ownership.

It changes only indicator compute residency, indicator cache correctness, and the chart's consumption of incremental result patches.

## Validation status

Completed in the archive environment:

- Standard-indicator numerical parity, including same-bar replacement.
- State-reset/WMA recurrence correctness checks.
- Static v107 contract checks.
- Full repository Markdown inventory and architecture/tracker alignment.

Not completed because the uploaded archive did not retain a complete dependency install:

- Full dependency-backed TypeScript typecheck.
- Full Vite production build.
- Connected FYERS multi-chart/tick-rate/FPS browser stress test.
