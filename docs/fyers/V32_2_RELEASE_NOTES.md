# TradingCoreOS v32.2 — FYERS Backend Foundation

Date: 2026-09-21

This release expands FYERS support without changing the UI.

### Added
- Shared FYERS REST client with authentication, retry and rate-limit handling.
- Shared market-data service.
- Quotes endpoint.
- Depth endpoint.
- Market Status endpoint.
- Full Option Chain v3 endpoint with expiry timestamp, strike count and Greeks controls.

### Changed
- Existing FYERS history route now uses the shared FYERS client/scheduler.
- Full option-chain payload is retained instead of trimming it to a UI-specific subset.

### Not changed
- React UI.
- Existing chart visual design.
- Existing route contract for historical candles.
- Live order behavior.

### Verification limitation
The archive's dependency tree is incomplete, so full TypeScript/build verification is not claimed.
