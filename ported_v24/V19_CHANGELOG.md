# TradingCoreOS V19 — Fast Navigation, Themes, Indicator Library

- Added an early-rendered top navigation for Live Trading, Models, Automations, Indicators, Portfolio and Profile.
- Navigation now routes before live broker bootstrap; switching to lightweight pages avoids websocket, option-chain, historical candle and archive initialization.
- Added session-level Light/Dark theme with a polished glass/gradient application shell.
- Live chart now accepts the application theme and renders in matching dark/light mode.
- Live chart Indicators button opens an in-chart popup library with search/filter.
- Preserved direct indicator and level toggles, including OI levels.
- Portfolio is isolated from live-market bootstrap and only fetches funds/positions/orders when selected.
- Python syntax and archive integrity should be checked before deployment; full Streamlit runtime testing requires project dependencies.
