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

## 4. Connect Vercel
Set server-side environment variables:
`ML_SERVICE_URL=https://<hosted-ml-service>`
`ML_SERVICE_SECRET=<same-secret>`

Never expose the secret through `VITE_*`.

## 5. Production model lifecycle
`trained -> paper/shadow -> evaluated -> production`.
The API reports `trained`, `status`, `model_version` and prediction intervals. Missing artifacts never become browser proxies.

## 6. Data requirements
Base models require OHLCV. Options Flow requires real OI/PCR/IV fields. News + Sentiment requires a real sentiment feature. GARCH forecasts volatility rather than pretending to be a directional price model. Conformal and quantile models return calibrated/empirical ranges.
