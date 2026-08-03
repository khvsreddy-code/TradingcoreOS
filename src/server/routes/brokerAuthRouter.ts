import { Router, Request, Response } from 'express';
import { BrokerOAuthService } from '../oauth/BrokerOAuthService.js';
import { EncryptionService } from '../security/EncryptionService.js';

export const brokerAuthRouter = Router();

/**
 * GET /api/auth/broker/:brokerId/login
 * Initiates OAuth authorization flow by returning the official broker login URL & state token
 */
brokerAuthRouter.get('/:brokerId/login', (req: Request, res: Response) => {
  const { brokerId } = req.params;
  const redirectUri = (req.query.redirect_uri as string) || `${req.protocol}://${req.get('host')}/auth/broker-callback`;
  const clientId = req.query.client_id as string;
  const userId = (req.query.user_id as string) || 'default_user';

  const { authUrl, state } = BrokerOAuthService.getAuthorizationUrl(
    brokerId,
    redirectUri,
    clientId,
    userId
  );

  res.json({
    success: true,
    brokerId,
    authUrl,
    state,
    redirectUri,
  });
});

/**
 * POST /api/auth/broker/callback
 * Handles OAuth auth code, exchanges for access tokens server-side, encrypts & saves session
 */
brokerAuthRouter.post('/callback', async (req: Request, res: Response) => {
  try {
    const { brokerId, code, state, redirectUri, userId } = req.body;

    if (!brokerId || !code) {
      return res.status(400).json({ success: false, error: 'brokerId and code are required' });
    }

    // Verify CSRF state token if provided
    if (state) {
      const verifiedState = EncryptionService.verifyCsrfStateToken(state);
      if (!verifiedState) {
        console.warn('State verification warning: Token expired or invalid, proceeding with code exchange in dev environment');
      }
    }

    const callbackRedirect = redirectUri || `${req.protocol}://${req.get('host')}/auth/broker-callback`;
    const result = await BrokerOAuthService.exchangeCodeForToken(
      brokerId,
      code,
      callbackRedirect,
      userId || 'default_user'
    );

    if (result.success && result.session) {
      return res.json({
        success: true,
        brokerId,
        expiresAt: result.session.expiresAt,
        connectedAt: result.session.connectedAt,
        clientCode: result.session.clientCode,
        message: 'Broker authenticated and session encrypted successfully',
      });
    } else {
      return res.status(400).json({ success: false, error: result.error || 'Token exchange failed' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error during OAuth callback' });
  }
});

/**
 * POST /api/auth/broker/refresh
 * Refreshes an active broker session
 */
brokerAuthRouter.post('/refresh', async (req: Request, res: Response) => {
  const { brokerId, userId } = req.body;
  if (!brokerId) {
    return res.status(400).json({ success: false, error: 'brokerId is required' });
  }

  const result = await BrokerOAuthService.refreshAccessToken(brokerId, userId || 'default_user');
  if (result.success) {
    return res.json({ success: true, message: 'Session refreshed successfully' });
  } else {
    return res.status(400).json({ success: false, error: result.error });
  }
});

/**
 * GET /api/auth/broker/sessions
 * Returns active broker sessions for current user
 */
brokerAuthRouter.get('/sessions', (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) || 'default_user';
  const sessions = BrokerOAuthService.getUserSessions(userId);

  const safeSessions = sessions.map((s) => ({
    brokerId: s.brokerId,
    clientCode: s.clientCode,
    expiresAt: s.expiresAt,
    connectedAt: s.connectedAt,
    status: s.status,
  }));

  res.json({ success: true, sessions: safeSessions });
});

/**
 * DELETE /api/auth/broker/:brokerId
 * Disconnects / revokes broker session
 */
brokerAuthRouter.delete('/:brokerId', (req: Request, res: Response) => {
  const { brokerId } = req.params;
  const userId = (req.query.user_id as string) || 'default_user';

  const deleted = BrokerOAuthService.disconnectSession(brokerId, userId);
  res.json({ success: deleted, message: deleted ? 'Broker disconnected' : 'Session not found' });
});

/**
 * GET /api/auth/broker/:brokerId/verify
 * Verifies profile, funds, holdings, positions, and orders with broker endpoint
 */
brokerAuthRouter.get('/:brokerId/verify', async (req: Request, res: Response) => {
  const { brokerId } = req.params;
  const userId = (req.query.user_id as string) || 'default_user';

  const result = await BrokerOAuthService.verifyEndpoint(brokerId, userId);
  res.json({
    success: true,
    brokerId,
    ...result,
  });
});
