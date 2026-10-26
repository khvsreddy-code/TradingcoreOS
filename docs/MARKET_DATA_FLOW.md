# TradingCoreOS shared market-data flow

This note documents the shared path used by FYERS, the canonical market data store, CoreSpirit computation, and Vela. It is an incremental architecture guide, not a proposed rewrite.

~~~mermaid
flowchart TD
  A[FYERS REST / streaming] --> B[Quota gate and broker adapters]
  B --> C[Canonical market data]
  C --> D[History reconciliation and revision control]
  D --> E[Typed columnar series]
  E --> F[CoreSpirit dependency graph]
  F --> G[Incremental compute and validation]
  G --> H[Signals, model outputs, visuals]
  E --> I[Vela chart and indicators]
  H --> I
  H --> J[Order intent]
  J --> K[Host-side risk and capability checks]
  K --> L[Broker execution adapter]
~~~

## Ownership boundaries

- src/services/marketData/chartDataPlane.ts owns the lifecycle for one broker/instrument/timeframe dataset: history readiness, accepted trade events, canonical mutation, generation/revision fences, and subscriber publication.
- src/services/marketData/chartHistoryNormalization.ts is a pure normalization boundary for object-history and columnar-history responses. It preserves the existing behavior: reject invalid rows, normalize timestamps, collapse whole-second duplicates, and retain only recognized provenance metadata.
- src/services/marketData/chartHistoryCoordinator.ts owns shared history request scheduling and priority. src/services/marketData/HistoryStore.ts owns the bounded cache/reconciliation behavior.
- src/services/marketData/chartCandleEvents.ts defines the mutation contract—dataset key, generation, revision, mutation kind and dirty range. Append/replace can update incrementally; corrections, backfills and resets require broader invalidation.
- src/services/marketData/chartComputeCoordinator.ts fences stale indicator results by dataset generation/revision. Worker results must not be accepted after a newer correction or chart generation.
- src/TcoVelaDataProvider.ts observes the same chart data plane and patches Vela. It must not open an independent market subscription or treat a partial history cache as proof that the requested history window is complete.

## Revision and lifecycle rules

1. Use the same canonical broker/instrument/timeframe key for mutation publication, downstream computation and Vela observation.
2. Late history responses must be generation-checked before mutation. A response for a prior chart generation is discarded, not merged into the active dataset.
3. Historical corrections/backfills publish the correct dirty range and trigger dependent invalidation/replay. A tail tick must not be promoted into a confirmed candle if its source timestamp/phase does not warrant that.
4. Chart switches detach old subscriptions and fence callbacks/results by dataset generation and key.
5. historyReady means an accepted baseline exists; it does not mean the entire requested history target has been satisfied. Keep the loading state and requested bar count explicit.
6. CoreSpirit temporal semantics remain authoritative: developing/repainting values must not silently become confirmed causal inputs.

## Extracted history-normalization boundary

The first maintainability extraction moved normalizeHistory and columnarHistoryToCandles from the large data-plane orchestrator into chartHistoryNormalization.ts. The orchestration API and data mutation order remain unchanged. chartHistoryNormalization.test.ts protects timestamp normalization, duplicate precedence, invalid-row rejection and provenance metadata. Continue with similarly small extractions only when the existing contract tests preserve the observable behavior.

## Sampled tick-to-render trace

src/services/core/performance/marketLatencyTrace.ts records sampled stages that share a timelineKey and chart revision:

- feed: the accepted tick's processing interval up to the start of canonical mutation.
- canonical: the actual typed-market append/replace interval.
- compute: asynchronous indicator computation completion for that chart revision, including the validated fallback path.
- patch: Vela's synchronous patch callback acceptance interval.
- paint: the next animation-frame opportunity after the Vela callback.

Tracing samples one revision in every 16 by default, stores at most 64 records for each of 32 recent dataset keys, and is diagnostic only. The records are attached to chartPerformanceTelemetry.snapshot(datasetKey).latencyTrace; align entries by timelineKey and sequence to compare stage timing. High-frequency frame coalescing can mean a sampled revision is superseded before patching; the existing aggregate tickToComputeP95Ms, tickToPatchP95Ms and tickToRenderP95Ms metrics remain useful for overall latency even when a sampled trace is incomplete. Do not use trace data as a trading or risk-control input.

## Execution boundary

Market data, indicator outputs, CoreSpirit signal/model outputs, and chart visuals are research/runtime outputs. Order intent must continue through host-side capability validation, pre-trade risk checks, idempotency and the broker adapter. Never let a Vela callback or model/AI response bypass these controls.
