import { Router } from 'express';
import { OAuthController } from '../auth/OAuthController.js';
import { requireUser } from '../auth/requireUser.js';

export const brokerRoutes = Router();

/**
 * Clean Unified API Surface for Multi-Broker Authentication:
 *
 * GET    /api/auth/broker/login?broker=upstox
 * POST   /api/auth/broker/callback
 * POST   /api/auth/broker/refresh
 * GET    /api/auth/broker/sessions
 * DELETE /api/auth/broker/:id
 * GET    /api/auth/broker/:id/verify
 */

// OAuth callbacks run in a broker-hosted popup. The popup may not have the
// parent TradingCore Supabase session available, so callback authentication is
// established by the cryptographically protected, short-lived OAuth state.
// The callback handler derives the TradingCore user from that state and never
// trusts a browser-supplied user_id.
brokerRoutes.post('/callback', OAuthController.handleCallback);

brokerRoutes.use(requireUser);
brokerRoutes.get('/login', OAuthController.handleLogin);
brokerRoutes.post('/refresh', OAuthController.handleRefresh);
brokerRoutes.get('/sessions', OAuthController.handleGetSessions);
brokerRoutes.delete('/:id', OAuthController.handleDisconnect);
brokerRoutes.get('/:id/verify', OAuthController.handleVerify);
