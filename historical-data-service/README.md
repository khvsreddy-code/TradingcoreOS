# TradingCoreOS Historical Data Service

This service isolates the tvdatafeed dependency from browser code and broker/order adapters. It accepts only authenticated, explicitly mapped requests and returns normalized OHLCV bars.

## Runtime

Build and deploy this directory as a private HTTP service. Configure a high-entropy TVDATAFEED_SERVICE_TOKEN in both this service and the TradingCoreOS server. Do not expose the service publicly without network restrictions, do not use a VITE_ prefix for credentials, and do not log TradingView usernames or passwords.

Optional credentials are TVDATAFEED_USERNAME and TVDATAFEED_PASSWORD. Anonymous TradingView access may be limited or unavailable for some symbols. Protect the endpoint with network ACLs in addition to its bearer token.

The handler uses a two-worker cap, short queue wait, request deadline, input limit of 5,000 candidate bars, strict timeframe validation, and OHLC sanity validation. No browser, historical replay or indicator host calls this package directly.

## Interface

POST /v1/history accepts instrument_id, symbol, exchange, timeframe, optional max_bars (1-5000), an IANA timezone, session_open, and optional fut_contract. The service calls the tvdatafeed get_hist(symbol, exchange, interval, n_bars=5000) API and returns normalized bars, a candidate cap, and arbitrary_end_paging=false. It deliberately does not accept a custom end timestamp because the underlying API does not expose a reliable arbitrary-end cursor.

10-minute bars are aggregated from a bounded 5-minute source response because the upstream library does not document a native 10-minute interval. Consequently, a 10-minute request may return fewer than 5,000 output bars.

## Symbol and contract mappings

Maintain historical_instrument_mappings in Supabase or the server-only TVDATAFEED_SYMBOL_MAP environment variable. Every entry must explicitly bind an exact FYERS instrument to one TradingView symbol and exchange. Do not use display-name fuzzy matching. For expiring futures/options, set both contract_identity and tv_contract_identity to the same exact contract identity and verify the chosen TradingView mapping during contract rollover. Continuous futures must be configured as a separate instrument and never mixed into a specific-expiry dataset.

## Source-of-truth policy

The TypeScript HistoricalDataService normalizes both sources, validates OHLCV geometry, deduplicates timestamps, keeps the newest three observed Fyers sessions as the recent authority, filters TV bars out of those sessions, and caps the total merged window at 5,000 bars inclusive. Fyers and tvdatafeed status/error metadata is carried to the chart; a quote remains a separate response object and is never turned into a candle. A failed source may degrade the dataset, but failure from one provider does not prevent the other from returning data.


Operator symbol discovery can run in the same environment without creating any automatic mapping:

    python discover_symbols.py "NIFTY" --exchange NSE

Review returned candidates and verify the exact FYERS instrument, timeframe behavior, contract expiry and adjustment policy before inserting a row into historical_instrument_mappings. The search response is never persisted or selected automatically.
