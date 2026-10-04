# Data and performance

## Target hot path

```
Broker / TCO feed
 → CanonicalMarketDataStore
 → typed-array views
    ├─ CoreSpirit
    ├─ indicator kernels
    ├─ analytics
    └─ Vela adapter
 → RenderPacket
 → incremental Vela patch
```

The canonical columns are typed arrays for time/open/high/low/close/volume.

## Worker transport

Canonical worker packets are copied once at the ownership boundary and expose their six ArrayBuffers as transferables. SharedArrayBuffer is deliberately deferred.

The transport boundary is now explicit, but some legacy worker kernels still convert packets into `HistoricalCandle[]`. That conversion is the next removal target; those kernels must not be described as zero-object compute until migrated.

## History

- initial chart load: 5,000 candles
- older demand page: 5,000
- Fyers request cap: 5,000
- retained shared history: 50,000
- identical requests: cached/single-flight
- older history: demand-driven near the visible left edge

## CoreSpirit fusion

The fused executor has a caller-owned-output form:

```executeCoreSpiritFusedSeriesPipelineInto(..., output)```

This reuses the destination and performs one chronological traversal. Bounded state is held per operation. No full historical intermediate array is created between compatible stages.

## Dirty spans — next performance boundary

Every mutation should carry:

```
timelineKey
revision
from
to
reason
```

Only the affected dependency closure should be recomputed. Then the same exact range should be sent to the RenderPacket and Vela.

## Frame budget

Track:

- data→compute latency
- compute→render latency
- patch latency
- allocations/update
- long tasks
- dropped frames
- dirty-span width
- full replacement count

The goal is bounded work per market update, not merely good average throughput.

## Do not

- introduce SAB before ownership/reclamation rules are explicit;
- rebuild 20k points for one live tick;
- add another normalization layer;
- create another chart-vendor abstraction;
- hide full replacements behind methods named “update”.


## v125 — fast chart history contract

The production chart history path is explicitly locked to:

```
Vela first load
  → 5,000 candles
  → interactive immediately
  → visible left-edge trigger
  → exactly one older 5,000-candle page
  → prepend while preserving logical viewport
  → repeat until the 50,000 retention ceiling or source genesis
```

FYERS is queried through the authenticated server route, capped at 5,000 candles per request, with server-side cache and single-flight deduplication. Epoch range boundaries anchor backward pages to exact candle boundaries. FYERS documents that history timestamps identify the start of each candle interval.

The Vela fork uses a 5,000-bar history chunk and a 200-bar left-edge trigger. The TCO provider's `loadRange` routes those requests through the shared ChartDataPlane instead of creating a second history path.

The remaining zero-object work is explicit: the native renderer consumes columnar data, but Vela's orchestration tape still keeps an OHLCV compatibility representation for history/session engines. Removing that last representation is a separate ABI-level migration and must not be hidden behind a misleading function name.

## v126 — compact FYERS → Vela history fast path

The first chart load now has an explicit compact numeric transport for FYERS-capable broker adapters:

```text
FYERS History API
  → compact numeric OHLCV columns
  → TradingCore runtime
  → shared ChartDataPlane
  → CanonicalDataPlane / typed arrays
  → Vela setBarsColumns()
```

The ordinary `HistoricalCandle[]` route remains as a compatibility boundary for secondary/ranged history and APIs that still require objects. The user-visible policy is unchanged: first load is 5,000 candles; left-edge demand fetches another 5,000; retention is capped at 50,000.

`MarketDataStore.replaceColumns()` writes directly into the canonical typed buffers, removing the previous browser-side conversion loop before the first native Vela paint.

### Remaining hot-path debt

The remaining materialization is concentrated in Vela orchestration/history compatibility and ranged/secondary-series consumers. That should be removed only after a true columnar history-tape ABI exists for replay, session windows, drawings and transformed chart types.

## v127 — stateful indicator kernels

All bounded-period math must use incremental state rather than creating a new window per output bar. The implementation now includes:

- `RollingSum` and `RollingMean` with ring-buffer state
- `RollingVariance` using running sum and sum-of-squares
- `RollingMinMax` with monotonic deques
- `RollingMedian` with dual heaps and delayed deletion
- `RollingPercentile` using the ordered multiset's order-statistic selection
- EMA/Wilder/ATR/VWAP state machines
- centered extrema scans implemented as one-pass monotonic-deque traversals

Bollinger, Donchian, Stochastic, CCI, MFI and the standard indicator engine now consume these stateful primitives. Advanced structure/volatility paths were also removed from repeated per-bar rolling scans where bounded state provides the same semantics.

The remaining slices in the indicator engine are either fixed-size pattern checks or whole-group/day calculations; they are not `O(N × period)` rolling windows.

## v127 — Vela columnar history tape

Vela's retained raw history now has a dedicated `ColumnarHistoryTape` source of truth for time/open/high/low/close/volume. The tape is bounded at 50,000 bars and supports replace, prepend, append, replace-last and trim operations without rebuilding the retained object array.

The renderer already owns its own numeric column store, so the Vela orchestration layer now passes numeric history through the columnar seam and materializes `OHLCV[]` only when compatibility consumers explicitly need it.

## v127 — exact dirty-span execution

The data path now carries exact dirty spans from history mutation into script execution. Each CoreSpirit artifact exposes its maximum causal lookback; a prepend re-run includes that warmup before replacing only the affected model range.

This changes the expensive path from:

```
prepend 5k
→ execute all retained history
→ rebuild all plots
→ full renderer replacement
```

to:

```
prepend 5k
→ bounded causal warmup
→ execute affected span
→ replace-range patch
→ preserve untouched series
```

## v127 — frame/backend telemetry

Vela's native renderer records frame-paint duration, worst frame, long-frame count and backend type (`webgl2` / `canvas2d`). VelaWorkspace aggregates those metrics across mounted cells, and TCO ingests them into `chartPerformanceTelemetry`.

Browser verification can inspect `window.__TCO_PERF__`. Actual browser/deployed verification remains a separate environment-dependent gate; source contracts do not claim that a browser session was executed when it was not.

## Performance invariants

1. O(N × period) rolling implementations are forbidden when bounded state can express the same calculation.
2. A live tick updates only the forming-bar state.
3. A 5,000-bar historical prepend does not imply a full retained-series renderer replacement.
4. Columnar data remains the canonical market-data representation through the hot path.
5. Compatibility object materialization is explicit and measurable.
