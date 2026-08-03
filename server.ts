import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { brokerRoutes } from './src/server/routes/broker.routes.js';
import { tradingRoutes } from './src/server/routes/trading.routes.js';

const app = express();

app.use(express.json());

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'TradingCore OS Kernel',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount Clean Unified Broker API Router FIRST
app.use('/api/auth/broker', brokerRoutes);
app.use('/api/trading', tradingRoutes);

export default app;

async function startServer() {
  const PORT = process.env.PORT || 3000;

  // Development vs Production static asset & Vite middleware serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TradingCore OS] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[TradingCore OS] Server failed to start:', err);
});
