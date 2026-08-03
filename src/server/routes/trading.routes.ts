import { Router, Request, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';

export const tradingRoutes = Router();

// Middleware to inject adapter and token
async function injectBrokerSession(req: Request, res: Response, next: Function) {
  const brokerId = req.params.brokerId;
  const userId = (req.query.user_id as string) || 'default_user';

  const session = BrokerRepository.getSession(brokerId, userId);
  if (!session || session.status !== 'Connected') {
    return res.status(401).json({ success: false, error: 'Broker not connected or session expired' });
  }

  const adapter = BrokerRegistry.getAdapter(brokerId);
  if (!adapter) {
    return res.status(400).json({ success: false, error: 'Unknown broker ID' });
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    (req as any).brokerAdapter = adapter;
    (req as any).accessToken = accessToken;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to decrypt session token' });
  }
}

tradingRoutes.get('/:brokerId/profile', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getProfile((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/funds', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getFunds((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/holdings', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getHoldings((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/positions', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getPositions((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/orders', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getOrders((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.post('/:brokerId/order', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.placeOrder((req as any).accessToken, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.put('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.modifyOrder((req as any).accessToken, req.params.orderId, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.delete('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.cancelOrder((req as any).accessToken, req.params.orderId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
