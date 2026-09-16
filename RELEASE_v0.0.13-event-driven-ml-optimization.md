# TradingCoreOS v0.0.13 — Event-Driven ML Optimization

Adds an optimization layer shared by the 39 production prediction entries.

## Methods

1. Triple-barrier event labeling
2. Random-Forest meta-labeler
3. Conditional entry thresholding
4. Top-of-book OFI z-score when real L2 snapshots exist
5. Book imbalance / micro-price features
6. PCR and OI-buildup alignment when real options data exists
7. GEX regime gate when real gamma exposure exists
8. India VIX / Cboe VIX volatility regimes
9. India intraday U-curve gates
10. Volatility-aware threshold adjustments

## Data integrity

The optimizer never fabricates OFI, GEX, OI, PCR, VIX or sentiment. Missing data is marked unavailable. This is important because broker candle history alone cannot reconstruct historical L2 order flow or dealer gamma exposure.

## Evaluation

No fixed win-rate improvement is promised. The correct validation is walk-forward, out-of-sample event evaluation with fees/slippage and per-market/per-timeframe reporting.
