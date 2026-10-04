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
