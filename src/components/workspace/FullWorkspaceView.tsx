import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Activity, BarChart3, RefreshCw, ShieldCheck, SlidersHorizontal, Wallet, Zap, Bot, BrainCircuit, Gauge, UserCircle, Info, ListOrdered, Layers3, Target, Radio, BriefcaseBusiness, Search, Plus, Star, LineChart } from 'lucide-react';
import { BrokerSettingsModal } from '../brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { MarketFeedStatus, NormalizedMarketTick } from '../../types/market';
import { AccountFunds, Holding, OrderRequest, OrderResult, Position, TradeRecord } from '../../services/brokers/BrokerAdapter';
import { LiveChart } from './LiveChart';
import { ChartAnalytics } from '../../services/marketData/levelEngine';

const defaultWatchlist = [
  { key: 'NSE_INDEX|Nifty 50', label: 'NIFTY 50', short: 'NIFTY', type: 'Index' },
  { key: 'NSE_INDEX|Nifty Bank', label: 'BANK NIFTY', short: 'BANK', type: 'Index' },
];
const instrumentSuggestions = [
  ...defaultWatchlist,
  { key: 'NSE_EQ|INE002A01018', label: 'RELIANCE', short: 'REL', type: 'Stock' },
  { key: 'NSE_EQ|INE009A01021', label: 'INFOSYS', short: 'INFY', type: 'Stock' },
  { key: 'NSE_EQ|INE467B01029', label: 'TCS', short: 'TCS', type: 'Stock' },
  { key: 'NSE_INDEX|Nifty Fin Service', label: 'FINNIFTY', short: 'FIN', type: 'Index' },
  { key: 'NSE_INDEX|India VIX', label: 'INDIA VIX', short: 'VIX', type: 'Index' },
  { key: 'MCX_FO|CRUDEOIL', label: 'CRUDE OIL FUT', short: 'CRUDE', type: 'Commodity Future' },
  { key: 'MCX_FO|GOLD', label: 'GOLD FUT', short: 'GOLD', type: 'Commodity Future' },
  { key: 'MCX_FO|SILVER', label: 'SILVER FUT', short: 'SILVER', type: 'Commodity Future' },
  { key: 'NSE_FO|NIFTY', label: 'NIFTY FUTURES', short: 'NIFTY FUT', type: 'Index Future' },
  { key: 'NSE_FO|BANKNIFTY', label: 'BANK NIFTY FUTURES', short: 'BANK FUT', type: 'Index Future' },
];

const fmt = (n?: number, digits = 2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const signed = (n?: number, digits = 2) => n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;

export function FullWorkspaceView({ onBackToLanding, onNavigateToBroker, onNavigate }: { onBackToLanding: () => void; onNavigateToBroker?: () => void; onNavigate: (path: '/live' | '/models' | '/automations' | '/indicators' | '/portfolio' | '/profile') => void }) {
  const [watchlist, setWatchlist] = useState(() => { try { const saved = localStorage.getItem('tradingcore_watchlist_v2'); return saved ? JSON.parse(saved) : defaultWatchlist; } catch { return defaultWatchlist; } });
  const [selectedKey, setSelectedKey] = useState(defaultWatchlist[0].key);
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
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
  const [latencyMs, setLatencyMs] = useState<number>();
  const [orderLatencyMs, setOrderLatencyMs] = useState<number>();
  const ticksRef = useRef<Record<string, NormalizedMarketTick>>({});
  const tickFrameRef = useRef<number>();
  const selectedTick = ticks[selectedKey];
  const selectedInstrument = watchlist.find((x: any) => x.key === selectedKey) || instrumentSuggestions.find((x: any) => x.key === selectedKey) || { key: selectedKey, label: selectedKey, short: selectedKey, type: 'Custom' };
  const matchingInstruments = instrumentSuggestions.filter((x: any) => `${x.label} ${x.key} ${x.type}`.toLowerCase().includes(instrumentSearch.toLowerCase())).slice(0, 20);
  const selectInstrument = (item: any) => { setSelectedKey(item.key); setInstrumentSearch(''); setShowInstrumentSearch(false); setActiveSection('info'); };
  const addCustomInstrument = () => { const key = instrumentSearch.trim(); if (!key) return; const item = { key, label: key, short: key.slice(0, 12), type: 'Custom' }; setWatchlist((current: any[]) => { const next = current.some(x => x.key === key) ? current : [...current, item]; localStorage.setItem('tradingcore_watchlist_v2', JSON.stringify(next)); return next; }); selectInstrument(item); };
  const addToWatchlist = () => { const item = selectedInstrument; setWatchlist((current: any[]) => { const next = current.some(x => x.key === item.key) ? current : [...current, item]; localStorage.setItem('tradingcore_watchlist_v2', JSON.stringify(next)); return next; }); };
  const loadOptionChain = async () => { setOptionLoading(true); setOptionError(''); try { setOptionChain(await tradingCoreRuntime.getOptionChain(selectedKey)); } catch (e: any) { setOptionError(e?.message || 'Option chain unavailable for this instrument.'); } finally { setOptionLoading(false); } };
  useEffect(() => { if (activeSection === 'option-chain') void loadOptionChain(); }, [activeSection, selectedKey]);
  const activeBroker = tradingCoreRuntime.getPrimaryBrokerInfo();

  const sync = async () => {
    try {
      const snapshot = await tradingCoreRuntime.syncPortfolio();
      setFunds(snapshot.funds); setPositions(snapshot.positions); setOrders(snapshot.orders); setTrades(snapshot.trades); setHoldings(snapshot.holdings);
    } catch (error: any) { setFeedError(error.message || 'Portfolio synchronization failed'); }
  };

  useEffect(() => {
    void sync();
    const stopFeed = tradingCoreRuntime.subscribeMarketData(Array.from(new Set([...watchlist.map((x: any) => x.key), selectedKey])), event => {
      if (event.type === 'tick' && event.tick) {
        ticksRef.current = { ...ticksRef.current, [event.tick.instrumentKey]: event.tick };
        if (tickFrameRef.current == null) {
          tickFrameRef.current = window.requestAnimationFrame(() => {
            tickFrameRef.current = undefined;
            setTicks(ticksRef.current);
          });
        }
      }
      if (event.type === 'status' && event.status) setFeedStatus(event.status);
      if (event.type === 'error') setFeedError(event.error);
    });
    const applySnapshot = (snapshot: any) => {
      setFunds(snapshot.funds); setPositions(snapshot.positions || []); setOrders(snapshot.orders || []); setTrades(snapshot.trades || []); setHoldings(snapshot.holdings || []);
    };
    const stopPortfolioEvents = tradingCoreRuntime.on('PORTFOLIO_SYNCED', applySnapshot);
    const stopPolling = tradingCoreRuntime.startPortfolioPolling(5000);
    return () => {
      stopFeed(); stopPortfolioEvents(); stopPolling();
      if (tickFrameRef.current != null) { window.cancelAnimationFrame(tickFrameRef.current); tickFrameRef.current = undefined; }
    };
  }, [watchlist, selectedKey]);

  useEffect(() => tradingCoreRuntime.on('ORDER_EXECUTED', () => void sync()), []);

  useEffect(() => {
    let dead = false;
    const measure = async () => {
      const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
      if (!broker) return;
      try {
        const value = await tradingCoreRuntime.testLatency(broker.brokerId);
        if (!dead) setLatencyMs(value);
      } catch { /* feed remains usable if the optional latency probe fails */ }
    };
    void measure();
    const timer = setInterval(() => void measure(), 15000);
    return () => { dead = true; clearInterval(timer); };
  }, []);

  const depth = useMemo(() => ({
    bids: selectedTick?.bid || [], asks: selectedTick?.ask || [],
    spread: selectedTick?.bid?.[0] && selectedTick?.ask?.[0] ? selectedTick.ask[0].price - selectedTick.bid[0].price : undefined
  }), [selectedTick]);

  const submitOrder = async () => {
    if (!order.instrument_token || !order.quantity || (order.orderType !== 'Market' && !Number(order.price)) || ((order.orderType === 'SL' || order.orderType === 'SL-M') && !Number(order.triggerPrice))) {
      setOrderResult('Enter a valid broker instrument token and all prices required by the selected order type.'); return;
    }
    if (!window.confirm(`Confirm ${order.side.toUpperCase()} ${order.quantity} of ${order.instrument_token} as ${order.orderType}. This sends a live broker order.`)) return;
    setSubmitting(true); setOrderResult(undefined);
    const orderStarted=performance.now();
    try {
      const result = await tradingCoreRuntime.placeOrder({ symbol: order.instrument_token, instrument_token: order.instrument_token, quantity: order.quantity, orderType: order.orderType, side: order.side, product: order.product, price: Number(order.price) || undefined, triggerPrice: Number(order.triggerPrice) || undefined, idempotencyKey: globalThis.crypto.randomUUID() } as OrderRequest & { instrument_token: string });
      const elapsed=Math.round(performance.now()-orderStarted); setOrderLatencyMs(elapsed); setOrderResult(`Broker response: ${result.status} · ${result.orderId} · ${elapsed}ms`); await sync();
    } catch (error: any) { setOrderResult(error.message || 'Broker order was rejected'); }
    finally { setSubmitting(false); }
  };

  const ltp = selectedTick?.ltp;
  const change = selectedTick?.changePercent;
  const state = analytics?.bias || (change != null ? change >= 0 ? 'BULLISH' : 'BEARISH' : 'RANGE');
  const stateClass = state === 'BULLISH' ? 'text-[#10b981]' : state === 'BEARISH' ? 'text-[#ef4444]' : 'text-[#f59e0b]';

  return <div className="min-h-screen bg-[#080a0f] text-[#f3f4f6] font-sans flex flex-col">
    <header className="shrink-0 border-b border-[#222636] bg-[#0c0e15]">
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBackToLanding} className="border border-[#222636] px-2.5 py-1.5 rounded-md text-[#8c93a6] hover:text-white"><ArrowLeft className="inline w-3 h-3 mr-1" /> Back to Home</button>
          <div className="font-mono text-xs font-bold tracking-wider">TRADINGCORE <span className="text-[#10b981]">OS</span></div>
          <span className={`hidden sm:inline font-mono text-[10px] ${feedStatus === 'connected' ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>● {feedStatus.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-[10px] font-mono text-[#8c93a6]">{activeBroker?.name || 'No broker'}</span>
          <span className="hidden sm:inline text-[10px] font-mono text-[#10b981]">RTT {latencyMs != null ? `${latencyMs}ms` : '—'}</span>
          <button onClick={() => void sync()} className="border border-[#222636] px-2.5 py-1.5 rounded-md text-xs hover:bg-[#141824]"><RefreshCw className="inline w-3 h-3 mr-1" /> Sync</button>
          <button onClick={() => setSettingsOpen(true)} className="border border-[#222636] px-2.5 py-1.5 rounded-md text-xs hover:bg-[#141824]"><SlidersHorizontal className="inline w-3 h-3 mr-1" /> Broker</button>
        </div>
      </div>
      <nav className="px-3 pb-2 flex gap-1 overflow-x-auto">
        {([
          ['/live', Activity, 'Live Trading'],
          ['/models', BrainCircuit, 'Models'],
          ['/automations', Bot, 'Automations'],
          ['/indicators', Gauge, 'Indicators'],
          ['/portfolio', BriefcaseBusiness, 'Portfolio'],
          ['/profile', UserCircle, 'Profile'],
        ] as const).map(([path, Icon, label]) => (
          <button key={path} onClick={() => onNavigate(path)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono whitespace-nowrap ${path === '/live' ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]' : 'border-transparent text-[#64748b] hover:text-white hover:bg-[#141824]'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </nav>
    </header>

    <BrokerSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onNavigateToConnect={onNavigateToBroker} />
    {feedError && <div className="mx-3 mt-3 px-3 py-2 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 text-[11px] text-[#fca5a5]"><AlertCircle className="inline w-3 h-3 mr-1" /> {feedError}</div>}

    <div className="border-b border-[#222636] bg-[#0c0e15] px-3 py-2 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {watchlist.map(item => {
          const tick = ticks[item.key];
          return <button key={item.key} onClick={() => setSelectedKey(item.key)} className={`min-w-[170px] text-left rounded-lg border px-3 py-2 ${selectedKey === item.key ? 'border-[#10b981]/50 bg-[#10b981]/5' : 'border-[#222636] bg-[#090a0f] hover:border-[#343b4f]'}`}>
            <div className="flex items-center justify-between"><span className="text-[10px] font-mono text-[#8c93a6]">{item.short}</span><span className={`text-[9px] font-mono ${feedStatus === 'connected' && tick ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>{feedStatus === 'connected' && tick ? 'LIVE' : feedStatus.toUpperCase()}</span></div>
            <div className="mt-1 flex items-baseline justify-between"><b className="text-xs">{item.label}</b><span className="font-mono text-xs">{tick?.ltp ? `₹${fmt(tick.ltp)}` : '—'}</span></div>
            <div className={`font-mono text-[10px] mt-0.5 ${tick?.changePercent != null && tick.changePercent < 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>{tick?.changePercent == null ? 'Awaiting feed' : `${signed(tick.changePercent)}%`}</div>
          </button>;
        })}
      </div>
    </div>

    <main className="flex-1 grid grid-cols-1 2xl:grid-cols-[240px_minmax(600px,1fr)_290px] min-h-0">
      <aside className="hidden 2xl:block border-r border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {(activeSection === 'option-chain' ? [
            ['option-chain', ListOrdered, 'Option Chain'],
            ['orders', ListOrdered, 'Orders'],
            ['signals', Radio, 'Signals'],
          ] : [
            ['info', Info, 'Info'],
            ['option-chain', ListOrdered, 'Option Chain'],
            ['positions', Wallet, 'Positions'],
            ['orders', ListOrdered, 'Orders'],
            ['levels', Layers3, 'Levels'],
            ['signals', Radio, 'Signals'],
          ]).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setActiveSection(id as typeof activeSection)} className={`flex items-center gap-1.5 rounded-md px-2 py-2 text-[9px] font-mono border ${activeSection === id ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]' : 'border-[#222636] text-[#64748b] hover:text-white'}`}>
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest text-[#64748b]"><Activity className="w-3 h-3" /> Market Map</div>
        <div className="space-y-2">
          <InfoCard label="Market state" value={state} valueClass={stateClass} />
          <InfoCard label="LTP" value={ltp ? `₹${fmt(ltp)}` : '—'} />
          <InfoCard label="Change" value={signed(change) + (change != null ? '%' : '')} valueClass={change != null && change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'} />
          <InfoCard label="VWAP" value={analytics?.vwap ? `₹${fmt(analytics.vwap, 1)}` : '—'} valueClass={ltp && analytics?.vwap ? ltp >= analytics.vwap ? 'text-[#10b981]' : 'text-[#ef4444]' : ''} />
          <div className="mt-4 rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b] mb-2">Session structure</div>
            <MetricRow label="Day H / L" value={`${fmt(analytics?.dayHigh, 0)} / ${fmt(analytics?.dayLow, 0)}`} />
            <MetricRow label="Prev H / L" value={`${fmt(analytics?.previousHigh, 0)} / ${fmt(analytics?.previousLow, 0)}`} />
            <MetricRow label="Open range" value={`${fmt(analytics?.openingLow, 0)} — ${fmt(analytics?.openingHigh, 0)}`} />
            <MetricRow label="ATR 14" value={fmt(analytics?.atr, 1)} />
          </div>
        </div>
      </aside>

      <section className="min-h-[560px] p-3 md:p-4 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 pb-2 relative">
          <div className="min-w-0"><button onClick={() => setShowInstrumentSearch(v => !v)} className="flex items-center gap-2 text-left font-mono text-sm font-bold hover:text-[#10b981]"><Search className="w-3.5 h-3.5 text-[#64748b]"/>{selectedInstrument.label}<span className="text-[9px] font-normal text-[#64748b]">· {selectedInstrument.type}</span></button><div className="text-[10px] text-[#64748b] mt-0.5">{activeSection === 'option-chain' ? 'Broker option chain · strikes · OI · CE / PE' : 'OHLC structure · calculated levels · live candle'}</div></div>
          <div className="flex items-center gap-2"><button onClick={addToWatchlist} className="rounded border border-[#222636] px-2 py-1 text-[9px] font-mono text-[#8c93a6] hover:text-white"><Star className="inline w-3 h-3 mr-1"/>Watchlist</button>{activeSection === 'option-chain' && <button onClick={() => setActiveSection('info')} className="rounded border border-[#10b981]/40 px-2 py-1 text-[9px] font-mono text-[#10b981]"><LineChart className="inline w-3 h-3 mr-1"/>Chart</button>}<div className={`font-mono text-[10px] ${stateClass}`}>● {state}</div></div>
          {showInstrumentSearch && <div className="absolute left-0 top-10 z-40 w-full max-w-xl rounded-xl border border-[#2a3040] bg-[#0b0e15] p-2 shadow-2xl"><input autoFocus value={instrumentSearch} onChange={e => setInstrumentSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !matchingInstruments.length) addCustomInstrument(); }} placeholder="Search indices, stocks, commodities, futures or options by broker symbol / instrument key" className="w-full rounded border border-[#222636] bg-[#080a0f] p-2 text-xs outline-none focus:border-[#10b981]/50"/><div className="mt-2 max-h-72 overflow-y-auto">{matchingInstruments.map((item: any) => <button key={item.key} onClick={() => selectInstrument(item)} className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-[#141824]"><span className="font-mono text-xs">{item.label}</span><span className="text-[9px] text-[#64748b]">{item.type}</span></button>)}{!matchingInstruments.length && <button onClick={addCustomInstrument} className="w-full rounded border border-dashed border-[#10b981]/30 px-2 py-2 text-left text-[10px] text-[#10b981]"><Plus className="inline w-3 h-3 mr-1"/>Add custom broker instrument: {instrumentSearch}</button>}</div></div>}
        </div>
        {activeSection === 'option-chain' ? <OptionChainPanel loading={optionLoading} error={optionError} chain={optionChain} onChart={() => setActiveSection('info')} /> : <LiveChart instrumentKey={selectedKey} tick={selectedTick} onAnalytics={setAnalytics} />}
      </section>

      <aside className="border-t 2xl:border-t-0 2xl:border-l border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto">
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3">
          <div className="flex items-center justify-between mb-2"><div className="text-[9px] uppercase tracking-widest text-[#64748b]">Live Execution</div><Target className="w-3.5 h-3.5 text-[#10b981]" /></div>
          <div className="space-y-1.5"><MetricRow label="Feed" value={feedStatus.toUpperCase()} /><MetricRow label="Regime" value={state} /><MetricRow label="VWAP" value={fmt(analytics?.vwap, 1)} /><MetricRow label="ATR 14" value={fmt(analytics?.atr, 1)} /><MetricRow label="Last order RTT" value={orderLatencyMs == null ? '—' : `${orderLatencyMs}ms`} /></div>
        </div>
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3">
          <div className="flex items-center justify-between mb-3"><div className="text-[10px] uppercase tracking-widest text-[#64748b]">Core Levels</div><BarChart3 className="w-3.5 h-3.5 text-[#8c93a6]" /></div>
          <LevelList title="Support" levels={analytics?.support || []} />
          <LevelList title="Resistance" levels={analytics?.resistance || []} />
          <div className="mt-3 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]">Levels use swing structure + session anchors. A break is informational until confirmed by candle close.</div>
        </div>

        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3">
          <div className="flex items-center justify-between mb-2"><div className="text-[10px] uppercase tracking-widest text-[#64748b]">Market Depth</div><Zap className="w-3.5 h-3.5 text-[#f59e0b]" /></div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
            <Depth title="Bids" rows={depth.bids} cls="text-[#10b981]" />
            <Depth title="Asks" rows={depth.asks} cls="text-[#ef4444]" />
          </div>
          <div className="mt-2 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]">Spread {depth.spread == null ? '—' : `₹${fmt(depth.spread, 2)}`}</div>
        </div>

        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#64748b] mb-2"><Wallet className="w-3.5 h-3.5" /> Quick Order</div>
          <input placeholder="Instrument token" value={order.instrument_token} onChange={e => setOrder({ ...order, instrument_token: e.target.value })} className="w-full bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px] font-mono outline-none focus:border-[#10b981]/50" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <select value={order.side} onChange={e => setOrder({ ...order, side: e.target.value as OrderRequest['side'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>Buy</option><option>Sell</option></select>
            <select value={order.orderType} onChange={e => setOrder({ ...order, orderType: e.target.value as OrderRequest['orderType'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>Market</option><option>Limit</option><option>SL</option><option>SL-M</option></select>
            <input type="number" min="1" value={order.quantity} onChange={e => setOrder({ ...order, quantity: Number(e.target.value) })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" />
            <select value={order.product} onChange={e => setOrder({ ...order, product: e.target.value as OrderRequest['product'] })} className="bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]"><option>MIS</option><option>CNC</option><option>NRML</option></select>
          </div>
          {order.orderType !== 'Market' && <input placeholder="Price" type="number" value={order.price} onChange={e => setOrder({ ...order, price: e.target.value })} className="w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" />}
          {(order.orderType === 'SL' || order.orderType === 'SL-M') && <input placeholder="Trigger price" type="number" value={order.triggerPrice} onChange={e => setOrder({ ...order, triggerPrice: e.target.value })} className="w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" />}
          <div className="mt-2 text-[9px] text-[#64748b]">Available margin: {funds ? `₹${fmt(funds.availableMargin, 0)}` : '—'}</div>
          <button disabled={submitting} onClick={() => void submitOrder()} className={`w-full mt-2 p-2 rounded-md font-mono text-[10px] font-bold ${order.side === 'Buy' ? 'bg-[#10b981] text-[#06110d]' : 'bg-[#ef4444] text-white'} disabled:opacity-50`}>{submitting ? 'SUBMITTING…' : `${order.side.toUpperCase()} · LIVE ORDER`}</button>
          {orderResult && <div className="mt-2 text-[9px] text-[#d1d5db] break-words">{orderResult}</div>}
        </div>
      </aside>
    </main>

    <section className="border-t border-[#222636] bg-[#0c0e15] p-2">
      <div className="flex gap-1 overflow-x-auto">
        {(['INFO','POSITIONS','ORDERS','TRADES','HOLDINGS','FUNDS'] as const).map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded-md font-mono text-[10px] ${activeTab === tab ? 'bg-[#10b981]/10 text-[#10b981]' : 'text-[#8c93a6] hover:text-white'}`}>{tab}</button>)}
      </div>
      <div className="mt-2 max-h-28 overflow-y-auto font-mono text-[10px] text-[#d1d5db]">
        {activeTab === 'INFO' && <div className="grid grid-cols-2 md:grid-cols-6 gap-2"><MetricRow label="Bias" value={analytics?.bias || '—'} /><MetricRow label="VWAP" value={fmt(analytics?.vwap, 1)} /><MetricRow label="ATR" value={fmt(analytics?.atr, 1)} /><MetricRow label="Prev H" value={fmt(analytics?.previousHigh, 0)} /><MetricRow label="Prev L" value={fmt(analytics?.previousLow, 0)} /><MetricRow label="Margin" value={funds ? `₹${fmt(funds.availableMargin, 0)}` : '—'} /></div>}
        {activeTab === 'POSITIONS' && (positions.length ? positions.map(p => <p key={p.id}>{p.symbol} · {p.quantity} · P&L ₹{fmt(p.pnl)}</p>) : <p className="text-[#64748b]">No positions returned by broker.</p>)}
        {activeTab === 'ORDERS' && (orders.length ? orders.map(o => <p key={o.orderId}>{o.orderId} · {o.status} · {o.timestamp}</p>) : <p className="text-[#64748b]">No orders returned by broker.</p>)}
        {activeTab === 'TRADES' && (trades.length ? trades.map(t => <p key={t.tradeId}>{t.symbol} · {t.side} · {t.quantity} @ ₹{fmt(t.price)}</p>) : <p className="text-[#64748b]">No trades returned by broker.</p>)}
        {activeTab === 'HOLDINGS' && (holdings.length ? holdings.map(h => <p key={h.id}>{h.symbol} · {h.quantity} · ₹{fmt(h.ltp)}</p>) : <p className="text-[#64748b]">No holdings returned by broker.</p>)}
        {activeTab === 'FUNDS' && <p>{funds ? `Available ₹${fmt(funds.availableMargin, 0)} · Used ₹${fmt(funds.usedMargin, 0)} · Collateral ₹${fmt(funds.collateralMargin, 0)}` : 'Funds unavailable'}</p>}
      </div>
    </section>
  </div>;
}

function InfoCard({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b]">{label}</div><div className={`mt-1 font-mono text-sm font-bold ${valueClass}`}>{value}</div></div>;
}
function MetricRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2 py-1"><span className="text-[#64748b]">{label}</span><b className="text-[#d1d5db]">{value}</b></div>;
}
function LevelList({ title, levels }: { title: string; levels: ChartAnalytics['support'] }) {
  return <div className="mb-3"><div className="text-[9px] uppercase tracking-widest text-[#64748b] mb-1">{title}</div>{levels.length ? levels.slice(0, 3).map((x, i) => <div key={`${x.side}-${x.price}`} className="flex items-center justify-between py-1.5 border-b border-[#1a1e29] last:border-0"><span className={`font-mono text-[10px] ${x.state === 'BROKEN' ? 'text-[#64748b]' : x.side === 'support' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{x.state}</span><span className="font-mono text-[11px]">₹{fmt(x.price)} <span className="text-[#64748b]">· {fmt(x.distance, 1)} pts</span></span></div>) : <div className="text-[9px] text-[#64748b]">Calculating from live candles…</div>}</div>;
}
function Depth({ title, rows, cls }: { title: string; rows: Array<{ price: number; quantity: number }>; cls: string }) {
  return <div><div className={`${cls} uppercase mb-1`}>{title}</div>{rows.length ? rows.slice(0, 5).map((r, i) => <div key={i} className="flex justify-between py-0.5"><span>₹{fmt(r.price)}</span><span className="text-[#8c93a6]">{r.quantity}</span></div>) : <div className="text-[#64748b]">—</div>}</div>;
}


function OptionChainPanel({ loading, error, chain, onChart }: { loading: boolean; error: string; chain: any; onChart: () => void }) {
  const rows = Array.isArray(chain?.contracts) ? chain.contracts : [];
  return <div className="flex min-h-[560px] flex-col rounded-xl border border-[#222636] bg-[#0c0e15] p-3"><div className="mb-3 flex items-center justify-between"><div><div className="font-mono text-sm font-bold">Option Chain</div><div className="text-[9px] text-[#64748b]">Underlying {chain?.underlyingKey || '—'} · Spot {chain?.spot ?? '—'}</div></div><button onClick={onChart} className="rounded border border-[#10b981]/40 px-2 py-1 text-[9px] font-mono text-[#10b981]">Chart</button></div>{loading && <div className="flex flex-1 items-center justify-center text-xs text-[#64748b]">Loading broker option chain…</div>}{error && <div className="rounded border border-[#ef4444]/30 bg-[#ef4444]/5 p-3 text-xs text-[#ef4444]">{error}</div>}{!loading && !error && <div className="overflow-auto"><table className="w-full min-w-[760px] text-left font-mono text-[10px]"><thead className="text-[#64748b]"><tr><th className="p-2">CALL OI</th><th className="p-2">CALL ΔOI</th><th className="p-2">CALL LTP</th><th className="p-2 text-center text-white">STRIKE</th><th className="p-2">PUT LTP</th><th className="p-2">PUT ΔOI</th><th className="p-2">PUT OI</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.strike} className="border-t border-[#151923]"><td className="p-2 text-[#ef4444]">{row.call?.oi ?? '—'}</td><td className="p-2">{row.call?.changeOi ?? row.call?.oiChange ?? '—'}</td><td className="p-2">{row.call?.ltp ?? '—'}</td><td className="p-2 text-center font-bold">{row.strike}</td><td className="p-2">{row.put?.ltp ?? '—'}</td><td className="p-2">{row.put?.changeOi ?? row.put?.oiChange ?? '—'}</td><td className="p-2 text-[#10b981]">{row.put?.oi ?? '—'}</td></tr>)}</tbody></table>{!rows.length && <div className="p-5 text-center text-xs text-[#64748b]">No option contracts returned for this instrument.</div>}</div>}</div>;
}
