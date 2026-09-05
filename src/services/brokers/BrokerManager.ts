import { BrokerAdapter, BrokerConnectionStatus, ApiCredentials, AccountFunds, Holding, Position, OrderResult, TradeRecord } from './BrokerAdapter';
import { BrokerAdapterRegistry } from './adapters';
import { tradingApi } from '../http/tradingApi';

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

  private constructor() {
    // Restore the last known session map immediately so a page refresh does not blank
    // the workspace while the authenticated server verification is still in flight.
    // The server remains the source of truth and will replace this cache when reachable.
    if (typeof window !== 'undefined') this.loadFromStorage();
  }

  private saveToStorage(): void {
    try {
      const serializable = Array.from(this.connections.values()).map((c) => ({
        brokerId: c.brokerId,
        nickname: c.nickname,
        status: c.status,
        isPrimary: c.isPrimary,
        lastSyncedAt: c.lastSyncedAt,
        tokenExpiry: c.tokenExpiry,
        permissions: c.permissions,
      }));
      localStorage.setItem('tradingcore_connected_brokers', JSON.stringify(serializable));
      localStorage.setItem('tradingcore_primary_broker', this.primaryBrokerId || '');
    } catch (e) {
      console.error('Failed to save broker connections:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('tradingcore_connected_brokers');
      const primaryStored = localStorage.getItem('tradingcore_primary_broker');
      if (stored) {
        const items = JSON.parse(stored);
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const adapter = BrokerAdapterRegistry.getAdapter(item.brokerId);
            if (adapter) {
              this.connections.set(item.brokerId.toLowerCase(), {
                brokerId: adapter.id,
                name: adapter.name,
                nickname: item.nickname || `${adapter.name} Main`,
                status: item.status || 'Connected',
                isPrimary: item.isPrimary || false,
                lastSyncedAt: item.lastSyncedAt || new Date().toISOString(),
                tokenExpiry: item.tokenExpiry,
                latencyMs: undefined,
                permissions: item.permissions || ['Read Portfolio', 'Execute Orders', 'WebSocket Stream'],
                adapter,
              });
            }
          });
        }
      }
      if (primaryStored && this.connections.has(primaryStored.toLowerCase())) {
        this.primaryBrokerId = primaryStored.toLowerCase();
      } else if (this.connections.size > 0) {
        this.primaryBrokerId = Array.from(this.connections.keys())[0];
      }
    } catch (e) {
      console.error('Failed to load broker connections:', e);
    }
  }

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

  /**
   * Rehydrates broker connections from the authenticated user's server-side
   * broker sessions. Browser storage can only nominate a primary among sessions
   * that the server has independently verified.
   */
  public async restoreServerConnections(): Promise<void> {
    try {
      const preferredPrimary = localStorage.getItem('tradingcore_primary_broker')?.toLowerCase() || '';
      const response = await tradingApi('/api/auth/broker/sessions');
      const data = await response.json();
      if (!response.ok || !data?.success || !Array.isArray(data.sessions)) {
        // Keep the last verified cache during a transient API/auth failure. This prevents
        // refreshes from incorrectly presenting a connected broker as disconnected.
        return;
      }

      // Do not erase a warm verified browser cache just because the first
      // post-refresh lookup races the auth/session cookie and briefly returns an
      // empty list. This was causing connected FYERS/Upstox accounts to flash as
      // DISCONNECTED and redirect the user out of the workspace.
      if (data.sessions.length === 0 && this.connections.size > 0) {
        return;
      }

      this.connections.clear();
      this.primaryBrokerId = null;

      for (const session of data.sessions) {
        const adapter = BrokerAdapterRegistry.getAdapter(String(session.brokerId || ''));
        if (!adapter || session.status !== 'Connected') continue;

        const brokerId = adapter.id.toLowerCase();
        adapter.markServerAuthenticated();
        this.connections.set(brokerId, {
          brokerId: adapter.id,
          name: adapter.name,
          nickname: `${adapter.name} Main`,
          status: 'Connected',
          isPrimary: false,
          lastSyncedAt: session.connectedAt || new Date().toISOString(),
          tokenExpiry: session.expiresAt,
          latencyMs: undefined,
          permissions: ['Read Portfolio', 'Execute Orders', 'WebSocket Stream', 'Historical Data'],
          adapter,
        });
      }

      // Preserve the user's last selected broker across reloads, but only if that
      // broker is currently authenticated. Otherwise use the first verified session.
      if (preferredPrimary && this.connections.has(preferredPrimary)) {
        this.primaryBrokerId = preferredPrimary;
      } else if (this.connections.size > 0) {
        this.primaryBrokerId = Array.from(this.connections.keys())[0];
      }

      if (this.primaryBrokerId) {
        this.connections.forEach((info, key) => {
          info.isPrimary = key === this.primaryBrokerId;
        });
        this.lastUsedBrokerId = this.primaryBrokerId;
        this.saveToStorage();
      }
    } catch (error) {
      console.warn('Unable to restore server-side broker connections:', error);
    }
  }

  public getConnectedBrokers(): BrokerAdapter[] {
    return Array.from(this.connections.values())
      .filter((c) => c.status === 'Connected' || c.status === 'Read Only')
      .map((c) => c.adapter);
  }

  public async connectOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) return { success: false, error: `Broker adapter ${brokerId} not found.` };

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
        latencyMs: undefined,
        permissions: ['Read Portfolio', 'Execute Orders', 'WebSocket Stream', 'Historical Data'],
        adapter,
      });
      if (isFirst || !this.primaryBrokerId) this.primaryBrokerId = adapter.id;
      this.lastUsedBrokerId = adapter.id;
      this.saveToStorage();
      return { success: true };
    }
    this.updateConnectionStatus(brokerId, 'Authentication Required');
    return { success: false, error: res.error || 'Authentication failed' };
  }

  public async connectApiKeys(brokerId: string, credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) return { success: false, error: `Broker adapter ${brokerId} not found.` };

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
        latencyMs: undefined,
        permissions: ['Read Portfolio', 'Execute Orders', 'Modify Orders', 'WebSocket Feed'],
        adapter,
      });
      if (isFirst || !this.primaryBrokerId) this.primaryBrokerId = adapter.id;
      this.lastUsedBrokerId = adapter.id;
      this.saveToStorage();
      return { success: true };
    }
    this.updateConnectionStatus(brokerId, 'Authentication Required');
    return { success: false, error: saveRes.error || 'Failed to save credentials' };
  }

  public setPrimaryBroker(brokerId: string): boolean {
    const id = brokerId.toLowerCase();
    if (!this.connections.has(id)) return false;
    this.primaryBrokerId = id;
    this.connections.forEach((info, key) => { info.isPrimary = key === id; });
    this.lastUsedBrokerId = id;
    this.saveToStorage();
    return true;
  }

  public renameConnection(brokerId: string, nickname: string): void {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (info) { info.nickname = nickname; this.saveToStorage(); }
  }

  public updateConnectionStatus(brokerId: string, status: BrokerConnectionStatus): void {
    const id = brokerId.toLowerCase();
    const existing = this.connections.get(id);
    if (existing) {
      existing.status = status;
      if (status === 'Connected') existing.lastSyncedAt = new Date().toISOString();
    }
  }

  public async testLatency(brokerId: string): Promise<number> {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    const start = performance.now();
    if (info) await info.adapter.getMarketData(['NIFTY 50']);
    else await new Promise((res) => setTimeout(res, 80));
    const latency = Math.round(performance.now() - start);
    if (info) info.latencyMs = latency;
    return latency;
  }

  public async testConnectivity(brokerId: string): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const id = brokerId.toLowerCase();
    const info = this.connections.get(id);
    if (!info) return { success: false, latencyMs: 0, message: 'Broker not connected' };
    try {
      const start = performance.now();
      await info.adapter.fetchProfile();
      const latencyMs = Math.round(performance.now() - start);
      info.latencyMs = latencyMs;
      info.status = 'Connected';
      return { success: true, latencyMs, message: `API endpoint ping successful (${latencyMs}ms)` };
    } catch (err: any) {
      info.status = 'Offline';
      return { success: false, latencyMs: 0, message: err?.message || 'Connection test failed' };
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
    }
    this.updateConnectionStatus(id, 'Authentication Required');
    return { success: false, error: res.error || 'Refresh failed' };
  }

  public async syncPortfolio(brokerId?: string): Promise<{
    funds: AccountFunds | null;
    holdings: Holding[];
    positions: Position[];
    orders: OrderResult[];
    trades: TradeRecord[];
  }> {
    const targetId = (brokerId || this.primaryBrokerId)?.toLowerCase();
    if (!targetId) return { funds: null, holdings: [], positions: [], orders: [], trades: [] };
    const info = this.connections.get(targetId);
    if (!info) return { funds: null, holdings: [], positions: [], orders: [], trades: [] };

    this.updateConnectionStatus(targetId, 'Syncing Portfolio');
    try {
      const response = await tradingApi(`/api/trading/${encodeURIComponent(targetId)}/portfolio-snapshot`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Portfolio snapshot failed');
      const data = payload.data || {};
      this.updateConnectionStatus(targetId, 'Connected');
      info.lastSyncedAt = new Date().toISOString();
      return {
        funds: data.funds ?? null,
        holdings: Array.isArray(data.holdings) ? data.holdings : [],
        positions: Array.isArray(data.positions) ? data.positions : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
        trades: Array.isArray(data.trades) ? data.trades : [],
      };
    } catch (error) {
      console.warn(`Fast broker snapshot failed for ${targetId}; using parallel fallback:`, error);
      const safe = async <T,>(task: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await task(); } catch (err) { console.warn(`Broker sync warning for ${targetId}:`, err); return fallback; }
      };
      const [funds, holdings, positions, orders, trades] = await Promise.all([
        safe(() => info.adapter.fetchFunds(), null),
        safe(() => info.adapter.fetchHoldings(), []),
        safe(() => info.adapter.fetchPositions(), []),
        safe(() => info.adapter.fetchOrders(), []),
        safe(() => info.adapter.fetchTradeHistory(), []),
      ]);
      this.updateConnectionStatus(targetId, 'Connected');
      info.lastSyncedAt = new Date().toISOString();
      return { funds, holdings, positions, orders, trades };
    }
  }

  public async disconnect(brokerId: string): Promise<void> {
    const id = brokerId.toLowerCase();
    try {
      await tradingApi(`/api/auth/broker/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Failed to delete ${id} broker session on server:`, error);
      throw error;
    }

    const info = this.connections.get(id);
    if (info) {
      await info.adapter.logout();
      this.connections.delete(id);
      if (this.primaryBrokerId === id) {
        const remaining = Array.from(this.connections.keys());
        this.primaryBrokerId = remaining.length > 0 ? remaining[0] : null;
        if (this.primaryBrokerId) this.connections.get(this.primaryBrokerId)!.isPrimary = true;
      }
      this.saveToStorage();
    }
  }

  public checkHealth(): Record<string, BrokerConnectionStatus> {
    const statusMap: Record<string, BrokerConnectionStatus> = {};
    this.connections.forEach((info, id) => { statusMap[id] = info.status; });
    return statusMap;
  }

  public getLastUsedBrokerId(): string | null { return this.lastUsedBrokerId; }
}

export const brokerManager = BrokerManager.getInstance();