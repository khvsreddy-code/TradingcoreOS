import app from '../../../server.js';

// Explicit broker function. Vercel must not send the streaming endpoint through the SPA rewrite.
export default app;
