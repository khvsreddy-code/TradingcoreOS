import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Activity, BarChart3, RefreshCw, SlidersHorizontal, Wallet, Zap, Bot, BrainCircuit, Gauge, UserCircle, Info, ListOrdered, Layers3, Target, Radio, BriefcaseBusiness } from 'lucide-react';
import { BrokerSettingsModal } from '../brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { LiveChart } from './LiveChart';
const watchlist = [
    { key: 'NSE_INDEX|Nifty 50', label: 'NIFTY 50', short: 'NIFTY', type: 'Index' },
    { key: 'NSE_INDEX|Nifty Bank', label: 'BANK NIFTY', short: 'BANK', type: 'Index' },
    { key: 'NSE:RELIANCE-EQ', label: 'RELIANCE', short: 'RELIANCE', type: 'Stock' },
    { key: 'NSE:TCS-EQ', label: 'TCS', short: 'TCS', type: 'Stock' },
    { key: 'MCX:GOLDM-I', label: 'GOLD', short: 'GOLD', type: 'Commodity Future' },
    { key: 'MCX:CRUDEOIL-I', label: 'CRUDE OIL', short: 'CRUDE', type: 'Commodity Future' },
    { key: 'MCX:SILVERMIC-I', label: 'SILVER', short: 'SILVER', type: 'Commodity Future' },
];
const fmt = (n, digits = 2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const signed = (n, digits = 2) => n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
export function FullWorkspaceView({ onBackToLanding, onNavigateToBroker, onNavigate }) {
    const [selectedKey, setSelectedKey] = useState(watchlist[0].key);
    const [instrumentSearch, setInstrumentSearch] = useState('');
    const [optionChain, setOptionChain] = useState();
    const [optionChainLoading, setOptionChainLoading] = useState(false);
    const [optionChainError, setOptionChainError] = useState();
    const [ticks, setTicks] = useState({});
    const [feedStatus, setFeedStatus] = useState('disconnected');
    const [feedError, setFeedError] = useState();
    const [analytics, setAnalytics] = useState(null);
    const [funds, setFunds] = useState(null);
    const [positions, setPositions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [trades, setTrades] = useState([]);
    const [holdings, setHoldings] = useState([]);
    const [activeTab, setActiveTab] = useState('INFO');
    const [order, setOrder] = useState({ instrument_token: '', quantity: 1, orderType: 'Market', side: 'Buy', product: 'MIS', price: '', triggerPrice: '' });
    const [orderResult, setOrderResult] = useState();
    const [submitting, setSubmitting] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('info');
    const [latencyMs, setLatencyMs] = useState();
    const [orderLatencyMs, setOrderLatencyMs] = useState();
    const ticksRef = useRef({});
    const tickFrameRef = useRef();
    const selectedTick = ticks[selectedKey];
    const selectedInstrument = watchlist.find(x => x.key === selectedKey) || { key: selectedKey, label: selectedKey, short: selectedKey, type: 'Broker Instrument' };
    const filteredInstruments = watchlist.filter(x => `${x.label} ${x.short} ${x.type}`.toLowerCase().includes(instrumentSearch.toLowerCase()));
    const activeBroker = tradingCoreRuntime.getPrimaryBrokerInfo();
    const sync = async () => {
        try {
            const snapshot = await tradingCoreRuntime.syncPortfolio();
            setFunds(snapshot.funds);
            setPositions(snapshot.positions);
            setOrders(snapshot.orders);
            setTrades(snapshot.trades);
            setHoldings(snapshot.holdings);
        }
        catch (error) {
            setFeedError(error.message || 'Portfolio synchronization failed');
        }
    };
    useEffect(() => {
        void sync();
        const stopFeed = tradingCoreRuntime.subscribeMarketData([selectedKey], event => {
            if (event.type === 'tick' && event.tick) {
                ticksRef.current = { ...ticksRef.current, [event.tick.instrumentKey]: event.tick };
                if (tickFrameRef.current == null) {
                    tickFrameRef.current = window.requestAnimationFrame(() => {
                        tickFrameRef.current = undefined;
                        setTicks(ticksRef.current);
                    });
                }
            }
            if (event.type === 'status' && event.status)
                setFeedStatus(event.status);
            if (event.type === 'error')
                setFeedError(event.error);
        });
        const applySnapshot = (snapshot) => {
            setFunds(snapshot.funds);
            setPositions(snapshot.positions || []);
            setOrders(snapshot.orders || []);
            setTrades(snapshot.trades || []);
            setHoldings(snapshot.holdings || []);
        };
        const stopPortfolioEvents = tradingCoreRuntime.on('PORTFOLIO_SYNCED', applySnapshot);
        const stopPolling = tradingCoreRuntime.startPortfolioPolling(5000);
        return () => {
            stopFeed();
            stopPortfolioEvents();
            stopPolling();
            if (tickFrameRef.current != null) {
                window.cancelAnimationFrame(tickFrameRef.current);
                tickFrameRef.current = undefined;
            }
        };
    }, [selectedKey]);
    useEffect(() => tradingCoreRuntime.on('ORDER_EXECUTED', () => void sync()), []);
    useEffect(() => {
        let dead = false;
        const measure = async () => {
            const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
            if (!broker)
                return;
            try {
                const value = await tradingCoreRuntime.testLatency(broker.brokerId);
                if (!dead)
                    setLatencyMs(value);
            }
            catch { /* feed remains usable if the optional latency probe fails */ }
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
            setOrderResult('Enter a valid broker instrument token and all prices required by the selected order type.');
            return;
        }
        if (!window.confirm(`Confirm ${order.side.toUpperCase()} ${order.quantity} of ${order.instrument_token} as ${order.orderType}. This sends a live broker order.`))
            return;
        setSubmitting(true);
        setOrderResult(undefined);
        const orderStarted = performance.now();
        try {
            const result = await tradingCoreRuntime.placeOrder({ symbol: order.instrument_token, instrument_token: order.instrument_token, quantity: order.quantity, orderType: order.orderType, side: order.side, product: order.product, price: Number(order.price) || undefined, triggerPrice: Number(order.triggerPrice) || undefined, idempotencyKey: globalThis.crypto.randomUUID() });
            const elapsed = Math.round(performance.now() - orderStarted);
            setOrderLatencyMs(elapsed);
            setOrderResult(`Broker response: ${result.status} · ${result.orderId} · ${elapsed}ms`);
            await sync();
        }
        catch (error) {
            setOrderResult(error.message || 'Broker order was rejected');
        }
        finally {
            setSubmitting(false);
        }
    };
    const loadOptionChain = async () => {
        setOptionChainLoading(true);
        setOptionChainError(undefined);
        try {
            setOptionChain(await tradingCoreRuntime.getOptionChain(selectedKey));
        }
        catch (error) {
            setOptionChainError(error?.message || 'Option chain is unavailable for this instrument/broker.');
        }
        finally {
            setOptionChainLoading(false);
        }
    };
    const ltp = selectedTick?.ltp;
    const change = selectedTick?.changePercent;
    const state = analytics?.bias || (change != null ? change >= 0 ? 'BULLISH' : 'BEARISH' : 'RANGE');
    const stateClass = state === 'BULLISH' ? 'text-[#10b981]' : state === 'BEARISH' ? 'text-[#ef4444]' : 'text-[#f59e0b]';
    return _jsxs("div", { className: "min-h-screen bg-[#080a0f] text-[#f3f4f6] font-sans flex flex-col", children: [_jsxs("header", { className: "shrink-0 border-b border-[#222636] bg-[#0c0e15]", children: [_jsxs("div", { className: "h-14 px-4 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsxs("button", { onClick: onBackToLanding, className: "border border-[#222636] px-2.5 py-1.5 rounded-md text-[#8c93a6] hover:text-white", children: [_jsx(ArrowLeft, { className: "inline w-3 h-3 mr-1" }), " Back to Home"] }), _jsxs("div", { className: "font-mono text-xs font-bold tracking-wider", children: ["TRADINGCORE ", _jsx("span", { className: "text-[#10b981]", children: "OS" })] }), _jsxs("span", { className: `hidden sm:inline font-mono text-[10px] ${feedStatus === 'connected' ? 'text-[#10b981]' : 'text-[#f59e0b]'}`, children: ["\u25CF ", feedStatus.toUpperCase()] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "hidden md:inline text-[10px] font-mono text-[#8c93a6]", children: activeBroker?.name || 'No broker' }), _jsxs("span", { className: "hidden sm:inline text-[10px] font-mono text-[#10b981]", children: ["RTT ", latencyMs != null ? `${latencyMs}ms` : '—'] }), _jsxs("button", { onClick: () => void sync(), className: "border border-[#222636] px-2.5 py-1.5 rounded-md text-xs hover:bg-[#141824]", children: [_jsx(RefreshCw, { className: "inline w-3 h-3 mr-1" }), " Sync"] }), _jsxs("button", { onClick: () => setSettingsOpen(true), className: "border border-[#222636] px-2.5 py-1.5 rounded-md text-xs hover:bg-[#141824]", children: [_jsx(SlidersHorizontal, { className: "inline w-3 h-3 mr-1" }), " Broker"] })] })] }), _jsx("nav", { className: "px-3 pb-2 flex gap-1 overflow-x-auto", children: [
                            ['/live', Activity, 'Live Trading'],
                            ['/models', BrainCircuit, 'Models'],
                            ['/automations', Bot, 'Automations'],
                            ['/indicators', Gauge, 'Indicators'],
                            ['/portfolio', BriefcaseBusiness, 'Portfolio'],
                            ['/profile', UserCircle, 'Profile'],
                        ].map(([path, Icon, label]) => (_jsxs("button", { onClick: () => onNavigate(path), className: `flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono whitespace-nowrap ${path === '/live' ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]' : 'border-transparent text-[#64748b] hover:text-white hover:bg-[#141824]'}`, children: [_jsx(Icon, { className: "w-3.5 h-3.5" }), " ", label] }, path))) })] }), _jsx(BrokerSettingsModal, { isOpen: settingsOpen, onClose: () => setSettingsOpen(false), onNavigateToConnect: onNavigateToBroker }), feedError && _jsxs("div", { className: "mx-3 mt-3 px-3 py-2 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 text-[11px] text-[#fca5a5]", children: [_jsx(AlertCircle, { className: "inline w-3 h-3 mr-1" }), " ", feedError] }), _jsxs("div", { className: "border-b border-[#222636] bg-[#0c0e15] px-3 py-2", children: [_jsxs("div", { className: "mb-2 flex items-center gap-2", children: [_jsx("input", { value: instrumentSearch, onChange: e => setInstrumentSearch(e.target.value), placeholder: "Search broker instruments: stocks, options, futures, commodities\u2026", className: "w-full max-w-xl rounded-md border border-[#222636] bg-[#090a0f] px-3 py-2 text-[10px] font-mono outline-none focus:border-[#10b981]/50" }), _jsxs("span", { className: "hidden md:inline text-[9px] font-mono text-[#64748b]", children: ["Broker universe \u00B7 ", activeBroker?.name || 'No broker'] })] }), _jsx("div", { className: "flex gap-2 min-w-max overflow-x-auto pb-1", children: filteredInstruments.map(item => {
                            const tick = ticks[item.key];
                            return _jsxs("button", { onClick: () => setSelectedKey(item.key), className: `min-w-[170px] text-left rounded-lg border px-3 py-2 ${selectedKey === item.key ? 'border-[#10b981]/50 bg-[#10b981]/5' : 'border-[#222636] bg-[#090a0f] hover:border-[#343b4f]'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[10px] font-mono text-[#8c93a6]", children: item.short }), _jsx("span", { className: `text-[9px] font-mono ${feedStatus === 'connected' && tick ? 'text-[#10b981]' : 'text-[#f59e0b]'}`, children: feedStatus === 'connected' && tick ? 'LIVE' : feedStatus.toUpperCase() })] }), _jsxs("div", { className: "mt-1 flex items-baseline justify-between", children: [_jsx("b", { className: "text-xs", children: item.label }), _jsx("span", { className: "font-mono text-xs", children: tick?.ltp ? `₹${fmt(tick.ltp)}` : '—' })] }), _jsx("div", { className: `font-mono text-[10px] mt-0.5 ${tick?.changePercent != null && tick.changePercent < 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`, children: tick?.changePercent == null ? 'Awaiting feed' : `${signed(tick.changePercent)}%` })] }, item.key);
                        }) })] }), _jsxs("main", { className: "flex-1 grid grid-cols-1 2xl:grid-cols-[240px_minmax(600px,1fr)_290px] min-h-0", children: [_jsxs("aside", { className: "hidden 2xl:block border-r border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto", children: [_jsx("div", { className: "grid grid-cols-2 gap-1.5 mb-4", children: [
                                    ['info', Info, 'Info'],
                                    ['option-chain', ListOrdered, 'Option Chain'],
                                    ['positions', Wallet, 'Positions'],
                                    ['orders', ListOrdered, 'Orders'],
                                    ['levels', Layers3, 'Levels'],
                                    ['signals', Radio, 'Signals'],
                                ].map(([id, Icon, label]) => (_jsxs("button", { onClick: () => setActiveSection(id), className: `flex items-center gap-1.5 rounded-md px-2 py-2 text-[9px] font-mono border ${activeSection === id ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]' : 'border-[#222636] text-[#64748b] hover:text-white'}`, children: [_jsx(Icon, { className: "w-3 h-3" }), " ", label] }, id))) }), _jsxs("div", { className: "flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest text-[#64748b]", children: [_jsx(Activity, { className: "w-3 h-3" }), " ", activeSection === 'option-chain' ? 'Option Chain' : 'Market Map'] }), activeSection === 'option-chain' ? _jsxs("div", { className: "space-y-2", children: [_jsx("button", { onClick: () => void loadOptionChain(), disabled: optionChainLoading, className: "w-full rounded-md border border-[#10b981]/40 bg-[#10b981]/10 px-2 py-2 text-[10px] font-mono text-[#10b981]", children: optionChainLoading ? 'LOADING…' : 'LOAD OPTION CHAIN' }), _jsx("button", { onClick: () => setActiveSection('info'), className: "w-full rounded-md border border-[#222636] px-2 py-2 text-[9px] font-mono text-[#8c93a6]", children: "CHART" }), optionChainError && _jsx("p", { className: "text-[9px] text-[#ef4444]", children: optionChainError }), optionChain?.contracts?.length ? optionChain.contracts.slice(0, 12).map((c) => _jsxs("div", { className: "rounded border border-[#222636] p-2 text-[9px] font-mono", children: [_jsx("b", { children: c.strike }), _jsxs("div", { className: "mt-1 text-[#64748b]", children: ["CE OI ", c.call?.oi ?? '—', " \u00B7 PE OI ", c.put?.oi ?? '—'] })] }, c.strike)) : _jsx("p", { className: "text-[9px] text-[#64748b]", children: "Select an underlying, then load the broker-supported chain." })] }) : _jsxs("div", { className: "space-y-2", children: [_jsx(InfoCard, { label: "Market state", value: state, valueClass: stateClass }), _jsx(InfoCard, { label: "LTP", value: ltp ? `₹${fmt(ltp)}` : '—' }), _jsx(InfoCard, { label: "Change", value: signed(change) + (change != null ? '%' : ''), valueClass: change != null && change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' }), _jsx(InfoCard, { label: "VWAP", value: analytics?.vwap ? `₹${fmt(analytics.vwap, 1)}` : '—', valueClass: ltp && analytics?.vwap ? ltp >= analytics.vwap ? 'text-[#10b981]' : 'text-[#ef4444]' : '' }), _jsxs("div", { className: "mt-4 rounded-xl border border-[#222636] bg-[#0c0e15] p-3", children: [_jsx("div", { className: "text-[9px] uppercase tracking-widest text-[#64748b] mb-2", children: "Session structure" }), _jsx(MetricRow, { label: "Day H / L", value: `${fmt(analytics?.dayHigh, 0)} / ${fmt(analytics?.dayLow, 0)}` }), _jsx(MetricRow, { label: "Prev H / L", value: `${fmt(analytics?.previousHigh, 0)} / ${fmt(analytics?.previousLow, 0)}` }), _jsx(MetricRow, { label: "Open range", value: `${fmt(analytics?.openingLow, 0)} — ${fmt(analytics?.openingHigh, 0)}` }), _jsx(MetricRow, { label: "ATR 14", value: fmt(analytics?.atr, 1) })] })] })] }), _jsxs("section", { className: "min-h-[560px] p-3 md:p-4 flex flex-col min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between pb-2", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-sm font-bold", children: selectedInstrument.label }), _jsxs("div", { className: "text-[10px] text-[#64748b] mt-0.5", children: [selectedInstrument.type, " \u00B7 ", selectedKey, " \u00B7 25,000-candle history target \u00B7 live candle"] })] }), _jsxs("div", { className: `font-mono text-[10px] ${stateClass}`, children: ["\u25CF ", state] })] }), _jsx(LiveChart, { instrumentKey: selectedKey, tick: selectedTick, onAnalytics: setAnalytics })] }), _jsxs("aside", { className: "border-t 2xl:border-t-0 2xl:border-l border-[#222636] bg-[#0a0c12] p-3 overflow-y-auto", children: [_jsxs("div", { className: "rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "text-[9px] uppercase tracking-widest text-[#64748b]", children: "Live Execution" }), _jsx(Target, { className: "w-3.5 h-3.5 text-[#10b981]" })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(MetricRow, { label: "Feed", value: feedStatus.toUpperCase() }), _jsx(MetricRow, { label: "Regime", value: state }), _jsx(MetricRow, { label: "VWAP", value: fmt(analytics?.vwap, 1) }), _jsx(MetricRow, { label: "ATR 14", value: fmt(analytics?.atr, 1) }), _jsx(MetricRow, { label: "Last order RTT", value: orderLatencyMs == null ? '—' : `${orderLatencyMs}ms` })] })] }), _jsxs("div", { className: "rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("div", { className: "text-[10px] uppercase tracking-widest text-[#64748b]", children: "Core Levels" }), _jsx(BarChart3, { className: "w-3.5 h-3.5 text-[#8c93a6]" })] }), _jsx(LevelList, { title: "Support", levels: analytics?.support || [] }), _jsx(LevelList, { title: "Resistance", levels: analytics?.resistance || [] }), _jsx("div", { className: "mt-3 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]", children: "Levels use swing structure + session anchors. A break is informational until confirmed by candle close." })] }), _jsxs("div", { className: "rounded-xl border border-[#222636] bg-[#0c0e15] p-3 mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "text-[10px] uppercase tracking-widest text-[#64748b]", children: "Market Depth" }), _jsx(Zap, { className: "w-3.5 h-3.5 text-[#f59e0b]" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2 font-mono text-[10px]", children: [_jsx(Depth, { title: "Bids", rows: depth.bids, cls: "text-[#10b981]" }), _jsx(Depth, { title: "Asks", rows: depth.asks, cls: "text-[#ef4444]" })] }), _jsxs("div", { className: "mt-2 pt-2 border-t border-[#222636] text-[9px] text-[#64748b]", children: ["Spread ", depth.spread == null ? '—' : `₹${fmt(depth.spread, 2)}`] })] }), _jsxs("div", { className: "rounded-xl border border-[#222636] bg-[#0c0e15] p-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#64748b] mb-2", children: [_jsx(Wallet, { className: "w-3.5 h-3.5" }), " Quick Order"] }), _jsx("input", { placeholder: "Instrument token", value: order.instrument_token, onChange: e => setOrder({ ...order, instrument_token: e.target.value }), className: "w-full bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px] font-mono outline-none focus:border-[#10b981]/50" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 mt-2", children: [_jsxs("select", { value: order.side, onChange: e => setOrder({ ...order, side: e.target.value }), className: "bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]", children: [_jsx("option", { children: "Buy" }), _jsx("option", { children: "Sell" })] }), _jsxs("select", { value: order.orderType, onChange: e => setOrder({ ...order, orderType: e.target.value }), className: "bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]", children: [_jsx("option", { children: "Market" }), _jsx("option", { children: "Limit" }), _jsx("option", { children: "SL" }), _jsx("option", { children: "SL-M" })] }), _jsx("input", { type: "number", min: "1", value: order.quantity, onChange: e => setOrder({ ...order, quantity: Number(e.target.value) }), className: "bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" }), _jsxs("select", { value: order.product, onChange: e => setOrder({ ...order, product: e.target.value }), className: "bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]", children: [_jsx("option", { children: "MIS" }), _jsx("option", { children: "CNC" }), _jsx("option", { children: "NRML" })] })] }), order.orderType !== 'Market' && _jsx("input", { placeholder: "Price", type: "number", value: order.price, onChange: e => setOrder({ ...order, price: e.target.value }), className: "w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" }), (order.orderType === 'SL' || order.orderType === 'SL-M') && _jsx("input", { placeholder: "Trigger price", type: "number", value: order.triggerPrice, onChange: e => setOrder({ ...order, triggerPrice: e.target.value }), className: "w-full mt-2 bg-[#090a0f] border border-[#222636] rounded-md p-2 text-[10px]" }), _jsxs("div", { className: "mt-2 text-[9px] text-[#64748b]", children: ["Available margin: ", funds ? `₹${fmt(funds.availableMargin, 0)}` : '—'] }), _jsx("button", { disabled: submitting, onClick: () => void submitOrder(), className: `w-full mt-2 p-2 rounded-md font-mono text-[10px] font-bold ${order.side === 'Buy' ? 'bg-[#10b981] text-[#06110d]' : 'bg-[#ef4444] text-white'} disabled:opacity-50`, children: submitting ? 'SUBMITTING…' : `${order.side.toUpperCase()} · LIVE ORDER` }), orderResult && _jsx("div", { className: "mt-2 text-[9px] text-[#d1d5db] break-words", children: orderResult })] })] })] }), _jsxs("section", { className: "border-t border-[#222636] bg-[#0c0e15] p-2", children: [_jsx("div", { className: "flex gap-1 overflow-x-auto", children: ['INFO', 'POSITIONS', 'ORDERS', 'TRADES', 'HOLDINGS', 'FUNDS'].map(tab => _jsx("button", { onClick: () => setActiveTab(tab), className: `px-3 py-1.5 rounded-md font-mono text-[10px] ${activeTab === tab ? 'bg-[#10b981]/10 text-[#10b981]' : 'text-[#8c93a6] hover:text-white'}`, children: tab }, tab)) }), _jsxs("div", { className: "mt-2 max-h-28 overflow-y-auto font-mono text-[10px] text-[#d1d5db]", children: [activeTab === 'INFO' && _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-6 gap-2", children: [_jsx(MetricRow, { label: "Bias", value: analytics?.bias || '—' }), _jsx(MetricRow, { label: "VWAP", value: fmt(analytics?.vwap, 1) }), _jsx(MetricRow, { label: "ATR", value: fmt(analytics?.atr, 1) }), _jsx(MetricRow, { label: "Prev H", value: fmt(analytics?.previousHigh, 0) }), _jsx(MetricRow, { label: "Prev L", value: fmt(analytics?.previousLow, 0) }), _jsx(MetricRow, { label: "Margin", value: funds ? `₹${fmt(funds.availableMargin, 0)}` : '—' })] }), activeTab === 'POSITIONS' && (positions.length ? positions.map(p => _jsxs("p", { children: [p.symbol, " \u00B7 ", p.quantity, " \u00B7 P&L \u20B9", fmt(p.pnl)] }, p.id)) : _jsx("p", { className: "text-[#64748b]", children: "No positions returned by broker." })), activeTab === 'ORDERS' && (orders.length ? orders.map(o => _jsxs("p", { children: [o.orderId, " \u00B7 ", o.status, " \u00B7 ", o.timestamp] }, o.orderId)) : _jsx("p", { className: "text-[#64748b]", children: "No orders returned by broker." })), activeTab === 'TRADES' && (trades.length ? trades.map(t => _jsxs("p", { children: [t.symbol, " \u00B7 ", t.side, " \u00B7 ", t.quantity, " @ \u20B9", fmt(t.price)] }, t.tradeId)) : _jsx("p", { className: "text-[#64748b]", children: "No trades returned by broker." })), activeTab === 'HOLDINGS' && (holdings.length ? holdings.map(h => _jsxs("p", { children: [h.symbol, " \u00B7 ", h.quantity, " \u00B7 \u20B9", fmt(h.ltp)] }, h.id)) : _jsx("p", { className: "text-[#64748b]", children: "No holdings returned by broker." })), activeTab === 'FUNDS' && _jsx("p", { children: funds ? `Available ₹${fmt(funds.availableMargin, 0)} · Used ₹${fmt(funds.usedMargin, 0)} · Collateral ₹${fmt(funds.collateralMargin, 0)}` : 'Funds unavailable' })] })] })] });
}
function InfoCard({ label, value, valueClass = '' }) {
    return _jsxs("div", { className: "rounded-xl border border-[#222636] bg-[#0c0e15] p-3", children: [_jsx("div", { className: "text-[9px] uppercase tracking-widest text-[#64748b]", children: label }), _jsx("div", { className: `mt-1 font-mono text-sm font-bold ${valueClass}`, children: value })] });
}
function MetricRow({ label, value }) {
    return _jsxs("div", { className: "flex items-center justify-between gap-2 py-1", children: [_jsx("span", { className: "text-[#64748b]", children: label }), _jsx("b", { className: "text-[#d1d5db]", children: value })] });
}
function LevelList({ title, levels }) {
    return _jsxs("div", { className: "mb-3", children: [_jsx("div", { className: "text-[9px] uppercase tracking-widest text-[#64748b] mb-1", children: title }), levels.length ? levels.slice(0, 3).map((x, i) => _jsxs("div", { className: "flex items-center justify-between py-1.5 border-b border-[#1a1e29] last:border-0", children: [_jsx("span", { className: `font-mono text-[10px] ${x.state === 'BROKEN' ? 'text-[#64748b]' : x.side === 'support' ? 'text-[#10b981]' : 'text-[#ef4444]'}`, children: x.state }), _jsxs("span", { className: "font-mono text-[11px]", children: ["\u20B9", fmt(x.price), " ", _jsxs("span", { className: "text-[#64748b]", children: ["\u00B7 ", fmt(x.distance, 1), " pts"] })] })] }, `${x.side}-${x.price}`)) : _jsx("div", { className: "text-[9px] text-[#64748b]", children: "Calculating from live candles\u2026" })] });
}
function Depth({ title, rows, cls }) {
    return _jsxs("div", { children: [_jsx("div", { className: `${cls} uppercase mb-1`, children: title }), rows.length ? rows.slice(0, 5).map((r, i) => _jsxs("div", { className: "flex justify-between py-0.5", children: [_jsxs("span", { children: ["\u20B9", fmt(r.price)] }), _jsx("span", { className: "text-[#8c93a6]", children: r.quantity })] }, i)) : _jsx("div", { className: "text-[#64748b]", children: "\u2014" })] });
}
