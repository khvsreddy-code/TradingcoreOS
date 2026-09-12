import { PopupManager } from './PopupManager.js';
import { tradingApi } from '../http/tradingApi.js';

const OAUTH_INIT_TIMEOUT_MS = 15_000;

export class BrokerOAuthService {
  public static async initiateOAuth(brokerId: string): Promise<{ success: boolean; error?: string }> {
    // Open a blank window immediately while the browser still considers this
    // call user-initiated. The signed broker URL is generated server-side and
    // will be assigned to this window after the API responds. This prevents
    // Chrome/Edge popup blocking after an awaited API request.
    const pendingPopup = PopupManager.openPopup('about:blank', { title: `Auth_${brokerId}` });

    try {
      const fetchUrl = `/api/auth/broker/login?broker=${encodeURIComponent(brokerId)}`;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), OAUTH_INIT_TIMEOUT_MS);
      let res: Response;
      try {
        res = await tradingApi(fetchUrl, { signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Broker authorization service returned an invalid response (${res.status}).`);
      }

      if (data.success && data.authUrl) {
        if (!pendingPopup || pendingPopup.closed) {
          throw new Error('Authorization popup was blocked. Allow popups for TradingCore and try again.');
        }
        pendingPopup.location.href = data.authUrl;
        pendingPopup.focus?.();
        return { success: true };
      }

      if (pendingPopup && !pendingPopup.closed) pendingPopup.close();
      return { success: false, error: data.error || 'Failed to generate authorization URL' };
    } catch (err: any) {
      if (pendingPopup && !pendingPopup.closed) pendingPopup.close();
      const message = err?.name === 'AbortError'
        ? 'Broker authorization service timed out. Check the Vercel Function logs and Supabase connection, then try again.'
        : err?.message || 'Network error initiating OAuth';
      console.error('Failed to initiate broker OAuth:', err);
      return { success: false, error: message };
    }
  }

  public static async completeOAuthCallback(
    brokerId: string,
    code: string,
    state?: string
  ): Promise<{ success: boolean; clientCode?: string; error?: string }> {
    try {
      const res = await tradingApi('/api/auth/broker/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: brokerId, code, state }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return { success: false, error: `Broker callback service returned an invalid response (${res.status}).` };
      }
      if (data.success) return { success: true, clientCode: data.clientCode };
      return { success: false, error: data.error || 'Token exchange failed' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Server connection error during OAuth' };
    }
  }

  public static async verifyEndpoint(brokerId: string): Promise<{ success: boolean; latencyMs?: number }> {
    try {
      const res = await tradingApi(`/api/auth/broker/${brokerId}/verify`);
      const data = await res.json();
      return { success: data.success && data.verified, latencyMs: data.latencyMs };
    } catch {
      return { success: false };
    }
  }
}
