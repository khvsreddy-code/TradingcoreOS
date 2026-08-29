import express from 'express';
import { brokerRoutes } from '../src/server/routes/broker.routes';
import { tradingRoutes } from '../src/server/routes/trading.routes';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', system: 'TradingCore OS', version: 'web-1.0.0', timestamp: new Date().toISOString() });
});

app.use('/api/auth/broker', brokerRoutes);
app.use('/api/trading', tradingRoutes);

export default app;
