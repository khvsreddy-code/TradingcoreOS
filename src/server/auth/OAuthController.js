import { OAuthService } from './OAuthService.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
function getBrokerRedirectUri(brokerId) {
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
    static async handleLogin(req, res) {
        const brokerId = req.query.broker || req.query.brokerId || 'upstox';
        const userId = req.tradingCoreUserId;
        try {
            const redirectUri = getBrokerRedirectUri(brokerId);
            const { authUrl, state } = await OAuthService.generateAuthUrl(brokerId, redirectUri, undefined, userId);
            res.json({ success: true, broker: brokerId, authUrl, state, redirectUri });
        }
        catch (err) {
            res.status(400).json({ success: false, error: err?.message || 'Unable to begin broker authorization' });
        }
    }
    /**
     * POST /api/auth/broker/callback/
     */
    static async handleCallback(req, res) {
        try {
            const { broker, brokerId, code, auth_code, state } = req.body;
            // FYERS v3 returns the actual credential as `auth_code`; `code=200` is
            // only the success status. Upstox uses `code` for its authorization code.
            const authorizationCode = auth_code || code;
            if (!authorizationCode) {
                return res
                    .status(400)
                    .json({ success: false, error: 'authorization code is required' });
            }
            if (!state) {
                return res.status(400).json({ success: false, error: 'OAuth state is required' });
            }
            // The callback endpoint is intentionally NOT behind requireUser.
            // The broker-hosted popup can be a separate browser context, so relying
            // on the TradingCore Supabase session here causes the exact
            // "Authenticated TradingCore session required" failure seen in production.
            //
            // Instead, the server validates its own encrypted, 15-minute state token
            // and derives BOTH the TradingCore user and broker from it. The browser
            // cannot supply or override user_id.
            const verifiedState = OAuthService.resolveOAuthState(state);
            if (!verifiedState) {
                return res.status(400).json({ success: false, error: 'OAuth state is invalid or expired' });
            }
            const stateBroker = verifiedState.brokerId.toLowerCase();
            const requestedBroker = String(broker || brokerId || '').toLowerCase();
            if (requestedBroker && requestedBroker !== stateBroker) {
                return res.status(400).json({ success: false, error: 'OAuth broker does not match the authorization state' });
            }
            const targetBroker = stateBroker;
            const tradingCoreUserId = verifiedState.userId;
            const callbackRedirect = getBrokerRedirectUri(targetBroker);
            const result = await OAuthService.handleCallback(targetBroker, authorizationCode, callbackRedirect, state, undefined, tradingCoreUserId);
            if (result.success && result.session) {
                return res.json({
                    success: true,
                    broker: targetBroker,
                    expiresAt: result.session.expiresAt,
                    connectedAt: result.session.connectedAt,
                    clientCode: result.session.clientCode,
                    message: 'Broker authorized and session encrypted successfully',
                });
            }
            else {
                return res
                    .status(400)
                    .json({ success: false, error: result.error || 'Token exchange failed' });
            }
        }
        catch (err) {
            return res
                .status(500)
                .json({ success: false, error: err?.message || 'Server error during OAuth callback' });
        }
    }
    /**
     * POST /api/auth/broker/refresh
     */
    static async handleRefresh(req, res) {
        const { broker, brokerId } = req.body;
        const targetBroker = broker || brokerId;
        if (!targetBroker) {
            return res.status(400).json({ success: false, error: 'broker is required' });
        }
        const result = await OAuthService.refreshSession(targetBroker, req.tradingCoreUserId);
        if (result.success) {
            return res.json({ success: true, message: 'Session refreshed successfully' });
        }
        else {
            return res.status(400).json({ success: false, error: result.error });
        }
    }
    /**
     * GET /api/auth/broker/sessions
     */
    static async handleGetSessions(req, res) {
        const userId = req.tradingCoreUserId;
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
    static async handleDisconnect(req, res) {
        const brokerId = req.params.id;
        const userId = req.tradingCoreUserId;
        const deleted = await BrokerRepository.deleteSession(brokerId, userId);
        res.json({
            success: deleted,
            message: deleted ? 'Broker disconnected' : 'Session not found',
        });
    }
    /**
     * GET /api/auth/broker/:id/verify
     */
    static async handleVerify(req, res) {
        const brokerId = req.params.id;
        const userId = req.tradingCoreUserId;
        const result = await OAuthService.verifyEndpoint(brokerId, userId);
        res.json({
            success: true,
            broker: brokerId,
            ...result,
        });
    }
}
