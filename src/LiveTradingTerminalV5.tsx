import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { LiveTradingTerminalV4 } from './LiveTradingTerminalV4';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { OrderRequest } from './services/brokers/BrokerAdapter';
import { DynamicLevelSettings, getDynamicLevelSettings, saveDynamicLevelSettings } from './services/marketData/levelSettings';
import { AdvancedOrderTicket } from './components/workspace/AdvancedOrderTicket';

type Panel = 'levels' | 'positions' | 'orders' | 'trades' | null;
const num = (v: any) => Number(v ?? 0) || 0;
const fmt = (v: any) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function focusedChart() {
  const el = document.querySelector('.tc4-chart.focused') as HTMLElement | null;
  return {
    symbol: (el?.querySelector('select') as HTMLSelectElement | null)?.value || '',
    label: (el?.querySelector('strong') as HTMLElement | null)?.textContent || '',
  };
}

const css = `
.tc5-backdrop{position:fixed;inset:0;z-index:500;background:transparent;backdrop-filter:none}
.tc5-window{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,calc(100vw - 32px));height:min(620px,calc(100vh - 110px));min-width:420px;min-height:260px;max-width:calc(100vw - 20px);max-height:calc(100vh - 40px);z-index:510;display:flex;flex-direction:column;overflow:hidden;resize:both;background:#080a0f;color:#e5e7eb;border:1px solid #3a4354;border-radius:10px;box-shadow:0 28px 90px #000e}
.tc5-head{height:42px;min-height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#0e121a;border-bottom:1px solid #252b38;user-select:none;cursor:grab}.tc5-head:active{cursor:grabbing}.tc5-head b{font:700 11px ui-monospace,monospace}.tc5-head small{color:#64748b;font:9px ui-monospace,monospace}.tc5-spacer{flex:1}.tc5-head button{display:inline-flex;align-items:center;gap:5px;background:#11151f;color:#cbd5e1;border:1px solid #252b38;border-radius:6px;padding:6px 8px;cursor:pointer}
.tc5-content{flex:1;min-height:0;overflow:auto;padding:10px}.tc5-card{border:1px solid #252b38;border-radius:8px;background:#090c12;padding:10px}.tc5-card b{display:block;font:700 11px ui-monospace,monospace}.tc5-card small,.tc5-muted{color:#64748b;font-size:9px}.tc5-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tc5-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.tc5-content label{display:block;color:#64748b;font:9px ui-monospace,monospace;text-transform:uppercase;margin-bottom:4px}.tc5-content input,.tc5-content select,.tc5-content button{box-sizing:border-box;background:#11151f;color:#e5e7eb;border:1px solid #252b38;border-radius:6px;padding:7px}.tc5-content input,.tc5-content select{width:100%}.tc5-actions{display:flex;gap:7px;margin-top:8px}.tc5-actions>*{flex:1}.tc5-table{width:100%;border-collapse:collapse;font:10px ui-monospace,monospace;margin-top:10px}.tc5-table th,.tc5-table td{padding:7px;border-bottom:1px solid #1b202b;text-align:right}.tc5-table th:first-child,.tc5-table td:first-child{text-align:left}.tc5-msg{color:#fbbf24;font-size:9px;margin-top:8px}
.tc5-ticket-pinned{position:fixed;right:16px;top:76px;width:min(590px,calc(100vw - 28px));height:min(720px,calc(100vh - 94px));min-width:360px;min-height:420px;max-width:calc(100vw - 20px);max-height:calc(100vh - 30px);z-index:9000;display:flex;flex-direction:column;overflow:hidden;resize:both;background:#080a0f;color:#e5e7eb;border:1px solid #3a4354;border-radius:10px;box-shadow:0 24px 80px #000e}
.tc5-ticket-pinned .tc5-content{padding:0}.tc5-ticket-pinned .tc5-head{cursor:grab}
.aot-root{height:100%;overflow:auto;background:#080a0f;color:#e5e7eb;font:11px ui-monospace,monospace}.aot-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #252b38;background:#0e121a}.aot-top b{display:block;font-size:11px}.aot-top small{display:block;color:#64748b;font-size:9px;margin-top:3px}.aot-top-actions{display:flex;gap:6px}.aot-top-actions button,.aot-advanced-toggle{display:inline-flex;align-items:center;gap:5px;background:#11151f;color:#cbd5e1;border:1px solid #252b38;border-radius:6px;padding:6px 8px;cursor:pointer}.aot-summary{display:flex;gap:7px;flex-wrap:wrap;padding:7px 12px;border-bottom:1px solid #1d2330;color:#8b98aa;font-size:9px}.aot-summary span{padding:3px 6px;border:1px solid #252b38;border-radius:4px;background:#0b0e14}.aot-card{margin:8px;border:1px solid #252b38;border-radius:8px;background:#090c12;padding:10px}.aot-section-title{font-weight:700;font-size:10px;margin-bottom:8px;color:#dbe4f0}.aot-four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.aot-two,.aot-risk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px}.aot-risk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.aot-trigger{margin-top:7px}.aot-root label{display:block;color:#64748b;font-size:8px;text-transform:uppercase;margin:0 0 4px}.aot-root input,.aot-root select{width:100%;box-sizing:border-box;background:#11151f;color:#e5e7eb;border:1px solid #252b38;border-radius:6px;padding:7px;font:10px ui-monospace,monospace}.aot-root input:disabled{opacity:.55}.aot-root input[readonly]{color:#7d899a}.aot-legs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.aot-leg{border:1px solid #252b38;border-radius:8px;background:#080b11;padding:9px}.aot-leg-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px}.aot-leg-head b{font-size:11px}.aot-leg-head small{display:block;color:#64748b;font-size:8px;margin-top:2px}.aot-leg-head strong{font-size:15px}.aot-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.aot-actions button{border-radius:6px;padding:8px;border:1px solid #252b38;font:700 10px ui-monospace,monospace;cursor:pointer}.aot-actions button:disabled{opacity:.45;cursor:not-allowed}.aot-buy{background:#0d211b!important;color:#6ee7b7!important}.aot-sell{background:#241013!important;color:#fca5a5!important}.aot-empty{padding:12px;color:#fbbf24;font-size:9px}.aot-advanced-toggle{margin:0 8px 8px;width:calc(100% - 16px);justify-content:center}.aot-note{margin-top:0}.aot-note div{font-weight:700;margin-bottom:4px}.aot-message{margin:8px;padding:8px;border:1px solid #4a3a18;border-radius:6px;color:#fbbf24;background:#161108;font-size:9px}
@media(max-width:900px){.tc5-window{width:calc(100vw - 20px);height:calc(100vh - 85px);min-width:300px}.tc5-grid,.aot-four,.aot-legs,.aot-risk-grid{grid-template-columns:1fr}.tc5-ticket-pinned{left:10px;right:auto;top:70px;width:calc(100vw - 20px);height:calc(100vh - 82px);min-width:300px}.aot-two{grid-template-columns:1fr}}
`;

export function LiveTradingTerminalV5() {
  const [panel, setPanel] = useState<Panel>(null);
  const [ticketPinned, setTicketPinned] = useState(() => { try { return localStorage.getItem('tradingcore_ticket_pinned') === '1'; } catch { return false; } });
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem('tradingcore_watchlist_name') || 'My First Watchlist'; } catch { return 'My First Watchlist'; } });
  const [draft, setDraft] = useState(name);
  const [levels, setLevels] = useState<DynamicLevelSettings>(() => getDynamicLevelSettings());
  const [portfolio, setPortfolio] = useState<any>({ positions: [], orders: [], trades: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const windowRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, left: 0, top: 0, target: 'panel' as 'panel' | 'ticket' });

  const sync = async () => { try { setPortfolio(await tradingCoreRuntime.syncPortfolio()); } catch (e: any) { setMessage(e?.message || 'Portfolio sync failed'); } };
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
      if (!/^(levels|positions|orders|trades|order ticket)$/.test(text)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (text === 'order ticket') setPanel('ticket'); else setPanel(text as Panel);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (!ticketPinned) setPanel(null); setRenameOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ticketPinned]);

  useEffect(() => {
    if (!panel || panel === 'ticket' || !windowRef.current) return;
    const el = windowRef.current;
    el.style.left = '50%'; el.style.top = '50%'; el.style.transform = 'translate(-50%,-50%)';
  }, [panel]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, target: 'panel' | 'ticket') => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = target === 'ticket' ? ticketRef.current : windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top, target };
    if (target === 'panel') el.style.transform = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
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

  const saveName = () => {
    const value = draft.trim().slice(0, 40); if (!value) return;
    setName(value); try { localStorage.setItem('tradingcore_watchlist_name', value); window.dispatchEvent(new CustomEvent('tradingcore:watchlist-name-changed',{detail:value})); } catch {} setRenameOpen(false);
  };

  const submit = async (side: OrderRequest['side'], symbol: string, extra: any = {}) => {
    setBusy(true); setMessage('');
    try {
      const result = await tradingCoreRuntime.placeOrder({
        symbol,
        instrument_token: symbol,
        quantity: Math.max(1, num(extra.quantity || 1)),
        price: num(extra.price) || undefined,
        triggerPrice: num(extra.triggerPrice) || undefined,
        orderType: extra.orderType || 'Market',
        side,
        product: extra.product || 'MIS',
        takeProfit: num(extra.target) || undefined,
        stopLoss: num(extra.stopLoss) || undefined,
        trailingStopLoss: num(extra.trailing) || undefined,
        idempotencyKey: globalThis.crypto?.randomUUID?.(),
      } as OrderRequest);
      setMessage(`${result.status || 'submitted'} ${result.orderId || ''}`); await sync();
    } catch (e: any) { setMessage(e?.message || 'Order failed'); } finally { setBusy(false); }
  };

  const renderTicket = (pinned: boolean) => <div ref={pinned ? ticketRef : undefined} className={pinned ? 'tc5-ticket-pinned' : 'tc5-window'} role="dialog" aria-modal="false">
    <div className="tc5-head" onPointerDown={e => startDrag(e, pinned ? 'ticket' : 'panel')} onPointerMove={dragWindow} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <b>{pinned ? 'PINNED ORDER TICKET' : 'ORDER TICKET'}</b><small>Drag title bar · resize from bottom-right</small><span className="tc5-spacer" />
      <button onPointerDown={e => e.stopPropagation()} onClick={pinTicket}>{pinned ? 'Unpin' : 'Pin'}</button><button onPointerDown={e => e.stopPropagation()} onClick={closeTicket}><X size={12} /> Close</button>
    </div>
    <div className="tc5-content"><AdvancedOrderTicket busy={busy} message={message} pinned={pinned} onPin={pinTicket} onClose={closeTicket} onSubmit={submit} /></div>
  </div>;

  return <>
    <style>{css}</style>
    <LiveTradingTerminalV4 />

    {panel && panel !== 'ticket' && <div className="tc5-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPanel(null); }}><div ref={windowRef} className="tc5-window" role="dialog" aria-modal="false" onPointerDown={e => e.stopPropagation()}>
      <div className="tc5-head" onPointerDown={e => startDrag(e, 'panel')} onPointerMove={dragWindow} onPointerUp={endDrag} onPointerCancel={endDrag}><b>{panel === 'levels' ? 'OS LEVELS' : panel.toUpperCase()}</b><small>Drag title bar · resize from bottom-right · ESC to close</small><span className="tc5-spacer" /><button onPointerDown={e => e.stopPropagation()} onClick={() => setPanel(null)}><X size={12} /> Close</button></div>
      <div className="tc5-content">
        {panel === 'levels' && <Levels value={levels} onChange={v => { setLevels(v); saveDynamicLevelSettings(v); }} />}
        {panel === 'positions' && <Portfolio kind="positions" rows={portfolio.positions || []} refresh={sync} />}
        {panel === 'orders' && <Portfolio kind="orders" rows={portfolio.orders || []} refresh={sync} />}
        {panel === 'trades' && <Portfolio kind="trades" rows={portfolio.trades || []} refresh={sync} />}
      </div>
    </div></div>}
    {panel === 'ticket' && !ticketPinned && <div className="tc5-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPanel(null); }}>{renderTicket(false)}</div>}
    {ticketPinned && renderTicket(true)}
  </>;
}

function Levels({ value, onChange }: { value: DynamicLevelSettings; onChange: (v: DynamicLevelSettings) => void }) {
  const set = (key: keyof DynamicLevelSettings, next: any) => onChange({ ...value, [key]: next });
  return <div className="tc5-grid"><div className="tc5-card"><b>Detection</b><small>Levels are a feature, not an indicator.</small><div className="tc5-fields"><div><label>How much back</label><input type="number" value={value.lookbackPeriod} onChange={e => set('lookbackPeriod', num(e.target.value))} /></div><div><label>Pivot length</label><input type="number" value={value.pivotLength} onChange={e => set('pivotLength', num(e.target.value))} /></div></div></div><div className="tc5-card"><b>Merge / confirmation</b><div className="tc5-fields"><div><label>Merge nearby levels</label><input type="checkbox" checked={value.mergeNearbyLevels} onChange={e => set('mergeNearbyLevels', e.target.checked)} /></div><div><label>Merge distance × ATR</label><input type="number" step=".1" value={value.mergeAtrMultiplier} onChange={e => set('mergeAtrMultiplier', num(e.target.value))} /></div><div><label>Breakout confirmation</label><select value={value.breakoutConfirmation} onChange={e => set('breakoutConfirmation', e.target.value)}><option>Close</option><option>Wick</option></select></div></div></div></div>;
}

function Portfolio({ kind, rows, refresh }: { kind: 'positions' | 'orders' | 'trades'; rows: any[]; refresh: () => void }) {
  const headers = kind === 'positions' ? ['Symbol', 'Qty', 'Avg', 'LTP', 'P&L'] : kind === 'orders' ? ['Order', 'Status', 'Side', 'Qty'] : ['Trade', 'Side', 'Qty', 'Price', 'P&L'];
  return <><div className="tc5-card"><b>{rows.length} {kind}</b><button style={{ float: 'right' }} onClick={refresh}><RefreshCw size={12} /> Refresh</button></div><table className="tc5-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row: any, index: number) => { const cells = kind === 'positions' ? [row.symbol, fmt(row.quantity), fmt(row.avgPrice), fmt(row.ltp), fmt(row.pnl)] : kind === 'orders' ? [row.orderId, row.status, row.side || '—', fmt(row.quantity)] : [row.tradeId, row.side, fmt(row.quantity), fmt(row.price), fmt(row.pnl)]; return <tr key={row.id || row.orderId || row.tradeId || index}>{cells.map((cell: any, j: number) => <td key={j}>{cell}</td>)}</tr>; })}</tbody></table></>;
}
