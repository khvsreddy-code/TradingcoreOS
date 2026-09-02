# TradingCoreOS V20 — Phase 1: Architecture & Performance Core

Implemented:
- Session-level index catalog cache (6h) to avoid repeated large catalog downloads.
- Short live bootstrap cache (3s) to avoid rebuilding option-chain/OI levels for every widget interaction.
- Explicit live bootstrap invalidation hook for reconnect/symbol-change flows.
- Navigation clears stale live workspace state when leaving Live Trading.
- Live page exposes a small feed/cache status line.

This phase makes the current Streamlit architecture substantially cheaper on reruns. It does not claim exchange-to-browser latency below a broker; the next phase is a persistent event-driven market-data hub and broker adapter layer.

Next phases: persistent market-data hub; broker adapters; chart/indicator registry; risk engine and kill switch; OI/option strategy engine; alerts/paper trading/automation/backtesting/journal; eventual persistent React/Next.js terminal shell.
