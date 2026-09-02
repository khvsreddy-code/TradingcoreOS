# TradingCore OS V26 — Phase 5 OI Visualization + Phase 6 Real Trading + Phase 7 Risk

Persistent browser terminal architecture. Streamlit is not part of the runtime.

## Runtime
- FastAPI backend
- Persistent HTML/CSS/JS frontend
- Broker adapters
- OI intelligence engine
- Modular indicator registry
- Pre-trade risk engine

## OI
The OI engine exposes PCR, max pain, walls, OI support/resistance and movement classification. The browser renders strength-weighted walls, heat zones and labels and lets each layer be toggled independently.

## Execution
Paper/live separation, CE/PE ticket, editable strikes, strategy templates, contract resolution, duplicate-order protection and server-side risk checks.

## Phase 7
See `PHASE_7.md`.
