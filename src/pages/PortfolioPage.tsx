import { useEffect, useState } from 'react';
import { RefreshCw, WalletCards } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { tradingCoreRuntime } from '../services/runtime/TradingCoreRuntime';
import { AccountFunds, Holding, OrderResult, Position, TradeRecord } from '../services/brokers/BrokerAdapter';

const fmt = (n?: number) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
export function PortfolioPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const [funds, setFunds] = useState<AccountFunds | null>(null); const [positions, setPositions] = useState<Position[]>([]); const [holdings, setHoldings] = useState<Holding[]>([]); const [orders, setOrders] = useState<OrderResult[]>([]); const [trades, setTrades] = useState<TradeRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const sync = async () => { setLoading(true); setError(''); try { const s = await tradingCoreRuntime.syncPortfolio(); setFunds(s.funds); setPositions(s.positions); setHoldings(s.holdings); setOrders(s.orders); setTrades(s.trades); } catch (e: any) { setError(e.message || 'Portfolio sync failed'); } finally { setLoading(false); } };
  useEffect(() => {
    void sync();
    const stop = tradingCoreRuntime.on('PORTFOLIO_SYNCED', (snapshot: any) => {
      setFunds(snapshot.funds); setPositions(snapshot.positions || []); setHoldings(snapshot.holdings || []); setOrders(snapshot.orders || []); setTrades(snapshot.trades || []);
    });
    const stopPolling = tradingCoreRuntime.startPortfolioPolling(5000);
    return () => { stop(); stopPolling(); };
  }, []);
  return <WorkspaceModuleShell active="/portfolio" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="Account & Risk" title="Portfolio" description="A dedicated account view for funds, holdings, positions, orders and executions. Live trading stays isolated on its own page." action={<button onClick={() => void sync()} className="premium-button premium-button-secondary"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Sync broker</button>}/>
    <main className="p-4 md:p-8 space-y-4">
      {error && <div className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 p-3 text-xs text-[#fca5a5]">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Available margin" value={funds ? `₹${fmt(funds.availableMargin)}` : '—'}/><Stat label="Used margin" value={funds ? `₹${fmt(funds.usedMargin)}` : '—'}/><Stat label="Positions" value={String(positions.length)}/><Stat label="Holdings" value={String(holdings.length)}/></div>
      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Open Positions"><List rows={positions.map(p => `${p.symbol} · ${p.quantity} · P&L ₹${fmt(p.pnl)}`)} empty="No open positions."/></Panel><Panel title="Holdings"><List rows={holdings.map(h => `${h.symbol} · ${h.quantity} · LTP ₹${fmt(h.ltp)}`)} empty="No holdings returned."/></Panel><Panel title="Recent Orders"><List rows={orders.slice(0, 10).map(o => `${o.orderId} · ${o.status} · ${o.timestamp}`)} empty="No orders returned."/></Panel><Panel title="Recent Trades"><List rows={trades.slice(0, 10).map(t => `${t.symbol} · ${t.side} · ${t.quantity} @ ₹${fmt(t.price)}`)} empty="No trades returned."/></Panel></div>
    </main>
  </WorkspaceModuleShell>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-4"><div className="text-[9px] font-mono uppercase tracking-widest text-[#64748b]">{label}</div><div className="mt-2 text-lg font-bold font-mono">{value}</div></div>; }
function List({ rows, empty }: { rows: string[]; empty: string }) { return <div className="space-y-1.5 text-xs font-mono">{rows.length ? rows.map((r, i) => <div key={i} className="rounded-md border border-[#1b1f2a] bg-[#090a0f] p-2 text-[#c9ceda]">{r}</div>) : <div className="text-[#64748b]">{empty}</div>}</div>; }
