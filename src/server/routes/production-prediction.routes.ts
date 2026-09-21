import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';

export const productionPredictionRoutes = Router();
productionPredictionRoutes.use(requireUser);

const MAX_CANDLES = 180;
const ALLOWED_MODELS = new Set(["xgb-direction", "rf-direction", "logistic-direction", "gb-volatility", "xgb-breakout", "momentum-regime", "mean-reversion", "trend-strength", "range-breakout", "volatility-regime", "price-action", "options-flow", "ensemble-voting", "tft-multihorizon", "nbeats-trend", "patchtst-pattern", "lstm-sequence", "tcn-momentum", "lightgbm-regime", "catboost-direction", "hmm-regime", "timemixer-multiscale", "conformal-range", "arima-direction", "sarima-seasonal", "ets-trend", "prophet-trend", "svr-direction", "knn-pattern", "bilstm-sequence", "cnn-lstm-hybrid", "lstm-gru-hybrid", "transformer-attention", "sentiment-hybrid", "garch-volatility", "quantile-forest-range", "production-xgboost-direction", "production-lstm-sequence", "production-transformer"]);

productionPredictionRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').trim().replace(/\/$/, '');
  if (!serviceUrl) {
    res.status(503).json({ success: false, error: 'Production ML service is not configured. Set ML_SERVICE_URL on the server.' });
    return;
  }
  const symbol = String(req.body?.symbol || '').trim();
  const timeframe = String(req.body?.timeframe || '').trim();
  const candles = Array.isArray(req.body?.candles) ? req.body.candles.slice(-MAX_CANDLES) : [];
  const models = Array.isArray(req.body?.models) ? req.body.models.filter((x: any) => ALLOWED_MODELS.has(String(x))).slice(0, 24) : ['xgboost','lstm'];
  if (!symbol || !timeframe || candles.length < 80) {
    res.status(400).json({ success: false, error: 'Production prediction requires symbol, timeframe and at least 80 candles.' });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(`${serviceUrl}/predict`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ML_SERVICE_SECRET ? { 'X-TradingCore-ML-Secret': process.env.ML_SERVICE_SECRET } : {}),
      },
      body: JSON.stringify({ symbol, timeframe, candles, models, horizon: 1 }),
    });
    const text = await upstream.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { detail: text.slice(0, 300) }; }
    if (!upstream.ok) {
      res.status(upstream.status >= 500 ? 503 : upstream.status).json({ success: false, error: payload?.detail || payload?.error || 'Production ML service rejected the prediction request.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...payload, user_id: req.tradingCoreUserId });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Production ML service timed out.' : 'Production ML service is unavailable.';
    res.status(503).json({ success: false, error: message });
  } finally {
    clearTimeout(timeout);
  }
});
