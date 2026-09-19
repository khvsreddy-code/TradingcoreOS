# TradingCoreOS — Stage 13 ML Feature Registry

## Purpose

Establish one canonical, versioned feature contract before expanding server-side model training and inference.

## Implemented

- Versioned feature definitions in `src/services/ml/featureRegistry.ts`.
- Explicit data requirements (`ohlcv`, `structure`, `options`, `depth`, `macro`, `sentiment`).
- Horizon metadata (`micro`, `intraday`, `swing`, `multi`).
- Provenance on every emitted feature value: source, timeframe, timestamp and definition version.
- Deterministic OHLCV feature extraction for returns, EMA distance, RSI, ATR percentage, range percentage, volume ratio and breakout distance.
- Optional real options/order-book/macro/sentiment inputs remain unavailable when their data source is absent; no synthetic substitutes are generated.
- Feature-vector validation for duplicate IDs, unknown IDs, non-finite available values and missing provenance.

## Boundary

Stage 13 is a feature-contract foundation. It does not make the existing 39 prediction models genuinely trained. Training artifacts, labels, dataset lineage, server inference and model-specific validation remain downstream work.
