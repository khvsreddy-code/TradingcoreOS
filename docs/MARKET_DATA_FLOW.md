# TradingCoreOS shared market-data flow

Provider history sources feed one canonical history service. An authorized NSE gateway is primary, Investiny is a best-effort history-only fallback for explicitly mapped non-derivatives, FYERS is the quota-aware broker fallback (especially for options/F&O), and compatible tvdatafeed history remains a legacy fallback. Vela, CoreSpirit, replay and research must not make competing independent candle stores.

~~~mermaid
flowchart TD
  A[Authorized NSE gateway] --> R[Capability router and source health]
  R -->|NSE healthy| N[Validated NSE bars]
  R -->|NSE down: historical data| I[Exact-ID Investiny adapter]
  R -->|F&O / backup unavailable| F[FYERS plan-aware API gate]
  N --> C[Canonical history normalization and cache]
  I --> C
  F --> C
  C --> D[ChartDataPlane: generation/revision fences]
  D --> E[Typed columnar market data]
  E --> G[CoreSpirit incremental compute]
  E --> H[Vela chart and indicators]
  G --> H
  R --> X[Auto-fixer: circuit, cooldown, half-open probe]
  X --> R
~~~

## Boundaries

- \`src/server/marketData/HistoricalDataService.ts\` owns source routing, normalized history, cache reconciliation, provenance and source metadata.
- \`src/server/marketData/MarketDataAutoFixer.ts\` owns bounded runtime recovery. It never writes or patches application source code.
- \`src/services/marketData/chartDataPlane.ts\` remains the only canonical lifecycle for a broker/instrument/timeframe dataset: accepted history, live trade events, mutations, revisions, generations and subscribers.
- \`chartHistoryCoordinator.ts\` schedules shared history demand. \`HistoryStore.ts\` owns bounded browser-side caching.
- \`chartCandleEvents.ts\` defines dataset key, generation, revision, mutation kind and dirty range. \`chartComputeCoordinator.ts\` fences stale indicator results.
- \`TcoVelaDataProvider.ts\` observes the canonical data plane; it must not open independent subscriptions.

## Rules

1. Instrument and derivative contract identities must be exact; do not mix expiries or adjustment policies.
2. Late history responses are generation-checked before mutation.
3. Corrections/backfills publish dirty ranges and invalidate/replay dependent calculations.
4. Only valid exchange trade timestamps may create or advance live candles; receive time is not trade time.
5. \`historyReady\` means an accepted baseline exists, not that the requested window is complete.
6. Quote snapshots never become fabricated OHLCV bars.
7. Provider failures open a source-specific circuit; cooldown expires into one probe, and a validated NSE response automatically restores the primary route.
8. Runtime auto-fixing must not evade provider access controls or mutate source code. Order intent still passes through host-side risk and capability checks.

## Deployment constraint

NSE routing is a private adapter contract—not a bundled feed or scraper. Configure \`NSE_MARKET_DATA_SERVICE_URL\` and \`NSE_MARKET_DATA_SERVICE_TOKEN\` for an authorized gateway implementing \`POST /v1/history\`. Investiny requires explicit opt-in, an exact ID map and permitted data usage. The existing FYERS transport remains the live-feed fallback; a true NSE live adapter needs the licensed provider's actual stream protocol.
