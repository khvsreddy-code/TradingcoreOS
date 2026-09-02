# TradingCoreOS V22 — Phase 3 Chart Engine

Phase 3 upgrades the existing Lightweight Charts workspace without replacing the working broker feed.

## Included
- Persistent chart layout state per symbol
- Restore active overlay indicators and oscillator pane
- Active indicator chips with one-click removal
- Live/Go Live control after manual chart navigation
- Screenshot export from the chart canvas
- OHLC/Delta/live-feed legend
- Keyboard shortcuts: Esc, Ctrl/Cmd+K, L
- Batched live-tick rendering through requestAnimationFrame
- Incremental chart updates preserved; no full chart rebuild per tick
- Responsive ResizeObserver handling for chart, volume and oscillator panes
- Existing India price-action and OI level toggles retained
- Clean default chart remains the default

## Performance principle
Lightweight Charts is used as the rendering layer because TradingView describes it as a high-performance, streaming-capable client-side charting library. V22 avoids calling setData for every live tick and batches incoming ticks into one browser animation-frame update.

## Validation
- Python compilation: PASS
- ZIP integrity: PASS
