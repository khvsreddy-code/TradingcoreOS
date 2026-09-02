# TradingCoreOS V34 — Low-Latency Chart + OI Intelligence

## Preserved UI
The existing TradingCoreOS UI and page structure remain intact. V34 adds controls/functionality inside the existing Live Trading chart rather than moving users to another page.

## Live Chart
- Added `+ Indicator` directly to the chart toolbar.
- Uses the same indicator library and persistence used by the Indicators page.
- Added worker-backed indicator calculations.
- Reuses Lightweight Charts study series and updates data instead of recreating worker-backed series every candle.
- Chart analytics now run in a Web Worker.
- Raw watchlist ticks are coalesced to animation frames in the workspace to reduce React render pressure.

## OI Levels
- Native OI/Delta-OI engine remains in TypeScript.
- Chart shows no more than 6 OI support/resistance levels.
- Up to 3 support levels are sourced from PUT OI and up to 3 resistance levels from CALL OI.
- Ranking prioritizes strongest meaningful OI walls around the LTP/ATM region, preferring 3–7 strikes away and falling back to 1–7 when needed.
- OI labels show OI, Delta-OI and strike distance.
- Max Pain and OI Flip remain available.
- OI state automatically changes between ACTIVE, TESTING and MITIGATED as spot moves.
- OI refreshes automatically every 5 seconds.

## Broker OI
- Upstox option-chain data is narrowed to ATM ±7 strikes before browser delivery.
- FYERS v3 option-chain support now returns CE/PE OI, previous OI and change-OI in the normalized chain.

## Validation
- Modified TypeScript files passed syntax/transpile checks.
- Synthetic OI-chain test produced exactly 6 selected OI levels with 3–7 strike distances.
- Full `npm run build` was not claimed because dependency installation is incomplete in the current execution environment.

## Telemetry and caching
- OI snapshots are signature-cached so unchanged strike OI does not trigger a full analytics rebuild; spot-only changes update the existing OI lines.
- Live workspace tick state is coalesced per animation frame.
- The workspace records the last order request/ack round-trip in milliseconds in the existing execution panel.
