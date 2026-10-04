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
