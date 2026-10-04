# Archived CoreSpirit Build Tracker — 2026-10-04

> Historical compatibility record. This file is retained only for regression-contract references. The active source of truth is `docs/CORESPIRIT_BUILD_TRACKER.md`.

## v110 indicator appearance schema v2

The indicator appearance contract separated presentation state from mathematical computation. Appearance-only fields include line color/width/style/opacity, fill controls, marker presentation and pane presentation.

## buildIndicatorComputationSignature

Indicator worker requests use a computation signature derived from mathematical inputs. Presentation changes must not invalidate mathematical computation.

## appearance-only fields

Appearance-only changes are applied on the renderer/UI side and do not request a fresh mathematical calculation.

## worker transport

Worker payloads carry computation-relevant configuration rather than spreading appearance-heavy configuration into every computation request.

## Vela renderer-only fill

Vela receives renderer-only fill/presentation mutations separately from indicator computation so channel appearance can update without recalculating the indicator.

## v107 incremental indicator execution

Incremental indicator execution uses bounded state and tail updates for forming-bar changes where supported. The active tracker supersedes this historical record.

## Historical status

This document is intentionally archival and contains no active architecture requirements.
