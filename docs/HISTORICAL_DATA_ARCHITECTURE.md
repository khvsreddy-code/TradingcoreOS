# Historical data source policy

TradingCoreOS has one historical data coordinator. The browser, Vela, CoreSpirit indicator execution, replay and research must consume its normalized candle timeline rather than independently fetching data.

## Request flow

1. Resolve an instrument only through an exact FYERS-symbol or canonical instrument-ID mapping. The mapping includes the TradingView symbol/exchange, instrument type, expiry/contract identity, exchange timezone/session, holiday calendar and adjustment policy. Display-name or fuzzy symbol matching is not allowed.
2. Read the server cache first. A fresh cache response returns quickly; stale data can be retained if both sources temporarily fail.
3. Request a session-aware recent window from FYERS. Stocks, indices and other non-option instruments keep the newest three observed trading sessions; individual option contracts keep the newest five observed sessions (one trading week). This is based on actual session dates in the mapped exchange timezone, not a rolling 72- or 168-hour span. Mark the exchange calendar complete only when the holiday list is actually maintained; otherwise the service uses a ten-calendar-day safety window for three-session instruments and a fourteen-calendar-day safety window for options, then selects the newest three or five observed sessions from actual FYERS candles.
4. Ask the protected Python service for up to 5,000 tvdatafeed candidates when an exact mapping and service credentials exist. The fetcher interface provides no arbitrary historical end timestamp, so this is a bounded latest-window source—not an unlimited backward pager.
5. Validate OHLC geometry and volumes, deduplicate on normalized candle timestamp, remove TradingView rows from every recent session owned by FYERS, merge and sort, then cap the returned dataset at 5,000 bars total. The cap includes the three FYERS sessions for stocks/indices or five FYERS sessions for option contracts; TradingView candles fill the older portion of that same chart window.
6. Return columnar data with a monotonic revision and source-health metadata. A quote is an independent snapshot object, never a synthetic candle. Empty history remains empty so chart/replay/model warm-up can show an error instead of training on a quote.

## Server configuration

Apply migration 20261019070000_historical_data_sources_and_cache.sql through the project's normal migration/deployment workflow. That migration creates server-only instrument mappings and a revisioned durable dataset cache, with RLS enabled and table privileges revoked from browser roles.

Deploy historical-data-service as a private service. Set TVDATAFEED_SERVICE_URL and the same high-entropy TVDATAFEED_SERVICE_TOKEN on the TradingCoreOS server and the Python service. TVDATAFEED_USERNAME and TVDATAFEED_PASSWORD are optional server-only credentials inside the Python service. Do not put any of these under a VITE_ variable.

Populate historical_instrument_mappings with verified exact pairs, or use the server-only TVDATAFEED_SYMBOL_MAP JSON environment variable. Set instrument_type accurately: option contracts receive five recent FYERS sessions; stocks, indices and other types default to three. The environment variable is useful for initial rollout, while Supabase mappings are the durable operator-managed catalog. Do not populate derivatives by underlying name alone: a specific-expiry FYERS contract and a continuous/other TradingView future require different instrument identities and must not be merged unless their exact contract identity and adjustment policy match. Configure fyers_adjustment_policy and tv_adjustment_policy separately; the coordinator declines to merge feeds when those policies differ because it does not silently rewrite split/dividend or continuous-futures adjustments.

## Bounded paging

The merged server dataset is capped at 5,000 total bars. The endpoint can return a page older than a supplied timestamp only when those rows exist in its cached merged window. It reports historyExhausted when no older cached bars exist and explicitly sets paginationSupported=false. Do not describe the current tvdatafeed integration as unlimited history paging.

10-minute bars are aggregated from tvdatafeed's 5-minute series because the upstream library does not document a native 10-minute interval. This may produce fewer than 5,000 output bars. All timestamps are returned as UTC ISO timestamps for row transport or epoch milliseconds for column transport.

## Failure semantics

- FYERS recent history fails, tvdatafeed works: return the validated tvdatafeed window, mark it degraded and preserve the source error in metadata.
- FYERS options history works but fewer than five observed sessions are available: retain all validated FYERS candles that actually exist and let TV fill only sessions strictly older than the oldest FYERS session; never fabricate missing option candles.
- tvdatafeed fails, FYERS works: return the recent FYERS session bars, mark the older portion unavailable/degraded when the TV source was configured for that mapping.
- Both sources fail with a stale cache: return stale validated bars and mark stale/degraded.
- Both sources fail without a cache: return an error and an optional separate quote snapshot; never convert that quote into an OHLCV bar.
