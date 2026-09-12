import app from '../server.js';

// Single Express entrypoint for every /api/* route.
// Vercel rewrites /api/* to this function so nested Express routes retain
// their original request path and middleware context.
export default app;

export const config = { maxDuration: 60 };
