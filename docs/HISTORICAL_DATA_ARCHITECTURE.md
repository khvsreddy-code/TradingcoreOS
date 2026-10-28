# Historical market-data architecture

TradingCoreOS uses one canonical historical coordinator. Vela, CoreSpirit, replay, analytics and research consume the same normalized candle timeline; provider adapters do not publish to separate chart stores.

## Source routing

1. **Authorized NSE adapter (primary).** Configure \`NSE_MARKET_DATA_SERVICE_URL\` and \`NSE_MARKET_DATA_SERVICE_TOKEN\` for a private gateway backed by an NSE subscription or authorized data vendor. The adapter contract is \`POST /v1/history\`, bearer-authenticated, with \`instrument_id\`, \`symbol\`, \`timeframe\`, \`from_ms\`, \`to_ms\`, \`max_bars\`, \`timezone\`, and \`session_open\`. It returns a \`bars\` array of normalized OHLCV rows. No NSE endpoint or credentials are bundled; routing is inactive until configured. Do not scrape NSE's public website, spoof clients, or rotate proxies to evade access controls.
2. **Investiny (historical-only backup).** Set \`INVESTINY_ENABLED=true\`, configure its private service URL/token, and provide exact verified numeric IDs in server-only \`INVESTINY_SYMBOL_MAP\`. No fuzzy resolution or \`search_assets\` lookup is done on demand. The package is unofficial, last published in 2022, and can fail or change; only use it where terms and data-use rights permit your intended use. It is not a live stream.
3. **FYERS broker fallback.** If NSE is unavailable, F&O/options skip Investiny and use the existing authenticated FYERS adapter and central plan-aware quota gate. Option-chain requests remain on the existing FYERS route. Other instrument types retain the quota-aware FYERS history fallback if preferred sources fail.
4. **Legacy tvdatafeed fallback.** Existing exact mappings remain usable only when derivative contract identity and adjustment policy are compatible.

## Automatic recovery

\`MarketDataAutoFixer\` is a bounded runtime circuit breaker keyed by source, capability, instrument and timeframe. It opens after a failed/empty/invalid response, suppresses retries during cooldown, permits a single half-open probe and automatically restores NSE following a validated response. Authentication/configuration errors use a longer cooldown; HTTP 429 honors \`Retry-After\` and a minimum wait; transport failures use capped exponential backoff. It does not rewrite application code. Source-code repairs should go through tests, review and CI.

## Cache, validation and precedence

- Resolve instruments through exact mappings, including instrument type, expiry/contract identity, timezone, session, holiday calendar and adjustment policy.
- The server cache is read before fetching; the existing in-flight promise map deduplicates identical history refreshes within one server process.
- Overlapping candle precedence is NSE, FYERS, Investiny, then tvdatafeed. A new correction from the same source supersedes that source's cached row.
- Validate timestamp, OHLC geometry, duplicate candles and volume before acceptance. Keep source provenance on each candle.
- Keep event time distinct from receive time. A quote snapshot with no valid trade timestamp must never become a synthetic candle.
- Keep one canonical path: historical service -> chart data plane/revision fences -> Vela/CoreSpirit. Corrections/backfills must invalidate the correct dirty range.

## Limits and failure policy

- Canonical historical datasets cap at 5,000 bars. Each chart request is currently capped at 2,000 bars; the existing FYERS page loop retains its bounded page budget and quota gate.
- Investiny's documented interval and historical-depth limitations are based on old documentation. Empty, 403 or malformed responses trigger fallback; never loop or rotate network identity to get around restrictions.
- NSE real-time feeds, snapshot files and historical data are distinct products/protocols. This change wires a historical gateway contract, not NSE multicast/SFTP decoding. Investiny must never be used for live ticks.
- The existing FYERS WebSocket remains the live-data transport in this change. FYERS REST requests stay behind \`FyersApiClient\` and shared request admission. Never bypass entitlement checks or treat stale prices as trading truth.
