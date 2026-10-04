# v95 — Canonical data plane and chart engine decomposition

## Goal

Deepen v94 zero-copy storage into a single shared consumer data plane and a renderer-neutral chart platform.

## Accepted architecture

Market history has one canonical owner per symbol/timeframe timeline. Indicators, models and charting borrow typed views. Only derived outputs and execution state belong to consumers.

Charting is decomposed into data, interaction, viewport/scales, retained scene/panes and rendering coordination. Lightweight Charts remains the production renderer until native parity is demonstrated.

## Verification

Focused v95 TypeScript compilation passes for the new data/chart subsystem. Source contract validation passes. Full application build is still environment-dependent on the supplied dependency installation.
