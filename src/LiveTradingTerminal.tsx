
import { X, RefreshCw } from 'lucide-react';
import { LiveTradingWorkspace } from './LiveTradingWorkspace';
import type { OrderResult, Position, TradeRecord } from './services/brokers/BrokerAdapter';
import { AdvancedOrderTicket } from './components/workspace/AdvancedOrderTicket';
import { useLiveTradingTerminalController } from './components/workspace/hooks/useLiveTradingTerminalController';

const num = (v: unknown) => Number(v ?? 0) || 0;
const fmt = (v: unknown) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });




const css = `
.tct-backdrop{position:fixed;inset:0;z-index:500;background:transparent;backdrop-filter:none}
.tct-window{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,calc(100vw - 32px));height:min(620px,calc(100vh - 110px));min-width:420px;min-height:260px;max-width:calc(100vw - 20px);max-height:calc(100vh - 40px);z-index:510;display:flex;flex-direction:column;overflow:hidden;resize:both;background:var(--tco-bg);color:#e5e7eb;border:1px solid #3a4354;border-radius:10px;box-shadow:0 28px 90px #000e}
.tct-head{height:42px;min-height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--tco-surface-3);border-bottom:1px solid var(--tco-control);user-select:none;cursor:grab}.tct-head:active{cursor:grabbing}.tct-head b{font:700 11px ui-monospace,monospace}.tct-head small{color:#64748b;font:9px ui-monospace,monospace}.tct-spacer{flex:1}.tct-head button{display:inline-flex;align-items:center;gap:5px;background:var(--tco-surface-3);color:#cbd5e1;border:1px solid var(--tco-control);border-radius:6px;padding:6px 8px;cursor:pointer}
.tct-content{flex:1;min-height:0;overflow:auto;padding:10px}.tct-card{border:1px solid var(--tco-control);border-radius:8px;background:var(--tco-surface-2);padding:10px}.tct-card b{display:block;font:700 11px ui-monospace,monospace}.tct-card small,.tct-muted{color:#64748b;font-size:9px}.tct-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tct-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.tct-content label{display:block;color:#64748b;font:9px ui-monospace,monospace;text-transform:uppercase;margin-bottom:4px}.tct-content input,.tct-content select,.tct-content button{box-sizing:border-box;background:var(--tco-surface-3);color:#e5e7eb;border:1px solid var(--tco-control);border-radius:6px;padding:7px}.tct-content input,.tct-content select{width:100%}.tct-actions{display:flex;gap:7px;margin-top:8px}.tct-actions>*{flex:1}.tct-table{width:100%;border-collapse:collapse;font:10px ui-monospace,monospace;margin-top:10px}.tct-table th,.tct-table td{padding:7px;border-bottom:1px solid var(--tco-border-soft);text-align:right}.tct-table th:first-child,.tct-table td:first-child{text-align:left}.tct-msg{color:#fbbf24;font-size:9px;margin-top:8px}
.tct-ticket-pinned{position:fixed;right:16px;top:76px;width:min(590px,calc(100vw - 28px));height:min(720px,calc(100vh - 94px));min-width:360px;min-height:420px;max-width:calc(100vw - 20px);max-height:calc(100vh - 30px);z-index:9000;display:flex;flex-direction:column;overflow:hidden;resize:both;background:var(--tco-bg);color:#e5e7eb;border:1px solid #3a4354;border-radius:10px;box-shadow:0 24px 80px #000e}
.tct-ticket-pinned .tct-content{padding:0}.tct-ticket-pinned .tct-head{cursor:grab}
.aot-root{height:100%;overflow:auto;background:var(--tco-bg);color:#e5e7eb;font:11px ui-monospace,monospace}.aot-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--tco-control);background:var(--tco-surface-3)}.aot-top b{display:block;font-size:11px}.aot-top small{display:block;color:#64748b;font-size:9px;margin-top:3px}.aot-top-actions{display:flex;gap:6px}.aot-top-actions button,.aot-advanced-toggle{display:inline-flex;align-items:center;gap:5px;background:var(--tco-surface-3);color:#cbd5e1;border:1px solid var(--tco-control);border-radius:6px;padding:6px 8px;cursor:pointer}.aot-summary{display:flex;gap:7px;flex-wrap:wrap;padding:7px 12px;border-bottom:1px solid var(--tco-border-soft);color:#8b98aa;font-size:9px}.aot-summary span{padding:3px 6px;border:1px solid var(--tco-control);border-radius:4px;background:var(--tco-surface-3)}.aot-card{margin:8px;border:1px solid var(--tco-control);border-radius:8px;background:var(--tco-surface-2);padding:10px}.aot-section-title{font-weight:700;font-size:10px;margin-bottom:8px;color:#dbe4f0}.aot-four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.aot-two,.aot-risk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px}.aot-risk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.aot-trigger{margin-top:7px}.aot-root label{display:block;color:#64748b;font-size:8px;text-transform:uppercase;margin:0 0 4px}.aot-root input,.aot-root select{width:100%;box-sizing:border-box;background:var(--tco-surface-3);color:#e5e7eb;border:1px solid var(--tco-control);border-radius:6px;padding:7px;font:10px ui-monospace,monospace}.aot-root input:disabled{opacity:.55}.aot-root input[readonly]{color:#7d899a}.aot-legs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.aot-leg{border:1px solid var(--tco-control);border-radius:8px;background:var(--tco-bg);padding:9px}.aot-leg-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px}.aot-leg-head b{font-size:11px}.aot-leg-head small{display:block;color:#64748b;font-size:8px;margin-top:2px}.aot-leg-head strong{font-size:15px}.aot-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.aot-actions button{border-radius:6px;padding:8px;border:1px solid var(--tco-control);font:700 10px ui-monospace,monospace;cursor:pointer}.aot-actions button:disabled{opacity:.45;cursor:not-allowed}.aot-buy{background:#090a0f!important;color:#93c5fd!important}.aot-sell{background:#241013!important;color:#fca5a5!important}.aot-empty{padding:12px;color:#fbbf24;font-size:9px}.aot-advanced-toggle{margin:0 8px 8px;width:calc(100% - 16px);justify-content:center}.aot-note{margin-top:0}.aot-note div{font-weight:700;margin-bottom:4px}.aot-message{margin:8px;padding:8px;border:1px solid #4a3a18;border-radius:6px;color:#fbbf24;background:var(--tco-surface-3);font-size:9px}
@media(max-width:900px){.tct-window{width:calc(100vw - 20px);height:calc(100vh - 85px);min-width:300px}.tct-grid,.aot-four,.aot-legs,.aot-risk-grid{grid-template-columns:1fr}.tct-ticket-pinned{left:10px;right:auto;top:70px;width:calc(100vw - 20px);height:calc(100vh - 82px);min-width:300px}.aot-two{grid-template-columns:1fr}}
`;

export function LiveTradingTerminal() {
  const { panel, setPanel, ticketPinned, portfolio, busy, message, windowRef, ticketRef, startDrag, dragWindow, endDrag, pinTicket, closeTicket, submit } = useLiveTradingTerminalController();

  const renderTicket = (pinned: boolean) => <div ref={pinned ? ticketRef : undefined} className={pinned ? 'tct-ticket-pinned' : 'tct-window'} role="dialog" aria-modal="false">
    <div className="tct-head" onPointerDown={e => startDrag(e, pinned ? 'ticket' : 'panel')} onPointerMove={dragWindow} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <b>{pinned ? 'PINNED ORDER TICKET' : 'ORDER TICKET'}</b><small>Drag title bar · resize from bottom-right</small><span className="tct-spacer" />
      <button onPointerDown={e => e.stopPropagation()} onClick={pinTicket}>{pinned ? 'Unpin' : 'Pin'}</button><button onPointerDown={e => e.stopPropagation()} onClick={closeTicket}><X size={12} /> Close</button>
    </div>
    <div className="tct-content"><AdvancedOrderTicket busy={busy} message={message} pinned={pinned} onPin={pinTicket} onClose={closeTicket} onSubmit={submit} /></div>
  </div>;

  return <>
    <style>{css}</style>
    <LiveTradingWorkspace />

    {panel && panel !== 'ticket' && <div className="tct-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPanel(null); }}><div ref={windowRef} className="tct-window" role="dialog" aria-modal="false" onPointerDown={e => e.stopPropagation()}>
      <div className="tct-head" onPointerDown={e => startDrag(e, 'panel')} onPointerMove={dragWindow} onPointerUp={endDrag} onPointerCancel={endDrag}><b>{panel.toUpperCase()}</b><small>Drag title bar · resize from bottom-right · ESC to close</small><span className="tct-spacer" /><button onPointerDown={e => e.stopPropagation()} onClick={() => setPanel(null)}><X size={12} /> Close</button></div>
      <div className="tct-content">
        {panel === 'positions' && <Portfolio kind="positions" rows={portfolio.positions || []} refresh={sync} />}
        {panel === 'orders' && <Portfolio kind="orders" rows={portfolio.orders || []} refresh={sync} />}
        {panel === 'trades' && <Portfolio kind="trades" rows={portfolio.trades || []} refresh={sync} />}
      </div>
    </div></div>}
    {panel === 'ticket' && !ticketPinned && <div className="tct-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPanel(null); }}>{renderTicket(false)}</div>}
    {ticketPinned && renderTicket(true)}
  </>;
}

function Portfolio({ kind, rows, refresh }: { kind: 'positions' | 'orders' | 'trades'; rows: Array<Position | OrderResult | TradeRecord>; refresh: () => void }) {
  const headers = kind === 'positions' ? ['Symbol', 'Qty', 'Avg', 'LTP', 'P&L'] : kind === 'orders' ? ['Order', 'Status', 'Side', 'Qty'] : ['Trade', 'Side', 'Qty', 'Price', 'P&L'];
  return <><div className="tct-card"><b>{rows.length} {kind}</b><button style={{ float: 'right' }} onClick={refresh}><RefreshCw size={12} /> Refresh</button></div><table className="tct-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, index: number) => { const cells = kind === 'positions' ? [String((row as Position).symbol), fmt((row as Position).quantity), fmt((row as Position).avgPrice), fmt((row as Position).ltp), fmt((row as Position).pnl)] : kind === 'orders' ? [String((row as OrderResult).orderId), (row as OrderResult).status, '—', '—'] : [String((row as TradeRecord).tradeId), (row as TradeRecord).side, fmt((row as TradeRecord).quantity), fmt((row as TradeRecord).price), fmt((row as TradeRecord).pnl)]; return <tr key={('id' in row ? row.id : 'orderId' in row ? row.orderId : row.tradeId) || index}>{cells.map((cell, j: number) => <td key={j}>{cell}</td>)}</tr>; })}</tbody></table></>;
}
