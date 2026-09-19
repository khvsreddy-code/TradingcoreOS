# TradingCoreOS v0.0.25 — Chart/Option Chain Persistence + Index/Derivative Symbol Resilience

## Fixes

- The candlestick chart is now kept mounted while Option Chain is open and is only hidden visually. Returning to **Chart** no longer destroys/recreates the chart instance, so timeframe, studies, drawings, live candle state, and loaded history are preserved.
- The Option Chain **Chart** action returns to the same live chart immediately.
- FYERS chart symbol canonicalization now handles NIFTY-family indexes plus `NSE_FO|...`, `BSE_FO|...`, and bare active NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY derivative symbols.
- The secondary FYERS market-data symbol normalizer was brought into line with the authoritative history normalizer.
- Existing FYERS history fallback remains intact: actual broker candles are preferred; a live quote seed is used only when the broker supplies no usable historical candles.

## Validation

- Source changes are limited to workspace chart/option-chain presentation and FYERS symbol normalization.
- The chart continues to use TradingView Lightweight Charts candlestick series APIs (`setData`/`update`) for OHLC rendering.
