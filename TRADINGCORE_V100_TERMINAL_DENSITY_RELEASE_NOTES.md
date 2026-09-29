# TradingCoreOS v100 — Terminal Visual Density

Date: 2026-09-29

## Scope

v100 is a live-terminal presentation release. It follows the v99 terminal-shell consolidation and does not change market-data, chart data-plane, broker, execution, or CoreSpirit architecture.

## Visual system

- Removed the card-heavy visual treatment from `/live`.
- Chart infrastructure is flat with 0–2px geometry and thin separators.
- Terminal controls use compact 0–4px rounding.
- Popovers are capped at 6px rounding.
- Decorative shadows are removed from live terminal infrastructure.
- Dense information is grouped by dividers, typography and spacing rather than nested cards.
- Blue remains the structural accent; semantic market colors remain available for positive/negative data.
- Landing/marketing surfaces retain their existing premium/glow styling.

## Non-interference

No broker transport, history pagination, live quote heartbeat, chart data plane, CoreSpirit language/compiler/IR/VM, or execution path was intentionally modified by v100.

## Verification

- `TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK`
- Existing contract suite remains the required regression gate.
- Full dependency-backed typecheck/build remains deployment-environment dependent when dependencies are unavailable in the archive.
