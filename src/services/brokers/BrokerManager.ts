import { BrokerAdapter, BrokerConnectionStatus, ApiCredentials, AccountFunds, Holding, Position, OrderResult, TradeRecord } from './BrokerAdapter';
import { BrokerAdapterRegistry } from './adapters';

export interface BrokerConnectionInfo {
  brokerId: string;
  name: string;
  nickname?: string;
  status: BrokerConnectionStatus;
  isPrimary: boolean;
  lastSyncedAt?: string;
  tokenExpiry?: string;
  latencyMs?: number;
  permissions?: string[];
  adapter: BrokerAdapter;
}

export class BrokerManager {
  private static instance: BrokerManager;
  private connections: Map<string, BrokerConnectionInfo> = new Map();
  private primaryBrokerId: string | null = null;
  private lastUsedBrokerId: string | null = null;

  private constructor() {}

  public static getInstance(): BrokerManager {
    if (!BrokerManager.instance) {
      BrokerManager.instance = new BrokerManager();
    }
    return BrokerManager.instance;
  }

  public getPrimaryBroker(): BrokerAdapter | null {
    if (!this.primaryBrokerId) return null;
    const info = this.connections.get(this.primaryBrokerId);
    return info ? info.adapter : null;
  }

  public getPrimaryBrokerInfo(): BrokerConnectionInfo | null {
    if (!this.primaryBrokerId) return null;
    return this.connections.get(this.primaryBrokerId) || null;
  }

  public getAllConnections(): BrokerConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  public getConnectedBrokers(): BrokerAdapter[] {
    return Array.from(this.connections.values())
      .filter((c) => c.status === 'Connected' || c.status === 'Read Only')
      .map((c) => c.adapter);
  }

  public async connectOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) {
      return { success: false, error: `Broker adapter ${brokerId} not found.` };
    }

    this.updateConnectionStatus(brokerId, 'Connecting...');
    const res = await adapter.authenticateOAuth(authCode);

    if (res.success) {
      const isFirst = this.connections.size === 0;
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      this.connections.set(brokerId.toLowerCase(), {
        brokerId: adapter.id,
        name: adapter.name,
        nickname: `${adapter.name} Main`,
        status: 'Connected',
        isPrimary: isFirst || this.primaryBrokerId === adapter.id,
        lastSyncedAt: new Date().toISOString(),
        tokenExpiry: expiry,
        latencyMs: Math.floor(Math.random() * 12 + 6),
        permissions: ['Read Portfolio', 'Execute Orders', 'WebSocket Stream', 'Historical Data'],
        adapter,
      });

      if (isFirst || !this.primaryBrokerId) {
        this.primaryBrokerId = adapter.id;
      }
      this.lastUsedBrokerId = adapter.id;
      return { success: true };
    } else {
      this.updateConnectionStatus(brokerId, 'Authentication Required');
      return { success: false, error: res.error || 'Authentication failed' };
    }
  }

  public async connectApiKeys(brokerId: string, credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) {
      return { success: false, error: `Broker adapter ${brokerId} not found.` };
    }

    this.updateConnectionStatus(brokerId, 'Connecting...');
    const validation = await adapter.validateApiKeys(credentials);
    if (!validation.isValid) {
      this.updateConnectionStatus(brokerId, 'Authentication Required');
      return { success: false, error: validation.message || 'Invalid API Credentials' };
    }

    const saveRes = await adapter.saveApiKeys(credentials);
    if (saveRes.success) {
      const isFirst = this.connections.size === 0;
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      this.connections.set(brokerId.toLowerCase(), {
        brokerId: adapter.id,
        name: adapter.name,
        nickname: `${adapter.name} API`,
        status: 'Connected',
        isPrimary: isFirst || this.primaryBrokerId === adapter.id,
        lastSyncedAt: new Date().toISOString(),
        tokenExpiry: expiry,
        latencyMs: Math.floor(Math.random() * 10 + 5),
        permissions: ['Read Portfolio', 'Execute Orders', 'Modify Orders', 'WebSocket Feed'],
        adapter,
      });

      if (isFirst || !this.primaryBrokerId) {
        this.primaryBrokerId = adapter.id;
      }
      this.lastUsedBrokerId = adapter.id;
      return { success: true };
    } else {
      this.updateConnectionStatus(brokerId, 'Authentication Required');
      return { success: false, error: saveRes.error || 'Failed to save credentials' };
    }
  }

  public setPrimaryBroker(brokerId: string): boolean {
    const id = brokerId.toLowerCase();
    if (this.connections.has(id)) {
      this.primaryBrokerId = id;
      this.connections.forEach((info, key) => {
        info.isPrimary = key === id;
      });
      return true;
    }
    return false;
  }

  public renameConnection(brokerId: string, nickname: string): void {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (info) {
      info.nickname = nickname;
    }
  }

  public updateConnectionStatus(brokerId: string, status: BrokerConnectionStatus): void {
    const id = brokerId.toLowerCase();
    const existing = this.connections.get(id);
    if (existing) {
      existing.status = status;
      if (status === 'Connected') {
        existing.lastSyncedAt = new Date().toISOString();
      }
    }
  }

  public async testLatency(brokerId: string): Promise<number> {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    const start = performance.now();
    if (info) {
      await info.adapter.getMarketData(['NIFTY 50']);
    } else {
      await new Promise((res) => setTimeout(res, 80));
    }
    const end = performance.now();
    const latency = Math.round(end - start);
    if (info) {
      info.latencyMs = latency;
    }
    return latency;
  }

  public async testConnectivity(brokerId: string): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (!info) {
      return { success: false, latencyMs: 0, message: 'Broker not connected' };
    }

    try {
      const start = performance.now();
      await info.adapter.fetchProfile();
      const latencyMs = Math.round(performance.now() - start);
      info.latencyMs = latencyMs;
      info.status = 'Connected';
      return {
        success: true,
        latencyMs,
        message: `API endpoint ping successful (${latencyMs}ms)`,
      };
    } catch (err: any) {
      info.status = 'Offline';
      return {
        success: false,
        latencyMs: 0,
        message: err?.message || 'Connection test failed',
      };
    }
  }

  public async refreshSession(brokerId: string): Promise<{ success: boolean; error?: string }> {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (!info) return { success: false, error: 'Connection not found' };

    this.updateConnectionStatus(id, 'Refreshing Session');
    const res = await info.adapter.authenticateOAuth();
    if (res.success) {
      this.updateConnectionStatus(id, 'Connected');
      info.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      info.lastSyncedAt = new Date().toISOString();
      return { success: true };
    } else {
      this.updateConnectionStatus(id, 'Authentication Required');
      return { success: false, error: res.error || 'Refresh failed' };
    }
  }

  public async syncPortfolio(brokerId?: string): Promise<{
    funds: AccountFunds | null;
    holdings: Holding[];
    positions: Position[];
    orders: OrderResult[];
    trades: TradeRecord[];
  }> {
    const targetId = brokerId || this.primaryBrokerId;
    if (!targetId) {
      return { funds: null, holdings: [], positions: [], orders: [], trades: [] };
    }

    const info = this.connections.get(targetId.toLowerCase());
    if (!info) {
      return { funds: null, holdings: [], positions: [], orders: [], trades: [] };
    }

    this.updateConnectionStatus(targetId, 'Syncing Portfolio');

    const [funds, holdings, positions, orders, trades] = await Promise.all([
      info.adapter.fetchFunds(),
      info.adapter.fetchHoldings(),
      info.adapter.fetchPositions(),
      info.adapter.fetchOrders(),
      info.adapter.fetchTradeHistory(),
    ]);

    this.updateConnectionStatus(targetId, 'Connected');
    info.lastSyncedAt = new Date().toISOString();

    return { funds, holdings, positions, orders, trades };
  }

  public disconnect(brokerId: string): void {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (info) {
      info.adapter.logout();
      this.connections.delete(id);
      if (this.primaryBrokerId === id) {
        const remaining = Array.from(this.connections.keys());
        this.primaryBrokerId = remaining.length > 0 ? remaining[0] : null;
        if (this.primaryBrokerId) {
          const primaryInfo = this.connections.get(this.primaryBrokerId);
          if (primaryInfo) primaryInfo.isPrimary = true;
        }
      }
    }
  }

  public checkHealth(): Record<string, BrokerConnectionStatus> {
    const statusMap: Record<string, BrokerConnectionStatus> = {};
    this.connections.forEach((info, id) => {
      statusMap[id] = info.status;
    });
    return statusMap;
  }

  public getLastUsedBrokerId(): string | null {
    return this.lastUsedBrokerId;
  }
}

export const brokerManager = BrokerManager.getInstance();
