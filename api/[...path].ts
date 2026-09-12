import app from '../server.js';

// Catch-all Vercel Function for the Express API.
// api/index.ts only maps the /api root; nested API paths such as
// /api/auth/broker/login need a dynamic function route so Express receives
// the full request and can dispatch its existing /api/* routes.
export default app;
