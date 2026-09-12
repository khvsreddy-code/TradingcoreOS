import type { Request, Response } from 'express';
import { OAuthController } from '../../../src/server/auth/OAuthController.js';

/** Explicit Vercel Function for the broker OAuth callback endpoint. */
export default function handler(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  void OAuthController.handleCallback(req as any, res);
}
