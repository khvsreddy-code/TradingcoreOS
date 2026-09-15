import { useEffect, useMemo, useState } from 'react';
import type { OrderRequest } from '../../services/brokers/BrokerAdapter';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';

const n = (v: any) => Number(v ?? 0) || 0;
const money = (v: any) => n(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function focusedChart() {
  const el = document.querySelector('.tc4-chart.focused') as HTMLElement | null;
  return { symbol: (el?.querySelector('select') as HTMLSelectElement | null)?.value || '', label: (el?.querySelector('strong') as HTMLElement | null)?.textContent || '' };
}

function upstoxUnderlyingKey(symbol: string, label: string): string {
  const text = `${symbol} ${label}`.toUpperCase().replace(/\s+/g, ' ').trim();
  if (text.includes('NIFTY BANK') || text.includes('BANK NIFTY')) return 'NSE_INDEX|Nifty Bank';
  if (text.includes('FINNIFTY') || text.includes('NIFTY FIN SERVICE') || text.includes('NIFTY FINANCIAL')) return 'NSE_INDEX|Nifty Fin Service';
  if (text.includes('MIDCP') || text.includes('NIFTY MIDCAP')) return 'NSE_INDEX|Nifty Midcap Select';
  if (text.includes('SENSEX')) return 'BSE_INDEX|SENSEX';
  if (text.includes('NIFTY')) return 'NSE_INDEX|Nifty 50';
  return symbol;
}

type Risk = { quantity: number; target: string; stopLoss: string; trailing: string };
type Props = { busy: boolean; message: string; pinned: boolean; onPin: () => void; onClose: () => void; onSubmit: (side: OrderRequest['side'], symbol: string, extra?: any) => void };

export function AdvancedOrderTicket({ busy, message, onSubmit }: Props) {
  const [meta, setMeta] = useState(focusedChart()); const [data, setData] = useState<any>(null);
  const [orderType, setOrderType] = useState<OrderRequest['orderType']>('Market'); const [product, setProduct] = useState<OrderRequest['product']>('MIS'); const [validity, setValidity] = useState<'DAY' | 'IOC'>('DAY');
  const [stockQty, setStockQty] = useState(1); const [stockPrice, setStockPrice] = useState(''); const [stockTrigger, setStockTrigger] = useState('');
  const [stockRisk, setStockRisk] = useState<Risk>({ quantity: 1, target: '', stopLoss: '', trailing: '' });
  const [ce, setCe] = useState(''); const [pe, setPe] = useState(''); const [ceRisk, setCeRisk] = useState<Risk>({ quantity: 1, target: '', stopLoss: '', trailing: '' }); const [peRisk, setPeRisk] = useState<Risk>({ quantity: 1, target: '', stopLoss: '', trailing: '' });
  const [showAdvanced, setShowAdvanced] = useState(true);

  useEffect(() => { const id = window.setInterval(() => setMeta(focusedChart()), 500); return () => window.clearInterval(id); }, []);
  const brokerId = tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId?.toLowerCase() || '';
  const isIndex = /NIFTY|SENSEX|FINNIFTY|MIDCP/i.test(`${meta.label} ${meta.symbol}`); const isOption = /(?:CE|PE)$/i.test(meta.symbol) || /OPTION/i.test(meta.label); const isFuture = /(?:FUT)$/i.test(meta.symbol) || /FUTURE/i.test(meta.label); const segment = isIndex ? 'INDEX' : isFuture ? 'FUTURE' : isOption ? 'OPTION' : 'EQUITY';
  const optionUnderlying = brokerId === 'upstox' ? upstoxUnderlyingKey(meta.symbol, meta.label) : meta.symbol;

  useEffect(() => {
    let dead = false;
    if (!isIndex || !meta.symbol) { setData(null); return () => { dead = true; }; }
    setData(null);
    tradingCoreRuntime.getOptionChain(optionUnderlying).then(x => { if (!dead) setData(x); }).catch((error: any) => {
      if (!dead) setData({ error: error?.message || 'Option chain unavailable' });
    });
    return () => { dead = true; };
  }, [meta.symbol, meta.label, isIndex, optionUnderlying]);

  const rows = Array.isArray(data?.contracts) ? data.contracts : Array.isArray(data) ? data : []; const spot = n(data?.spot ?? data?.underlyingPrice);
  const sortedStrikes = useMemo(() => rows.map((r: any) => n(r.strike ?? r.strikePrice)).filter(Boolean).sort((a: number, b: number) => a - b), [rows]);
  const atm = useMemo(() => sortedStrikes.reduce((best: number, strike: number) => !best || Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best, 0), [sortedStrikes, spot]);
  useEffect(() => { if (!rows.length) return; const row = rows.find((x: any) => n(x.strike ?? x.strikePrice) === atm) || rows[0]; const call = row?.call; const put = row?.put; if (call) { setCe(call.instrumentKey || call.symbol || ''); const lot = n(call.lotSize) || n(put?.lotSize) || 1; setCeRisk(x => ({ ...x, quantity: x.quantity === 1 ? lot : x.quantity })); } if (put) { setPe(put.instrumentKey || put.symbol || ''); const lot = n(put.lotSize) || n(call?.lotSize) || 1; setPeRisk(x => ({ ...x, quantity: x.quantity === 1 ? lot : x.quantity })); } }, [data, atm, rows.length]);

  const findContract = (side: 'CE' | 'PE', selected: string) => { for (const row of rows) { const contract = side === 'CE' ? row.call : row.put; const key = contract?.instrumentKey || contract?.symbol; if (key === selected) return { row, contract }; } return { row: null, contract: null }; };
  const submitStock = (side: OrderRequest['side']) => { if (!meta.symbol) return; onSubmit(side, meta.symbol, { quantity: stockQty, price: stockPrice, triggerPrice: stockTrigger, orderType, product, validity, target: stockRisk.target, stopLoss: stockRisk.stopLoss, trailing: stockRisk.trailing, instrumentToken: meta.symbol }); };
  const submitOption = (side: 'CE' | 'PE', tradeSide: OrderRequest['side']) => { const selected = side === 'CE' ? ce : pe; const risk = side === 'CE' ? ceRisk : peRisk; if (!selected) return; onSubmit(tradeSide, selected, { quantity: risk.quantity, price: stockPrice, triggerPrice: stockTrigger, orderType, product, validity, target: risk.target, stopLoss: risk.stopLoss, trailing: risk.trailing, instrumentToken: selected }); };
  const renderRisk = (risk: Risk, setRisk: (fn: (x: Risk) => Risk) => void) => <div className="aot-risk-grid"><div><label>Target</label><input placeholder="₹ / points" value={risk.target} onChange={e => setRisk(x => ({ ...x, target: e.target.value }))} /></div><div><label>Stop loss</label><input placeholder="₹ / points" value={risk.stopLoss} onChange={e => setRisk(x => ({ ...x, stopLoss: e.target.value }))} /></div><div><label>Trailing SL</label><input placeholder="₹ / points" value={risk.trailing} onChange={e => setRisk(x => ({ ...x, trailing: e.target.value }))} /></div></div>;
  const renderOptionLeg = (side: 'CE' | 'PE', selected: string, setSelected: (v: string) => void, risk: Risk, setRisk: (fn: (x: Risk) => Risk) => void) => { const found = findContract(side, selected); const contract = found.contract; const strike = n(found.row?.strike ?? found.row?.strikePrice); return <div className="aot-leg"><div className="aot-leg-head"><div><b>{side}</b><small>{strike ? `${strike} strike` : 'Select strike'}</small></div><strong>₹{money(contract?.ltp ?? contract?.lastPrice)}</strong></div><label>Strike</label><select value={selected} onChange={e => setSelected(e.target.value)}>{rows.map((row: any) => { const z = side === 'CE' ? row.call : row.put; const key = z?.instrumentKey || z?.symbol; if (!key) return null; return <option key={key} value={key}>{n(row.strike ?? row.strikePrice)} {side} · ₹{money(z.ltp ?? z.lastPrice)}</option>; })}</select><div className="aot-two"><div><label>Quantity / lots</label><input type="number" min="1" value={risk.quantity} onChange={e => setRisk(x => ({ ...x, quantity: Math.max(1, n(e.target.value)) }))} /></div><div><label>Lot size</label><input readOnly value={n(contract?.lotSize) || '—'} /></div></div>{renderRisk(risk, setRisk)}<div className="aot-actions"><button className="aot-buy" disabled={busy || !selected} onClick={() => submitOption(side, 'Buy')}>BUY {side}</button><button className="aot-sell" disabled={busy || !selected} onClick={() => submitOption(side, 'Sell')}>SELL {side}</button></div></div>; };

  return <div className="aot-root"><div className="aot-summary"><span>{meta.symbol || '—'}</span><span>{isIndex ? `Spot ₹${money(spot)}` : 'Single instrument'}</span><span>{segment}</span><span>{product}</span><span>{validity}</span></div>
    <div className="aot-global aot-card"><div className="aot-section-title">Execution</div><div className="aot-four"><div><label>Order type</label><select value={orderType} onChange={e => setOrderType(e.target.value as OrderRequest['orderType'])}><option>Market</option><option>Limit</option><option>SL</option><option>SL-M</option></select></div><div><label>Product</label><select value={product} onChange={e => setProduct(e.target.value as OrderRequest['product'])}><option>MIS</option><option>CNC</option><option>NRML</option></select></div><div><label>Validity</label><select value={validity} onChange={e => setValidity(e.target.value as 'DAY' | 'IOC')}><option>DAY</option><option>IOC</option></select></div><div><label>Price</label><input placeholder={orderType === 'Market' ? 'Market' : '₹ price'} value={stockPrice} onChange={e => setStockPrice(e.target.value)} disabled={orderType === 'Market'} /></div></div>{(orderType === 'SL' || orderType === 'SL-M') && <div className="aot-two aot-trigger"><div><label>Trigger price</label><input value={stockTrigger} onChange={e => setStockTrigger(e.target.value)} /></div><div><label>Execution</label><input readOnly value="Broker trigger order" /></div></div>}</div>
    {isIndex && <div className="aot-card"><div className="aot-section-title">Index options · ATM {atm || '—'} · {data?.expiry || data?.expiryDate || 'current expiry'}</div>{data?.error ? <div className="aot-empty">{data.error}</div> : !rows.length ? <div className="aot-empty">Loading live option chain…</div> : <div className="aot-legs">{renderOptionLeg('CE', ce, setCe, ceRisk, setCeRisk)}{renderOptionLeg('PE', pe, setPe, peRisk, setPeRisk)}</div>}</div>}
    {!isIndex && <div className="aot-card"><div className="aot-section-title">{segment} order</div><div className="aot-two"><div><label>Quantity</label><input type="number" min="1" value={stockQty} onChange={e => setStockQty(Math.max(1, n(e.target.value)))} /></div><div><label>Instrument</label><input readOnly value={meta.symbol || 'Focus a chart first'} /></div></div>{renderRisk(stockRisk, setStockRisk)}<div className="aot-actions"><button className="aot-buy" disabled={busy || !meta.symbol} onClick={() => submitStock('Buy')}>BUY {meta.symbol || ''}</button><button className="aot-sell" disabled={busy || !meta.symbol} onClick={() => submitStock('Sell')}>SELL {meta.symbol || ''}</button></div></div>}
    <button className="aot-advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>{showAdvanced ? 'Hide' : 'Show'} advanced risk / execution</button>{showAdvanced && <div className="aot-card aot-note"><div>Smart ticket</div><small>Target, stop loss and trailing SL are sent with the order when the broker adapter supports them. Validate quantities and prices before submitting live orders.</small></div>}{message && <div className="aot-message">{message}</div>}
  </div>;
}
