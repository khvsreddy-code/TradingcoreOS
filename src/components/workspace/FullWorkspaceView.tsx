import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, ArrowLeft, Activity, BarChart3, RefreshCw, ShieldCheck, SlidersHorizontal, Wallet, Zap, Bot, BrainCircuit, Gauge, UserCircle, Info, ListOrdered, Layers3, Target, Radio, BriefcaseBusiness, Search, Plus, Star, LineChart, X, Pin, PinOff, Move, PanelRight, PanelBottom, Maximize2 } from 'lucide-react';
import { BrokerSettingsModal } from '../brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { MarketFeedStatus, NormalizedMarketTick } from '../../types/market';
import { AccountFunds, Holding, OrderRequest, OrderResult, Position, TradeRecord } from '../../services/brokers/BrokerAdapter';
import { LiveChart } from './LiveChart';
import { ChartAnalytics } from '../../services/marketData/levelEngine';
import { searchBrokerInstruments, SearchInstrument, InstrumentSearchSegment } from '../../services/marketData/instrumentSearch';

const defaultWatchlist = [
  { key: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY', type: 'Index' },
  { key: 'NSE:NIFTYBANK-INDEX', label: 'BANK NIFTY', short: 'BANK', type: 'Index' },
];
const legacyWatchlist = [
  { key: 'NSE_INDEX|Nifty 50', label: 'NIFTY 50', short: 'NIFTY', type: 'Index' },
  { key: 'NSE_INDEX|Nifty Bank', label: 'BANK NIFTY', short: 'BANK', type: 'Index' },
];
const legacyToFyers: Record<string, string> = {
  'NSE_INDEX|Nifty 50': 'NSE:NIFTY50-INDEX',
  'NSE_INDEX|Nifty Bank': 'NSE:NIFTYBANK-INDEX',
  'NSE_INDEX|Nifty Fin Service': 'NSE:FINNIFTY-INDEX',
  'NSE_INDEX|India VIX': 'NSE:INDIAVIX-INDEX',
};

const fmt =
 (n?: number, digits = 2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const signed = (n?: number, digits = 2) => n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;

type FloatingPanelProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  initial?: { x: number; y: number };
};

function FloatingPanel({ title, subtitle, onClose, children, initial = { x: 0, y: 0 } }: FloatingPanelProps) {
  const [x, setX] = useState(() => initial.x || Math.max(18, Math.round(window.innerWidth * 0.28)));
  const [y, setY] = useState(() => initial.y || 92);
  const [pinned, setPinned] = useState(true);
  const [dock, setDock] = useState<'float' | 'right' | 'bottom'>('float');
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current || dock !== 'float') return;
      setX(Math.max(8, Math.min(window.innerWidth - 360, event.clientX - drag.current.dx)));
      setY(Math.max(58, Math.min(window.innerHeight - 180, event.clientY - drag.current.dy)));
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dock]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dock !== 'float') return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const toggleDock = () => {
    if (dock === 'float') setDock('right');
    else if (dock === 'right') setDock('bottom');
    else setDock('float');
  };

  const style = dock === 'right'
    ? { right: 18, top: 88, width: 'min(520px, calc(100vw - 36px))', maxHeight: 'calc(100vh - 110px)' }
    : dock === 'bottom'
      ? { left: 18, right: 18, bottom: 58, width: 'auto', maxHeight: '46vh' }
      : { left: x, top: y, width: 'min(620px, calc(100vw - 28px))', maxHeight: 'calc(100vh - 110px)' };

  return (
    <div className={`fixed z-[80] overflow-hidden rounded-xl border bg-[#0b0e15] shadow-2xl ${pinned ? 'border-[#3b82f6]/45' : 'border-[#2a3040]'} ${dock === 'float' ? 'select-none' : ''}`} style={style as any}>
      <div onPointerDown={startDrag} className={`flex cursor-move items-center justify-between gap-3 border-b border-[#222636] bg-[#0f121b] px-3 py-2 ${pinned ? 'shadow-[0_0_0_1px_rgba(59,130,246,.06)]' : ''}`}>
        <div className="min-w-0"><div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[#d1d5db]"><Move className="h-3 w-3 text-[#64748b]" /> {title}</div>{subtitle && <div className="mt-0.5 truncate text-[9px] text-[#64748b]">{subtitle}</div>}</div>
        <div className="flex shrink-0 items-center gap-1">
          <button title={pinned ? 'Unpin panel' : 'Pin panel'} onPointerDown={e => e.stopPropagation()} onClick={() => setPinned(v => !v)} className="rounded border border-[#222636] p-1.5 text-[#8c93a6] hover:text-white">{pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}</button>
          <button title="Dock panel" onPointerDown={e => e.stopPropagation()} onClick={toggleDock} className="rounded border border-[#222636] p-1.5 text-[#8c93a6] hover:text-white">{dock === 'bottom' ? <PanelBottom className="h-3 w-3" /> : <PanelRight className="h-3 w-3" />}</button>
          <button title="Maximize width" onPointerDown={e => e.stopPropagation()} onClick={() => setDock(dock === 'bottom' ? 'right' : 'bottom')} className="rounded border border-[#222636] p-1.5 text-[#8c93a6] hover:text-white"><Maximize2 className="h-3 w-3" /></button>
          <button title="Close panel" onPointerDown={e => e.stopPropagation()} onClick={onClose} className="rounded border border-[#222636] p-1.5 text-[#ef4444] hover:text-white"><X className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="max-h-[calc(100vh-160px)] overflow-auto p-3">{children}</div>
    </div>
  );
}

function DataTable({ columns, rows, empty = 'No data available.' }: { columns: string[]; rows: (string | number | ReactNode)[][]; empty?: string }) {
  return rows.length ? <div className="overflow-auto rounded-lg border border-[#222636]"><table className="w-full min-w-[520px] border-collapse font-mono text-[10px]"><thead className="sticky top-0 bg-[#10141d] text-left text-[9px] uppercase tracking-widest text-[#64748b]"><tr>{columns.map(column => <th key={column} className="border-b border-[#222636] px-2.5 py-2 font-normal">{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-[#181c27] last:border-b-0 hover:bg-[#121722]">{row.map((cell, j) => <td key={j} className="px-2.5 py-2 text-[#d1d5db]">{cell}</td>)}</tr>)}</tbody></table></div> : <div className="rounded-lg border border-[#222636] bg-[#090c12] p-8 text-center font-mono text-[10px] text-[#64748b]">{empty}</div>;
}

function PositionPanel({ positions, onRefresh, onClose }: { positions: Position[]; onRefresh: () => void; onClose: () => void }) {
  const rows = positions.map((p: any) => [<span className="font-bold text-white">{p.symbol || p.instrument_token || p.instrumentKey || 'Position'}</span>, p.quantity ?? p.netQuantity ?? '—', fmt(Number(p.averagePrice ?? p.avgPrice)), fmt(Number(p.lastPrice ?? p.ltp)), <span className={(Number(p.pnl ?? p.unrealizedPnl ?? 0) >= 0) ? 'text-[#3b82f6]' : 'text-[#ef4444]'}>{signed(Number(p.pnl ?? p.unrealizedPnl ?? 0))}</span>, <span className="text-[#64748b]">{p.product || p.productType || '—'}</span>]);
  return <FloatingPanel title="Positions" subtitle="Live broker positions · draggable · dockable · pinnable" onClose={onClose}><div className="mb-3 flex items-center justify-between"><span className="text-[10px] text-[#64748b]">{positions.length} open / reported positions</span><button onClick={onRefresh} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><RefreshCw className="mr-1 inline h-3 w-3"/>Refresh</button></div><DataTable columns={['Instrument','Qty','Avg','LTP','P&L','Product']} rows={rows} empty="No open positions for the active broker." /></FloatingPanel>;
}

function OrdersPanel({ orders, onRefresh, onClose }: { orders: OrderResult[]; onRefresh: () => void; onClose: () => void }) {
  const rows = orders.map((o: any) => [<span className="font-bold text-white">{o.symbol || o.instrument_token || o.instrumentKey || 'Order'}</span>, o.side || '—', o.quantity ?? '—', o.orderType || o.type || '—', o.status || '—', o.orderId || o.id || '—']);
  return <FloatingPanel title="Orders" subtitle="Active broker orders · draggable · dockable · pinnable" onClose={onClose}><div className="mb-3 flex items-center justify-between"><span className="text-[10px] text-[#64748b]">{orders.length} orders</span><button onClick={onRefresh} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><RefreshCw className="mr-1 inline h-3 w-3"/>Refresh</button></div><DataTable columns={['Instrument','Side','Qty','Type','Status','Order ID']} rows={rows} empty="No orders reported by the active broker." /></FloatingPanel>;
}

export function FullWorkspaceView({ onBackToLanding, onNavigateToBroker, onNavigate }: { onBackToLanding: () => void; onNavigateToBroker?: () => void; onNavigate: (path: '/live' | '/models' | '/automations' | '/indicators' | '/portfolio' | '/profile') => void }) {
  const [brokerId, setBrokerId] = useState<string>(() => String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId || 'fyers').toLowerCase());
  const storageKey = `tradingcore_watchlists_v3_${brokerId}`;
  const [watchlists, setWatchlists] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) return parsed; }
      const legacy = JSON.parse(localStorage.getItem('tradingcore_watchlist_v2') || 'null');
      const migrated = Array.isArray(legacy) && legacy.length ? legacy.map((item: any) => ({ ...item, key: brokerId === 'fyers' ? (legacyToFyers[item.key] || item.key) : item.key })) : (brokerId === 'fyers' ? defaultWatchlist : legacyWatchlist);
      return [{ id: 'default', name: 'Main', pinned: true, items: migrated }];
    } catch { return [{ id: 'default', name: 'Main', pinned: true, items: brokerId === 'fyers' ? defaultWatchlist : legacyWatchlist }]; }
  });
  const [activeWatchlistId, setActiveWatchlistId] = useState('default');
  const [watchlistManagerOpen, setWatchlistManagerOpen] = useState(false);
  const [watchlistDraft, setWatchlistDraft] = useState('');
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [instrumentSegment, setInstrumentSegment] = useState<InstrumentSearchSegment>('all');
  const [instrumentResults, setInstrumentResults] = useState<SearchInstrument[]>([]);
  const [instrumentSearchLoading, setInstrumentSearchLoading] = useState(false);
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  const currentWatchlist = watchlists.find(w => w.id === activeWatchlistId) || watchlists[0] || { id: 'default', name: 'Main', items: [] };
  const watchlist = currentWatchlist.items || [];
  const [selectedKey, setSelectedKey] = useState(watchlist[0]?.key || defaultWatchlist[0].key);
  const [optionChain, setOptionChain] = useState<any>(null);
  const [optionLoading, setOptionLoading] = useState(false);
  const [optionError, setOptionError] = useState('');
  const [ticks, setTicks] = useState<Record<string, NormalizedMarketTick>>({});
  const [feedStatus, setFeedStatus] = useState<MarketFeedStatus>('disconnected');
  const [feedError, setFeedError] = useState<string>();
  const [analytics, setAnalytics] = useState<ChartAnalytics | null>(null);
  const [funds, setFunds] = useState<AccountFunds | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [activeTab, setActiveTab] = useState<'INFO' | 'POSITIONS' | 'ORDERS' | 'TRADES' | 'HOLDINGS' | 'FUNDS'>('INFO');
  const [order, setOrder] = useState({ instrument_token: '', quantity: 1, orderType: 'Market' as OrderRequest['orderType'], side: 'Buy' as OrderRequest['side'], product: 'MIS' as OrderRequest['product'], price: '', triggerPrice: '' });
  const [orderResult, setOrderResult] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'option-chain' | 'positions' | 'orders' | 'levels' | 'signals'>('info');
  const [levelsRequest, setLevelsRequest] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number>();
  const [orderLatencyMs, setOrderLatencyMs] = useState<number>();
  const ticksRef = useRef<Record<string, NormalizedMarketTick>>({});
  const tickFrameRef = useRef<number>();
  const selectedTick = ticks[selectedKey];
  const selectedInstrument = watchlist.find((x: any) => x.key === selectedKey) || instrumentResults.find((x: any) => x.key === selectedKey) || { key: selectedKey, label: selectedKey, short: selectedKey, type: 'Custom' };

  useEffect(() => {
    const refreshBrokerRoute = () => {
      const next = String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId || '').toLowerCase();
      if (next && next !== brokerId) {
        ticksRef.current = {};
        setTicks({});
        setAnalytics(null);
        setOptionChain(null);
        setOptionError('');
        setFeedError(undefined);
        setFeedStatus('connecting');
      }
      if (next) setBrokerId(next);
    };
    const offPrimary = tradingCoreRuntime.on('STATUS_CHANGED', refreshBrokerRoute);
    const offConnected = tradingCoreRuntime.on('BROKER_CONNECTED', refreshBrokerRoute);
    const offDisconnected = tradingCoreRuntime.on('BROKER_DISCONNECTED', refreshBrokerRoute);
    refreshBrokerRoute();
    return () => { offPrimary(); offConnected(); offDisconnected(); };
  }, [brokerId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setWatchlists(parsed); setActiveWatchlistId(parsed[0]?.id || 'default'); setSelectedKey(parsed[0]?.items?.[0]?.key || (brokerId === 'fyers' ? defaultWatchlist[0].key : legacyWatchlist[0].key));
          setTicks({}); setAnalytics(null); setOptionChain(null); setOptionError(''); return;
        }
      }
    } catch { /* fall through to defaults */ }
    const fallback = brokerId === 'fyers' ? defaultWatchlist : legacyWatchlist;
    const next = [{ id: 'default', name: 'Main', pinned: true, items: fallback }];
    setWatchlists(next); setActiveWatchlistId('default'); setSelectedKey(fallback[0]?.key || ''); setTicks({}); setAnalytics(null); setOptionChain(null); setOptionError('');
  }, [brokerId, storageKey]);

  const persistWatchlists = (next: any[]) => { setWatchlists(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage is best-effort */ } };
  const updateActiveWatchlist = (items: any[]) => persistWatchlists(watchlists.map(w => w.id === activeWatchlistId ? { ...w, items } : w));
  const selectInstrument = (item: any) => { setSelectedKey(item.key); setInstrumentSearch(''); setInstrumentResults([]); setShowInstrumentSearch(false); setActiveSection('info'); };
  const addToWatchlist = (item = selectedInstrument) => { if (!item?.key) return; if (watchlist.some((x: any) => x.key === item.key)) { selectInstrument(item); return; } updateActiveWatchlist([...watchlist, { key: item.key, label: item.label || item.symbol || item.key, short: item.short || String(item.label || item.symbol || item.key).slice(0, 12), type: item.type || 'Instrument', exchange: item.exchange, expiry: item.expiry, strike: item.strike, optionType: item.optionType, lotSize: item.lotSize }]); selectInstrument(item); };
  const removeFromWatchlist = (key: string) => { const next = watchlist.filter((x: any) => x.key !== key); updateActiveWatchlist(next); if (selectedKey === key && next[0]) setSelectedKey(next[0].key); };
  const createWatchlist = () => { const name = watchlistDraft.trim() || `Watchlist ${watchlists.length + 1}`; const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const next = [...watchlists, { id, name, pinned: false, items: [] }]; persistWatchlists(next); setActiveWatchlistId(id); setWatchlistDraft(''); };
  const renameWatchlist = (id: string) => { const current = watchlists.find(w => w.id === id); const name = window.prompt('Rename watchlist', current?.name || ''); if (!name?.trim()) return; persistWatchlists(watchlists.map(w => w.id === id ? { ...w, name: name.trim() } : w)); };
  const deleteWatchlist = (id: string) => { if (watchlists.length <= 1) return; const current = watchlists.find(w => w.id === id); if (!window.confirm(`Delete watchlist "${current?.name || ''}"?`)) return; const next = watchlists.filter(w => w.id !== id); persistWatchlists(next); if (activeWatchlistId === id) setActiveWatchlistId(next[0].id); };

  useEffect(() => {
    const q = instrumentSearch.trim();
    if (!showInstrumentSearch || q.length < 2) { setInstrumentResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setInstrumentSearchLoading(true);
      try { const rows = await searchBrokerInstruments(brokerId, q, instrumentSegment, brokerId === 'upstox' ? 30 : 80); if (!cancelled) setInstrumentResults(rows); }
      catch (e: any) { if (!cancelled) setFeedError(e?.message || 'Instrument search unavailable'); }
      finally { if (!cancelled) setInstrumentSearchLoading(false); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [instrumentSearch, instrumentSegment, showInstrumentSearch, brokerId]);

  const sync = async () => { try { const snapshot = await tradingCoreRuntime.syncPortfolio(); setFunds(snapshot.funds); setPositions(snapshot.positions); setOrders(snapshot.orders); setTrades(snapshot.trades); setHoldings(snapshot.holdings); } catch (error: any) { setFeedError(error.message || 'Portfolio synchronization failed'); } };

  const refreshOptionChain = async () => { setOptionLoading(true); setOptionError(''); try { const chain = await tradingCoreRuntime.getOptionChain(selectedKey); setOptionChain(chain); } catch (error: any) { setOptionError(error?.message || 'Unable to load option chain'); } finally { setOptionLoading(false); } };
  useEffect(() => { if (activeSection !== 'option-chain' || !selectedKey) return; let dead=false; const load=async()=>{ try { const chain=await tradingCoreRuntime.getOptionChain(selectedKey); if(!dead) setOptionChain(chain); setOptionError(''); } catch(e:any){ if(!dead) setOptionError(e?.message||'Unable to load option chain'); } finally { if(!dead) setOptionLoading(false); } }; setOptionLoading(true); void load(); const id=window.setInterval(()=>void load(),15000); return()=>{dead=true;window.clearInterval(id);}; }, [activeSection, selectedKey, brokerId]);

  useEffect(() => {
    void sync();
    const stopFeed = tradingCoreRuntime.subscribeMarketData(Array.from(new Set([...watchlist.map((x: any) => x.key), selectedKey])), event => {
      if (event.type === 'tick' && event.tick) { setFeedStatus('connected'); setFeedError(undefined); ticksRef.current = { ...ticksRef.current, [event.tick.instrumentKey]: event.tick }; if (tickFrameRef.current == null) { tickFrameRef.current = window.requestAnimationFrame(() => { tickFrameRef.current = undefined; setTicks(ticksRef.current); }); } }
      if (event.type === 'status' && event.status) { setFeedStatus(event.status); if (event.status === 'connected') setFeedError(undefined); }
      if (event.type === 'error') setFeedError(event.error);
    }, selectedKey);
    const applySnapshot = (snapshot: any) => { setFunds(snapshot.funds); setPositions(snapshot.positions || []); setOrders(snapshot.orders || []); setTrades(snapshot.trades || []); setHoldings(snapshot.holdings || []); };
    const stopPortfolioEvents = tradingCoreRuntime.on('PORTFOLIO_SYNCED', applySnapshot);
    const stopPolling = tradingCoreRuntime.startPortfolioPolling(5000);
    return () => { stopFeed(); stopPortfolioEvents(); stopPolling(); if (tickFrameRef.current != null) { window.cancelAnimationFrame(tickFrameRef.current); tickFrameRef.current = undefined; } };
  }, [watchlist, selectedKey, brokerId]);

  useEffect(() => tradingCoreRuntime.on('ORDER_EXECUTED', () => void sync()), []);
  useEffect(() => { let dead = false; const measure = async () => { const broker = tradingCoreRuntime.getPrimaryBrokerInfo(); if (!broker) return; try { const value = await tradingCoreRuntime.testLatency(broker.brokerId); if (!dead) setLatencyMs(value); } catch {} }; void measure(); const timer = setInterval(() => void measure(), 15000); return () => { dead = true; clearInterval(timer); }; }, []);

  const depth = useMemo(() => ({ bids: selectedTick?.bid || [], asks: selectedTick?.ask || [], spread: selectedTick?.bid?.[0] && selectedTick?.ask?.[0] ? selectedTick.ask[0].price - selectedTick.bid[0].price : undefined }), [selectedTick]);

  const submitOrder = async () => {
    if (!order.instrument_token || !order.quantity || (order.orderType !== 'Market' && !Number(order.price)) || ((order.orderType === 'SL' || order.orderType === 'SL-M') && !Number(order.triggerPrice))) { setOrderResult('Enter a valid broker instrument token and all prices required by the selected order type.'); return; }
    if (!window.confirm(`Confirm ${order.side.toUpperCase()} ${order.quantity} of ${order.instrument_token} as ${order.orderType}. This sends a live broker order.`)) return;
    setSubmitting(true); setOrderResult(undefined); const orderStarted=performance.now();
    try { const result = await tradingCoreRuntime.placeOrder({ symbol: order.instrument_token, instrument_token: order.instrument_token, quantity: order.quantity, orderType: order.orderType, side: order.side, product: order.product, price: Number(order.price) || undefined, triggerPrice: Number(order.triggerPrice) || undefined, idempotencyKey: globalThis.crypto.randomUUID() } as OrderRequest & { instrument_token: string }); const elapsed=Math.round(performance.now()-orderStarted); setOrderLatencyMs(elapsed); setOrderResult(`Broker response: ${result.status} · ${result.orderId} · ${elapsed}ms`); await sync(); } catch (error: any) { setOrderResult(error.message || 'Broker order was rejected'); } finally { setSubmitting(false); }
  };

  const ltp = selectedTick?.ltp;
  const change = selectedTick?.changePercent;
  const state = analytics?.bias || (change != null ? change >= 0 ? 'BULLISH' : 'BEARISH' : 'RANGE');
  const stateClass = state === 'BULLISH' ? 'text-[#3b82f6]' : state === 'BEARISH' ? 'text-[#ef4444]' : 'text-[#f59e0b]';
  const refreshWorkspaceData = () => { void sync(); };
  const renderOverlay = () => {
    if (activeSection === 'positions') return <PositionPanel positions={positions} onRefresh={refreshWorkspaceData} onClose={() => setActiveSection('info')} />;
    if (activeSection === 'orders') return <OrdersPanel orders={orders} onRefresh={refreshWorkspaceData} onClose={() => setActiveSection('info')} />;
    if (activeSection === 'levels') return <FloatingPanel title="Core Levels" subtitle="Calculated support / resistance / session structure" onClose={() => setActiveSection('info')}><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><LevelList title="Support" levels={analytics?.support || []} /></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><LevelList title="Resistance" levels={analytics?.resistance || []} /></div></div></FloatingPanel>;
    if (activeSection === 'signals') return <FloatingPanel title="Signals" subtitle="Current automation / market signals" onClose={() => setActiveSection('info')}><div className="space-y-2 font-mono text-[10px]"><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3">Market bias: <span className={stateClass}>{analytics?.bias || 'RANGE'}</span></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3">VWAP relation: <span className="text-[#d1d5db]">{ltp != null && analytics?.vwap != null ? (ltp >= analytics.vwap ? 'ABOVE VWAP' : 'BELOW VWAP') : 'WAITING FOR FEED'}</span></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3">Signal engine: <span className="text-[#d1d5db]">Active chart studies and automations</span></div></div></FloatingPanel>;
    return null;
  };

  return <div className="min-h-screen bg-[#080a0f] text-[#f3f4f6] font-sans flex flex-col">
    <header className="shrink-0 border-b border-[#222636] bg-[#0c0e15]">
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0"><button onClick={onBackToLanding} className="border border-[#222636] px-2.5 py-1.5 rounded-md text-[#8c93a6] hover:text-white"><ArrowLeft className="inline w-3 h-3 mr-1" /> Back to Home</button><div className="font-mono text-xs font-bold tracking-wider">TRADINGCORE <span className="text-[#3b82f6]">OS</span></div><span className={`hidden sm:inline font-mono text-[10px] ${feedStatus === 'connected' ? 'text-[#3b82f6]' : 'text-[#f59e0b]'}`}>● {feedStatus.toUpperCase()}</span></div>
        <div className="flex items-center gap-2"><button onClick={() => setSettingsOpen(true)} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><SlidersHorizontal className="mr-1 inline w-3 h-3"/>Broker Settings</button></div>
      </div>
      {feedError && <div className="mx-4 mb-2 rounded border border-[#ef4444]/30 bg-[#ef4444]/5 px-3 py-2 text-[10px] font-mono text-[#ef4444]">{feedError}</div>}
      <div className="flex gap-2 overflow-x-auto border-t border-[#222636] p-2">{watchlist.map((item:any)=><div key={item.key} className={`min-w-[165px] rounded-lg border p-2 ${selectedKey===item.key?'border-[#3b82f6]/50 bg-[#3b82f6]/5':'border-[#222636] bg-[#090c12]'}`}><button onClick={()=>setSelectedKey(item.key)} className="w-full text-left"><div className="flex items-center justify-between font-mono text-[9px] text-[#64748b]"><span>{item.short}</span><span className={ticks[item.key]?'text-[#3b82f6]':'text-[#f59e0b]'}>{ticks[item.key]?'LIVE':'RECONNECTING'}</span></div><div className="mt-1 font-mono text-xs font-bold">{item.label}</div><div className="mt-1 font-mono text-[9px] text-[#64748b]">{ticks[item.key]?.ltp != null ? `₹${fmt(ticks[item.key].ltp)}` : 'Awaiting feed'}</div></button><button onClick={()=>removeFromWatchlist(item.key)} className="mt-1 text-[9px] text-[#64748b] hover:text-[#ef4444]">Remove</button></div>)}<button onClick={()=>setShowInstrumentSearch(true)} className="min-w-[90px] rounded-lg border border-dashed border-[#222636] p-2 text-[10px] font-mono text-[#64748b] hover:text-white"><Plus className="mr-1 inline h-3 w-3"/>Add symbol</button></div>
    </header>

    <main className="flex-1 grid grid-cols-1 2xl:grid-cols-[240px_minmax(600px,1fr)_290px] min-h-0">
      <aside className="hidden 2xl:block border-r border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-1.5 mb-4">{[['info', Info, 'Info'],['option-chain', ListOrdered, 'Option Chain'],['positions', Wallet, 'Positions'],['orders', ListOrdered, 'Orders'],['levels', Layers3, 'Levels'],['signals', Radio, 'Signals']].map(([id, Icon, label]) => <button key={id as string} onClick={() => { setActiveSection(id as typeof activeSection); if ((id as string) === 'levels') setLevelsRequest(v => v + 1); }} className={`flex items-center gap-1.5 rounded-md px-2 py-2 text-[9px] font-mono border ${activeSection === id ? 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#3b82f6]' : 'border-[#222636] text-[#64748b] hover:text-white'}`}><Icon className="w-3 h-3" /> {label as string}</button>)}</div>
        <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest text-[#64748b]"><Activity className="w-3 h-3" /> Market Map</div>
        <div className="space-y-2"><InfoCard label="Market state" value={state} valueClass={stateClass} /><InfoCard label="LTP" value={ltp ? `₹${fmt(ltp)}` : '—'} /><InfoCard label="Change" value={signed(change) + (change != null ? '%' : '')} valueClass={change != null && change >= 0 ? 'text-[#3b82f6]' : 'text-[#ef4444]'} /><InfoCard label="VWAP" value={analytics?.vwap ? `₹${fmt(analytics.vwap, 1)}` : '—'} valueClass={ltp && analytics?.vwap ? ltp >= analytics.vwap ? 'text-[#3b82f6]' : 'text-[#ef4444]' : ''} /><div className="mt-4 rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b] mb-2">Session structure</div><MetricRow label="Day H / L" value={`${fmt(analytics?.dayHigh, 0)} / ${fmt(analytics?.dayLow, 0)}`} /><MetricRow label="Prev H / L" value={`${fmt(analytics?.previousHigh, 0)} / ${fmt(analytics?.previousLow, 0)}`} /><MetricRow label="Open range" value={`${fmt(analytics?.openingLow, 0)} — ${fmt(analytics?.openingHigh, 0)}`} /><MetricRow label="ATR 14" value={fmt(analytics?.atr, 1)} /></div></div>
      </aside>

      <section className="min-h-[560px] p-3 md:p-4 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 pb-2 relative">
          <div className="min-w-0"><button onClick={() => setShowInstrumentSearch(v => !v)} className="flex items-center gap-2 text-left font-mono text-sm font-bold hover:text-[#3b82f6]"><Search className="w-3.5 h-3.5 text-[#64748b]"/>{selectedInstrument.label}<span className="text-[9px] font-normal text-[#64748b]">· {selectedInstrument.type}</span></button><div className="text-[10px] text-[#64748b] mt-0.5">{activeSection === 'option-chain' ? 'Complete broker option chain · strikes · OI · CE / PE' : 'OHLC structure · calculated levels · live candle'}</div></div>
          <div className="flex items-center gap-2"><button onClick={() => setWatchlistManagerOpen(v => !v)} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><Star className="inline w-3 h-3 mr-1"/>{currentWatchlist.name}</button><button onClick={() => addToWatchlist()} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><Plus className="inline w-3 h-3 mr-1"/>Add</button>{activeSection === 'option-chain' && <button onClick={() => setActiveSection('info')} className="rounded border border-[#3b82f6]/40 px-2 py-1 text-[9px] font-mono text-[#3b82f6]"><LineChart className="inline w-3 h-3 mr-1"/>Chart</button>}<div className={`font-mono text-[10px] ${stateClass}`}>● {state}</div></div>
          {showInstrumentSearch && <div className="absolute left-0 top-10 z-40 w-full max-w-2xl rounded-xl border border-[#2a3040] bg-[#0b0e15] p-2 shadow-2xl"><div className="flex gap-1 mb-2 overflow-x-auto">{(['all','stocks','futures','options','commodities','currency'] as InstrumentSearchSegment[]).map(seg => <button key={seg} onClick={() => setInstrumentSegment(seg)} className={`rounded border px-2 py-1 text-[9px] font-mono whitespace-nowrap ${instrumentSegment === seg ? 'border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#3b82f6]' : 'border-[#222636] text-[#64748b]'}`}>{seg}</button>)}</div><input autoFocus value={instrumentSearch} onChange={e => setInstrumentSearch(e.target.value)} placeholder={`Search all ${brokerId === 'upstox' ? 'Upstox' : 'FYERS'} instruments: stock, index, future, option, commodity, currency...`} className="w-full rounded border border-[#222636] bg-[#080a0f] p-2 text-xs outline-none focus:border-[#3b82f6]/50"/><div className="mt-2 max-h-80 overflow-y-auto">{instrumentSearchLoading && <div className="px-2 py-3 text-[10px] text-[#64748b]">Loading symbol master…</div>}{!instrumentSearchLoading && instrumentResults.map((item) => <div key={`${item.key}-${item.expiry || ''}-${item.strike || ''}`} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-[#141824]"><button onClick={() => addToWatchlist(item)} className="min-w-0 flex-1 text-left"><div className="font-mono text-xs truncate">{item.label || item.symbol}</div><div className="text-[9px] text-[#64748b] truncate">{item.symbol}{item.expiry ? ` · ${item.expiry}` : ''}{item.strike ? ` · ${item.strike}` : ''}{item.optionType ? ` · ${item.optionType}` : ''}</div></button><button onClick={() => addToWatchlist(item)} className="rounded border border-[#222636] px-2 py-1 text-[9px] text-[#3b82f6]"><Plus className="inline w-3 h-3"/> Watch</button></div>)}{!instrumentSearchLoading && instrumentSearch.trim() && !instrumentResults.length && <div className="px-2 py-3 text-[10px] text-[#64748b]">No matching active broker instrument found.</div>}</div></div>}
          {watchlistManagerOpen && <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-[#2a3040] bg-[#0b0e15] p-3 shadow-2xl"><div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-2">Watchlists</div><div className="flex gap-1 mb-2"><input value={watchlistDraft} onChange={e => setWatchlistDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createWatchlist(); }} placeholder="New watchlist name" className="min-w-0 flex-1 rounded border border-[#222636] bg-[#080a0f] px-2 py-1.5 text-[10px]"/><button onClick={createWatchlist} className="rounded border border-[#3b82f6]/40 px-2 text-[#3b82f6]"><Plus className="w-3 h-3"/></button></div><div className="space-y-1 max-h-72 overflow-y-auto">{watchlists.map(w => <div key={w.id} className={`flex items-center gap-1 rounded border px-2 py-1.5 ${w.id === activeWatchlistId ? 'border-[#3b82f6]/30 bg-[#3b82f6]/5' : 'border-[#222636]'}`}><button onClick={() => { setActiveWatchlistId(w.id); setSelectedKey(w.items?.[0]?.key || selectedKey); }} className="min-w-0 flex-1 text-left"><span className="font-mono text-[10px]">{w.name}</span><span className="ml-2 text-[9px] text-[#64748b]">{w.items?.length || 0}</span></button><button onClick={() => renameWatchlist(w.id)} className="text-[9px] text-[#64748b] hover:text-white">Rename</button>{watchlists.length > 1 && <button onClick={() => deleteWatchlist(w.id)} className="text-[9px] text-[#ef4444]">Delete</button>}</div>)}</div><div className="mt-3 border-t border-[#222636] pt-2 text-[9px] text-[#64748b]">Edit symbols from the search panel. Remove symbols from the watchlist strip below.</div></div>}
        </div>
        <div className={activeSection === 'option-chain' ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
          <LiveChart key={`${brokerId}:${selectedKey}`} instrumentKey={selectedKey} brokerId={brokerId} tick={selectedTick} levelsRequest={levelsRequest} onAnalytics={setAnalytics} />
        </div>
        {activeSection === 'option-chain' && <OptionChainPanel loading={optionLoading} error={optionError} chain={optionChain} onChart={() => setActiveSection('info')} onRefresh={() => void refreshOptionChain()} />}
      </section>

      <aside className="border-t 2xl:border-t-0 2xl:border-l border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto">
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3"><div className="flex items-center justify-between mb-2"><div className="text-[9px] uppercase tracking-widest text-[#64748b]">Live Execution</div><Target className="w-3.5 h-3.5 text-[#3b82f6]" /></div><div className="space-y-1.5"><MetricRow label="Feed" value={feedStatus.toUpperCase()} /><MetricRow label="Regime" value={state} /><MetricRow label="VWAP" value={fmt(analytics?.vwap, 1)} /><MetricRow label="ATR 14" value={fmt(analytics?.atr, 1)} /><MetricRow label="Last order RTT" value={orderLatencyMs == null ? '—' : `${orderLatencyMs}ms`} /></div></div>
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3"><div className="flex items-center justify-between mb-3"><div className="text-[10px] uppercase tracking-widest text-[#64748b]">Core Levels</div><BarChart3 className="w-3.5 h-3.5 text-[#8c93a6]" /></div><LevelList title="Support" levels={analytics?.support || []} /><LevelList title="Resistance" levels={analytics?.resistance || []} /><div className="mt-3 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]">Levels use swing structure + session anchors. A break is informational until confirmed by candle close.</div></div>
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3"><div className="flex items-center justify-between mb-2"><div className="text-[10px] uppercase tracking-widest text-[#64748b]">Market Depth</div><Zap className="w-3.5 h-3.5 text-[#f59e0b]" /></div><div className="grid grid-cols-2 gap-2 font-mono text-[10px]"><Depth title="Bids" rows={depth.bids} cls="text-[#3b82f6]" /><Depth title="Asks" rows={depth.asks} cls="text-[#ef4444]" /></div><div className="mt-2 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]">Spread {depth.spread == null ? '—' : `₹${fmt(depth.spread, 2)}`}</div></div>
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#64748b] mb-2"><Wallet className="w-3.5 h-3.5" /> Quick Order</div><input placeholder="Instrument token" value={order.instrument_token} onChange={e => setOrder({ ...order, instrument_token: e.target.value })} className="w-full bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px] font-mono outline-none focus:border-[#3b82f6]/50" /><div className="grid grid-cols-2 gap-2 mt-2"><select value={order.side} onChange={e => setOrder({ ...order, side: e.target.value as OrderRequest['side'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>Buy</option><option>Sell</option></select><select value={order.orderType} onChange={e => setOrder({ ...order, orderType: e.target.value as OrderRequest['orderType'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>Market</option><option>Limit</option><option>SL</option><option>SL-M</option></select><input type="number" min="1" value={order.quantity} onChange={e => setOrder({ ...order, quantity: Number(e.target.value) })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" /><select value={order.product} onChange={e => setOrder({ ...order, product: e.target.value as OrderRequest['product'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>MIS</option><option>CNC</option><option>NRML</option></select></div>{order.orderType !== 'Market' && <input placeholder="Price" type="number" value={order.price} onChange={e => setOrder({ ...order, price: e.target.value })} className="w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" />}{(order.orderType === 'SL' || order.orderType === 'SL-M') && <input placeholder="Trigger price" type="number" value={order.triggerPrice} onChange={e => setOrder({ ...order, triggerPrice: e.target.value })} className="w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" />}<div className="mt-2 text-[9px] text-[#64748b]">Available margin: {funds ? `₹${fmt(funds.availableMargin, 0)}` : '—'}</div><button disabled={submitting} onClick={() => void submitOrder()} className={`w-full mt-2 p-2 rounded-md font-mono text-[10px] font-bold ${order.side === 'Buy' ? 'bg-[#3b82f6] text-[#06110d]' : 'bg-[#ef4444] text-white'} disabled:opacity-50`}>{submitting ? 'SUBMITTING…' : `${order.side.toUpperCase()} · LIVE ORDER`}</button>{orderResult && <div className="mt-2 text-[9px] text-[#d1d5db] break-words">{orderResult}</div>}</div>
      </aside>
    </main>

    {renderOverlay()}

    <section className="border-t border-[#222636] bg-[#0c0e15] p-2"><div className="flex gap-1 overflow-x-auto">{(['INFO','POSITIONS','ORDERS','TRADES','HOLDINGS','FUNDS'] as const).map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded-md font-mono text-[10px] ${activeTab === tab ? 'bg-[#3b82f6]/10 text-[#3b82f6]' : 'text-[#8c93a6] hover:text-white'}`}>{tab}</button>)}</div><div className="mt-2 max-h-28 overflow-y-auto font-mono text-[10px] text-[#d1d5db]">{activeTab === 'INFO' && <div className="grid grid-cols-2 md:grid-cols-6 gap-2"><MetricRow label="Bias" value={analytics?.bias || '—'} /><MetricRow label="VWAP" value={fmt(analytics?.vwap, 1)} /><MetricRow label="ATR" value={fmt(analytics?.atr, 1)} /><MetricRow label="Prev H" value={fmt(analytics?.previousHigh, 0)} /><MetricRow label="Prev L" value={fmt(analytics?.previousLow, 0)} /><MetricRow label="Margin" value={funds ? `₹${fmt(funds.availableMargin, 0)}` : '—'} /></div>}{activeTab === 'POSITIONS' && (positions.length ? positions.map(p => <p key={p.id}>{p.symbol} · {p.quantity} · P&L ₹{fmt(p.pnl)}</p>) : <p className="text-[#64748b]">No positions returned by broker.</p>)}{activeTab === 'ORDERS' && (orders.length ? orders.map(o => <p key={o.orderId}>{o.orderId} · {o.status} · {o.timestamp}</p>) : <p className="text-[#64748b]">No orders returned by broker.</p>)}{activeTab === 'TRADES' && (trades.length ? trades.map(t => <p key={t.tradeId}>{t.symbol} · {t.side} · {t.quantity} @ ₹{fmt(t.price)}</p>) : <p className="text-[#64748b]">No trades returned by broker.</p>)}{activeTab === 'HOLDINGS' && (holdings.length ? holdings.map(h => <p key={h.id}>{h.symbol} · {h.quantity} · ₹{fmt(h.ltp)}</p>) : <p className="text-[#64748b]">No holdings returned by broker.</p>)}{activeTab === 'FUNDS' && <p>{funds ? `Available ₹${fmt(funds.availableMargin, 0)} · Used ₹${fmt(funds.usedMargin, 0)} · Collateral ₹${fmt(funds.collateralMargin, 0)}` : 'Funds unavailable'}</p>}</div></section>
    {settingsOpen && <BrokerSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onConnected={() => { setSettingsOpen(false); void tradingCoreRuntime.restoreBrokerConnections(); }} />}
  </div>;
}

function InfoCard({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) { return <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b]">{label}</div><div className={`mt-1 font-mono text-sm font-bold ${valueClass}`}>{value}</div></div>; }
function MetricRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-2 py-1"><span className="text-[#64748b]">{label}</span><b className="text-[#d1d5db]">{value}</b></div>; }
function LevelList({ title, levels }: { title: string; levels: ChartAnalytics['support'] }) { return <div className="mb-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b] mb-1">{title}</div>{levels.length ? levels.slice(0, 3).map((x, i) => <div key={`${x.side}-${x.price}`} className="flex items-center justify-between py-1.5 border-b border-[#1a1e29] last:border-0"><span className={`font-mono text-[10px] ${x.state === 'BROKEN' ? 'text-[#64748b]' : x.side === 'support' ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>{x.state}</span><span className="font-mono text-[11px]">₹{fmt(x.price)} <span className="text-[#64748b]">· {fmt(x.distance, 1)} pts</span></span></div>) : <div className="text-[9px] text-[#64748b]">Calculating from live candles…</div>}</div>; }
function Depth({ title, rows, cls }: { title: string; rows: Array<{ price: number; quantity: number }>; cls: string }) { return <div><div className={`${cls} uppercase mb-1`}>{title}</div>{rows.length ? rows.slice(0, 5).map((r, i) => <div key={i} className="flex justify-between py-0.5"><span>₹{fmt(r.price)}</span><span className="text-[#8c93a6]">{r.quantity}</span></div>) : <div className="text-[#64748b]">—</div>}</div>; }

function OptionChainPanel({ loading, error, chain, onChart, onRefresh }: { loading: boolean; error: string; chain: any; onChart: () => void; onRefresh: () => void }) {
  const rows = Array.isArray(chain?.contracts) ? chain.contracts : [];
  const spot = Number(chain?.spot || 0);
  const atmStrike = rows.length && spot ? rows.reduce((best: any, row: any) => Math.abs(Number(row.strike) - spot) < Math.abs(Number(best.strike) - spot) ? row : best, rows[0]).strike : undefined;
  const atmIndex = rows.findIndex((r:any)=>Number(r.strike)===Number(atmStrike));
  const nearby = rows.filter((_:any,i:number)=>atmIndex<0 || Math.abs(i-atmIndex)<=5);
  const fmtN=(n:any)=>{const x=Number(n||0);return x>=1e7?`${(x/1e7).toFixed(2)}Cr`:x>=1e5?`${(x/1e5).toFixed(2)}L`:x>=1e3?`${(x/1e3).toFixed(1)}K`:String(Math.round(x));};
  const oiChange=(quote:any)=>{
    const direct=quote?.oiChange ?? quote?.changeInOI ?? quote?.changeOi;
    if(direct!=null&&Number.isFinite(Number(direct)))return Number(direct);
    const oi=Number(quote?.oi),previous=Number(quote?.previousOi);
    return Number.isFinite(oi)&&Number.isFinite(previous)?oi-previous:0;
  };
  const callOi=rows.reduce((a:any,r:any)=>a+Number(r.call?.oi||0),0),putOi=rows.reduce((a:any,r:any)=>a+Number(r.put?.oi||0),0);
  const callChg=rows.reduce((a:any,r:any)=>a+oiChange(r.call),0),putChg=rows.reduce((a:any,r:any)=>a+oiChange(r.put),0);
  const pcr=callOi?putOi/callOi:0;
  const maxCall=rows.reduce((b:any,r:any)=>Number(r.call?.oi||0)>Number(b?.call?.oi||0)?r:b,null);
  const maxPut=rows.reduce((b:any,r:any)=>Number(r.put?.oi||0)>Number(b?.put?.oi||0)?r:b,null);
  const bullish=pcr>1.05 || putChg>callChg, bearish=pcr<0.8 || callChg>putChg*1.25;
  const bias=bullish&&!bearish?'BULLISH':bearish&&!bullish?'BEARISH':'RANGE / TWO-WAY';
  const next = bullish&&!bearish ? `Upside is favoured while ${maxCall?.strike??'resistance'} stays capped; a clean acceptance above the nearest call wall would increase continuation odds.` : bearish&&!bullish ? `Downside is favoured while ${maxPut?.strike??'support'} fails to absorb selling; reclaiming the nearest put wall would invalidate the bearish read.` : `Expect two-way trade around ATM until OI concentration or spot displacement breaks the range.`;
  return <div className="flex min-h-[560px] flex-1 flex-col rounded-xl border border-[#222636] bg-[#0c0e15] p-3">
    <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-mono text-sm font-bold">Option Chain Intelligence</div><div className="truncate text-[9px] text-[#64748b]">{chain?.underlyingKey||'—'} · Spot {spot?fmt(spot):'—'} · Expiry {chain?.expiry||'—'} · auto-refresh 5s</div></div><div className="flex shrink-0 items-center gap-1.5"><span className="rounded border border-[#3b82f6]/30 bg-[#3b82f6]/5 px-2 py-1 text-[8px] font-mono text-[#3b82f6]">● LIVE</span><button onClick={onRefresh} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><RefreshCw className="mr-1 inline h-3 w-3"/>Refresh</button><button onClick={onChart} className="rounded border border-[#3b82f6]/40 px-2 py-1 text-[9px] font-mono text-[#3b82f6]"><LineChart className="mr-1 inline h-3 w-3"/>Chart</button></div></div>
    {loading && !rows.length && <div className="flex flex-1 items-center justify-center text-xs text-[#64748b]">Loading live broker option intelligence…</div>}
    {error && <div className="mb-3 rounded border border-[#ef4444]/30 bg-[#ef4444]/5 p-3 text-xs text-[#ef4444]">{error}</div>}
    {!!rows.length && <>
      <div className="grid gap-2 md:grid-cols-5 mb-3"><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><div className="text-[8px] text-[#64748b]">PCR</div><div className="mt-1 text-lg font-black">{pcr.toFixed(2)}</div><div className="text-[8px] text-[#8c93a6]">{pcr>1.05?'put support bias':pcr<.8?'call pressure':'balanced'}</div></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><div className="text-[8px] text-[#64748b]">CALL OI</div><div className="mt-1 text-lg font-black text-[#ef4444]">{fmtN(callOi)}</div><div className="text-[8px] text-[#8c93a6]">Δ {callChg>=0?'+':''}{fmtN(callChg)}</div></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><div className="text-[8px] text-[#64748b]">PUT OI</div><div className="mt-1 text-lg font-black text-[#3b82f6]">{fmtN(putOi)}</div><div className="text-[8px] text-[#8c93a6]">Δ {putChg>=0?'+':''}{fmtN(putChg)}</div></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><div className="text-[8px] text-[#64748b]">MAX WALLS</div><div className="mt-1 text-sm font-black">{maxPut?.strike??'—'} / {maxCall?.strike??'—'}</div><div className="text-[8px] text-[#8c93a6]">PUT support / CALL resistance</div></div><div className="rounded-lg border border-[#222636] bg-[#090c12] p-3"><div className="text-[8px] text-[#64748b]">CURRENT READ</div><div className={`mt-1 text-sm font-black ${bias==='BULLISH'?'text-[#3b82f6]':bias==='BEARISH'?'text-[#ef4444]':'text-[#f59e0b]'}`}>{bias}</div><div className="text-[8px] text-[#8c93a6]">derived from OI + ΔOI</div></div></div>
      <div className="mb-3 rounded-lg border border-[#3b82f6]/15 bg-[#3b82f6]/5 p-3"><div className="text-[8px] uppercase tracking-widest text-[#64748b]">What is likely next</div><div className="mt-1 text-xs leading-5 text-[#d1d5db]">{next}</div></div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[#222636]"><table className="w-full min-w-[1120px] text-left font-mono text-[10px]"><thead className="sticky top-0 z-10 bg-[#10141d] text-[#64748b]"><tr><th className="p-2 text-right">CALL OI</th><th className="p-2 text-right">ΔOI</th><th className="p-2 text-right">LTP</th><th className="p-2 text-right">BID</th><th className="p-2 text-right">ASK</th><th className="p-2 text-center text-white">STRIKE</th><th className="p-2">BID</th><th className="p-2">ASK</th><th className="p-2">LTP</th><th className="p-2">ΔOI</th><th className="p-2">PUT OI</th></tr></thead><tbody>{nearby.map((row:any)=>{const atm=Number(row.strike)===Number(atmStrike);const c=row.call||{},q=row.put||{},cOiChange=oiChange(c),qOiChange=oiChange(q);return <tr key={`${row.strike}-${row.expiry||''}`} className={`border-t border-[#151923] ${atm?'bg-[#3b82f6]/10':'hover:bg-[#121722]'}`}><td className="p-2 text-right text-[#ef4444]">{fmtN(c.oi)}</td><td className={`p-2 text-right ${cOiChange>=0?'text-[#3b82f6]':'text-[#ef4444]'}`}>{fmtN(cOiChange)}</td><td className="p-2 text-right">{c.ltp??'—'}</td><td className="p-2 text-right text-[#64748b]">{c.bidPrice??'—'}</td><td className="p-2 text-right text-[#64748b]">{c.askPrice??'—'}</td><td className="p-2 text-center font-bold text-white">{row.strike}{atm&&<span className="ml-1 rounded bg-[#3b82f6]/15 px-1 text-[8px] text-[#3b82f6]">ATM</span>}</td><td className="p-2 text-[#64748b]">{q.bidPrice??'—'}</td><td className="p-2 text-[#64748b]">{q.askPrice??'—'}</td><td className="p-2">{q.ltp??'—'}</td><td className={`p-2 ${qOiChange>=0?'text-[#3b82f6]':'text-[#ef4444]'}`}>{fmtN(qOiChange)}</td><td className="p-2 text-[#3b82f6]">{fmtN(q.oi)}</td></tr>})}</tbody></table></div>
    </>}
    {!loading&&!error&&!rows.length&&<div className="flex flex-1 items-center justify-center text-xs text-[#64748b]">No option contracts returned by the connected broker.</div>}
  </div>;
}

