# v116 — Vela columnar boundary + native shell chrome

## Goals

- Make the native Vela renderer consume typed OHLCV columns directly.
- Carry TCO-computed LOD indexes into the native render seam.
- Keep Vela implementation details behind `velaChartFacade`.
- Move Watchlist and Journal onto Vela's native panel button group.
- Move Broker Connection into Vela's actual topbar action cluster.

## Data ABI

```text
TradingCoreOS Chart Contract
        ↓
velaChartFacade
        ↓
TCO Vela Adapter
        ↓
modified Vela
```

The columnar ABI uses `Float64Array` channels for time/OHLC/volume plus an explicit time unit. Object rows remain a compatibility format only.

### Full history

`TcoVelaDataProvider.getBarsColumns()` returns subarray views into the canonical data plane. The Vela feed/orchestrator prefers the columnar path for initial identity-bar loads within the bounded single-load threshold. The orchestrator creates its existing internal object mirror once because native scripting and legacy data-window features still require it.

### Renderer

`NativeRenderer.setBarsColumns()` retains the columns and installs them on the scene. Canvas2D/WebGL2 candle rendering reads OHLC values directly from those typed channels. This avoids the previous `typed columns → N object bars → setBars()` render preparation.

`setLodIndex()` accepts a typed bucket index produced by TCO's LOD subsystem. The compatibility `setReducedCandles()` API is still present but is no longer the native TCO route.

## Shell chrome

### Watchlist

Watchlist is now a `SidePanelDescriptor` projected through Vela's own panel group. It is no longer an absolutely-positioned React button or floating panel. The panel follows the active chart symbol/timeframe and receives live FYERS quote updates.

### Journal

Journal is a second Vela side panel with per-workspace local persistence for notes and context stamping.

### Broker Connection

Broker Connection is a contributed `topbar` action. Vela renders it inside its real topbar action cluster; TradingCoreOS listens for the action event and opens its existing broker settings modal. There is no absolute overlay hovering above the topbar.

## Compatibility boundary

The direct columnar path is intentionally conservative. Bar transforms such as Heikin-Ashi continue through object semantics, and deep/progressive history continues through existing object-compatible feed paths until ranged columnar healing is implemented. This prevents an architectural “zero-copy” claim from becoming a semantic regression.

## Next

1. Convert CoreSpirit native indicator kernels from `OHLCV[]` to typed-series input.
2. Add a ranged columnar backfill ABI so 10k+/deep history remains object-free inside Vela as well.
3. Replace the Vela compatibility mirror for native indicators that have fully migrated to typed inputs.
4. Revisit `SharedArrayBuffer` only after revision and ownership semantics are explicit.


## Deeper v116 pass — live columnar updates

The second v116 pass extends the columnar ABI into the forming-bar path. `DataProvider.subscribeColumns()`, `MarketDataFeed.subscribeColumns()` and `LiveSession` select a `ColumnarBarUpdate` stream when the active chart is an identity series and the renderer exposes `updateBarColumns()`.

This removes the provider-to-renderer `OHLCV` allocation on every live packet. `EngineOrchestrator` still creates one compatibility bar per update because the existing event/session ABI remains object-shaped; that is now an isolated legacy seam rather than the native renderer transport.

`NativeRenderer.setBarsColumns()` also owns a mutable typed buffer even for an empty history response. That matters because a cold/temporarily empty canonical source may be followed immediately by the first live bar; the append path must be safe without assuming that the provider returned a mutable capacity object.

The resulting native flow is:

```text
canonical typed history
       ↓
ColumnarBars
       ↓
Vela-owned typed capacity buffer
       ↓
Canvas2D/WebGL2 candle geometry

canonical forming-bar tail
       ↓
ColumnarBarUpdate
       ↓
NativeRenderer.updateBarColumns()
       ↓
mutate numeric tail / append numeric row
```

`setVisibleRange()` remains untouched as the public viewport seam. TCO never reaches into Vela's coordinate system to preserve zoom or anchor state.
