# TradingCore OS — v0.0.10 API Routing Fix

## Problem

Both FYERS and Upstox displayed:

`Unexpected token 'T', "The page c..." is not valid JSON`

This is not a broker-specific market-data error. It means the browser requested a TradingCore `/api/...` endpoint and received an HTML page instead of the JSON API response.

## Root Cause

TradingCore contains a Vite frontend and an Express backend. On the affected Vercel deployment, nested `/api/*` requests were still reaching the Vite/SPA deployment path instead of the Express application.

That explains why the exact same JSON parsing error appeared for both brokers.

## Fix

- Restored a single Vercel catch-all Node function at `api/[...path].ts`.
- The function delegates every `/api/*` request to the existing Express app in `server.ts`.
- Removed the old duplicate API-function approach; there is now one authoritative API entrypoint.
- Explicitly keeps Vite as the frontend framework while `/api/*` is handled by the Node function.
- API responses remain JSON-only through the Express API 404/error middleware.
- FYERS and Upstox continue to use their existing broker-specific data pipelines.

## Important distinction

The previous FYERS WebSocket HTTP 500 issue is separate. This release fixes the shared frontend-to-TradingCore API routing problem that produces the HTML-as-JSON error. FYERS live-feed fallback logic from v0.0.9 remains intact.
