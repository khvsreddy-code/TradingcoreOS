import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(vercel.services?.web?.functions?.['api/index.ts']?.maxDuration, 15);
assert.equal(vercel.services?.realtimefresh?.runtime, 'container');
assert.equal(vercel.services?.realtimefresh?.entrypoint, 'Dockerfile');
assert.equal(vercel.services?.realtimefresh?.ignoreCommand, 'node tools/ignore-realtime-build.mjs');
assert.ok(vercel.rewrites?.some((route) => route.source === '/api/realtime/healthz' && route.destination?.service === 'realtimefresh'), 'health route must target the deployed realtime service');
assert.ok(vercel.rewrites?.some((route) => route.source === '/api/realtime/ws' && route.destination?.service === 'realtimefresh'), 'WebSocket route must target the deployed realtime service');
assert.ok(vercel.rewrites?.some((route) => route.source === '/api/:path*' && route.destination?.service === 'web'), 'API routes must target the web service');
assert.ok(vercel.rewrites?.some((route) => route.source === '/(.*)' && route.destination?.service === 'web'), 'SPA routes must target the web service');
assert.deepEqual(vercel.regions, ['bom1'], 'India-first Vercel functions must remain in Mumbai (bom1)');
assert.ok(vercel.services?.web?.functions?.['api/queue.ts'], 'queue worker must remain separate from api/index');

const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
assert.match(server, /requestDeadline/);
assert.match(server, /realtimeTicketRoutes/);

const gate = fs.readFileSync(new URL('./server/brokers/BrokerRequestGate.ts', import.meta.url), 'utf8');
assert.match(gate, /getSharedRedis/);
assert.match(gate, /distributedEnabled/);
assert.match(gate, /ADMISSION|admission/i);

const redis = fs.readFileSync(new URL('./server/coordination/UpstashRedisRest.ts', import.meta.url), 'utf8');
assert.match(redis, /UPSTASH_REDIS_REST_URL/);
assert.match(redis, /acquireLock/);
assert.match(redis, /incrementWindow/);

const ticket = fs.readFileSync(new URL('./server/realtime/ticket.ts', import.meta.url), 'utf8');
assert.match(ticket, /createHmac/);
assert.match(ticket, /REALTIME_GATEWAY_SHARED_SECRET/);

const gateway = fs.readFileSync(new URL('../realtime-gateway/server.ts', import.meta.url), 'utf8');
assert.match(gateway, /SUPABASE_URL/);
assert.match(gateway, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(gateway, /claim_realtime_gateway_owner/);
assert.match(gateway, /realtime_gateway_subscriptions/);
assert.match(gateway, /realtime_gateway_owner/);
assert.match(gateway, /broadcast/);
assert.match(gateway, /COORDINATION_CHANNEL/);
assert.match(gateway, /verifyRealtimeTicket/);
assert.match(gateway, /\/api\/realtime\/healthz/, 'the Vercel health rewrite path must be handled by the gateway');
assert.match(gateway, /WebSocketServer/);

const frontend = fs.readFileSync(new URL('./frontendPerformanceContract.test.mjs', import.meta.url), 'utf8');
assert.match(frontend, /frontend performance architecture contract: OK/);

const marketClient = fs.readFileSync(new URL('./services/marketData/BrokerMarketDataClient.ts', import.meta.url), 'utf8');
assert.match(marketClient, /\/api\/realtime\/ticket/);
assert.match(marketClient, /new WebSocket/);
assert.match(marketClient, /connectLegacy/);
assert.match(marketClient, /VITE_REALTIME_LEGACY_FALLBACK/);

console.log('TRADINGCORE_REALTIME_REQUEST_PLANE_CONTRACT_OK');
