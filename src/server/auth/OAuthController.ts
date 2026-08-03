import { Request, Response } from 'express';
import { OAuthService } from './OAuthService.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';

export class OAuthController {
  /**
   * GET /api/auth/broker/login?broker=upstox
   */
  public static handleLogin(req: Request, res: Response): void {
    const brokerId = (req.query.broker as string) || (req.query.brokerId as string) || 'upstox';
    const redirectUri =
      (req.query.redirect_uri as string) ||
      `${req.protocol}://${req.get('host')}/auth/broker-callback`;
    const clientId = req.query.client_id as string;
    const userId = (req.query.user_id as string) || 'default_user';

    const { authUrl, state } = OAuthService.generateAuthUrl(
      brokerId,
      redirectUri,
      clientId,
      userId
    );

    res.json({
      success: true,
      broker: brokerId,
      authUrl,
      state,
      redirectUri,
    });
  }

  /**
   * POST /api/auth/broker/callback
   */
  public static async handleCallback(req: Request, res: Response): Promise<Response> {
    try {
      const { broker, brokerId, code, state, redirectUri, clientId, userId } = req.body;
      const targetBroker = broker || brokerId;

      if (!targetBroker || !code) {
        return res
          .status(400)
          .json({ success: false, error: 'broker and code parameters are required' });
      }

      const callbackRedirect =
        redirectUri || `${req.protocol}://${req.get('host')}/auth/broker-callback`;
      const result = await OAuthService.handleCallback(
        targetBroker,
        code,
        callbackRedirect,
        state,
        clientId,
        userId || 'default_user'
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
  public static async handleRefresh(req: Request, res: Response): Promise<Response> {
    const { broker, brokerId, userId } = req.body;
    const targetBroker = broker || brokerId;

    if (!targetBroker) {
      return res.status(400).json({ success: false, error: 'broker is required' });
    }

    const result = await OAuthService.refreshSession(targetBroker, userId || 'default_user');
    if (result.success) {
      return res.json({ success: true, message: 'Session refreshed successfully' });
    } else {
      return res.status(400).json({ success: false, error: result.error });
    }
  }

  /**
   * GET /api/auth/broker/sessions
   */
  public static handleGetSessions(req: Request, res: Response): void {
    const userId = (req.query.user_id as string) || 'default_user';
    const sessions = BrokerRepository.getUserSessions(userId);

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
  public static handleDisconnect(req: Request, res: Response): void {
    const brokerId = req.params.id;
    const userId = (req.query.user_id as string) || 'default_user';

    const deleted = BrokerRepository.deleteSession(brokerId, userId);
    res.json({
      success: deleted,
      message: deleted ? 'Broker disconnected' : 'Session not found',
    });
  }

  /**
   * GET /api/auth/broker/:id/verify
   */
  public static handleVerify(req: Request, res: Response): void {
    const brokerId = req.params.id;
    const userId = (req.query.user_id as string) || 'default_user';

    const result = OAuthService.verifyEndpoint(brokerId, userId);
    res.json({
      success: true,
      broker: brokerId,
      ...result,
    });
  }
}
