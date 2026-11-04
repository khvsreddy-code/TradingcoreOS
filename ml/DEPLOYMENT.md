# TradingCoreOS Real ML deployment

## 1. Build
`docker build -f ml/Dockerfile -t tradingcoreos-ml .`

The image installs PyTorch, XGBoost, LightGBM, CatBoost, statsmodels, hmmlearn, ARCH and Prophet.

## 2. Train every requested symbol/timeframe
Use real Fyers/Upstox historical exports or another licensed historical source:
`python -m ml.app.train_all --csv ./data/NIFTY50_5m.csv --symbol NIFTY50 --timeframe 5m --out ./ml/models --horizon 1`

Repeat for each symbol/timeframe. The pipeline creates a separate artifact for every one of the 39 model IDs. Models requiring data not present in the CSV are marked `blocked` with the exact reason.

## 3. Run inference
`MODEL_ROOT=/app/models ML_SERVICE_SECRET=<secret> uvicorn ml.app.main:app --host 0.0.0.0 --port 8000`

`ML_SERVICE_SECRET` is mandatory and must contain at least 32 characters. The `/predict` and `/models` endpoints require the `X-TradingCore-ML-Secret` header; they fail closed when the secret is absent or invalid. `/health` remains unauthenticated and reports whether inference authentication is configured.

## 4. Connect Vercel
Set server-side environment variables:
`ML_SERVICE_URL=https://<hosted-ml-service>`
`ML_SERVICE_SECRET=<same-secret>`

Use HTTPS outside localhost development. Never expose the secret through `VITE_*`.

## 5. CoreSpirit host-model integration
CoreSpirit's Python adapter registers a version-pinned model through the existing Model ABI and `CoreSpiritModelRuntime`. It sends confirmed OHLCV windows only, enforces the registered artifact version, and returns typed direction-probability and confidence tensors. A model is unavailable when its exact trained artifact is not installed.

This host adapter does not make the synchronous chart worker perform remote HTTP requests. Direct chart-worker prediction requires a separately designed asynchronous host/worker request-and-response lifecycle; do not silently substitute local formulas while that capability is unavailable.

## 6. Production model lifecycle
`trained -> paper/shadow -> evaluated -> production`.
The API reports `trained`, `status`, `model_version` and prediction intervals. Missing artifacts never become browser proxies.

## 7. Data requirements
Base models require OHLCV. Options Flow requires real OI/PCR/IV fields. News + Sentiment requires a real sentiment feature. GARCH forecasts volatility rather than pretending to be a directional price model. Conformal and quantile models return calibrated/empirical ranges.
