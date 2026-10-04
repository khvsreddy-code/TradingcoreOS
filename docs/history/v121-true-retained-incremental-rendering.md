# v121 — True retained incremental rendering

## Goal

Close the remaining #3 gap between having incremental renderer primitives and actually selecting them at the facade/diff-planner layer.

## Live data

The TCO facade detects the common live tail shapes and emits only append or replace-last payloads for line-like series. Vela's retained model mutates those points in place.

## Overlay state

The retained patch ABI now includes explicit collection deltas for tail-local backgrounds, price lines, drawings, tables and trade collections. Structural changes remain full replacements so correctness is never traded for a speculative diff.

## Drawing rasterization

Indicator drawing slices are cached by content revision, viewport and pane scale signature. Forming-bar ticks do not advance the drawing revision unless drawing content itself changed.

## Core rule

tick -> tiny patch -> retained mutation -> dirty surface.

The chart may still repaint visible candle geometry every frame because scale/price pixels change, but it must not rebuild history-sized object graphs or repaint unrelated retained drawing rasters.
