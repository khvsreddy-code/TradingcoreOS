import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useLiveTradingTerminalController } from './hooks/useLiveTradingTerminalController';

type Tab = 'positions' | 'orders' | 'trades';

const money = (value: unknown) => Number.isFinite(Number(value))
  ? '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  : '—';

export function TerminalPortfolioPanel() {
  const { portfolio, message, sync } = useLiveTradingTerminalController();
  const [tab, setTab] = useState<Tab>('positions');
  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'positions', label: 'Positions', count: portfolio.positions.length },
    { id: 'orders', label: 'Orders', count: portfolio.orders.length },
    { id: 'trades', label: 'Trades', count: portfolio.trades.length },
  ];

  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-[#0b1018] p-3 text-[#e5edf7]">
    <header className="flex items-center justify-between gap-3">
      <div><div className="text-[12px] font-semibold">Trading activity</div><div className="mt-1 text-[9px] text-[#8092aa]">Broker-synchronized account snapshot · read-only</div></div>
      <button type="button" onClick={() => void sync()} title="Refresh account activity" className="rounded-lg border border-[#2b3a4d] p-2 text-[#8fa3be] hover:bg-[#172232]"><RefreshCw size={13}/></button>
    </header>
    <nav className="flex gap-1 border-b border-[#263449]" aria-label="Trading activity tabs">
      {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={'flex-1 border-b-2 px-2 py-2 text-[9px] font-semibold ' + (tab === item.id ? 'border-[#60a5fa] text-white' : 'border-transparent text-[#8193aa] hover:text-white')}>{item.label} <span className="ml-1 text-[#71839a]">{item.count}</span></button>)}
    </nav>
    {message && <div role="status" className="text-[9px] text-amber-300">{message}</div>}
    {tab === 'positions' && <div className="space-y-2">
      {portfolio.positions.length ? portfolio.positions.map(item => <article key={item.id} className="rounded-lg border border-[#26364a] bg-[#101925] p-3">
        <div className="flex items-center justify-between gap-2"><b className="text-[10px]">{item.symbol}</b><span className={'text-[10px] font-semibold ' + (item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{money(item.pnl)}</span></div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[8px] text-[#8294ab]"><span>Qty <b className="block text-[#dce7f5]">{item.quantity}</b></span><span>Avg <b className="block text-[#dce7f5]">{money(item.avgPrice)}</b></span><span>LTP <b className="block text-[#dce7f5]">{money(item.ltp)}</b></span></div>
      </article>) : <div className="py-8 text-center text-[10px] text-[#71839a]">No open positions reported by the connected broker.</div>}
    </div>}
    {tab === 'orders' && <div className="space-y-2">
      {portfolio.orders.length ? portfolio.orders.map((item, index) => <article key={item.orderId || index} className="flex items-center justify-between gap-2 rounded-lg border border-[#26364a] bg-[#101925] p-3"><div className="min-w-0"><b className="block truncate text-[9px]">{item.orderId}</b><small className="text-[8px] text-[#71839a]">{new Date(item.timestamp).toLocaleString()}</small></div><span className={'text-[8px] font-bold ' + (item.status === 'COMPLETE' ? 'text-emerald-400' : item.status === 'REJECTED' ? 'text-rose-400' : 'text-amber-300')}>{item.status}</span></article>) : <div className="py-8 text-center text-[10px] text-[#71839a]">No recent orders reported by the connected broker.</div>}
    </div>}
    {tab === 'trades' && <div className="space-y-2">
      {portfolio.trades.length ? portfolio.trades.map(item => <article key={item.tradeId} className="flex items-center justify-between gap-2 rounded-lg border border-[#26364a] bg-[#101925] p-3"><div className="min-w-0"><b className="block truncate text-[10px]">{item.symbol} <span className={item.side === 'Buy' ? 'text-emerald-400' : 'text-rose-400'}>{item.side}</span></b><small className="text-[8px] text-[#71839a]">{item.quantity} × {money(item.price)} · {new Date(item.timestamp).toLocaleString()}</small></div><span className="text-[9px] text-[#a8b9ce]">{item.product}</span></article>) : <div className="py-8 text-center text-[10px] text-[#71839a]">No recent trades reported by the connected broker.</div>}
    </div>}
    <div className="mt-auto flex items-center gap-2 border-t border-[#263449] pt-2 text-[8px] text-[#71839a]"><Activity size={12}/> Orders and positions are read from the connected broker; this panel does not simulate fills.</div>
  </div>;
}
