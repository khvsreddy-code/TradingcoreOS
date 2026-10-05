import crypto from 'node:crypto';

type RealtimeTicketPayload = {
  sub: string;
  broker: 'fyers';
  exp: number;
  jti: string;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createRealtimeTicket(userId: string, broker: 'fyers' = 'fyers', ttlMs = 60_000): { token: string; expiresAt: number } {
  const secret = String(process.env.REALTIME_GATEWAY_SHARED_SECRET || '');
  if (!secret) throw new Error('REALTIME_GATEWAY_SHARED_SECRET is not configured');

  const exp = Date.now() + ttlMs;
  const payload: RealtimeTicketPayload = {
    sub: userId,
    broker,
    exp,
    jti: crypto.randomUUID(),
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = base64url(crypto.createHmac('sha256', secret).update(encoded).digest());
  return { token: encoded + '.' + signature, expiresAt: exp };
}

export function verifyRealtimeTicket(token: string): RealtimeTicketPayload {
  const secret = String(process.env.REALTIME_GATEWAY_SHARED_SECRET || '');
  if (!secret) throw new Error('REALTIME_GATEWAY_SHARED_SECRET is not configured');

  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new Error('Invalid realtime ticket');

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid realtime ticket signature');
  }

  let payload: RealtimeTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as RealtimeTicketPayload;
  } catch {
    throw new Error('Invalid realtime ticket payload');
  }

  if (!payload.sub || payload.broker !== 'fyers' || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    throw new Error('Realtime ticket expired or invalid');
  }

  return payload;
}
