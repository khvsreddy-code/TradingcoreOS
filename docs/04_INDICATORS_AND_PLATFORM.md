# Indicators and platform

## Indicator artifacts

Indicators are first-class CoreSpirit components with published:

- identity
- inputs
- calculations
- state
- events
- plots
- visuals
- alerts
- pane/scale/display behavior
- settings schema

The UI reads artifact metadata instead of hardcoding indicator-specific control panels.

## Universal parameters

```
number, integer, decimal, boolean, enum, color,
source, timeframe, symbol, session, price, duration, string
```

Parameters may publish min/max/step/default/group/tooltip/dependency/visibility/validation.

Appearance-only changes must not trigger mathematical recomputation.

## Canonical computation path

Standard bounded indicators use the shared CoreSpirit stateful kernel layer:

| Indicator family | Canonical state |
|---|---|
| Bollinger | rolling mean + variance |
| Donchian | bounded min/max |
| Stochastic | bounded high/low + smoothers |
| CCI | rolling mean + ordered MAD |
| MFI | rolling positive/negative sums |
| Median / percentile | dual-heap / ordered statistics |
| EMA / RMA / ATR | recursive state |
| WMA | weighted rolling state |
| VWAP | session accumulator |

This is one mathematical implementation shared by CoreSpirit and the market-data incremental engine.

### Forming-bar correctness

A forming bar is replaced in place. The `RollingMinMax` implementation repairs its current tree slot without advancing the ring cursor; this prevents a quote update from silently behaving like an additional historical bar.

## Complexity rule

A historical loop must not do this when an equivalent state machine exists:

```
window = values[i-period+1 ... i]
scan(window)
```

The compiler/runtime should absorb the data structures. CoreSpirit authors keep the source declarative.

Reference tests may intentionally retain slow windowed algorithms for parity checking; those are not production execution kernels.

## Dependency graph

The semantic dependency graph is authoritative for:

- composability
- dirty-span propagation
- fusion eligibility
- incremental recomputation
- cache reuse

Regex/source-text discovery is not an architecture mechanism.

## Public CoreSpirit scripts

Public publication uses an explicit `script_kind`:

- `indicator`
- `strategy`

The public catalog exposes `/explore/indicators` and the unified `/explore/scripts` hub. CoreSpirit remains the only scripting language; there is no PineScript/PineTS compatibility layer.

## Community indicators

The public concept is **CoreSpirit Community Indicators**. Published artifacts carry author metadata, settings, source visibility and install/view accounting through the Supabase publication model.

## Structure/advanced indicators

Not every advanced indicator reduces to a scalar rolling statistic. Pattern/structure features can use semantic session grouping, confirmed swings, fixed-size candle relationships, centered extrema or other purpose-built state. Those paths are evaluated against their actual dependency/complexity rather than being mislabeled as generic O(1).

## v131 indicator math cleanup

The scalar indicator kernel delegates to `statefulIndicatorKernel.ts`, and the `seriesVector.ts` fused executor now uses the same canonical Rolling/EMA/Wilder/WMA/change/persistence classes. There is no second private median/heap/rolling-state implementation.

The remaining optimization target is execution granularity: exact dirty spans must eventually flow through every indicator/render packet consumer rather than falling back to broad series replacement.

## Authority boundary

Indicator/model computation cannot directly control broker execution. Risk, order authority and broker interaction stay outside the numeric VM.


## v130 incremental-kernel status
Bollinger, Donchian, Stochastic, CCI and MFI standard paths already use canonical rolling kernels. Runtime RSI/ATR/session VWAP now use the same stateful kernel family and no longer maintain history-sized hot arrays for those calculations.


## v107 incremental indicator execution

CoreSpirit and the market-data indicator engine use bounded incremental kernels for repeated indicator updates, with tail-only forming-bar updates where the data-plane contract permits. IndicatorCodeViewer remains available for source inspection without introducing a second scripting language.


The canonical bounded kernel family includes `RollingAbsoluteDeviation` for ordered-MAD calculations and robust dispersion metrics.

Forming-bar indicator updates use `series.update`/tail-update semantics where the renderer/data-plane contract permits.
