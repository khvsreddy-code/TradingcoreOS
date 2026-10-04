# TradingCoreOS — Multi-Asset ML Browser-OS Architecture

## Decision
The proposed four-layer ML ecosystem is a strong product direction, but TradingCoreOS should treat ML as a set of **evidence-producing services**, not as the authority that directly places orders.

```text
                         TradingCore OS
                              │
                 ┌────────────┴────────────┐
                 │                         │
           Core Chart Engine         CoreSpirit Engine
                 │                         │
                 └────────────┬────────────┘
                              │
                        Data/Event Bus
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
   Prediction            Structure/Regime       Cross-Asset
   Services              & Price Action          Feature Layer
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                       Signal/Feature Store
                              │
                       Validation / Meta Gate
                              │
                       Risk & Policy Engine
                              │
                     Execution Intent (not order)
                              │
                       Broker Execution Layer
```

## Layer 1 — Prediction
- Short-horizon market models: gradient boosting, LSTM/Transformer/TFT and calibrated ensembles.
- Fundamental/filing models are a separate medium-horizon family; do not mix their target horizon with intraday models.
- DOM/order-book models require genuine depth/event data. OHLCV cannot substitute for Level-2 training data.
- Every prediction carries model version, training window, feature schema, timestamp, horizon, calibration state and artifact status.

## Layer 2 — Structure, regime and price action
- Keep deterministic structure engines first: fractals, swings, S/R, S/D, ATR impulse, order blocks, FVG, MSS/CHOCH, mitigation and MTF confluence.
- Use statistical/ML classifiers for regime probabilities rather than allowing a model to invent chart structure without provenance.
- Computer vision on candlestick images is optional research; the primary representation should remain market-native time-series/features.

## Layer 3 — Multi-asset features
- Equities/indices: constituents, breadth, relative strength, futures/spot basis and options OI/IV/Greeks where available.
- Commodities: term structure, inventory/macro releases and cross-asset drivers where data licensing permits.
- FX: currency-strength and rate-differential features plus volatility/liquidity state.
- Derivatives: OI, volume, IV, delta/gamma exposure and put/call measures. Name each metric precisely; avoid treating OI and COI as interchangeable.

## Layer 4 — Decision and execution
Do not let PPO/DQN directly decide whether a live order is sent in the first implementation.

Use:
1. feature aggregation;
2. calibrated meta-classifier / meta-labeler;
3. deterministic risk policy;
4. execution policy;
5. broker adapter.

Reinforcement learning can be introduced later in a sandbox/backtest environment after transaction costs, slippage, partial fills, latency and policy constraints are modeled.

## CoreSpirit integration
CoreSpirit is the semantic layer for deterministic and user-authored logic. ML outputs are first-class inputs:

```text
market.bar
   ↓
CoreSpirit
   ├── structure()
   ├── regime()
   ├── model("...")
   ├── signal(...)
   ├── alert(...)
   └── draw(...)
```

The chart consumes standardized objects, so model failures cannot blank candles.

## Browser-OS rule
All live modules must fail independently. A missing model artifact, stale prediction, unavailable options feed or script exception must degrade only that feature and leave the core chart/portfolio/execution UI operational.
