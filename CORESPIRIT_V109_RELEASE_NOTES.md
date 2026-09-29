# CoreSpirit v109 — Indicator Schema Architecture

Date: 2026-09-29

## Architecture lock

v109 does not create a second language or renderer. It deepens the v108 CoreSpirit-first + Vela boundary by making indicator customization declarative from one versioned schema.

```text
CoreSpirit / native indicator definition
        ↓
IndicatorSettingsSchema
        ↓
Universal settings editor
        ↓
workspace normalized values
        ↓
public schema + values snapshot
        ↓
TCO render intent
        ↓
Vela adapter
```

## Completed

- Added the canonical `IndicatorSettingsSchema` ABI.
- Unified Inputs / Style / Display / Behavior / Alerts / Visualization metadata.
- Added layout and output declarations plus execution/renderer capability metadata.
- Added safe schema validation and nested immutable-style patch writes, with defense-in-depth rejection of unsafe prototype-pollution paths, bounded schema identities/layouts/outputs, and custom-schema kind matching.
- Replaced manual settings UI branches in the Indicators workspace and `/live` indicator editor.
- Added conditional field visibility and advanced controls to the universal editor.
- Normalized workspace settings from schema defaults.
- Extended public publication snapshots with schema + resolved values while retaining legacy keys.
- Made live chart refresh observe the full schema-derived settings fingerprint.
- Extended roadmap to stage 145.

## Compatibility

Existing `IndicatorConfig` fields remain supported. The schema is additive, and the existing `indicator_publications.indicator_settings` JSONB column is sufficient for the richer snapshot. Existing release manifests and historical tracker entries remain historical records.

## Security

Custom schemas are metadata, not executable code. Validation rejects unsafe path segments and malformed field declarations. Indicator settings never contain broker credentials or direct broker authority.

## Remaining

Lower-level Vela performance deepening remains on D1–D6: typed-array ingress, viewport LOD, stable render packets, retained drawings, multi-chart synchronization and frame/GPU budgets. Full browser and deployed smoke verification is still required before claiming end-to-end production validation.
