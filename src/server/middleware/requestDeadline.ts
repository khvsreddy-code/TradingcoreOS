import type { NextFunction, Response } from 'express';
import type { TradingCoreRequest } from './requestContext.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';

function budgetFor(path: string): number {
  if (/\/quotes(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.quote;
  if (/\/depth(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.depth;
  if (/\/market-status(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.marketStatus;
  if (/\/order(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.order;
  if (/\/historical(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.history;
  if (/\/market-stream(?:$|[?\/])|\/order-stream(?:$|[?\/])/.test(path)) return API_LATENCY_BUDGET_MS.streamLease + 1_000;
  if (/^\/api\/jobs(?:$|[?\/])/.test(path)) return 4_000;
  if (/^\/api\/health(?:$|[?\/])/.test(path)) return 1_500;
  return 12_000;
}

export function requestDeadline(req: TradingCoreRequest, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }

  const budgetMs = budgetFor(req.path);
  const controller = new AbortController();
  req.tradingCoreAbortController = controller;
  req.tradingCoreAbortSignal = controller.signal;
  res.setHeader('X-TradingCore-Deadline-Ms', String(budgetMs));

  const timer = setTimeout(() => {
    controller.abort();
    if (res.writableEnded) return;

    const body = JSON.stringify({
      success: false,
      error: 'TradingCore request deadline exceeded.',
      requestId: req.tradingCoreRequestId || null,
      deadlineMs: budgetMs,
    });
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    res.status(504);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(body);
  }, budgetMs);

  const cleanup = () => clearTimeout(timer);
  res.on('finish', cleanup);
  res.on('close', cleanup);
  next();
}
