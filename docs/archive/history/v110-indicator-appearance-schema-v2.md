# v110 — Indicator Appearance Schema v2

Date: 2026-09-29

## Scope

v110 deepens the schema-driven indicator editor and renderer boundary established in v109. It does not change CoreSpirit grammar, compiler/IR/VM semantics, broker execution authority or the canonical market-data ownership model.

## Delivered

- Schema ABI advanced to v2.
- Line appearance expanded to opacity, width, dash style, gradient, glow and context visibility.
- Fill, marker, level and pane/scale appearance became declarative schema surfaces.
- Computation identity is separated from appearance identity.
- Incremental indicator runtime and shared worker coordinator now use the canonical computation signature.
- Worker payloads exclude appearance-only fields.
- LiveChart has separate compute and appearance reactive effects.
- Vela facade exposes fill and pane presentation mutation without mathematical recomputation.
- v1 custom schemas are upgraded to v2 in memory for backward compatibility.

## Non-interference rule

Appearance changes must never cause a calculation reset, worker reseed, indicator-engine evaluation or historical data request. Only an input/source/definition identity change may invalidate mathematical state.
