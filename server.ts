import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { brokerRoutes } from './src/server/routes/broker.routes.js';
import { instrumentSearchPriorityRoutes } from './src/server/routes/instrument-search-priority.routes.js';
import { workspaceFixRoutes } from './src/server/routes/workspace-fix.routes.js';
import { brokerMarketDataRoutes } from './src/server/routes/broker-market-data.routes.js';
import { fyersHistoryRoutes } from './src/server/routes/fyers-history.routes.js';
import { coreSpiritResearchHistoryRoutes } from './src/server/routes/coreSpirit-research-history.routes.js';
import { fyersMarketRoutes } from './src/server/routes/fyers-market.routes.js';
import { fyersOrderStreamRoutes } from './src/server/routes/fyers-order-stream.routes.js';
import { fyersAccountRoutes } from './src/server/routes/fyers-account.routes.js';
import { fyersSymbolRoutes } from './src/server/routes/fyers-symbol.routes.js';
import { portfolioSnapshotRoutes } from './src/server/routes/portfolio-snapshot.routes.js';
import { tradingRoutes } from './src/server/routes/trading.routes.js';
import { automationIntegrationRoutes, automationGatewayRoutes } from './src/server/routes/automation-integration.routes.js';
import { automationSignalIngestRoutes } from './src/server/routes/automation-signal-ingest.routes.js';
import { productionPredictionRoutes } from './src/server/routes/production-prediction.routes.js';
import { newsRoutes } from './src/server/routes/news.routes.js';
import { yahooMarketDataRoutes } from './src/server/routes/yahoo-market-data.routes.js';
import { backgroundJobRoutes } from './src/server/routes/background-jobs.routes.js';
import { coreSpiritModelRoutes } from './src/server/routes/coreSpirit-models.routes.js';
import { coreSpiritCopilotRoutes } from './src/server/routes/coreSpirit-copilot.routes.js';
import { realtimeTicketRoutes } from './src/server/routes/realtime-ticket.routes.js';
import { requestDeadline } from './src/server/middleware/requestDeadline.js';
import { sharedBrokerCoordinationBackend, sharedBrokerCoordinationConfigured, sharedBrokerCoordinationHealthy } from './src/server/coordination/sharedBrokerCoordination.js';
import { getFyersQuotaTelemetry } from './src/server/fyers/core/FyersQuotaTelemetry.js';
import { requestContext, type TradingCoreRequest } from './src/server/middleware/requestContext.js';
import { createRateLimiter } from './src/server/middleware/rateLimit.js';
import { recordRequest, getRequestMetrics } from './src/server/observability/requestMetrics.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestContext);
app.use(requestDeadline);
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

app.use((req: TradingCoreRequest, res, next) => {
  res.on('finish', () => {
    recordRequest(res.statusCode, Date.now() - (req.tradingCoreStartedAt || Date.now()), { requestId: req.tradingCoreRequestId, reason: req.tradingCoreRequestReason, route: `${req.method} ${req.route?.path || req.path}` });
  });
  next();
});

// Keep the global body cap tight, but give explicitly bounded history/research routes
// enough space for up to 5000 OHLCV bars or 5000 x 16 scalar research rows. Route schemas
// enforce row/feature limits, and these parsers run before the global 512 KiB parser.
app.use('/api/predictions/production', express.json({ limit: '3mb' }));
app.use('/api/corespirit/models', express.json({ limit: '4mb' }));
// Chunk ingestion has its own immutable per-chunk 4 MiB serialized limit; give JSON framing room above it.
app.use('/api/corespirit/dataset-batches', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '512kb' }));
app.use(createRateLimiter({ windowMs: 60_000, max: 180, name: 'api', key: (req) => req.ip || 'unknown' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  const scriptPolicy = process.env.NODE_ENV === 'production' ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  res.setHeader('Content-Security-Policy', [
    `default-src 'self'`,
    `script-src ${scriptPolicy}`,
    `style-src 'self' 'unsafe-inline' https:`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https:`,
    `connect-src 'self' https: wss: ws:`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; '));
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

function healthChecks() {
  // FYERS REST admission always requires shared coordination in production.
  const coordinationRequired = process.env.NODE_ENV === 'production' || process.env.TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true';
  const realtimeGatewayRequired = process.env.REALTIME_GATEWAY_REQUIRED === 'true';
  const configuredGatewayUrl = String(process.env.REALTIME_GATEWAY_URL || '').trim().replace(/\/$/, '');
  const realtimeGatewayConfigured = Boolean(
    process.env.REALTIME_GATEWAY_SHARED_SECRET &&
    (configuredGatewayUrl || process.env.VERCEL === '1'),
  );
  return {
    database: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)),
    encryption: Boolean(process.env.ENCRYPTION_SECRET && process.env.ENCRYPTION_SECRET.length >= 32),
    fyers: Boolean(process.env.FYERS_CLIENT_ID && process.env.FYERS_CLIENT_SECRET && process.env.FYERS_REDIRECT_URI),
    coordination: sharedBrokerCoordinationConfigured(),
    coordinationBackend: sharedBrokerCoordinationBackend(),
    coordinationRequired,
    coordinationReachable: false,
    realtimeGatewayRequired,
    realtimeGatewayConfigured,
    realtimeGateway: realtimeGatewayConfigured,
  };
}

function requestOrigin(req: express.Request): string {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.get('host') || '').trim();
  return host ? `${proto}://${host}` : '';
}

async function realtimeGatewayReady(req: express.Request): Promise<boolean> {
  if (process.env.REALTIME_GATEWAY_REQUIRED !== 'true') return true;
  if (!healthChecks().realtimeGatewayConfigured) return false;
  const configuredGatewayUrl = String(process.env.REALTIME_GATEWAY_URL || '').trim().replace(/\/$/, '');
  const healthUrl = configuredGatewayUrl
    ? `${configuredGatewayUrl}/healthz`
    : `${requestOrigin(req)}/api/realtime/healthz`;
  try {
    const response = await fetch(healthUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1_000),
      headers: { accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

app.get('/api/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok', system: 'TradingCore OS', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', async (req, res) => {
  const checks = healthChecks();
  const signal = (req as TradingCoreRequest).tradingCoreAbortSignal;
  const [gatewayReachable, coordinationReachable] = await Promise.all([
    realtimeGatewayReady(req),
    checks.coordinationRequired ? sharedBrokerCoordinationHealthy(signal) : Promise.resolve(checks.coordination),
  ]);
  checks.realtimeGateway = gatewayReachable;
  checks.coordinationReachable = coordinationReachable;
  const ready = checks.database &&
    checks.encryption &&
    checks.fyers &&
    (!checks.coordinationRequired || (checks.coordination && checks.coordinationReachable)) &&
    (!checks.realtimeGatewayRequired || checks.realtimeGateway);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', system: 'TradingCore OS', checks, timestamp: new Date().toISOString() });
});

app.get('/api/health/diagnostics', async (req, res) => {
  const checks = healthChecks();
  const signal = (req as TradingCoreRequest).tradingCoreAbortSignal;
  const [gatewayReachable, coordinationReachable] = await Promise.all([
    realtimeGatewayReady(req),
    checks.coordinationRequired ? sharedBrokerCoordinationHealthy(signal) : Promise.resolve(checks.coordination),
  ]);
  checks.realtimeGateway = gatewayReachable;
  checks.coordinationReachable = coordinationReachable;
  res.status(200).json({
    system: 'TradingCore OS', version: '0.5.0', checks, metrics: getRequestMetrics(),
    fyersQuota: getFyersQuotaTelemetry(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (req, res) => {
  const checks = healthChecks();
  checks.coordinationReachable = checks.coordinationRequired
    ? await sharedBrokerCoordinationHealthy((req as TradingCoreRequest).tradingCoreAbortSignal)
    : checks.coordination;
  const ready = checks.database &&
    checks.encryption &&
    checks.fyers &&
    (!checks.coordinationRequired || (checks.coordination && checks.coordinationReachable));
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', system: 'TradingCore OS', version: '0.5.0', checks, timestamp: new Date().toISOString() });
});

app.use('/api/auth/broker', brokerRoutes);
// The prioritized FYERS search route must run before the broader workspace-fix
// search route so plain "nifty" ranks NIFTY 50 ahead of FINNIFTY.
app.use('/api/trading', instrumentSearchPriorityRoutes);
// Workspace-fix routes must run before the legacy market-data routes so their
// improved suggestions and option-chain normalization win deterministically.
app.use('/api/trading', workspaceFixRoutes);
// Broker-specific routes must run before generic adapter routes.
// Historical and market routes are deliberately mounted before generic adapter paths
// so the quota-safe FYERS implementations take precedence.
app.use('/api/trading', fyersHistoryRoutes);
app.use('/api/trading', fyersMarketRoutes);
app.use('/api/trading', fyersOrderStreamRoutes);
app.use('/api/trading', fyersAccountRoutes);
app.use('/api/trading', fyersSymbolRoutes);
app.use('/api/trading', brokerMarketDataRoutes);
// Portfolio snapshots are also mounted before the generic trading route so the
// serialized/cached implementation is used instead of the old Promise.all fan-out.
app.use('/api/trading', portfolioSnapshotRoutes);
app.use('/api/trading', tradingRoutes);
// Signed CoreSpirit ingress is mounted before bearer-token workflow endpoints.
app.use('/api/automation-integrations', automationIntegrationRoutes);
app.use('/api/automation-gateway', automationSignalIngestRoutes);
app.use('/api/automation-gateway', automationGatewayRoutes);
app.use('/api/predictions/production', productionPredictionRoutes);
app.use('/api/jobs', backgroundJobRoutes);
app.use('/api/corespirit/copilot', coreSpiritCopilotRoutes);
// Research, replay and model inference share the same authenticated FYERS + TV dataset policy.
app.use('/api/corespirit/research', coreSpiritResearchHistoryRoutes);
app.use('/api/corespirit', coreSpiritModelRoutes);
app.use('/api/realtime/ticket', realtimeTicketRoutes);
app.use('/api/market-data/yahoo', yahooMarketDataRoutes);
app.use('/api', newsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api')) {
    const record = err && typeof err === 'object' ? err as Record<string, unknown> : {};
    console.error('[TradingCore API]', { requestId: req.get('x-request-id'), error: err });
    const status = Number(record.statusCode || record.status || 500);
    const message = typeof record.message === 'string' ? record.message : 'Internal TradingCore API error';
    return res.status(status).json({ success: false, error: message, requestId: req.get('x-request-id') || null });
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
