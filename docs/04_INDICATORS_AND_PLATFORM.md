# Indicators and platform

## Indicator artifacts

An indicator is a first-class CoreSpirit component with published:

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

The UI consumes the artifact schema instead of hardcoding individual indicator controls.

## Universal parameters

```
number, integer, decimal, boolean, enum, color,
source, timeframe, symbol, session, price, duration, string
```

Parameters may define min/max/step/default/group/tooltip/dependency/visibility/validation.

Example:

```
Method = Adaptive
  → show Adaptation Length
  → show Sensitivity
  → show Noise Filter

Method = Fixed
  → hide those fields
```

Changing appearance alone must never trigger mathematical recomputation.

## Dependency graph

The semantic dependency graph is authoritative for composability, dirty-span propagation, fusion eligibility, incremental recomputation and cache reuse.

Regex discovery is not an architecture.

## Community indicators

The public concept is **CoreSpirit Community Indicators**. They are CoreSpirit artifacts, not Pine imports.

## Performance

Prefer incremental kernels:

- EMA/RMA state
- rolling mean/variance
- monotonic min/max deques
- bounded median state
- VWAP session state
- ATR state

Avoid repeated full-array slice/reduce/sort work when bounded state produces the same result.

## Authority boundary

Indicator/model computation cannot directly control the broker. Execution remains a separate authority layer.

## Public CoreSpirit scripts

The community publication model now treats `indicator` and `strategy` as explicit CoreSpirit script kinds. Public discovery is available through `/explore/indicators` and the unified `/explore/scripts` hub, with the same source-inspection, author metadata, install/view accounting and Supabase publication model.

A publication carries `script_kind` so the catalog does not infer strategy-vs-indicator semantics from naming or source text. CoreSpirit remains the only user-facing scripting language; there is no PineScript/PineTS compatibility layer.

## v127 — indicator computation contract

Indicator implementations are split into two paths.

**Stateful incremental path** for bounded rolling math:
```
RollingSum · RollingMean · RollingVariance
RollingMin/Max · RollingMedian · RollingPercentile
EMA · Wilder · ATR · VWAP
```

**Structural/semantic path** for pattern logic where the window is not a simple rolling statistic. Even there, centered extrema and other bounded lookbacks use monotonic state instead of repeated array slicing.

The standard indicator set — including Bollinger, Donchian, Stochastic, CCI and MFI — stays on the stateful lane for live updates and historical execution.

## Dirty-range indicator execution

A CoreSpirit artifact publishes `maxLookback`. During history backfill, only the newly introduced region plus the causal warmup is recomputed. The generated `IndicatorModel` carries `dirty` so Vela can issue a `replace-range` patch rather than treating the model as a full replacement.

Appearance-only settings remain isolated from mathematical recomputation.

## Public scripts

The public publication model treats `indicator` and `strategy` as explicit CoreSpirit script kinds. Public discovery is available through `/explore/indicators` and `/explore/scripts`. No PineScript/PineTS compatibility layer is involved.

## Performance rule for authors

Do not write per-bar window construction such as:

```
slice(...)
Math.max(...)
Math.min(...)
reduce(...)
sort(...)
```

inside historical loops when a canonical stateful kernel exists. The compiler/runtime should absorb this complexity so CoreSpirit scripts remain simple while execution stays bounded.

## v128 — one canonical stateful kernel layer

`src/services/coreSpirit/statefulIndicatorKernel.ts` is the canonical bounded-state math layer. The older market-data kernel module is now a compatibility re-export, preventing the two subsystems from drifting into separate implementations.

Every bounded rolling primitive supports `append` and, where semantically valid, `replace` for a forming candle. Authors should express the calculation normally in CoreSpirit; the runtime absorbs ring buffers, monotonic queues and ordered statistics.

The standard rolling family covered by this architecture includes Bollinger, Donchian, Stochastic, CCI, MFI, rolling median/percentile, EMA/RMA, ATR and VWAP. A bounded structural algorithm may still use a fixed-size or centered scan when its cost is independent of user-selected period, but arbitrary `O(N × period)` window construction is prohibited.

## v129 — indicator complexity contract

| Family | Hot-path state | Complexity per bar |
|---|---|---:|
| SMA / rolling sum | `RollingMean` / `RollingSum` | O(1) |
| Bollinger / variance | `RollingMean` + `RollingVariance` | O(1) |
| Donchian / rolling extrema | bounded segment tree with point replacement | O(log period) |
| Stochastic | bounded extrema + smoothers | O(log period) |
| CCI / MAD | running mean + ordered state | O(log period) |
| MFI | rolling positive/negative sums | O(1) |
| Median / percentile | dual heap / ordered multiset | O(log period) expected |
| EMA / Wilder / ATR | recursive state | O(1) |
| VWAP | session accumulator | O(1) |

Grouping, pivot and structural indicators may use different state machines when their semantics require them. The hard rule is that a historical loop must not rebuild and rescan the same period-sized window for every bar.
