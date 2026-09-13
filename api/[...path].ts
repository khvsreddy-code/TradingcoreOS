import app from '../server.js';

/**
 * Vercel catch-all API function for the Express backend.
 *
 * The browser and frontend are built with Vite, while the authenticated
 * trading API is implemented in Express. Keeping one catch-all Node function
 * under /api guarantees that nested routes such as /api/trading/fyers/* and
 * /api/auth/broker/* reach Express instead of Vite's SPA fallback HTML.
 */
export default app;
