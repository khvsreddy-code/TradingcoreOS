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

## v126 — Vela interaction and history ingress

Vela now owns the complete Alt quick-tool interaction. Holding **Alt** on the chart opens a radial wheel sourced from the Vela drawing registry. The wheel exposes common line, Fibonacci, shape, text and anchored-VWAP tools, while the center action opens the active Vela panel dock. Editable fields are excluded so Alt remains safe during text entry.

The live workspace no longer mounts a competing React Alt indicator wheel. This keeps input ownership inside the chart engine and avoids duplicate overlays.

The first native Vela history paint uses compact broker columns when available. Vela still exposes `setBarsColumns()`/`updateBarColumns()` to the native renderer, while older compatibility consumers may still receive `OHLCV[]`.

### TCO chrome model

The production chart chrome uses a graphite-black base with royal purple/indigo accents. The duplicate watchlist control is replaced by the **Bookmarks** side panel, and the topbar provides explicit **Panels** and profile/account actions. Workspace state continues through the Vela persistence adapter, with TCO exposing `saveNow()` for scheduled autosave.
