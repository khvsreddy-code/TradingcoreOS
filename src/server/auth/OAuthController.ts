import { Response } from 'express';
import { OAuthService } from './OAuthService.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { AuthenticatedRequest } from './requireUser.js';

function getBrokerRedirectUri(brokerId: string): string {
  const key = `${brokerId.toUpperCase()}_REDIRECT_URI`;
  const redirectUri = process.env[key];
  if (!redirectUri) {
    throw new Error(`${key} is not configured on the server`);
  }
  return redirectUri;
}

export class OAuthController {
  /**
   * GET /api/auth/broker/login?broker=upstox
   */
  public static handleLogin(req: AuthenticatedRequest, res: Response): void {
    const brokerId = (req.query.broker as string) || (req.query.brokerId as string) || 'upstox';
    const userId = req.tradingCoreUserId!;

    try {
      const redirectUri = getBrokerRedirectUri(brokerId);
      const { authUrl, state } = OAuthService.generateAuthUrl(brokerId, redirectUri, undefined, userId);
      res.json({ success: true, broker: brokerId, authUrl, state, redirectUri });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Unable to begin broker authorization' });
    }
  }

  /**
   * POST /api/auth/broker/callback/
   */
  public static async handleCallback(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const { broker, brokerId, code, state } = req.body;
      let targetBroker = (broker || brokerId || '').toLowerCase();

      if (!code) {
        return res
          .status(400)
          .json({ success: false, error: 'authorization code is required' });
      }

      // The OAuth state is encrypted server-side. If the broker callback does
      // not include a broker query parameter (FYERS uses auth_code), resolve
      // the broker from the state so the registered redirect URI stays exact.
      if (!targetBroker && state) {
        targetBroker = OAuthService.resolveBrokerFromState(state, req.tradingCoreUserId!);
      }

      if (!targetBroker) {
        return res.status(400).json({ success: false, error: 'Unable to determine broker from OAuth state' });
      }

      const callbackRedirect = getBrokerRedirectUri(targetBroker);
      const result = await OAuthService.handleCallback(
        targetBroker,
        code,
        callbackRedirect,
        state,
        undefined,
        req.tradingCoreUserId!
      );


      if (result.success && result.session) {
        return res.json({
          success: true,
          broker: targetBroker,
          expiresAt: result.session.expiresAt,
          connectedAt: result.session.connectedAt,
          clientCode: result.session.clientCode,
          message: 'Broker authorized and session encrypted successfully',
        });
      } else {
        return res
          .status(400)
          .json({ success: false, error: result.error || 'Token exchange failed' });
      }
    } catch (err: any) {
      return res
        .status(500)
        .json({ success: false, error: err?.message || 'Server error during OAuth callback' });
    }
  }

  /**
   * POST /api/auth/broker/refresh
   */
  public static async handleRefresh(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const { broker, brokerId } = req.body;
    const targetBroker = broker || brokerId;

    if (!targetBroker) {
      return res.status(400).json({ success: false, error: 'broker is required' });
    }

    const result = await OAuthService.refreshSession(targetBroker, req.tradingCoreUserId!);
    if (result.success) {
      return res.json({ success: true, message: 'Session refreshed successfully' });
    } else {
      return res.status(400).json({ success: false, error: result.error });
    }
  }

  /**
   * GET /api/auth/broker/sessions
   */
  public static async handleGetSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.tradingCoreUserId!;
    const sessions = await BrokerRepository.getUserSessions(userId);

    const safeSessions = sessions.map((s) => ({
      brokerId: s.brokerId,
      clientCode: s.clientCode,
      expiresAt: s.expiresAt,
      connectedAt: s.connectedAt,
      status: s.status,
    }));

    res.json({ success: true, sessions: safeSessions });
  }

  /**
   * DELETE /api/auth/broker/:id
   */
  public static async handleDisconnect(req: AuthenticatedRequest, res: Response): Promise<void> {
    const brokerId = req.params.id;
    const userId = req.tradingCoreUserId!;

    const deleted = await BrokerRepository.deleteSession(brokerId, userId);
    res.json({
      success: deleted,
      message: deleted ? 'Broker disconnected' : 'Session not found',
    });
  }

  /**
   * GET /api/auth/broker/:id/verify
   */
  public static async handleVerify(req: AuthenticatedRequest, res: Response): Promise<void> {
    const brokerId = req.params.id;
    const userId = req.tradingCoreUserId!;

    const result = await OAuthService.verifyEndpoint(brokerId, userId);
    res.json({
      success: true,
      broker: brokerId,
      ...result,
    });
  }
}
