# Historical market-data architecture

TradingCoreOS uses one canonical historical coordinator. Vela, CoreSpirit, replay, analytics and research consume the same normalized candle timeline; providers do not publish into separate chart stores.

## Source routing

1. **FYERS — recent history and live feed.** The authenticated FYERS Data API supplies at most the latest seven calendar days of standard OHLCV history. Every ordinary `/history` call passes through `FyersApiClient`, which clips overlapping ranges or rejects pages wholly outside that window. Live ticks arrive over the existing FYERS WebSocket; REST is not polled to maintain the active candle.
2. **Investiny — older historical backfill.** Investiny is the historical-only source for candles older than the FYERS seven-day window. Configure `INVESTINY_ENABLED=true`, the private service URL/token, and exact verified numeric IDs in server-only `INVESTINY_SYMBOL_MAP`. No fuzzy symbol resolution or identity probing is used. The configured two-to-five-year floor is applied before each provider request, not merely filtered after a wider fetch. Investiny never supplies live ticks or the active forming candle.
3. **Failure behaviour.** When FYERS is disconnected, the chart may still use validated Investiny history, but it must not manufacture live candles from a quote snapshot. When a symbol lacks an exact Investiny mapping, report it as unmapped and preserve the last valid cache rather than guessing another instrument.

## Cache, validation and precedence

- Resolve instruments through exact mappings, including instrument type, expiry/contract identity, timezone, session, holiday calendar and adjustment policy.
- Read the existing cache before provider requests; the in-flight promise map deduplicates identical refreshes within one server process.
- FYERS wins overlapping recent candles. Investiny contributes only older history and cannot replace a validated FYERS candle.
- Validate timestamps, OHLC geometry, duplicate candles and volume before acceptance. Keep source provenance on each candle.
- Keep event time distinct from receive time. A quote snapshot without a valid trade timestamp must never become a synthetic candle.
- Keep one canonical path: historical service → chart data plane/revision fences → Vela/CoreSpirit. Corrections/backfills invalidate the correct dirty range.

## Limits and safeguards

- Canonical cached datasets cap at 5,000 bars. Chart requests remain bounded and viewport-driven.
- Standard FYERS Data API admission uses 80% of the documented 5,000/day, 50/minute and 5/second ceilings: at most 4,000 admitted Data API requests/day, 40/minute and 4/second per authenticated FYERS user. The remaining 20% is reserved for external/manual use and unexpected provider behaviour. Retries count as real attempts and pass through the shared Redis/Supabase admission authority.
- This internal guarantee only covers requests routed through TradingCoreOS. Calls made elsewhere using the same FYERS credentials are outside its counters and consume the provider's remaining allowance.
- Investiny's package is unofficial and may fail or change. Use it only where its terms and intended data rights permit. Missing exact mappings must fail closed.
- FYERS WebSocket remains the live transport. Do not poll REST for continuously changing prices, use Investiny for ticks, or treat stale prices as execution truth.