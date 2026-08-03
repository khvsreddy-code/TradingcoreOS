import { BrokerAdapter, BrokerConnectionStatus, ApiCredentials } from './BrokerAdapter';
import { BrokerAdapterRegistry } from './adapters';

export interface BrokerConnectionInfo {
  brokerId: string;
  name: string;
  status: BrokerConnectionStatus;
  isPrimary: boolean;
  lastSyncedAt?: string;
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
      this.connections.set(brokerId.toLowerCase(), {
        brokerId: adapter.id,
        name: adapter.name,
        status: 'Connected',
        isPrimary: isFirst || this.primaryBrokerId === adapter.id,
        lastSyncedAt: new Date().toISOString(),
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
      this.connections.set(brokerId.toLowerCase(), {
        brokerId: adapter.id,
        name: adapter.name,
        status: 'Connected',
        isPrimary: isFirst || this.primaryBrokerId === adapter.id,
        lastSyncedAt: new Date().toISOString(),
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
