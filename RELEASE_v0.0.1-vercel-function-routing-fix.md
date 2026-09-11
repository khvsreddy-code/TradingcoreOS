# TradingCore OS v0.0.1 — Vercel Function Routing Fix

## Deployment fix

Fixed the Vercel deployment error:

`The pattern "api/index.ts" defined in functions doesn't match any Serverless Functions inside the api directory.`

### Changes
- Removed the explicit `functions.api/index.ts` override from `vercel.json`.
- Vercel now auto-detects `api/index.ts` as a Node.js/TypeScript Function.
- Changed the API rewrite destination from the source filename to `/api/index`.
- Kept the Vite frontend rewrite unchanged so `/api/*` requests reach the backend before the SPA fallback.
- Kept the existing Express application as the default export from `api/index.ts`.

This follows Vercel's current zero-configuration Function detection for TypeScript files under the root `api/` directory.
