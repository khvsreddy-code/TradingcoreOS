import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from 'redis';
import { BrokerRepository } from '../src/server/storage/BrokerRepository.js';
import { EncryptionService } from '../src/server/encryption/EncryptionService.js';
import { FyersMarketDataTransport } from '../src/server/marketData/FyersMarketDataTransport.js';
import { FyersOrderStreamTransport } from '../src/server/fyers/trading/FyersOrderStreamTransport.js';
import { verifyRealtimeTicket } from '../src/server/realtime/ticket.js';

const PORT = Number(process.env.REALTIME_GATEWAY_PORT || process.env.PORT || 8080);
const INSTANCE_ID = String(process.env.REALTIME_GATEWAY_INSTANCE_ID || crypto.randomUUID());
const REDIS_URL = String(process.env.REALTIME_REDIS_URL || process.env.REDIS_URL || '').trim();
const OWNER_TTL_MS = 15_000;
const OWNER_RENEW_MS = 5_000;
const SUB_TTL_MS = 35_000;
const SUB_TOUCH_MS = 10_000;
const OWNER_WATCH_MS = 5_000;
const EVENT_CHANNEL = 'tco:realtime:events';
const CONTROL_CHANNEL = 'tco:realtime:control';

type RealtimeKind = 'market' | 'orders' | 'both';
type ConnectionRecord = {
  userId: string;
  connectionId: string;
  kind: RealtimeKind;
  symbols: string[];
  updatedAt: number;
};

type LocalConnection = ConnectionRecord & { socket: WebSocket; subscriptionKey: string; heartbeat: NodeJS.Timeout; ownerWatch: NodeJS.Timeout };

type OwnedUser = {
  ownerValue: string;
  renewTimer: NodeJS.Timeout;
  marketListener: (event: any) => void;
  orderListener: (event: any) => void;
};

if (!REDIS_URL) {
  throw new Error('REALTIME_REDIS_URL (or REDIS_URL) is required for the realtime gateway.');
}
if (!process.env.REALTIME_GATEWAY_SHARED_SECRET) {
  throw new Error('REALTIME_GATEWAY_SHARED_SECRET is required for the realtime gateway.');
}

const redis = createClient({ url: REDIS_URL });
const subscriber = redis.duplicate();

redis.on('error', (error) => console.error('[TradingCore realtime redis]', error));
subscriber.on('error', (error) => console.error('[TradingCore realtime subscriber]', error));

const localConnections = new Map<string, LocalConnection>();
const connectionsByUser = new Map<string, Set<string>>();
const ownedUsers = new Map<string, OwnedUser>();

const RELEASE_LOCK_LUA = [
  "if redis.call('get', KEYS[1]) == ARGV[1] then",
  "  return redis.call('del', KEYS[1])",
  "end",
  "return 0",
].join(' ');

const RENEW_LOCK_LUA = [
  "if redis.call('get', KEYS[1]) == ARGV[1] then",
  "  return redis.call('pexpire', KEYS[1], ARGV[2])",
  "end",
  "return 0",
].join(' ');

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ownerKey(userId: string): string {
  return 'tco:realtime:owner:' + userId;
}

function subscriptionSetKey(userId: string): string {
  return 'tco:realtime:subs:' + userId;
}

function parseKind(value: string): RealtimeKind {
  const kind = value.toLowerCase();
  return kind === 'orders' || kind === 'both' ? kind : 'market';
}

function parseSymbols(value: string): string[] {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .slice(0, 100),
  )];
}

function activeLocalUsers(): string[] {
  return [...connectionsByUser.keys()];
}

function userHasLocalConnections(userId: string): boolean {
  return (connectionsByUser.get(userId)?.size || 0) > 0;
}

function userSubscriptionKey(record: ConnectionRecord): string {
  return 'tco:realtime:sub:' + record.userId + ':' + INSTANCE_ID + ':' + record.connectionId;
}

async function publishControl(record: ConnectionRecord, action: 'upsert' | 'remove'): Promise<void> {
  await redis.publish(CONTROL_CHANNEL, JSON.stringify({
    action,
    ...record,
  }));
}

async function writeSubscription(record: ConnectionRecord): Promise<string> {
  const key = userSubscriptionKey(record);
  await redis.set(key, JSON.stringify(record), { PX: SUB_TTL_MS });
  await redis.sAdd(subscriptionSetKey(record.userId), key);
  return key;
}

async function touchSubscription(connection: LocalConnection): Promise<void> {
  await redis.set(connection.subscriptionKey, JSON.stringify({
    userId: connection.userId,
    connectionId: connection.connectionId,
    kind: connection.kind,
    symbols: connection.symbols,
    updatedAt: Date.now(),
  } satisfies ConnectionRecord), { PX: SUB_TTL_MS });
}

async function removeSubscription(connection: LocalConnection): Promise<void> {
  await redis.del(connection.subscriptionKey);
  await redis.sRem(subscriptionSetKey(connection.userId), connection.subscriptionKey);
}

async function acquireOwnership(userId: string): Promise<boolean> {
  if (ownedUsers.has(userId)) return true;
  const value = INSTANCE_ID + ':' + userId;
  const acquired = await redis.set(ownerKey(userId), value, { NX: true, PX: OWNER_TTL_MS });
  if (acquired !== 'OK') return false;

  const marketListener = (event: any) => {
    void redis.publish(EVENT_CHANNEL, JSON.stringify({ type: 'market', userId, event })).catch(() => undefined);
  };
  const orderListener = (event: any) => {
    void redis.publish(EVENT_CHANNEL, JSON.stringify({ type: 'order', userId, event })).catch(() => undefined);
  };

  const renewTimer = setInterval(() => {
    void renewOwnership(userId).catch((error) => console.error('[TradingCore realtime owner renew]', error));
  }, OWNER_RENEW_MS);

  ownedUsers.set(userId, { ownerValue: value, renewTimer, marketListener, orderListener });
  await syncOwnedUser(userId);
  return true;
}

async function renewOwnership(userId: string): Promise<void> {
  const owned = ownedUsers.get(userId);
  if (!owned) return;
  const renewed = Number(await redis.eval(RENEW_LOCK_LUA, {
    keys: [ownerKey(userId)],
    arguments: [owned.ownerValue, String(OWNER_TTL_MS)],
  })) === 1;
  if (renewed) return;
  await stopOwnership(userId);
}

async function stopOwnership(userId: string): Promise<void> {
  const owned = ownedUsers.get(userId);
  if (!owned) return;
  clearInterval(owned.renewTimer);
  ownedUsers.delete(userId);
  FyersMarketDataTransport.disconnect(userId);
  FyersOrderStreamTransport.disconnect(userId);
  await redis.eval(RELEASE_LOCK_LUA, {
    keys: [ownerKey(userId)],
    arguments: [owned.ownerValue],
  }).catch(() => undefined);
}

async function loadDesiredConnections(userId: string): Promise<ConnectionRecord[]> {
  const keys = await redis.sMembers(subscriptionSetKey(userId));
  if (!keys.length) return [];
  const rows = await redis.mGet(keys);
  const active: ConnectionRecord[] = [];
  const staleKeys: string[] = [];
  rows.forEach((raw, index) => {
    if (!raw) {
      staleKeys.push(keys[index]);
      return;
    }
    try {
      const value = JSON.parse(raw) as ConnectionRecord;
      if (!value.userId || !value.connectionId) {
        staleKeys.push(keys[index]);
        return;
      }
      active.push(value);
    } catch {
      staleKeys.push(keys[index]);
    }
  });
  if (staleKeys.length) {
    await redis.sRem(subscriptionSetKey(userId), staleKeys);
  }
  return active;
}

async function brokerToken(userId: string): Promise<string> {
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') throw new Error('Fyers is not connected for this account.');
  return EncryptionService.decrypt(session.accessTokenEncrypted);
}

async function syncOwnedUser(userId: string): Promise<void> {
  if (!ownedUsers.has(userId)) return;

  const desired = await loadDesiredConnections(userId);
  const market = desired.filter((item) => item.kind === 'market' || item.kind === 'both');
  const orders = desired.some((item) => item.kind === 'orders' || item.kind === 'both');
  const symbols = [...new Set(market.flatMap((item) => item.symbols))];

  if (!desired.length) {
    await stopOwnership(userId);
    return;
  }

  try {
    const token = await brokerToken(userId);
    if (symbols.length) {
      const owned = ownedUsers.get(userId)!;
      FyersMarketDataTransport.subscribe(
        userId,
        token,
        symbols,
        owned.marketListener,
      );
    } else {
      FyersMarketDataTransport.disconnect(userId);
    }

    if (orders) {
      const owned = ownedUsers.get(userId)!;
      FyersOrderStreamTransport.subscribe(userId, token, owned.orderListener);
    } else {
      FyersOrderStreamTransport.disconnect(userId);
    }
  } catch (error) {
    await redis.publish(EVENT_CHANNEL, JSON.stringify({
      type: 'system',
      userId,
      event: { type: 'error', error: error instanceof Error ? error.message : 'Unable to initialize broker realtime session' },
    })).catch(() => undefined);
  }
}

async function ensureOwnership(userId: string): Promise<void> {
  if (!userHasLocalConnections(userId)) return;
  if (ownedUsers.has(userId)) return;
  const acquired = await acquireOwnership(userId);
  if (acquired) return;
}

function broadcastEvent(payload: any): void {
  const userId = String(payload?.userId || '');
  if (!userId) return;
  const localIds = connectionsByUser.get(userId);
  if (!localIds?.size) return;

  for (const connectionId of localIds) {
    const connection = localConnections.get(connectionId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) continue;

    if (payload.type === 'market' && (connection.kind === 'orders')) continue;
    if (payload.type === 'market' && payload.event?.type === 'tick') {
      const symbol = String(payload.event?.tick?.instrumentKey || '');
      if (symbol && connection.symbols.length && !connection.symbols.includes(symbol)) continue;
    }
    if (payload.type === 'order' && connection.kind === 'market') continue;

    try {
      connection.socket.send(JSON.stringify(payload.event));
    } catch {
      // The close handler will remove the connection.
    }
  }
}

async function handleControl(message: string): Promise<void> {
  let event: any;
  try { event = JSON.parse(message); } catch { return; }
  const userId = String(event?.userId || '');
  if (!userId || !ownedUsers.has(userId)) return;
  await syncOwnedUser(userId);
}

async function handleConnection(socket: WebSocket, request: http.IncomingMessage): Promise<void> {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  let ticket;
  try {
    ticket = verifyRealtimeTicket(String(requestUrl.searchParams.get('ticket') || ''));
  } catch (error) {
    socket.close(1008, error instanceof Error ? error.message : 'Invalid realtime ticket');
    return;
  }

  const kind = parseKind(String(requestUrl.searchParams.get('kind') || 'market'));
  const symbols = parseSymbols(String(requestUrl.searchParams.get('symbols') || ''));
  if ((kind === 'market' || kind === 'both') && !symbols.length) {
    socket.close(1008, 'At least one market symbol is required.');
    return;
  }

  const connectionId = crypto.randomUUID();
  const record: ConnectionRecord = {
    userId: ticket.sub,
    connectionId,
    kind,
    symbols,
    updatedAt: Date.now(),
  };
  const subscriptionKey = await writeSubscription(record);
  const local: LocalConnection = {
    ...record,
    socket,
    subscriptionKey,
    heartbeat: setInterval(() => {
      void touchSubscription(local).catch(() => undefined);
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.ping(); } catch {}
      }
    }, SUB_TOUCH_MS),
    ownerWatch: setInterval(() => {
      void ensureOwnership(local.userId).catch((error) => console.error('[TradingCore realtime ownership]', error));
    }, OWNER_WATCH_MS),
  };

  localConnections.set(connectionId, local);
  let ids = connectionsByUser.get(record.userId);
  if (!ids) { ids = new Set(); connectionsByUser.set(record.userId, ids); }
  ids.add(connectionId);

  socket.on('pong', () => { void touchSubscription(local).catch(() => undefined); });
  socket.on('message', async (raw) => {
    let message: any;
    try { message = JSON.parse(raw.toString()); } catch { socket.send(JSON.stringify({ type: 'error', error: 'Invalid realtime message.' })); return; }
    if (message?.type !== 'subscribe') return;
    const nextKind = parseKind(String(message.kind || local.kind));
    const nextSymbols = parseSymbols(String(message.symbols || local.symbols.join(',')));
    if ((nextKind === 'market' || nextKind === 'both') && !nextSymbols.length) {
      socket.send(JSON.stringify({ type: 'error', error: 'At least one market symbol is required.' }));
      return;
    }
    local.kind = nextKind;
    local.symbols = nextSymbols;
    await writeSubscription(local);
    await publishControl(local, 'upsert');
    await ensureOwnership(local.userId);
  });

  socket.on('close', async () => {
    clearInterval(local.heartbeat);
    clearInterval(local.ownerWatch);
    localConnections.delete(connectionId);
    const currentIds = connectionsByUser.get(local.userId);
    currentIds?.delete(connectionId);
    if (currentIds && !currentIds.size) connectionsByUser.delete(local.userId);
    await removeSubscription(local);
    await publishControl(local, 'remove').catch(() => undefined);
    if (!userHasLocalConnections(local.userId) && ownedUsers.has(local.userId)) {
      // Another gateway instance may still host active clients for this user.
      // Re-sync before giving up ownership; an empty Redis subscription set means
      // it is safe to release the broker socket.
      await syncOwnedUser(local.userId).catch(() => undefined);
    }
  });

  socket.send(JSON.stringify({
    type: 'status',
    status: 'connected',
    instanceId: INSTANCE_ID,
  }));
  await publishControl(local, 'upsert');
  await ensureOwnership(local.userId);
}

const server = http.createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(redis.isReady ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({
      status: redis.isReady ? 'ok' : 'degraded',
      instanceId: INSTANCE_ID,
      localConnections: localConnections.size,
      ownedUsers: ownedUsers.size,
      timestamp: new Date().toISOString(),
    }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  if (requestUrl.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    void handleConnection(ws, request).catch((error) => {
      console.error('[TradingCore realtime connection]', error);
      try { ws.close(1011, 'Realtime gateway error'); } catch {}
    });
  });
});

async function shutdown(): Promise<void> {
  for (const userId of [...ownedUsers.keys()]) await stopOwnership(userId);
  for (const connection of localConnections.values()) {
    try { connection.socket.close(1001, 'Gateway shutting down'); } catch {}
  }
  await subscriber.quit().catch(() => undefined);
  await redis.quit().catch(() => undefined);
  server.close();
}

async function start(): Promise<void> {
  await redis.connect();
  await subscriber.connect();
  await subscriber.subscribe(EVENT_CHANNEL, (message) => {
    try { broadcastEvent(JSON.parse(message)); } catch (error) { console.error('[TradingCore realtime event]', error); }
  });
  await subscriber.subscribe(CONTROL_CHANNEL, (message) => {
    void handleControl(message).catch((error) => console.error('[TradingCore realtime control]', error));
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log('[TradingCore realtime] gateway listening on :' + PORT + ' instance=' + INSTANCE_ID);
  });
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });

void start().catch((error) => {
  console.error('[TradingCore realtime] startup failed', error);
  process.exit(1);
});
