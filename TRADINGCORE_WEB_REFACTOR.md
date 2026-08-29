# TradingCoreOS Web Refactor

## What changed

- Removed bundled Python/Streamlit demo copies, nested ZIP archives, build output, `.vercel` metadata, `node_modules`, and Windows/native executable artifacts.
- Reduced the supported broker surface to **Upstox** and **Fyers** in the UI and broker registries.
- Reworked broker selection into a focused two-broker experience.
- Rebuilt the web trading workspace around a lightweight `lightweight-charts` implementation.
- Added TradingCoreOS-inspired trader information panels:
  - market state / bias
  - LTP and change
  - VWAP
  - day high/low
  - previous session high/low
  - opening range
  - ATR
  - market depth
  - quick live order panel
- Added browser-side calculated level engine using swing structure and session anchors.
- Added support/resistance lifecycle states (`ACTIVE`, `TESTING`, `BROKEN`) and chart price labels.
- Added chart controls for 1m/3m/5m/15m/30m/1H/1D, Levels, VWAP and Volume.
- Live ticks update the existing candle series instead of recreating the chart.

## Blueprint integration

The `TradingCoreOS_V11_8_LIVE_CHART_FIX CODEX 10` Python demo was used as the blueprint for the trader-first hierarchy, level lifecycle concept, session anchors, VWAP/ATR context, and live chart behavior. The implementation was adapted to TypeScript/browser constraints rather than embedding Streamlit/Python into the website.

## Validation

`npm run lint` passed after the source changes. The original bundled `node_modules` was intentionally removed from the deliverable; a production build should be run after installing dependencies in the deployment environment.
