# Vela Chart Integration

Date: 2026-09-29

## Architecture lock

TradingCoreOS is now locked to this production chart direction:

```text
TradingCoreOS
 ├── CoreSpirit (user language)
 ├── TCO data plane / compute / broker systems
 └── TCO Chart API
       ↓
   Vela NativeRenderer
       ├── WebGL2
       └── Canvas2D fallback
```

Vela is a rendering backend, not a replacement for TradingCoreOS domain ownership. TCO continues to own canonical market data, indicator/model execution, CoreSpirit compilation/runtime, risk, automation and broker authorization.

## Dependency decision

`lightweight-charts` is removed from `package.json` and `package-lock.json`. No PineScript/PineTS compatibility package, translator, runtime helper, public-script catalog or TradingView import path is part of the application architecture.

Community indicators remain a first-class feature, but their unit of distribution is a versioned **CoreSpirit Community Indicator** containing CoreSpirit source, immutable version metadata, settings schema, author/license metadata, documentation and a compiled-artifact identity.

## Vendor boundary

Vela source is vendored under `vendor/vela` with its Apache-2.0 `LICENSE` and `NOTICE`. Application code reaches Vela through:

- `src/services/core/chart/velaChartFacade.ts` — stable chart vocabulary used by the workspace.
- `src/services/core/chart/velaNativeChartRenderer.ts` — implementation of the TCO `ChartRenderer` port.
- `src/services/core/chart/chartRendererFactory.ts` — production renderer selection.

No React component or CoreSpirit module should import Vela directly.

## Data path

```text
Broker/history/live feed
        ↓
Canonical MarketDataStore
        ↓
ChartCore / ChartController
        ↓
TCO Vela adapter
        ↓
NativeRenderer
        ↓
WebGL2 / Canvas2D
```

Realtime forming-bar updates use Vela's incremental `updateBar` seam. Complete history replacement uses `setBars`. The canonical store remains the source for indicators, models and chart rendering.

## Rendering path

CoreSpirit output remains renderer-neutral:

```text
CoreSpirit source
   ↓ compile / IR / VM
Declarative visual output
   ↓
TCO chart output controller
   ↓
Vela series / markers / price lines
```

High-cardinality visuals should remain batched or retained at the TCO layer instead of becoming thousands of DOM nodes or independent browser series.

## Attribution

Vela's bundled `NOTICE` requires visible attribution wherever a chart is displayed. TradingCoreOS therefore keeps Vela's native attribution enabled rather than hiding it. Any future host-level attribution change must provide an equivalent visible notice/link on the same screen before disabling the renderer's built-in mark.

## Deepening roadmap

### D1 — Typed-array ingestion
Add a Vela-native ingestion method that can consume `MarketDataViews` or an equivalent typed-array view contract directly. The current adapter materializes OHLCV objects once per full history replacement; realtime updates remain incremental.

### D2 — Renderer-owned LOD
Connect the existing TCO `ChartLodIndex` to Vela viewport changes so the renderer can select the smallest safe representation for the current pixel density without copying the entire dataset.

### D3 — CoreSpirit render packets
Convert CoreSpirit output into stable render packets keyed by series/visual IDs, allowing plot style changes and point-tail updates without remounting an indicator.

### D4 — Drawings in the native scene
Move TCO drawing primitives into the Vela/TCO retained scene boundary rather than maintaining separate browser overlays for production chart visuals where Vela has an equivalent primitive.

### D5 — Multi-chart synchronization
Use TCO's renderer-neutral visible-range and crosshair contracts to synchronize multiple Vela surfaces without exposing Vela internals to React.

### D6 — GPU budget enforcement
Introduce a chart frame budget and allocation counters: visible bars, active series, draw calls, typed-buffer bytes, overlay nodes and long-task duration. Regression gates should be attached to the contracts rather than manual observation alone.

## Explicit non-goals

- No PineScript compatibility mode.
- No PineTS execution layer.
- No TradingView script importer/catalog dependency.
- No broker capability exposed through Vela.
- No renderer-specific language keywords in CoreSpirit.
- No second production chart vendor.
