import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { createRealtimeTicket } from '../realtime/ticket.js';

export const realtimeTicketRoutes = Router();
realtimeTicketRoutes.use(requireUser);

realtimeTicketRoutes.get('/', (req: AuthenticatedRequest, res: Response) => {
  const gatewayUrl = String(process.env.REALTIME_GATEWAY_URL || '').trim().replace(/\/$/, '');
  // Return an explicit legacy transport instead of a 503 when the dedicated
  // gateway has not been provisioned. The browser already supports this
  // fallback, and a successful capability response avoids retry/error noise.
  if (!gatewayUrl) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: { broker: 'fyers', transport: 'legacy' },
      requestId: req.get('x-request-id') || null,
    });
    return;
  }

  const broker = String(req.query.broker || 'fyers').toLowerCase();
  if (broker !== 'fyers') {
    res.status(400).json({ success: false, error: 'Unsupported realtime broker.' });
    return;
  }

  try {
    const issued = createRealtimeTicket(req.tradingCoreUserId!, 'fyers', 60_000);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        broker: 'fyers',
        ticket: issued.token,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        websocketUrl: gatewayUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws',
      },
      requestId: req.get('x-request-id') || null,
    });
  } catch (error: any) {
    res.status(503).json({ success: false, error: error?.message || 'Unable to issue realtime ticket.' });
  }
});
