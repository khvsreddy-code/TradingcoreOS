import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { brokerRoutes } from './src/server/routes/broker.routes.js';
import { workspaceFixRoutes } from './src/server/routes/workspace-fix.routes.js';
import { brokerMarketDataRoutes } from './src/server/routes/broker-market-data.routes.js';
import { fyersHistoryRoutes } from './src/server/routes/fyers-history.routes.js';
import { upstoxHistoryRoutes } from './src/server/routes/upstox-history.routes.js';
import { portfolioSnapshotRoutes } from './src/server/routes/portfolio-snapshot.routes.js';
import { tradingRoutes } from './src/server/routes/trading.routes.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/api/health', (_req, res) => {
  const checks = {
    database: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    encryption: Boolean(process.env.ENCRYPTION_SECRET && process.env.ENCRYPTION_SECRET.length >= 32),
    upstox: Boolean(process.env.UPSTOX_CLIENT_ID && process.env.UPSTOX_CLIENT_SECRET && process.env.UPSTOX_REDIRECT_URI),
    fyers: Boolean(process.env.FYERS_CLIENT_ID && process.env.FYERS_CLIENT_SECRET && process.env.FYERS_REDIRECT_URI),
  };
  const ready = checks.database && checks.encryption && (checks.upstox || checks.fyers);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', system: 'TradingCore OS', version: '0.5.0', checks, timestamp: new Date().toISOString() });
});

app.use('/api/auth/broker', brokerRoutes);
// Workspace-fix routes must run before the legacy market-data routes so their
// improved suggestions and option-chain normalization win deterministically.
app.use('/api/trading', workspaceFixRoutes);
// Broker-specific routes must run before generic adapter routes.
// Historical routes are deliberately mounted before brokerMarketDataRoutes so
// the quota-safe implementations take precedence over legacy adapter paths.
app.use('/api/trading', fyersHistoryRoutes);
app.use('/api/trading', brokerMarketDataRoutes);
app.use('/api/trading', upstoxHistoryRoutes);
// Portfolio snapshots are also mounted before the generic trading route so the
// serialized/cached implementation is used instead of the old Promise.all fan-out.
app.use('/api/trading', portfolioSnapshotRoutes);
app.use('/api/trading', tradingRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api')) {
    console.error('[TradingCore API]', err);
    return res.status(Number(err?.statusCode || err?.status || 500)).json({ success: false, error: err?.message || 'Internal TradingCore API error' });
  }
  return next(err);
});

export default app;

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`[TradingCore OS] Server running on http://0.0.0.0:${PORT}`));
}

if (process.env.VERCEL !== '1') {
  startServer().catch((err) => console.error('[TradingCore OS] Server failed to start:', err));
}
