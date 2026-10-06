# TradingCore Scene Graph + Lazy Capability Architecture

## Scene graph

TradingCore/Vela now has a renderer-neutral retained graph behind the native renderer.

```text
Scene
 ├─ panes
 ├─ indicator/layer nodes
 │   ├─ series
 │   ├─ markers
 │   ├─ drawings
 │   ├─ labels
 │   └─ heatmap / instance batches
 └─ future chart-wide layers
```

Every retained node carries a stable id, z-index, visibility, dirty flags, optional viewport bounds, optional data range, style payload and renderer payload. `SceneDirty` separates data, style, layout, transform, visibility and structure invalidation.

The important rule is that a high-cardinality visual is **one retained node with an instance payload**, not 10,000 nodes.

Viewport changes mark transform state. Runtime patches mark data/structure nodes. The renderer can therefore prepare only dirty drawing/heatmap/label work while preserving the existing Vela series path.

## Lazy capability boundary

Drawing families already use metadata + dynamic imports. Native classic indicators now follow the same rule.

The initial Vela composition root keeps the always-useful `volume`/`vpvr` natives, but classic indicators are represented by a small metadata catalog. Their implementation families are loaded on demand:

```text
picker metadata
    ↓
addNativeIndicatorAsync(type)
    ↓
family dynamic import
    ↓
register descriptor
    ↓
native lifecycle
```

The families are averages, bands, oscillators, trend, volatility, volume and overlays.

This keeps the initial chart bundle from importing the entire classic compute catalog.

The synchronous `addNativeIndicator()` path remains for already-registered types and compatibility. Picker-driven surfaces should use `addNativeIndicatorAsync()` for lazy types.

## Next capability boundaries

```text
AI models
  metadata manifest → worker/model chunk

broker adapters
  broker manifest → broker transport chunk

analytics
  capability manifest → compute worker/chunk

heavy chart plugins
  metadata → renderer/plugin chunk
```

The rule is simple: **metadata is cheap and eagerly available; implementation is loaded only when the user actually activates the capability.**

## Rendering boundary today

The retained graph is now the invalidation authority for expensive overlay work:
drawings, labels and high-cardinality instance batches. The canonical candle/series surface still uses Vela's existing optimized typed-buffer paint path. That is intentional: converting every line/candle into an independent offscreen surface would add a large compositing cost without improving the hot path.

The next step toward fully object-dirty rendering is a retained surface cache for series groups, where unchanged series stay in GPU/bitmap resources and only dirty groups re-rasterize. The scene graph ABI is designed to support that without changing CoreSpirit or the public chart API.

## Capability policy

The same metadata-first rule should govern future expensive subsystems:

```text
cheap metadata
    ↓
capability catalog
    ↓
user activation / persisted workspace need
    ↓
dynamic import or worker load
    ↓
live instance
```

That boundary can later host broker adapters, AI model runners, footprint/heatmap compute kernels and advanced analytics without forcing those implementations into the TradingCore OS entry bundle.
