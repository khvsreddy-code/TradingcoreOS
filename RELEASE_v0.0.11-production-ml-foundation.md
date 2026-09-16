# TradingCoreOS v0.0.11 — Production ML Foundation

Implemented the production ML boundary for real trained models.

- Added Python FastAPI ML service.
- Added shared feature engineering for OHLCV candles.
- Added genuine XGBoost and PyTorch LSTM training pipelines.
- Added walk-forward train/validation/test separation.
- Added artifact metadata and model versioning contract.
- Added server-side prediction API integration to TradingCoreOS.
- Added explicit LOCAL vs SERVER model labels in the chart model picker.
- Production model IDs no longer fall back to browser proxies when the ML service is unavailable.
- Added Supabase MLOps registry tables for artifacts, training runs and evaluations.
- Added GitHub Actions training workflow for externally hosted OHLCV datasets.

Important: no production artifact is marked live until it has been trained on real market data and evaluated on an untouched out-of-sample period.
