import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { brokerRoutes } from './src/server/routes/broker.routes.js';
import { brokerMarketDataRoutes } from './src/server/routes/broker-market-data.routes.js';
import { tradingRoutes } from './src/server/routes/trading.routes.js';

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '32kb' }));

// Security headers
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
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    system: 'TradingCore OS',
    version: '0.5.0',
    checks,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth/broker', brokerRoutes);
// FYERS-specific historical/stream routes must run before the generic adapter routes.
app.use('/api/trading', brokerMarketDataRoutes);
app.use('/api/trading', tradingRoutes);

export default app;

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TradingCore OS] Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer().catch((err) => {
    console.error('[TradingCore OS] Server failed to start:', err);
  });
}
