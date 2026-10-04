# Vela and charting

## Vendor boundary

```
TradingCoreOS
 ↓
velaChartFacade
 ↓
TCO Vela adapter
 ↓
modified Vela
 ↓
native renderer
```

Application code should not import Vela renderer internals directly.

## Columnar candle API

The native path exposes:

```
setBarsColumns(columns)
updateBarColumns(update)
setLodIndex(index)
setVisibleRange(range)
```

The renderer owns its mutable numeric capacity after the boundary. Forming-bar updates and finalized-bar appends are O(1) mutations.

A legacy OHLCV mirror remains for Vela compatibility consumers, but it is not the preferred candle painting transport.

## Incremental contract

```
history       → setData once
new bar       → append
forming bar   → replace-last
style change  → style patch
marker change → marker range patch
fill change   → fill patch
```

A full replacement is allowed only when identity/order/continuity cannot prove a smaller patch.

## Deep history

```
Vela range request
 → TCO provider
 → ChartDataPlane
 → local cache
 → Fyers only if missing
 → prepend 5,000
 → preserve viewport
```

Retention remains bounded at 50,000 bars.

## LOD

LOD uses typed bucket arrays and source ranges. Legacy reduced-candle object input is compatibility-only.

## Motion

Current Vela defaults are intentionally restrained:

- zoom 260ms
- pan inertia 360ms
- scroll 320ms
- autoscale 260ms
- live-bar easing 180ms

Motion is spatial continuity, not decoration. Motion remains the DOM/UI animation layer; Vela owns chart motion.

## Viewport rule

History prepend must preserve the user's logical/time anchor. Data growth must not automatically refit the chart to the newest candle.
