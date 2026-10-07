import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { createRealtimeTicket } from '../realtime/ticket.js';

export const realtimeTicketRoutes = Router();
realtimeTicketRoutes.use(requireUser);

realtimeTicketRoutes.get('/', (req: AuthenticatedRequest, res: Response) => {
  const configuredGatewayUrl = String(process.env.REALTIME_GATEWAY_URL || '').trim().replace(/\/$/, '');
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.get('host') || '').trim();
  const gatewayUrl = configuredGatewayUrl || (host ? `${forwardedProto}://${host}/api/realtime` : '');
  if (!gatewayUrl || !process.env.REALTIME_GATEWAY_SHARED_SECRET) {
    // No signed gateway ticket can be issued until the shared secret exists.
    // The browser knows how to consume this explicit legacy capability without
    // turning the missing gateway configuration into a retry/503 storm.
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
