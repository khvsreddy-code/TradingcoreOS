# TradingCoreOS web readiness audit — November 2026

This document records code-backed changes to workspace startup, chart data, broker quotas, exact historical-source mappings and remaining release gates. Vela remains the terminal/chart owner; React owns authentication, routing and surrounding UI.

## Changes implemented

### Authentication and broker readiness are independent

`src/App.tsx` now gates protected navigation on authentication readiness only. Broker restoration starts as background work and emits `tco:broker-readiness` events (`restoring`, `connected`, `not-connected`, `unavailable`). A slow, expired or absent FYERS session no longer holds the protected workspace behind a broker-restoration loading screen.

The live workspace already requests historical candles while its broker restore promise is pending. The canonical loader can use exact Investiny mappings when configured and FYERS for recent/live data when a valid session exists. Account, order and live-feed operations remain broker-gated; removing the route gate does not grant those capabilities.

### FYERS quotas are keyed by broker account

`resolveFyersQuotaIdentity()` is shared by account routes, market/quote routes, canonical history, the legacy broker adapter, the direct history route and the fixed-IP manual-order gateway. A known `clientCode` defines the account budget across TradingCore users. When it is absent, the configured FYERS application ID is used as a conservative shared fallback; the OAuth token-exchange call also uses this application-level bucket because the broker account ID is not known until the token is returned. The identity is SHA-256 hashed before it reaches request-gate keys. The WebSocket symbol-union admission gate uses that same account identity across active user sessions; an account switch retires that user's stale sockets before admitting the new account's subscriptions. Rotating access tokens and TradingCore user IDs are not independent quota identities.

### Historical provider pages are coalesced

FYERS and Investiny history pages use one Redis-backed distributed single-flight boundary. The key includes provider, canonical instrument identity, provider asset ID where applicable, timeframe, requested page size and exact page timestamps. Provider results are shared briefly across Vercel instances. The existing `HistoricalDataService` process-local single-flight still deduplicates full dataset refreshes inside each process. Without shared Redis, only the process-local guarantee is available.

### Investiny asset IDs are explicit and validated

No ticker-to-Investing.com ID is inferred. A mapping must be configured under the exact canonical instrument ID or exact exchange-qualified FYERS symbol and contain a positive safe-integer asset ID. Optional declared instrument, FYERS symbol and exchange fields are checked and mismatches are rejected.

## Existing foundations verified and preserved

- `App.tsx` lazy-loads both the non-live workspace shell and live terminal only when their protected routes open. Landing/login keep their own route graph and do not download the workspace shell up front.
- `TcoVelaDataProvider` subscribes to the canonical chart data plane and sends columnar updates directly to Vela; React is not on the per-tick candle path.
- The provider sends a small first-paint batch before awaiting the complete historical dataset. The full requested history still has to be ready before the initial chart load resolves.
- The full-page CoreSpirit Coder and embedded dock use the same `CoreSpiritEditorModel` class and `mountCoreSpiritMonaco` adapter. The Vela dock loads those modules only when opened and defers the compiler worker until Compile & Run. The critical dock contract now protects this shared implementation boundary.
- Vite route/chunk budgets and manifest-based bundle validation remain intact. The preceding performance commit added browser first-plot, warm-recompile, heap and frame-gap measurements with configurable runner budgets.
- The SMC/Pine parity documentation remains explicit about higher-timeframe, full order-block, strong/weak swing, original display-mode and exchange-session gaps.

## Historical lookback policy

The current chart path can paint a bounded first batch while complete requested history loads. The 5,000-bar upper window is intentionally retained because attached indicator and arbitrary CoreSpirit script lookbacks are not yet represented by one authoritative chart-level requirement registry. Reducing the analysis dataset to the visible viewport or 500-bar warm target before that registry exists could silently change indicator outputs.

The safe next step is to expose each attached builtin indicator and CoreSpirit artifact's maximum required lookback to the chart data plane, calculate `max(viewport + warmup, requiredLookback)`, then prove output parity against a full-history reference on replay and input changes. Until then the smaller first-paint path is used for responsiveness, but analysis history remains complete within the current bounded target.

## Remaining roadmap

### P0 — release correctness
1. Run typecheck, critical contracts, production build and deployment status for the target commit.
2. Populate and review exact Investing.com asset IDs for every supported index/equity. Code can reject missing or mismatched IDs; it cannot establish the correctness of an administrator-entered ID without authoritative source metadata.
3. Verify FYERS `clientCode` is populated consistently in stored sessions. The application-ID fallback is conservative, but a broker account identity is more precise.

### P1 — reliable daily workflow
1. Run authenticated browser acceptance with no FYERS session and prove the Investiny historical chart becomes usable before broker restoration completes.
2. Run acceptance with an expired FYERS token; account/order actions must remain disabled while historical charting remains available.
3. Run a multi-instance history test with shared Redis and inspect coalescing behavior under concurrent cold requests.
4. Open the dock and full-page IDE in a real browser, edit source in each, and verify diagnostics/completion use the same Monaco model.
5. Complete Pine semantic fixtures before declaring SMC parity.

### P2 — broader platform depth
1. Add array/UDF/map/enum/library language work only behind compiler/runtime conformance tests.
2. Extend strategy execution with deterministic position lifecycle, fees, slippage, partial fills, session rules and walk-forward backtesting.
3. Expand options coverage with validated IV/Greeks/pricing fixtures and independent numerical references.
4. Collect same-runner route, chart-open, editor-open, indicator-add, live-update, replay, memory and multi-indicator browser performance distributions.

## Verification commands

```sh
npm run typecheck
npm run verify:critical-contracts
npm run build
TCO_BROWSER_URL=http://localhost:5173/live npm run verify:corespirit:smc:browser
```

Browser commands require a running workspace with appropriate chart data. A deploy build alone is not evidence of authenticated chart readiness, no-FYERS fallback, Monaco parity or production-browser performance.