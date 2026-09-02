# Phase 6 — Real Trading (corrected continuation)

V25.1 is built from V24's feature set and preserves its chart/OI/indicator source material under `frontend/ported_v24_*` and `ported_v24/`. The executable browser shell is FastAPI + vanilla JS; Streamlit is not a runtime dependency.

Trading features:
- CE/PE ticket with editable strikes
- +1 ITM default convention
- BUY CE / BUY PE / SELL CE / SELL PE
- strategy templates
- PAPER/LIVE switch
- order status endpoints
- contract quantity validation
- 15-second idempotency/duplicate protection
- live lot and notional limits
- server-side broker sessions

The V24 chart engine was extracted as a framework-independent HTML template rather than deleted. OI mechanics were ported to `backend/oi_engine.py`.

## Deployment
Run `uvicorn backend.server:app --host 0.0.0.0 --port 8000`.
For production, add real authentication, encrypted persistent broker-token storage, OAuth callback/session binding, CSRF, audit logs, Redis/event bus, and broker-specific contract resolution before live money.
