# TradingCoreOS v0.0.12 — All 39 real ML pipeline

- Replaced production inference's three-model-only implementation with a unified artifact loader for all 39 Prediction Center entries.
- Added genuine implementations/training paths for tree, kernel, nearest-neighbor, recurrent, convolutional, attention, time-series, HMM, conformal, quantile and volatility model families.
- Added strict no-proxy behavior: missing artifacts return unavailable instead of drawing synthetic forecasts.
- Added all 39 model IDs to the production API allow-list.
- Frontend prediction overlays now use server outputs only.
- Added chronological training workflow with 70/15/15 train/validation/test split.
- Added explicit data requirements for options-flow and sentiment models.
- Added ML dependencies for statsmodels, hmmlearn, ARCH, LightGBM, CatBoost and Prophet.
- Supabase registry now contains all 39 real-model entries in paper status.

Important: no genuine trained weights are fabricated. Real artifacts are produced only after `ml/app/train_all.py` is run against real historical data for each symbol/timeframe. Optional-data models remain blocked when their required real features are absent.
