type RedisCommandResponse<T> = { result?: T; error?: string };

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

const INCREMENT_WINDOW_LUA = [
  "local count = redis.call('incr', KEYS[1])",
  "if count == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end",
  "return count",
].join(' ');

function envValue(primary: string, secondary: string): string {
  return String(process.env[primary] || process.env[secondary] || '').trim().replace(/\/$/, '');
}

export class UpstashRedisRest {
  private readonly url: string;
  private readonly token: string;

  constructor(url = envValue('UPSTASH_REDIS_REST_URL', 'TRADINGCORE_REDIS_REST_URL'), token = envValue('UPSTASH_REDIS_REST_TOKEN', 'TRADINGCORE_REDIS_REST_TOKEN')) {
    this.url = url;
    this.token = token;
  }

  get configured(): boolean {
    return Boolean(this.url && this.token);
  }

  async command<T>(command: Array<string | number>, signal?: AbortSignal, timeoutMs = 900): Promise<T> {
    if (!this.configured) throw new Error('Upstash Redis coordination is not configured');
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const response = await fetch(this.url, {
      method: 'POST',
      signal: requestSignal,
      headers: {
        Authorization: 'Bearer ' + this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    let payload: RedisCommandResponse<T>;
    try {
      payload = await response.json() as RedisCommandResponse<T>;
    } catch {
      throw new Error('Upstash Redis returned non-JSON (' + response.status + ')');
    }
    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'Upstash Redis command failed (' + response.status + ')');
    }
    return payload.result as T;
  }

  async ping(signal?: AbortSignal): Promise<boolean> {
    return (await this.command<string>(['PING'], signal)) === 'PONG';
  }

  async get<T = string>(key: string, signal?: AbortSignal): Promise<T | null> {
    return this.command<T | null>(['GET', key], signal);
  }

  async mget<T = string>(keys: string[], signal?: AbortSignal): Promise<Array<T | null>> {
    if (!keys.length) return [];
    return this.command<Array<T | null>>(['MGET', ...keys], signal);
  }

  async pttl(key: string, signal?: AbortSignal): Promise<number> {
    return this.command<number>(['PTTL', key], signal);
  }

  async set(key: string, value: string, options: { px?: number; nx?: boolean; xx?: boolean } = {}, signal?: AbortSignal): Promise<string | null> {
    const command: Array<string | number> = ['SET', key, value];
    if (options.nx) command.push('NX');
    if (options.xx) command.push('XX');
    if (options.px != null) command.push('PX', options.px);
    return this.command<string | null>(command, signal);
  }

  async del(key: string, signal?: AbortSignal): Promise<number> {
    return this.command<number>(['DEL', key], signal);
  }

  async sadd(key: string, values: string[], signal?: AbortSignal): Promise<number> {
    return values.length ? this.command<number>(['SADD', key, ...values], signal) : 0;
  }

  async srem(key: string, values: string[], signal?: AbortSignal): Promise<number> {
    return values.length ? this.command<number>(['SREM', key, ...values], signal) : 0;
  }

  async smembers(key: string, signal?: AbortSignal): Promise<string[]> {
    return (await this.command<string[] | null>(['SMEMBERS', key], signal)) || [];
  }

  async publish(channel: string, message: string, signal?: AbortSignal): Promise<number> {
    return this.command<number>(['PUBLISH', channel, message], signal);
  }

  async eval<T = unknown>(script: string, keys: string[], args: Array<string | number>, signal?: AbortSignal): Promise<T> {
    return this.command<T>(['EVAL', script, keys.length, ...keys, ...args], signal);
  }

  async acquireLock(key: string, owner: string, ttlMs: number, signal?: AbortSignal): Promise<boolean> {
    return (await this.set(key, owner, { nx: true, px: ttlMs }, signal)) === 'OK';
  }

  async renewLock(key: string, owner: string, ttlMs: number, signal?: AbortSignal): Promise<boolean> {
    return Number(await this.eval<number>(RENEW_LOCK_LUA, [key], [owner, ttlMs], signal)) === 1;
  }

  async releaseLock(key: string, owner: string, signal?: AbortSignal): Promise<boolean> {
    return Number(await this.eval<number>(RELEASE_LOCK_LUA, [key], [owner], signal)) === 1;
  }

  async incrementWindow(key: string, ttlMs: number, signal?: AbortSignal): Promise<number> {
    return Number(await this.eval<number>(INCREMENT_WINDOW_LUA, [key], [ttlMs], signal));
  }
}

let singleton: UpstashRedisRest | null = null;

export function getSharedRedis(): UpstashRedisRest {
  if (!singleton) singleton = new UpstashRedisRest();
  return singleton;
}

export function sharedRedisConfigured(): boolean {
  return getSharedRedis().configured;
}

export async function sharedRedisHealthy(signal?: AbortSignal): Promise<boolean> {
  if (!sharedRedisConfigured()) return false;
  try {
    const timeoutSignal = AbortSignal.timeout(1_200);
    return await getSharedRedis().ping(signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal);
  } catch {
    return false;
  }
}
