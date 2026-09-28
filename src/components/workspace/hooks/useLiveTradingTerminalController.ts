import { useEffect, useRef, useState } from 'react';
import type { OrderRequest, Position, OrderResult, TradeRecord } from '../../../services/brokers/BrokerAdapter';
import { tradingCoreRuntime } from '../../../services/runtime/TradingCoreRuntime';

export type TerminalPanel = 'positions' | 'orders' | 'trades' | 'ticket' | null;
export type TerminalPortfolio = { positions: Position[]; orders: OrderResult[]; trades: TradeRecord[] };

export function useLiveTradingTerminalController() {
  const [panel, setPanel] = useState<TerminalPanel>(null);
  const [ticketPinned, setTicketPinned] = useState(() => { try { return localStorage.getItem('tradingcore_ticket_pinned') === '1'; } catch { return false; } });
  const [portfolio, setPortfolio] = useState<TerminalPortfolio>({ positions: [], orders: [], trades: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const windowRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, left: 0, top: 0, target: 'panel' as 'panel' | 'ticket' });

  const sync = async () => {
    try {
      const snapshot = await tradingCoreRuntime.syncPortfolio();
      setPortfolio({ positions: snapshot.positions, orders: snapshot.orders, trades: snapshot.trades });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Portfolio sync failed');
    }
  };

  useEffect(() => { void sync(); return tradingCoreRuntime.startPortfolioPolling(15000); }, []);
  useEffect(() => { try { localStorage.setItem('tradingcore_ticket_pinned', ticketPinned ? '1' : '0'); } catch {} }, [ticketPinned]);
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest('button') as HTMLButtonElement | null;
      if (!button) return;
      const controlBar = button.closest('.tc4-toolbar, .tc4-bottom');
      if (!controlBar) return;
      const text = (button.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!/^(positions|orders|trades|order ticket)$/.test(text)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (text === 'order ticket') setPanel('ticket'); else setPanel(text as Exclude<TerminalPanel, 'ticket' | null>);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ticketPinned) setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ticketPinned]);
  useEffect(() => {
    if (!panel || panel === 'ticket' || !windowRef.current) return;
    windowRef.current.style.left = '50%'; windowRef.current.style.top = '50%'; windowRef.current.style.transform = 'translate(-50%,-50%)';
  }, [panel]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, target: 'panel' | 'ticket') => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = target === 'ticket' ? ticketRef.current : windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top, target };
    if (target === 'panel') el.style.transform = 'none';
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  };
  const dragWindow = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = dragRef.current.target === 'ticket' ? ticketRef.current : windowRef.current;
    if (!el) return;
    const nextLeft = Math.max(0, Math.min(window.innerWidth - 140, dragRef.current.left + e.clientX - dragRef.current.startX));
    const nextTop = Math.max(58, Math.min(window.innerHeight - 70, dragRef.current.top + e.clientY - dragRef.current.startY));
    el.style.left = `${nextLeft}px`; el.style.top = `${nextTop}px`;
    if (dragRef.current.target === 'ticket') el.style.right = 'auto';
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => { dragRef.current.active = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} };
  const pinTicket = () => { setTicketPinned(v => !v); setPanel(p => p === 'ticket' ? null : p); };
  const closeTicket = () => { setTicketPinned(false); setPanel(null); };
  const submit = async (side: OrderRequest['side'], symbol: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMessage('');
    try {
      const quantity = Number(extra.quantity ?? 1);
      const orderType = String(extra.orderType ?? 'Market') as OrderRequest['orderType'];
      const result = await tradingCoreRuntime.placeOrder({
        symbol, instrument_token: symbol, quantity: Math.max(1, Number.isFinite(quantity) ? quantity : 1),
        price: Number(extra.price) || undefined, triggerPrice: Number(extra.triggerPrice) || undefined,
        orderType, side, product: String(extra.product ?? 'MIS') as OrderRequest['product'],
        takeProfit: Number(extra.target) || undefined, stopLoss: Number(extra.stopLoss) || undefined, trailingStopLoss: Number(extra.trailing) || undefined,
        idempotencyKey: globalThis.crypto?.randomUUID?.(),
      });
      setMessage(`${result.status || 'submitted'} ${result.orderId || ''}`); await sync();
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Order failed'); } finally { setBusy(false); }
  };
  return { panel, setPanel, ticketPinned, portfolio, busy, message, windowRef, ticketRef, startDrag, dragWindow, endDrag, pinTicket, closeTicket, submit, sync };
}
