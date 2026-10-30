# TradingCoreOS shared market-data flow

FYERS supplies the latest seven calendar days of standard chart history and the live WebSocket feed. Investiny fills only older validated history within the configured two-to-five-year window. All consumers share one canonical dataset; Vela, CoreSpirit, replay and research must not create competing candle stores.

~~~mermaid
flowchart TD
  F[FYERS REST: trailing 7 days] --> C[Canonical history normalization + cache]
  I[Exact-ID Investiny historical backfill] --> C
  WS[FYERS Data WebSocket: live ticks] --> D[ChartDataPlane: generation/revision fences]
  C --> D
  D --> E[Typed columnar market data]
  E --> G[CoreSpirit incremental compute]
  E --> H[Vela chart and native indicators]
  G --> H
  G --> X[Host risk and execution boundary]
  C --> A[Source health and cache metadata]
  I --> A
  F --> A
~~~

## Boundaries

- `HistoricalDataService.ts` owns source routing, normalized history, cache reconciliation, provenance and source metadata.
- `FyersApiClient.ts` owns the authenticated Data API request gate. `FyersHistoryWindow.ts` enforces the seven-calendar-day range centrally for every standard `/history` caller, including legacy adapters.
- Investiny is historical-only and requires exact server-side asset IDs; its configured floor is applied before provider requests.
- `chartDataPlane.ts` remains the only canonical lifecycle for a broker/instrument/timeframe dataset: accepted history, live trade events, mutations, revisions, generations and subscribers.
- `chartHistoryCoordinator.ts` schedules shared history demand. `HistoryStore.ts` owns bounded browser-side caching.
- `chartCandleEvents.ts` defines dataset key, generation, revision, mutation kind and dirty range. `chartComputeCoordinator.ts` fences stale indicator results.
- `TcoVelaDataProvider.ts` observes the canonical data plane; it must not open independent subscriptions.

## Rules

1. Instrument and derivative contract identities must be exact; never mix expiries or adjustment policies.
2. No ordinary FYERS `/history` request may fetch candles older than the trailing seven calendar days.
3. Older chart history goes to Investiny only when an exact Investing.com ID is configured.
4. Live candle updates come from the FYERS WebSocket; REST history and quote snapshots cannot synthesize live candles.
5. Late history responses are generation-checked before mutation.
6. Corrections/backfills publish dirty ranges and invalidate/replay dependent calculations.
7. Only valid exchange trade timestamps may create or advance live candles; receive time is not trade time.
8. Provider failures open a source-specific circuit; retries are bounded and observable. Runtime auto-fixing must not evade provider access controls or mutate source code.
9. Order intent stays inside host-side risk, capability and broker-execution boundaries.

## FYERS quota policy

Standard Data API limits are 5 requests/second, 50/minute and 5,000/day. TradingCoreOS admits at most 80% through its shared per-user gate (4/second, 40/minute and 4,000/day). This reserves 20% for safety and manual/external use. Every retry is a separately counted provider attempt. Requests made outside TradingCoreOS cannot be included in the internal quota counter.

## Failure policy

If FYERS is disconnected, historical candles can still load from the validated Investiny cache/backfill. The application must show that the live feed is unavailable rather than synthesizing a current candle. If Investiny has no exact mapping, report an unmapped source and retain the last valid data; never guess an instrument or silently mix derivative expiries.