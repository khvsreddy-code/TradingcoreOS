# Vela and charting

Vela is TradingCoreOS's sole charting/rendering engine. Application code crosses into it through TCO-owned facades/adapters.

## Boundary

```
TradingCoreOS
 → velaChartFacade
 → TCO Vela adapter/provider
 → modified Vela
 → native renderer
```

TCO feature code should not depend directly on Vela renderer implementation classes.

## Canonical columnar data plane

The **canonical columnar data plane** is the numeric OHLCV boundary from TCO into Vela. The production identity-chart path feeds the **Vela NativeRenderer** from typed columns rather than using object rows as the render transport.

**Object materialization** remains an explicit compatibility operation for consumers that have not migrated to the columnar ABI. The native LOD path targets **zero-object LOD**: reduced geometry is represented as typed bucket/index data instead of repeatedly constructing reduced candle objects.

## Columnar retained history

`ColumnarHistoryTape` is the retained raw-history source of truth for identity OHLCV charts.

It supports:

- typed time/open/high/low/close/volume columns
- binary time lookup
- append
- replace-last
- prepend
- bounded trim
- 50,000-bar retention

The native renderer consumes typed columns. The user-visible history flow is:

```
5,000 initial
 → left-edge trigger
 → 5,000 older
 → preserve logical viewport
 → repeat
 → 50,000 maximum
```

### Important status

This is **not yet a zero-object end-to-end Vela tape**.

Selected Vela consumers still use explicit `OHLCV[]` projections for compatibility, especially where existing replay/session/drawing/transformed-price APIs have not migrated to a columnar ABI. The native candle renderer is not dependent on those objects, but the compatibility mirror cannot be removed until those consumers are converted.

## Rendering patch model

The preferred mutation classes are:

```
initial history → set data
new bar        → append
forming bar    → replace-last
older page     → prepend
style change   → style patch
localized data → replace-range
```

A full replacement is only valid when identity/order/continuity or a dependency contract prevents a smaller patch.

## Dirty-range bridge

The primary CoreSpirit/Vela history path can produce a causal dirty range and convert it into a binary-bounded range delta.

**Current status: partial completion.** The bridge is real, but not all renderer-owned collections and overlay categories are guaranteed to preserve one exact dirty span end-to-end. This is one of the three remaining deep architecture phases.

## Motion

Chart motion belongs to Vela. Current restrained defaults are:

- zoom: 260ms
- pan inertia: 360ms
- scroll: 320ms
- autoscale: 260ms
- forming-bar easing: 180ms

DOM/UI motion remains with Motion/CSS. Three.js is not used for ordinary DOM animation because it would create an unnecessary rendering subsystem for the terminal.

## Alt drawing wheel

Holding Alt on the chart opens the Vela-owned drawing wheel. It is populated from the Vela drawing registry and includes common line, Fibonacci, shape, text and anchored-VWAP tools. The center action opens the active panel dock.

The React workspace does not mount a competing Alt wheel.

## Workspace persistence

Vela workspace state is persisted through the TCO Supabase adapter with a local fallback. The live workspace schedules a 15-minute autosave.

Persisted state includes the chart/layout state used for the user experience: symbol/timeframe, drawings, indicators, panels, layout and related Vela workspace state.

## Performance telemetry

Vela exposes frame/backend statistics and TCO aggregates stage-level telemetry. The browser verifier reads `window.__TCO_PERF__`.

**Runtime browser verification is still open.** Source contracts do not claim that authenticated browser or GPU measurements have been captured.

## v130 boundary cleanup

The canonical stateful mathematical path is now separated from the legacy scalar compatibility helpers. Vela's retained history remains columnar by default, while compatibility object materialization stays explicit and tracked.

## Three remaining deep phases

1. **True columnar history ABI completion** — migrate the remaining Vela session/replay/drawing/transform consumers and remove the compatibility mirror.
2. **Exact dirty-span completion** — carry one proven causal range through CoreSpirit → renderer/model packets → Vela invalidation for every supported overlay collection.
3. **GPU/frame runtime verification** — capture actual browser measurements for 1/4/8 charts, 5k load, 5k prepend and live ticks; add GPU telemetry only where the browser/backend can provide meaningful counters.

## Historical renderer migration notes

The old standalone renderer migration document has been retired. Durable renderer-boundary information lives here; superseded implementation notes remain in `docs/archive/history/`.
