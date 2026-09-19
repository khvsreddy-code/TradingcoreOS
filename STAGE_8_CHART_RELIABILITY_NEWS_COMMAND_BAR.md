# Stage 8 — Chart Reliability, News, Top Command Bar & Crosshair

Implemented on top of the Stage 7 merged build.

## Chart reliability
- LiveChart retains the existing Core Chart / CoreSpirit separation.
- Historical chart failures no longer leave a completely unusable blank chart when a valid live quote exists.
- A broker live quote can seed one developing candle while websocket updates continue.
- Historical data remains authoritative when available; the live seed is explicitly a recovery path, not fabricated history.
- Chart lifecycle/error isolation is preserved.

## News
- Added `src/server/routes/news.routes.ts`.
- Added `src/services/news/newsService.ts`.
- Watchlist ticker detail now loads symbol-contextual news.
- Primary free provider is GDELT, proxied server-side to avoid browser CORS/API-key problems.
- News is cached briefly and requests are deduplicated.
- Headlines link to the originating publisher URL.
- News failure is isolated from the chart and watchlist quote feed.

## Right-side workspace rail
- Watchlist remains the right-side vertical rail entry.
- Removed the crowded stack of history/object/alert/calendar/help buttons from the right rail.
- Those utilities are represented in the top command bar instead.

## Top command bar
- Added horizontally scrollable command/tool area.
- Added Crosshair, Recent, Object Tree, Alerts, Calendar/Events and Help buttons.
- Existing symbol, favorite, timeframe, chart type, indicators, levels, option chain, AI, layout, replay, alert, drawing, fit, undo/redo, buy/sell controls remain.
- Existing visual language is preserved; this is an information architecture improvement rather than a redesign.

## Layering / z-index
- Top command bar is above the drawing rail so dropdowns/popovers cannot sit behind the left drawing toolbar.
- Drawing rail remains above the chart canvas.
- Popovers retain high local z-index within the command bar stacking context.

## Crosshair
- Core Chart supports a workspace-level `TRADINGCORE_CROSSHAIR` event.
- The top-bar crosshair control toggles Lightweight Charts crosshair between normal and hidden modes.
- The event is chart-index scoped, so multi-chart workspaces do not toggle unrelated charts.

## Free news-source guidance
- GDELT: primary free/open source for broad global news and no API-key dependency in this integration.
- Alpha Vantage NEWS_SENTIMENT: useful optional market-news/sentiment provider when a free key is configured, subject to its free request limits.
- NewsAPI: development/testing option only on its free tier; do not treat the free Developer plan as production infrastructure.
- Production architecture should keep news behind a provider abstraction so paid/licensed feeds can be added later without changing the watchlist UI.

## Still not complete
- Full multi-provider news ranking/deduplication.
- Publisher-specific licensing/redistribution controls.
- Rich ticker fundamentals/range data beyond the broker tick payload.
- Full TradingView-grade object-tree interaction, drawing hit-testing and editing.
- Full CoreSpirit chronological runtime remains a separate engine concern.

## Completion pass — 2026-09-18

Worker indicator rendering is RAF-batched, pending chart work is cancelled during lifecycle cleanup, and CoreDrawing selection/dragging uses data-coordinate hit testing. Full browser build/FPS validation remains a release gate because the extracted environment lacks installed dependencies.
