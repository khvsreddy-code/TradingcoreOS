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
- `RollingMinMax` with replace-safe bounded segment-tree state; centered extrema use monotonic deques
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

## v128 — deep performance closure

### Stateful mathematical kernels

The canonical CoreSpirit kernel layer now owns bounded-period primitives used by the runtime and market-data indicator engine. The market-data compatibility module is a re-export, so new code does not create a second kernel implementation.

Rolling sum/mean/variance are O(1) append/replace operations; min/max use monotonic deques; median uses bounded dual-heap state; percentile and mean-absolute-deviation use an ordered statistic structure; EMA/Wilder/ATR/WMA/VWAP use persistent state machines. Forming-bar updates use replacement state rather than rebuilding a window.

Standard indicators such as Bollinger, Donchian, Stochastic, CCI and MFI therefore execute as approximately O(N) over history for their bounded rolling portions, with O(log P) expected work only for ordered-statistic operations.

### Columnar deep backfill

Vela's retained history is now columnar through the backward paging path as well as the renderer path. The engine asks the provider for `loadRangeColumns`, prepends the returned typed columns directly into `ColumnarHistoryTape`, and sends the same retained columns to the renderer.

On identity price charts, only the newly introduced compatibility head page is materialized into `OHLCV[]`; the already-retained tail is reused by reference. Full compatibility rebuilding remains isolated to transformed price styles or an explicit fallback.

### Dirty-span closure

Backfill calculates a causal dirty span using the newly prepended region plus the maximum registered lookback. CoreSpirit evaluates that bounded range, `IndicatorModel.dirty` carries the exact time span, `rangeSeriesDelta` finds binary time bounds, and Vela applies `replace-range` only to the changed section.

### Telemetry

Native Vela telemetry now reports p95 frame duration, FPS estimate, 16.67ms frame-budget misses, budget-miss rate, long-frame count and rendering backend. A bounded 240-sample frame history is maintained without per-frame allocation.

Browser verification accepts multiple URLs/cell-count expectations through `TCO_BROWSER_URLS` and `TCO_EXPECTED_CELLS`, with an optional `TCO_MAX_P95_FRAME_MS` gate.

## v129 — latency budget model

The performance model now separates transport, compute, patch and renderer/frame costs. Columnar market data is the preferred transport shape, CoreSpirit indicator state is bounded by lookback/period, and dirty backfills execute only the causal span required to repair an invalidated range.

The 5,000-first / 5,000-backward / 50,000-retention history policy remains fixed.

Browser runtime measurements are intentionally separate from source contracts.


## v130 — kernel closure and quadratic-path removal

The mathematical hot path is now consolidated around one canonical CoreSpirit kernel layer.

- `seriesVector.ts` no longer contains private copies of rolling, median, EMA, change or persistence algorithms; it is an execution/fusion coordinator over `statefulIndicatorKernel.ts`.
- `RollingMinMax` uses a bounded segment tree because forming-bar replacement is a point mutation; this is O(log P) and is the correct trade-off for exact live-bar revisions. Pure append-only centered extrema remain O(1) amortized with monotonic deques.
- `ChangeState` and `RollingPersistenceState` are canonical kernels, so fused execution no longer carries a second implementation of those state machines.
- `src/services/coreSpirit/indicatorKernel.ts` no longer constructs period windows with `slice`, `reduce` or spread min/max. Scalar helpers delegate to bounded kernels or use a single linear loop.
- `structureEngine.ts` no longer computes `atrValue(c.slice(0, i + 1))` for every candidate zone. ATR and rolling volume averages are materialized once and reused, removing the previous quadratic prefix-scan path.
- HMA now uses three bounded WMA states in one chronological traversal instead of creating two full WMA histories plus a raw intermediate series.

- Fractal pivot detection is now linear in history size: high/low windows are evaluated by the centered monotonic-extrema kernel instead of scanning `1..period` for every candidate bar.

### Complexity contract

| Primitive | Append | Forming-bar replace |
|---|---:|---:|
| sum / mean / variance | O(1) | O(1) |
| min / max on replace-capable `RollingMinMax` | O(log P) | O(log P) |
| centered extrema | O(1) amortized | n/a |
| EMA / Wilder / ATR | O(1) | O(1) |
| WMA | O(1) | O(1) |
| median / percentile / MAD | O(log P) expected | O(log P) expected |
| persistence / change | O(1) amortized | O(1) |

The reference parity tests may intentionally use naive window scans because they are test oracles. That does not authorize the same pattern in production indicator code.
