# v100 — Live Terminal Visual Density

Date: 2026-09-29

## Intent

Refine the v99 chart-first terminal so `/live` reads like a professional trading workstation rather than a SaaS dashboard. The change is visual and host-scoped.

## Rules

```text
chart infrastructure → 0–2px radius
controls             → 0–4px radius
popovers             → ≤6px radius
decorative shadows   → off
separation           → 1px dividers
density              → typography + spacing
accent               → blue
```

The chart remains the primary surface. Watchlist/order book/alerts remain docked at right; Positions/Orders/Trades/Activity/Strategy Log/Order Ticket remain docked at bottom. No card redesign is required to preserve these functions.

## Compatibility

The v100 pass does not change the canonical live terminal owner, workspace persistence shape, chart event bridge, market-data subscriptions, or CoreSpirit execution boundary established by v99 and earlier releases.
