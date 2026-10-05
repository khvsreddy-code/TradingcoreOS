type RedisRestPayload<T> = { result?: T; error?: string };

export class RealtimeRedisRest {
  readonly url: string;
  readonly token: string;
  readonly configured: boolean;

  constructor(
    url = String(process.env.REALTIME_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, ''),
    token = String(process.env.REALTIME_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
  ) {
    this.url = url;
    this.token = token;
    this.configured = Boolean(url && token);
  }

  private async command<T>(command: Array<string | number>, signal?: AbortSignal, timeoutMs = 1_500): Promise<T> {
    if (!this.configured) throw new Error('Realtime Redis REST credentials are not configured.');
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    const response = await fetch(this.url, {
      method: 'POST',
      signal: requestSignal,
      headers: {
        Authorization: 'Bearer ' + this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    let payload: RedisRestPayload<T>;
    try {
      payload = await response.json() as RedisRestPayload<T>;
    } catch {
      throw new Error('Realtime Redis returned non-JSON (' + response.status + ')');
    }

    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'Realtime Redis command failed (' + response.status + ')');
    }
    return payload.result as T;
  }

  async ping(): Promise<boolean> {
    return (await this.command<string>(['PING'])) === 'PONG';
  }

  async get<T = string>(key: string): Promise<T | null> {
    return this.command<T | null>(['GET', key]);
  }

  async mGet<T = string>(keys: string[]): Promise<Array<T | null>> {
    return keys.length ? this.command<Array<T | null>>(['MGET', ...keys]) : [];
  }

  async set(key: string, value: string, options: { nx?: boolean; xx?: boolean; px?: number } = {}): Promise<string | null> {
    const command: Array<string | number> = ['SET', key, value];
    if (options.nx) command.push('NX');
    if (options.xx) command.push('XX');
    if (options.px != null) command.push('PX', options.px);
    return this.command<string | null>(command);
  }

  async del(key: string): Promise<number> {
    return this.command<number>(['DEL', key]);
  }

  async sAdd(key: string, values: string[]): Promise<number> {
    return values.length ? this.command<number>(['SADD', key, ...values]) : 0;
  }

  async sRem(key: string, values: string[]): Promise<number> {
    return values.length ? this.command<number>(['SREM', key, ...values]) : 0;
  }

  async sMembers(key: string): Promise<string[]> {
    return (await this.command<string[] | null>(['SMEMBERS', key])) || [];
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.command<number>(['PUBLISH', channel, message]);
  }

  async eval<T = unknown>(script: string, keys: string[], args: Array<string | number>): Promise<T> {
    return this.command<T>(['EVAL', script, keys.length, ...keys, ...args]);
  }

  async subscribe(
    channel: string,
    onMessage: (message: string) => void,
    externalAbort?: AbortSignal,
  ): Promise<AbortController> {
    const controller = new AbortController();
    const signal = externalAbort ? AbortSignal.any([externalAbort, controller.signal]) : controller.signal;

    void this.subscribeLoop(channel, onMessage, signal);
    return controller;
  }

  private async subscribeLoop(channel: string, onMessage: (message: string) => void, signal: AbortSignal): Promise<void> {
    let backoffMs = 250;

    while (!signal.aborted) {
      try {
        const response = await fetch(
          this.url + '/subscribe/' + encodeURIComponent(channel),
          {
            method: 'POST',
            signal,
            headers: {
              Authorization: 'Bearer ' + this.token,
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          },
        );

        if (!response.ok || !response.body) {
          throw new Error('Realtime Redis subscribe failed (' + response.status + ')');
        }

        backoffMs = 250;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;

            const payload = line.slice(5).trim();
            if (!payload.startsWith('message,')) continue;

            const firstComma = payload.indexOf(',');
            const secondComma = payload.indexOf(',', firstComma + 1);
            if (secondComma < 0) continue;

            onMessage(payload.slice(secondComma + 1));
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        console.error('[TradingCore realtime redis subscribe]', channel, error);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(5_000, backoffMs * 2);
      }
    }
  }
}
