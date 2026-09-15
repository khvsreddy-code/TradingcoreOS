import app from '../server.js';

/**
 * Single authoritative Vercel Node function for TradingCore's Express API.
 * vercel.json rewrites every /api/* request to this function so nested API
 * routes are never left to the Vite SPA router.
 */
export default app;
