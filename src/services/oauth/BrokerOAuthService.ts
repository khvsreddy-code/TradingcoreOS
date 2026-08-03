import { PopupManager } from './PopupManager.js';

export class BrokerOAuthService {
  /**
   * Initiates official OAuth flow by querying backend endpoint & opening popup manager
   */
  public static async initiateOAuth(brokerId: string, customClientId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const redirectUri = `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/broker-callback`;
      let fetchUrl = `/api/auth/broker/login?broker=${encodeURIComponent(brokerId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      if (customClientId) {
        fetchUrl += `&client_id=${encodeURIComponent(customClientId)}`;
      }

      const res = await fetch(fetchUrl);
      const data = await res.json();

      if (data.success && data.authUrl) {
        PopupManager.openPopup(data.authUrl, {
          title: `Auth_${brokerId}`,
        });
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to generate authorization URL' };
      }
    } catch (err: any) {
      console.error('Failed to initiate broker OAuth:', err);
      return { success: false, error: err?.message || 'Network error initiating OAuth' };
    }
  }

  /**
   * Completes OAuth callback exchange with backend
   */
  public static async completeOAuthCallback(
    brokerId: string,
    code: string,
    state?: string
  ): Promise<{ success: boolean; clientCode?: string; error?: string }> {
    try {
      const redirectUri = `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/broker-callback`;
      const res = await fetch('/api/auth/broker/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: brokerId,
          code,
          state,
          redirectUri,
        }),
      });

      const data = await res.json();
      if (data.success) {
        return { success: true, clientCode: data.clientCode };
      } else {
        return { success: false, error: data.error || 'Token exchange failed' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Server connection error during OAuth' };
    }
  }

  /**
   * Verifies endpoint health (Profile, Funds, Holdings, Positions, Orders)
   */
  public static async verifyEndpoint(brokerId: string): Promise<{ success: boolean; latencyMs?: number }> {
    try {
      const res = await fetch(`/api/auth/broker/${brokerId}/verify`);
      const data = await res.json();
      return { success: data.success && data.verified, latencyMs: data.latencyMs };
    } catch (err) {
      return { success: false };
    }
  }
}
