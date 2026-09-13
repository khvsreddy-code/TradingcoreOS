import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { LiveTradingTerminalV4 } from './LiveTradingTerminalV4';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { OrderRequest } from './services/brokers/BrokerAdapter';
import { DynamicLevelSettings, getDynamicLevelSettings, saveDynamicLevelSettings } from './services/marketData/levelSettings';

type Panel = 'levels' | 'positions' | 'orders' | 'trades' | 'ticket' | null;
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
.tc5-rename{position:fixed;left:8px;top:76px;width:205px;height:34px;z-index:300;cursor:pointer;background:#0b0e15;color:#cbd5e1;border:1px solid #252b38;border-radius:7px;text-align:left;padding:6px 9px}
.tc5-rename-modal{position:fixed;left:12px;top:120px;width:290px;z-index:1000;background:#0b0e15;color:#e5e7eb;border:1px solid #303747;border-radius:9px;padding:12px;box-shadow:0 20px 60px #000d}
.tc5-rename-modal input{width:100%;box-sizing:border-box;background:#11151f;color:#fff;border:1px solid #252b38;border-radius:6px;padding:8px}
.tc5-backdrop{position:fixed;inset:0;z-index:500;background:#0007;backdrop-filter:blur(1px)}
.tc5-window{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,calc(100vw - 32px));height:min(620px,calc(100vh - 110px));min-width:420px;min-height:260px;max-width:calc(100vw - 20px);max-height:calc(100vh - 40px);z-index:510;display:flex;flex-direction:column;overflow:hidden;resize:both;background:#080a0f;color:#e5e7eb;border:1px solid #3a4354;border-radius:10px;box-shadow:0 28px 90px #000e}
.tc5-head{height:42px;min-height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#0e121a;border-bottom:1px solid #252b38;user-select:none}
.tc5-head b{font:700 11px ui-monospace,monospace}.tc5-head small{color:#64748b;font:9px ui-monospace,monospace}.tc5-spacer{flex:1}
.tc5-head button{display:inline-flex;align-items:center;gap:5px;background:#11151f;color:#cbd5e1;border:1px solid #252b38;border-radius:6px;padding:6px 8px;cursor:pointer}
.tc5-content{flex:1;min-height:0;overflow:auto;padding:10px}.tc5-card{border:1px solid #252b38;border-radius:8px;background:#090c12;padding:10px}.tc5-card b{display:block;font:700 11px ui-monospace,monospace}.tc5-card small,.tc5-muted{color:#64748b;font-size:9px}
.tc5-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tc5-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.tc5-content label{display:block;color:#64748b;font:9px ui-monospace,monospace;text-transform:uppercase;margin-bottom:4px}.tc5-content input,.tc5-content select,.tc5-content button{box-sizing:border-box;background:#11151f;color:#e5e7eb;border:1px solid #252b38;border-radius:6px;padding:7px}.tc5-content input,.tc5-content select{width:100%}.tc5-actions{display:flex;gap:7px;margin-top:8px}.tc5-actions>*{flex:1}.tc5-buy{background:#0d211b!important;color:#6ee7b7!important}.tc5-sell{background:#241013!important;color:#fca5a5!important}.tc5-atm{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.tc5-leg{border:1px solid #252b38;border-radius:8px;padding:10px;background:#090c12}.tc5-ltp{font:700 16px ui-monospace,monospace;margin-top:4px}.tc5-table{width:100%;border-collapse:collapse;font:10px ui-monospace,monospace;margin-top:10px}.tc5-table th,.tc5-table td{padding:7px;border-bottom:1px solid #1b202b;text-align:right}.tc5-table th:first-child,.tc5-table td:first-child{text-align:left}.tc5-msg{color:#fbbf24;font-size:9px;margin-top:8px}
@media(max-width:900px){.tc5-window{width:calc(100vw - 20px);height:calc(100vh - 85px);min-width:300px}.tc5-grid,.tc5-atm,.tc5-fields{grid-template-columns:1fr}.tc5-rename{width:170px}}
`;

export function LiveTradingTerminalV5() {
  const [panel, setPanel] = useState<Panel>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem('tradingcore_watchlist_name') || 'Main Watchlist'; } catch { return 'Main Watchlist'; } });
  const [draft, setDraft] = useState(name);
  const [levels, setLevels] = useState<DynamicLevelSettings>(() => getDynamicLevelSettings());
  const [portfolio, setPortfolio] = useState<any>({ positions: [], orders: [], trades: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const sync = async () => { try { setPortfolio(await tradingCoreRuntime.syncPortfolio()); } catch (e: any) { setMessage(e?.message || 'Portfolio sync failed'); } };
  useEffect(() => { void sync(); return tradingCoreRuntime.startPortfolioPolling(15000); }, []);

  // Intercept ONLY the five popup controls. Option Chain and every other terminal control remain untouched.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest('button') as HTMLButtonElement | null;
      if (!button) return;
      const text = (button.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!/^(levels|positions|orders|trades|order ticket)$/.test(text)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setPanel(text === 'order ticket' ? 'ticket' : text as Panel);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(null); setRenameOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveName = () => {
    const value = draft.trim().slice(0, 40);
    if (!value) return;
    setName(value);
    try { localStorage.setItem('tradingcore_watchlist_name', value); } catch {}
    setRenameOpen(false);
  };

  const submit = async (side: OrderRequest['side'], symbol: string, extra: any = {}) => {
    setBusy(true); setMessage('');
    try {
      const result = await tradingCoreRuntime.placeOrder({ symbol, instrument_token: symbol, quantity: Math.max(1, num(extra.quantity || 1)), orderType: 'Market', side, product: 'MIS', takeProfit: num(extra.target) || undefined, stopLoss: num(extra.stopLoss) || undefined, trailingStopLoss: num(extra.trailing) || undefined, idempotencyKey: globalThis.crypto?.randomUUID?.() } as any);
      setMessage(`${result.status || 'submitted'} ${result.orderId || ''}`);
      await sync();
    } catch (e: any) { setMessage(e?.message || 'Order failed'); }
    finally { setBusy(false); }
  };

  return <>
    <style>{css}</style>
    <LiveTradingTerminalV4 />
    <button className="tc5-rename" onClick={() => { setDraft(name); setRenameOpen(true); }}>{name} ✎</button>
    {renameOpen && <div className="tc5-rename-modal">
      <b>RENAME WATCHLIST</b>
      <div style={{ marginTop: 8 }}><input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenameOpen(false); }} /></div>
      <div className="tc5-actions"><button onClick={() => setRenameOpen(false)}>Cancel</button><button onClick={saveName}>Save</button></div>
    </div>}
    {panel && <div className="tc5-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPanel(null); }}>
      <div className="tc5-window" role="dialog" aria-modal="true" onPointerDown={e => e.stopPropagation()}>
        <div className="tc5-head">
          <b>{panel === 'levels' ? 'OS LEVELS' : panel.toUpperCase()}</b>
          <small>Floating window · resize from bottom-right · ESC to close</small>
          <span className="tc5-spacer" />
          <button onClick={() => setPanel(null)}><X size={12} /> Close</button>
        </div>
        <div className="tc5-content">
          {panel === 'levels' && <Levels value={levels} onChange={v => { setLevels(v); saveDynamicLevelSettings(v); }} />}
          {panel === 'positions' && <Portfolio kind="positions" rows={portfolio.positions || []} refresh={sync} />}
          {panel === 'orders' && <Portfolio kind="orders" rows={portfolio.orders || []} refresh={sync} />}
          {panel === 'trades' && <Portfolio kind="trades" rows={portfolio.trades || []} refresh={sync} />}
          {panel === 'ticket' && <Ticket busy={busy} message={message} onSubmit={submit} />}
        </div>
      </div>
    </div>}
  </>;
}

function Levels({ value, onChange }: { value: DynamicLevelSettings; onChange: (v: DynamicLevelSettings) => void }) {
  const set = (key: keyof DynamicLevelSettings, value: any) => onChange({ ...value, [key]: value });
  return <div className="tc5-grid">
    <div className="tc5-card"><b>Detection</b><small>Levels are a feature, not an indicator.</small><div className="tc5-fields">
      <div><label>How much back</label><input type="number" value={value.lookbackPeriod} onChange={e => set('lookbackPeriod', num(e.target.value))} /></div>
      <div><label>Pivot length</label><input type="number" value={value.pivotLength} onChange={e => set('pivotLength', num(e.target.value))} /></div>
    </div></div>
    <div className="tc5-card"><b>Merge / confirmation</b><div className="tc5-fields">
      <div><label>Merge nearby levels</label><input type="checkbox" checked={value.mergeNearbyLevels} onChange={e => set('mergeNearbyLevels', e.target.checked)} /></div>
      <div><label>Merge distance × ATR</label><input type="number" step=".1" value={value.mergeAtrMultiplier} onChange={e => set('mergeAtrMultiplier', num(e.target.value))} /></div>
      <div><label>Breakout confirmation</label><select value={value.breakoutConfirmation} onChange={e => set('breakoutConfirmation', e.target.value)}><option>Close</option><option>Wick</option></select></div>
    </div></div>
  </div>;
}

function Portfolio({ kind, rows, refresh }: { kind: 'positions' | 'orders' | 'trades'; rows: any[]; refresh: () => void }) {
  const headers = kind === 'positions' ? ['Symbol', 'Qty', 'Avg', 'LTP', 'P&L'] : kind === 'orders' ? ['Order', 'Status', 'Side', 'Qty'] : ['Trade', 'Side', 'Qty', 'Price', 'P&L'];
  return <><div className="tc5-card"><b>{rows.length} {kind}</b><button style={{ float: 'right' }} onClick={refresh}><RefreshCw size={12} /> Refresh</button></div>
    <table className="tc5-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {rows.map((row: any, index: number) => { const cells = kind === 'positions' ? [row.symbol, fmt(row.quantity), fmt(row.avgPrice), fmt(row.ltp), fmt(row.pnl)] : kind === 'orders' ? [row.orderId, row.status, row.side || '—', fmt(row.quantity)] : [row.tradeId, row.side, fmt(row.quantity), fmt(row.price), fmt(row.pnl)]; return <tr key={row.id || row.orderId || row.tradeId || index}>{cells.map((cell: any, j: number) => <td key={j}>{cell}</td>)}</tr>; })}
    </tbody></table></>;
}

function Ticket({ busy, message, onSubmit }: { busy: boolean; message: string; onSubmit: (side: OrderRequest['side'], symbol: string, extra?: any) => void }) {
  const [meta, setMeta] = useState(focusedChart());
  const [data, setData] = useState<any>(null);
  const [ce, setCe] = useState(''); const [pe, setPe] = useState('');
  const [ceRisk, setCeRisk] = useState({ quantity: 1, target: '', stopLoss: '', trailing: '' });
  const [peRisk, setPeRisk] = useState({ quantity: 1, target: '', stopLoss: '', trailing: '' });
  useEffect(() => { const id = window.setInterval(() => setMeta(focusedChart()), 300); return () => window.clearInterval(id); }, []);
  const isIndex = /NIFTY|SENSEX|FINNIFTY|MIDCP/i.test(meta.label + ' ' + meta.symbol);
  useEffect(() => { let dead = false; if (!isIndex || !meta.symbol) { setData(null); return; } tradingCoreRuntime.getOptionChain(meta.symbol).then(x => { if (!dead) setData(x); }).catch(() => { if (!dead) setData({ error: 'Option chain unavailable' }); }); return () => { dead = true; }; }, [meta.symbol, isIndex]);
  const rows = Array.isArray(data?.contracts) ? data.contracts : Array.isArray(data) ? data : [];
  const spot = num(data?.spot ?? data?.underlyingPrice);
  const strikes = rows.map((r: any) => num(r.strike ?? r.strikePrice)).filter(Boolean);
  const atm = strikes.sort((a: number, b: number) => Math.abs(a - spot) - Math.abs(b - spot))[0] || 0;
  useEffect(() => { const row = rows.find((x: any) => num(x.strike ?? x.strikePrice) === atm); if (row) { setCe(row.call?.instrumentKey || row.call?.symbol || ''); setPe(row.put?.instrumentKey || row.put?.symbol || ''); const lot = num(row.call?.lotSize || row.put?.lotSize) || 1; setCeRisk(x => ({ ...x, quantity: lot })); setPeRisk(x => ({ ...x, quantity: lot })); } }, [data, atm]);
  const renderLeg = (side: 'CE' | 'PE', selected: string, setSelected: any, risk: any, setRisk: any) => {
    const row = rows.find((x: any) => (side === 'CE' ? x.call?.instrumentKey || x.call?.symbol : x.put?.instrumentKey || x.put?.symbol) === selected);
    const contract = side === 'CE' ? row?.call : row?.put;
    if (!contract) return <div className="tc5-leg"><small>Select {side} strike.</small></div>;
    const symbol = contract.instrumentKey || contract.symbol;
    return <div className="tc5-leg"><b>{num(row.strike ?? row.strikePrice)} {side}</b><div className="tc5-ltp">₹{fmt(contract.ltp ?? contract.lastPrice)}</div>
      <div className="tc5-fields"><div><label>Strike</label><select value={selected} onChange={e => setSelected(e.target.value)}>{rows.map((x: any) => { const z = side === 'CE' ? x.call : x.put; const key = z?.instrumentKey || z?.symbol; return key ? <option key={key} value={key}>{num(x.strike ?? x.strikePrice)} {side} · ₹{fmt(z.ltp ?? z.lastPrice)}</option> : null; })}</select></div>
      <div><label>Quantity</label><input type="number" min="1" value={risk.quantity} onChange={e => setRisk((x: any) => ({ ...x, quantity: num(e.target.value) }))} /></div>
      <div><label>Target</label><input value={risk.target} onChange={e => setRisk((x: any) => ({ ...x, target: e.target.value }))} /></div>
      <div><label>Stop loss</label><input value={risk.stopLoss} onChange={e => setRisk((x: any) => ({ ...x, stopLoss: e.target.value }))} /></div>
      <div><label>Trailing SL</label><input value={risk.trailing} onChange={e => setRisk((x: any) => ({ ...x, trailing: e.target.value }))} /></div></div>
      <div className="tc5-actions"><button className="tc5-buy" disabled={busy} onClick={() => onSubmit('Buy', symbol, risk)}>BUY {side}</button><button className="tc5-sell" disabled={busy} onClick={() => onSubmit('Sell', symbol, risk)}>SELL {side}</button></div>
    </div>;
  };
  return <div className="tc5-card"><b>{isIndex ? 'ATM CE / PE ORDER TICKET' : 'ORDER TICKET'}</b><small>{meta.label || meta.symbol || 'Focus a chart first'}</small>
    {isIndex ? data?.error ? <div className="tc5-msg">{data.error}</div> : !rows.length ? <div className="tc5-muted">Loading live option chain…</div> : <div className="tc5-atm">{renderLeg('CE', ce, setCe, ceRisk, setCeRisk)}{renderLeg('PE', pe, setPe, peRisk, setPeRisk)}</div> : <div className="tc5-msg">Select an index to use the ATM CE/PE ticket.</div>}
    {message && <div className="tc5-msg">{message}</div>}
  </div>;
}
