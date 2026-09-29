# TradingCoreOS Real ML — 39-model production pipeline

This ML package contains genuine algorithm implementations and a common training/inference contract for all 39 Prediction Center entries (36 distinct model families plus 3 production aliases).

## Important
The repository contains **training code**, not fabricated trained weights. A model is only considered trained after `train_all.py` is run against real historical data for the requested symbol/timeframe. Models that require unavailable data (options OI/IV or sentiment) are explicitly blocked rather than silently using synthetic proxies.

## 39 model entries
XGBoost Direction, Random Forest Direction, Logistic Regression, Gradient Boosting Volatility, XGBoost Breakout, Momentum Regime, Mean Reversion, Trend Strength, Range Breakout Pro, Volatility Regime, Price Action Structure, Options Flow Bias, Core Ensemble Voting, Temporal Fusion Transformer, N-BEATS Trend, PatchTST Pattern, LSTM Sequence, Temporal Convolution Network, LightGBM Regime, CatBoost Direction, Hidden Markov Regime, TimeMixer Multi-Scale, Conformal Prediction Range, ARIMA Direction, SARIMA Seasonal, ETS Trend, Prophet Trend, Support Vector Regression, KNN Pattern Match, Bidirectional LSTM, CNN-LSTM Hybrid, LSTM-GRU Hybrid, Transformer Attention, News + Sentiment Hybrid, GARCH Volatility, Quantile Forest Range, Production XGBoost Direction, Production LSTM Sequence, Production Transformer.

## Training
```bash
python -m ml.app.train_all --csv ./data/NIFTY50_5m.csv --symbol NIFTY50 --timeframe 5m --out ./ml/models --horizon 1 --epochs 20
```

CSV must contain:
`timestamp, open, high, low, close, volume`

Options Flow additionally needs real fields such as `pcr`, `iv` and/or OI/volume fields.
Sentiment Hybrid additionally needs a real numeric `sentiment` feature.

Training uses chronological 70/15/15 train/validation/test splits. It never randomizes time across the split.

Artifacts are written per model:
`<SYMBOL>__<TIMEFRAME>__<MODEL_ID>/model.joblib` or `model.pt` + `scaler.joblib`, plus `metadata.json`.

## Inference
```bash
uvicorn ml.app.main:app --host 0.0.0.0 --port 8000
```

`POST /predict` accepts the latest candles and requested model IDs. If an artifact is missing, that model returns `trained:false` instead of falling back to a browser proxy.

## Production policy
Do not mark a model `live` only because training completed. Review walk-forward test metrics and shadow/live performance first. Prediction Center should display model version and artifact status.

## Intraday signal optimization (event-driven)

The production inference path now supports an optional optimization layer on top of every model:

- **Triple-barrier labeling**: 1.5 ATR take-profit, 1 ATR stop, 6-bar time barrier by default.
- **Meta-labeling**: a separate Random Forest predicts whether the primary signal is likely to hit TP before SL. Default execution threshold is 0.65 and is learned from historical events; it is not a guaranteed win-rate target.
- **OFI / book imbalance**: used when real bid/ask price and size snapshots are supplied. No synthetic order-flow data is created.
- **Options positioning**: PCR, OI changes and GEX are used only when real chain features are present.
- **Volatility regime**: India VIX and Cboe VIX are recognized; opening/closing session gates raise the required meta probability.
- **Intraday U-curve**: India-session opening/midday/closing flags and relative volatility are available to the meta-labeler.
- **Cross-market compatibility**: the same feature schema works for NSE/BSE and US instruments; market-specific features are activated only when the broker/data source actually supplies them.

This layer is a **conditional entry filter**, not a claim that the models will achieve a particular win rate. It should be evaluated with walk-forward tests including transaction costs and slippage before enabling live execution.
