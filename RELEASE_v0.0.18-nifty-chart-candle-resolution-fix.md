# TradingCoreOS v0.0.18 — NIFTY candle resolution fix

## Problem

The live workspace could restore a persisted chart assignment using a broker-specific instrument key from a previous broker/session. For example, an Upstox-style `NSE_INDEX|Nifty 50` key could survive while FYERS was the active broker. The chart could then request historical data with the wrong instrument key and render no NIFTY candles.

## Fix

- Canonicalize NIFTY 50, BANK NIFTY, and SENSEX aliases to the FYERS index symbols inside `LiveChart` before historical/option-chain requests.
- Canonicalize the same aliases in the FYERS historical API route.
- Normalize locally restored `selected` and `slotKeys` against the active broker.
- Normalize cloud-restored `selected` and `slotKeys` against the active broker.
- Normalize named workspace restores the same way.
- Keep chart state keyed to the canonical broker instrument key.

## Expected result

With FYERS connected, NIFTY 50 resolves to `NSE:NIFTY50-INDEX` regardless of an older persisted alias, and the chart historical request uses that canonical symbol.

FYERS documents that the History API returns OHLCV candles for a requested symbol/date range and recommends the current Symbol Master for valid symbols.
