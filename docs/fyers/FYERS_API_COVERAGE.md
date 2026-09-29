# FYERS API Coverage Map

Source basis: official FYERS v3 documentation / FYERSDev `fyers-skills` references reviewed 2026-09-21.

## Market data
| Capability | Status | TradingCoreOS |
|---|---|---|
| Historical candles | Implemented | Dedicated history route + shared client |
| Quotes | Backend endpoint added | `/api/trading/fyers/quotes` |
| 5-level depth | Backend endpoint added | `/api/trading/fyers/depth` |
| Option Chain v3 | Backend endpoint added | `/api/trading/fyers/option-chain-v3` |
| Market status | Backend endpoint added | `/api/trading/fyers/market-status` |
| Futures chain | Backend endpoint added | `/api/trading/fyers/futures-chain` |
| Expired F&O | Backend endpoints added | `/api/trading/fyers/expired-fno/*` |
| Symbol masters | Existing | Daily cached masters/search |

## Realtime
| Capability | Status |
|---|---|
| SymbolUpdate | Hardened; runtime verification pending |
| DepthUpdate | Hardened; runtime verification pending |
| Order socket | Backend transport added; runtime verification pending |
| TBT 50-level | Pending |

## Trading/account
| Capability | Status |
|---|---|
| Orders | Existing broker layer; FYERS full-service extraction pending |
| Multi-order | Pending |
| Async orders | Pending |
| Positions | Existing broker layer; FYERS service extraction pending |
| Funds | Pending |
| Holdings | Pending |
| Margin | Pending |
| GTT/OCO | Pending |
| Smart Orders | Pending |
| Smart Exit / TP-SL | Pending |
| Reports | Pending |
| EDIS | Pending / jurisdiction/API-dependent |

## Intelligence
| Capability | Status |
|---|---|
| Option Greeks | Preserved by full Option Chain response |
| OI / OI change | Preserved by full Option Chain response |
| India VIX | Preserved by full Option Chain response |
| PCR analytics | Pending |
| IV analytics | Pending |
| Screeners | Pending |
| Price alerts | Pending |

## Rules
- Use the official symbol master rather than constructing derivative symbols blindly.
- Use WebSockets for live prices rather than quote polling loops.
- Respect FYERS documented 10 requests/sec, 200 requests/minute and 100,000/day limits.
- Respect order operation limits separately.
- Keep chart/history failure isolated from optional analytics/features.
- Never change UI while completing backend FYERS coverage unless explicitly instructed.


## v32.4 additions
- Account read services: profile, funds, holdings, orders, trades, positions.
- Multi-order margin preflight.
- Dedicated daily symbol-master service across all documented exchange segments.
