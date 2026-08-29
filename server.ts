import express from 'express';
import path from 'node:path';
import { brokerRoutes } from './src/server/routes/broker.routes.js';
import { tradingRoutes } from './src/server/routes/trading.routes.js';

const app = express();
app.set('trust proxy', 1);

app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'TradingCore OS Kernel',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth/broker', brokerRoutes);
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
