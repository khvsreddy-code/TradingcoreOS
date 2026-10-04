# TradingCoreOS v123 — performance depth pass

Date: 2026-10-04

## Locked performance model

TradingCoreOS now treats performance as one system rather than separate chart, data, language and UI optimizations:

```text
Fyers
  ↓ one bounded 5k request
ChartHistoryCoordinator
  ↓ single-flight + 2 global concurrent requests
ChartDataPlane
  ↓ canonical typed columns + bounded 50k retention
TCO Vela provider
  ↓ explicit range seam
Vela
  ↓ retained 5k page + 5k older pages
Native renderer
  ↓ incremental patches / typed buffers
```

### 1. Initial history

- Initial chart history is **5,000 candles**.
- Fyers requests are hard-capped at 5,000.
- Identical requests are cached and single-flight deduplicated.
- The browser coordinator limits simultaneous history requests to two.
- The chart can paint the first 5k without waiting for unrelated chart cells.

### 2. Deep history

The loaded tape grows in bounded 5,000-candle pages.

When the visible left edge approaches the loaded history boundary:

1. Vela requests a backward range.
2. The TCO provider resolves that range through the shared `ChartDataPlane`.
3. The plane first checks its local history store.
4. Only missing older data reaches the Fyers broker route.
5. The new page is merged at the front while preserving the viewport.
6. The retained tape is capped at 50,000 candles.
7. Repeated requests for the same boundary are suppressed.

This is deliberately **demand-driven**. TradingCoreOS does not pre-download 50k candles merely because the cache can hold them.

### 3. CoreSpirit true kernel fusion

The hot path is:

```text
source bar
  ↓
stage 1 bounded state
  ↓ scalar
stage 2 bounded state
  ↓ scalar
stage 3 bounded state
  ↓
final output[i]
```

A compatible linear CoreSpirit series chain therefore has:

- one chronological traversal;
- one reusable fused cursor;
- bounded state per operation;
- zero history-sized intermediate arrays;
- one final history-sized output array when a historical materialization is required.

EMA/RMA are valid fusion stages because their state is deterministic and local. Effectful or nondeterministic operations remain barriers.

The semantic graph remains the source of eligibility; regex/source-text discovery is not allowed.

### 4. Realtime fusion

Realtime forming-bar revisions restore bounded kernel state instead of rebuilding intermediate history arrays. Cursor snapshots are reused, and stage state is copied in place where the rollback path requires it.

The next deeper optimization is not another array trick. It is **dirty-span execution**: once the typed-series input boundary is complete, only the affected dependency range should be evaluated and only that range should reach the RenderPacket.

### 5. UI and animation

Three.js is intentionally **not** introduced as a UI animation dependency. It is a 3D rendering engine, while TradingCoreOS already has Motion for React/DOM interaction. The chart itself uses Vela's native motion system.

The motion model is now deliberately restrained:

- zoom: 260ms
- pan inertia: 360ms
- scroll: 320ms
- autoscale: 260ms
- forming-bar glide: 180ms
- first-paint reveal: 1.2s in the live workspace

The application also has a 240ms standard UI transition and a reduced-motion override.

Motion exists to preserve spatial continuity, not to make a trading terminal feel animated.

### 6. Visual identity

The production direction is:

- near-black graphite surfaces;
- gray borders and text hierarchy;
- royal purple / indigo accent;
- green/red candles retained for market semantics;
- restrained glow;
- high information density;
- no gradient-heavy dashboard decoration inside the trading terminal.

The purple accent is a TCO identity layer; it does not override market-semantic colors such as bullish/bearish candles.

## Remaining v124 targets

- Direct CanonicalMarketView → CoreSpirit typed-series ingress for every built-in numeric kernel.
- Dirty-span propagation from CoreSpirit → RenderPacket → Vela.
- Shared range revision IDs so history prepend, indicator recomputation and render patching can be correlated without broad invalidation.
- GPU/CPU frame-budget telemetry with allocation and long-task thresholds.
- Further removal of compatibility `OHLCV[]` materialization from non-render compute paths.
