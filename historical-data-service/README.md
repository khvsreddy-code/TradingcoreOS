# TradingCoreOS Historical Data Service

Private FastAPI service isolating history libraries from browser and broker/order adapters. Every endpoint is protected by a server-only bearer token and should sit behind network restrictions. It provides historical OHLCV only.

## Runtime

Install dependencies from \`requirements.txt\`. The existing tvdatafeed adapter is \`POST /v1/history\`. The optional Investiny adapter is \`POST /v1/investiny/history\`, enabled only when \`INVESTINY_ENABLED=true\`. Both endpoints share a two-worker executor, bounded queue, request deadline and bearer-token authentication. The Investiny endpoint accepts the separate \`INVESTINY_SERVICE_TOKEN\`, falling back to \`TVDATAFEED_SERVICE_TOKEN\`.

Investiny requires an exact numeric Investing.com asset ID supplied by the authenticated TradingCoreOS server. It does not perform fuzzy symbol discovery and does not provide live quotes/ticks. The package is unofficial, last published in 2022, and its upstream can fail or change. Only enable it when your data-use rights and upstream terms permit your intended usage; do not use IP rotation, fingerprint spoofing or alternate hidden endpoints as a recovery tactic.

## Investiny interface

\`POST /v1/investiny/history\` accepts \`instrument_id\`, \`investing_id\`, \`timeframe\`, \`from_ms\`, \`to_ms\`, \`max_bars\`, IANA \`timezone\`, and \`session_open\`. It returns normalized bars and explicit \`historical_only: true\` / \`live_stream_supported: false\` metadata. Seconds timeframes are rejected. Non-native minute intervals are aggregated from supported finer intervals using the session open as the bucket anchor, then filtered and validated.

Supported underlying intervals are 1, 5, 15, 30, 60, 300 minutes, daily, weekly and monthly. Intraday history depth varies by interval and may be limited. HTTP 403, empty or malformed responses trigger fallback; do not retry aggressively.

## Source-of-truth policy

TradingCoreOS routes an authorized NSE gateway first. Investiny is a historical-only fallback for explicitly mapped non-derivatives. F&O/options fall through to the existing quota-gated FYERS API when NSE is unavailable; existing tvdatafeed remains a final legacy fallback if contract identity and adjustment policy match. Source priority for overlapping timestamps is NSE, Investiny, FYERS, then tvdatafeed; F&O/options skip Investiny entirely and retain FYERS as the broker fallback.
