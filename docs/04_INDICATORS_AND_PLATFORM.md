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
