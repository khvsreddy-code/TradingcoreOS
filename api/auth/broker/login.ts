import type { Request, Response } from 'express';
import { OAuthController } from '../../../src/server/auth/OAuthController.js';
import { requireUser, type AuthenticatedRequest } from '../../../src/server/auth/requireUser.js';

/**
 * Explicit Vercel Function for the broker OAuth login endpoint.
 * This avoids relying on catch-all function routing for the nested
 * /api/auth/broker/login path.
 */
export default function handler(req: Request, res: Response): void {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  void requireUser(req as AuthenticatedRequest, res, () => {
    void OAuthController.handleLogin(req as AuthenticatedRequest, res);
  });
}
