# TradingCoreOS v0.0.15 — TradingView Indicator Pack

Added a native TradingCore implementation layer for the indicator names supplied in the TradingView archive:

- Adaptive Ehlers
- ATR Percentile Bands
- CVD Profiles
- Delta Sigma Heatmap
- Dual Phase Reversal
- Fractional EMA Kalman Filter
- Harmonic Lab
- HTF 3 Candle System
- HTF Volume Spike & Imbalance Projection
- Initial Balance Auction Intelligence
- LTF Volume Microburst Bubbles
- Market Structure Dashboard
- Neural Weight Oscillator
- OrderBlock AI
- Pivot Consolidation Zone
- Stoploss Cascades
- Trend Pressure
- Trend Target Ribbon
- Trinity
- Volatility Shock Half Life Monitor
- Volume Delta Footprint
- Wyckoff

These are native algorithmic equivalents based on the supplied indicator names/concepts; the archive's Pine source was not copied verbatim. They are exposed through the chart Indicators menu and use the chart's existing candle data.

The new indicators support lines, zones and event markers where applicable and persist like the existing chart indicators.

No unavailable broker data is fabricated. Volume/order-flow style calculations use fields actually present in the chart dataset.
