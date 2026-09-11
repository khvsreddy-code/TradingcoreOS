import app from '../server.js';

// Vercel auto-detects TypeScript files under /api as Node.js Functions.
// Keep the Express app as the default export; routing is handled by server.ts.
export default app;
