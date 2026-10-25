import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { BrokerRepository, BrokerSessionRecord } from '../storage/BrokerRepository.js';
import { OAuthStateRepository } from '../storage/OAuthStateRepository.js';

export class OAuthService {
  /**
   * Validates and decodes the short-lived OAuth state created when an
   * authenticated TradingCore user starts broker authorization.
   *
   * This is intentionally independent of the browser's Supabase session:
   * broker OAuth callbacks execute inside a popup and must still be able to
   * complete the token exchange safely.
   */
  public static resolveOAuthState(
    state: string
  ): { brokerId: string; userId: string; timestamp: number } | null {
    return EncryptionService.verifyCsrfStateToken(state);
  }

  /**
   * Resolves the broker encoded in our encrypted OAuth state without exposing
   * broker state contents to the browser.
   */
  public static resolveBrokerFromState(state: string, userId: string): string {
    if (!state || !userId) return '';
    const verified = EncryptionService.verifyCsrfStateToken(state);
    if (!verified || verified.userId !== userId) return '';
    const adapter = BrokerRegistry.getAdapter(verified.brokerId);
    return adapter?.brokerId || '';
  }

  /**
   * Generates official authorization login URL for requested broker via BrokerRegistry
   */
  public static async generateAuthUrl(
    brokerId: string,
    redirectUri: string,
    userId: string,
    _clientId?: string
  ): Promise<{ authUrl: string; state: string }> {
    const adapter = BrokerRegistry.getAdapter(brokerId);
    const state = EncryptionService.generateCsrfStateToken(adapter.brokerId, userId);
    // Broker app credentials are server-side configuration. The browser never
    // supplies or receives a broker client secret.
    await OAuthStateRepository.issue(state, userId, adapter.brokerId, new Date(Date.now() + 15 * 60 * 1000));
    const authUrl = adapter.getAuthUrl(redirectUri, state);

    return { authUrl, state };
  }

  /**
   * Exchanges OAuth authorization code for encrypted session storage
   */
  public static async handleCallback(
    brokerId: string,
    code: string,
    redirectUri: string,
    userId: string,
    state?: string,
    _clientId?: string
  ): Promise<{ success: boolean; session?: BrokerSessionRecord; error?: string }> {
    try {
      if (!state) return { success: false, error: 'OAuth state is required' };
      const verifiedState = EncryptionService.verifyCsrfStateToken(state);
      if (!verifiedState || verifiedState.brokerId !== brokerId || verifiedState.userId !== userId) {
        return { success: false, error: 'OAuth state is invalid or expired' };
      }

      const adapter = BrokerRegistry.getAdapter(brokerId);
      const consumed = await OAuthStateRepository.consume(state, userId, adapter.brokerId);
      if (!consumed) return { success: false, error: 'OAuth state is invalid, expired, or already used' };
      const tokenResult = await adapter.exchangeCodeForToken(code, redirectUri, undefined, userId);

      if (!tokenResult.success || !tokenResult.rawAccessToken) {
        return { success: false, error: tokenResult.error || 'Token exchange failed' };
      }

      // Encrypt tokens using AES-256-GCM
      const encryptedAccess = EncryptionService.encrypt(tokenResult.rawAccessToken);
      const encryptedRefresh = tokenResult.rawRefreshToken
        ? EncryptionService.encrypt(tokenResult.rawRefreshToken)
        : undefined;

      const expiresAt = new Date(
        Date.now() + (tokenResult.expiresInSeconds || 86400) * 1000
      ).toISOString();

      const session: BrokerSessionRecord = {
        brokerId: adapter.brokerId,
        userId,
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        expiresAt,
        status: 'Connected',
        connectedAt: new Date().toISOString(),
        clientCode: tokenResult.clientCode,
      };

      await BrokerRepository.saveSession(session);

      // Never report OAuth success until the durable server-side session can
      // immediately be read back. This prevents a popup from saying "success"
      // when the broker token only existed in the current server invocation.
      const persisted = await BrokerRepository.getSession(adapter.brokerId, userId);
      if (
        !persisted ||
        persisted.userId !== userId ||
        persisted.brokerId.toLowerCase() !== adapter.brokerId.toLowerCase() ||
        persisted.status !== 'Connected' ||
        persisted.accessTokenEncrypted?.ciphertext !== encryptedAccess.ciphertext
      ) {
        throw new Error('Broker authorization completed, but the encrypted broker session could not be verified in durable storage.');
      }

      return { success: true, session };
    } catch (err: any) {
      console.error(`OAuthService callback error for ${brokerId}:`, err);
      return { success: false, error: err?.message || 'Token exchange failed' };
    }
  }

  /**
   * Refreshes active session token
   */
  public static async refreshSession(
    brokerId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = await BrokerRepository.getSession(brokerId, userId);
    if (!session || !session.refreshTokenEncrypted) {
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const adapter = BrokerRegistry.getAdapter(brokerId);
      const rawRefreshToken = EncryptionService.decrypt(session.refreshTokenEncrypted);
      const tokenResult = await adapter.refreshToken(rawRefreshToken);

      if (!tokenResult.success || !tokenResult.rawAccessToken) {
        return { success: false, error: tokenResult.error || 'Refresh failed' };
      }

      session.accessTokenEncrypted = EncryptionService.encrypt(tokenResult.rawAccessToken);
      if (tokenResult.rawRefreshToken) session.refreshTokenEncrypted = EncryptionService.encrypt(tokenResult.rawRefreshToken);
      session.expiresAt = new Date(
        Date.now() + (tokenResult.expiresInSeconds || 86400) * 1000
      ).toISOString();
      session.status = 'Connected';

      await BrokerRepository.saveSession(session);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to refresh token' };
    }
  }

  /**
   * Verifies broker endpoint profile, funds, holdings, positions, and orders
   */
  public static async verifyEndpoint(
    brokerId: string,
    userId: string
  ): Promise<{
    verified: boolean;
    checks: { profile: boolean; funds: boolean; holdings: boolean; positions: boolean; orders: boolean };
    latencyMs: number;
  }> {
    const session = await BrokerRepository.getSession(brokerId, userId);
    const empty = { profile: false, funds: false, holdings: false, positions: false, orders: false };
    if (!session || session.status !== 'Connected') return { verified: false, checks: empty, latencyMs: 0 };

    const started = Date.now();
    try {
      const adapter = BrokerRegistry.getAdapter(brokerId);
      const token = EncryptionService.decrypt(session.accessTokenEncrypted);
      const checks = { ...empty };
      const calls: Array<[keyof typeof checks, () => Promise<unknown>]> = [
        ['profile', () => adapter.getProfile(token, userId)],
        ['funds', () => adapter.getFunds(token, userId)],
        ['holdings', () => adapter.getHoldings(token, userId)],
        ['positions', () => adapter.getPositions(token, userId)],
        ['orders', () => adapter.getOrders(token, userId)],
      ];

      // Run independently so one optional portfolio endpoint cannot hide which
      // part of the broker connection failed. These are read-only checks.
      const results = await Promise.allSettled(calls.map(([, call]) => call()));
      results.forEach((result, index) => { checks[calls[index][0]] = result.status === 'fulfilled'; });
      return { verified: Object.values(checks).every(Boolean), checks, latencyMs: Date.now() - started };
    } catch {
      return { verified: false, checks: empty, latencyMs: Date.now() - started };
    }
  }
}
