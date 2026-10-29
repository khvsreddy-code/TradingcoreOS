# TradingCoreOS Historical Backfill Service

Private FastAPI service for historical OHLCV backfill only. TradingCoreOS uses the authenticated FYERS API and FYERS WebSocket as the live/recent market-data path; FYERS historical requests are bounded to the latest 14 calendar days. This service supplies older history from Investiny and never emits live quotes or ticks.

## Runtime

Install dependencies from `requirements.txt` and run `uvicorn app:app --host 0.0.0.0 --port 8080 --workers 1`. The service exposes `POST /v1/investiny/history` and `GET /health`. Requests require a server-only bearer token in `INVESTINY_SERVICE_TOKEN`. The service has bounded concurrency, request deadlines, a maximum of 5,000 bars per response, strict timestamp/OHLCV validation, and explicit historical-only metadata.

Investiny requires an exact numeric Investing.com asset ID supplied by the authenticated TradingCoreOS server. It does not perform fuzzy symbol discovery. The package is unofficial and may fail or change; use only where your data-use rights and upstream terms permit. Do not rotate identities, spoof fingerprints, or probe hidden endpoints as a recovery strategy.

## Source policy

- **FYERS:** live ticks and forming/closed candle updates; recent historical candles, with a strict 14-day historical window.
- **Investiny:** older historical candles only, up to a configurable 2–5-year lookback and within the 5,000-bar chart/history cap.
- **Orders:** remain on the independent FYERS order execution path; the historical backfill service cannot place orders.
- **NSE scraper / tvdatafeed:** not used by this service.

The server requires exact instrument-to-Investing.com numeric IDs in `INVESTINY_SYMBOL_MAP`; it must not guess an asset based on fuzzy text matching. Intraday history availability depends on the upstream instrument and interval, so responses must report the actual validated candle count rather than fabricate missing bars.
