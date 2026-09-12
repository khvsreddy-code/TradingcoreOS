import { PopupManager } from './PopupManager.js';
import { tradingApi } from '../http/tradingApi.js';

export class BrokerOAuthService {
  public static async initiateOAuth(brokerId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fetchUrl = `/api/auth/broker/login?broker=${encodeURIComponent(brokerId)}`;
      const res = await tradingApi(fetchUrl);
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Broker authorization service returned an invalid response (${res.status}).`);
      }

      if (data.success && data.authUrl) {
        PopupManager.openPopup(data.authUrl, { title: `Auth_${brokerId}` });
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to generate authorization URL' };
    } catch (err: any) {
      console.error('Failed to initiate broker OAuth:', err);
      return { success: false, error: err?.message || 'Network error initiating OAuth' };
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
