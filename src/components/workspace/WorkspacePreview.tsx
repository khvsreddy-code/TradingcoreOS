import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Bell,
  Bot,
  Crosshair,
  Layers3,
  Plus,
  Search,
  Settings,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { WatchlistItem, DepthRow, PositionItem } from '../../types/landing';
import { ShowcaseChart } from './ShowcaseChart';

const WATCHLIST_DATA: WatchlistItem[] = [
  { symbol: 'NIFTY 50', ltp: 24175.65, change: 84.8, changePercent: 0.35 },
  { symbol: 'BANKNIFTY', ltp: 54212.4, change: 330.1, changePercent: 0.61 },
  { symbol: 'FINNIFTY', ltp: 26108.2, change: 46.7, changePercent: 0.18 },
  { symbol: 'RELIANCE', ltp: 1411.9, change: -3.15, changePercent: -0.22 },
  { symbol: 'TCS', ltp: 3218.4, change: 12.8, changePercent: 0.4 },
  { symbol: 'HDFCBANK', ltp: 1942.5, change: 8.6, changePercent: 0.44 },
  { symbol: 'INFY', ltp: 1518.2, change: -2.4, changePercent: -0.16 },
  { symbol: 'ICICIBANK', ltp: 1340.5, change: 5.2, changePercent: 0.39 },
];

const DEPTH_DATA: DepthRow[] = [
  { bidQty: 125, bidPrice: 54198.65, askPrice: 54200.1, askQty: 92 },
  { bidQty: 180, bidPrice: 54197.4, askPrice: 54201.25, askQty: 135 },
  { bidQty: 240, bidPrice: 54195.9, askPrice: 54202.5, askQty: 220 },
  { bidQty: 310, bidPrice: 54193.85, askPrice: 54204.0, askQty: 265 },
  { bidQty: 420, bidPrice: 54190.5, askPrice: 54206.4, askQty: 350 },
];

const POSITIONS_DATA: PositionItem[] = [
  { id: '1', symbol: 'BANKNIFTY 25 SEP 54500 CE', type: 'NRML', lots: 25, pnl: 2850, ltp: 312.45 },
  { id: '2', symbol: 'NIFTY 25 SEP 24200 PE', type: 'NRML', lots: 25, pnl: -1125, ltp: 186.3 },
];

const CANDLES = [
  { time: '09:45', open: 53980, high: 54040, low: 53930, close: 54020, volume: 2100 },
  { time: '10:00', open: 54020, high: 54090, low: 53980, close: 54070, volume: 2500 },
  { time: '10:15', open: 54070, high: 54115, low: 54020, close: 54045, volume: 1800 },
  { time: '10:30', open: 54045, high: 54180, low: 54030, close: 54155, volume: 4200 },
  { time: '10:45', open: 54155, high: 54210, low: 54120, close: 54190, volume: 3900 },
  { time: '11:00', open: 54190, high: 54230, low: 54145, close: 54205, volume: 3200 },
  { time: '11:15', open: 54205, high: 54220, low: 54155, close: 54178, volume: 2300 },
  { time: '11:30', open: 54178, high: 54270, low: 54165, close: 54242, volume: 4600 },
  { time: '11:45', open: 54242, high: 54255, low: 54195, close: 54218, volume: 2600 },
  { time: '12:00', open: 54218, high: 54295, low: 54205, close: 54270, volume: 5100 },
  { time: '12:15', open: 54270, high: 54320, low: 54245, close: 54305, volume: 5700 },
  { time: '12:30', open: 54305, high: 54328, low: 54240, close: 54265, volume: 3300 },
];

const fmt = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const WorkspacePreview: React.FC<{ onLaunch?: () => void }> = ({ onLaunch }) => {
  const [selectedSymbol, setSelectedSymbol] = useState('BANKNIFTY');
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const [orderSide, setOrderSide] = useState<'Buy' | 'Sell'>('Buy');
  const [quantity, setQuantity] = useState(25);
  const [activeTab, setActiveTab] = useState<'Order' | 'Positions'>('Order');
  const [showLevels, setShowLevels] = useState(true);
  const [showForecast, setShowForecast] = useState(true);

  const selected = WATCHLIST_DATA.find(x => x.symbol === selectedSymbol) || WATCHLIST_DATA[1];

  const levels = useMemo(() => ({
    target: 54520,
    entry: 54212.4,
    stop: 53985,
    vwap: 54168,
  }), []);

  return (
    <section id="workspace-preview" className="relative py-24 sm:py-32">
      <div className="section-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-[1480px] px-3 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="eyebrow mb-4 inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" /> ILLUSTRATIVE WORKSPACE PREVIEW</div>
          <h2 className="section-title">One screen. <span className="hero-gradient-text">Every decision.</span></h2>
          <p className="section-copy">
            A trading terminal designed to feel calm when the market is not. Keep market structure,
            execution, positions and intelligence visible without turning the interface into noise.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="terminal-shell"
        >
          <div className="terminal-chrome">
            <div className="flex items-center gap-1.5">
              <span className="terminal-dot bg-[#ff5f57]" /><span className="terminal-dot bg-[#febc2e]" /><span className="terminal-dot bg-[#28c840]" />
            </div>
            <div className="hidden flex-1 items-center justify-center sm:flex">
              <div className="terminal-address">tradingcoreos.vercel.app/dashboard</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[9px] text-[#667188]"><span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" /> DEMO DATA</div>
          </div>

          <div className="flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#0d111a] px-3 sm:px-4">
            <div className="flex items-center gap-3">
              <div className="brand-chip">TC</div>
              <div>
                <div className="text-[11px] font-bold text-[#f3f4f6]">TradingCore <span className="text-[#34d399]">OS</span></div>
                <div className="font-mono text-[8px] text-[#59647a]">PROFESSIONAL TRADING TERMINAL</div>
              </div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              {[
                ['AUTOMATIONS', Bot],
                ['MODELS', Sparkles],
                ['INDICATORS', Activity],
                ['PORTFOLIO', Wallet],
              ].map(([label, Icon], i) => {
                const I = Icon as typeof Activity;
                return <button key={label as string} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[9px] ${i === 2 ? 'bg-white/[0.05] text-[#f3f4f6]' : 'text-[#69748a] hover:text-white'}`}><I className="h-3 w-3" />{label as string}</button>;
              })}
            </div>
            <button className="hidden rounded-md border border-white/[0.07] p-1.5 text-[#69748a] hover:text-white sm:block"><Settings className="h-3.5 w-3.5" /></button>
          </div>

          <div className="grid min-h-[680px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_270px]">
            <aside className="hidden border-r border-white/[0.06] bg-[#0b0e16] lg:block">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#8a94a9]">Markets</div>
                <div className="flex gap-2 text-[#59647a]"><Plus className="h-3.5 w-3.5" /><Search className="h-3.5 w-3.5" /></div>
              </div>
              <div className="border-b border-white/[0.05] px-3 py-2 font-mono text-[8px] text-[#566177]">WATCHLIST · 8</div>
              <div>
                {WATCHLIST_DATA.map(item => {
                  const active = selectedSymbol === item.symbol;
                  return (
                    <button key={item.symbol} onClick={() => setSelectedSymbol(item.symbol)} className={`flex w-full items-center justify-between border-b border-white/[0.035] px-3 py-2.5 text-left transition ${active ? 'bg-[#10b981]/[0.08]' : 'hover:bg-white/[0.025]'}`}>
                      <div>
                        <div className={`font-mono text-[9px] font-semibold ${active ? 'text-[#f3f4f6]' : 'text-[#b6bdcb]'}`}>{item.symbol}</div>
                        <div className="mt-0.5 text-[8px] text-[#59647a]">NSE · F&amp;O</div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-[9px] text-[#e6e9ef]">{fmt(item.ltp)}</div>
                        <div className={`mt-0.5 text-[8px] ${item.changePercent >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'}`}>{item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-white/[0.06] p-3">
                <div className="mb-2 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.15em] text-[#69748a]"><span>Market depth</span><span className="text-[#34d399]">L2</span></div>
                <div className="space-y-1">
                  {DEPTH_DATA.map((row, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 font-mono text-[8px]">
                      <span className="text-right text-[#34d399]">{row.bidPrice.toFixed(2)} <em className="not-italic text-[#59647a]">{row.bidQty}</em></span>
                      <span className="text-[#fb7185]">{row.askPrice.toFixed(2)} <em className="not-italic text-[#59647a]">{row.askQty}</em></span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <main className="min-w-0 bg-[#070a10]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-mono text-[11px] font-bold text-[#f3f4f6]">{selectedSymbol}</div>
                    <div className="mt-0.5 font-mono text-[8px] text-[#59647a]">NSE · F&amp;O · INDEX</div>
                  </div>
                  <div className="font-mono text-[12px] font-semibold text-[#e8ebf1]">{fmt(selected.ltp)}</div>
                  <div className="rounded-md bg-[#10b981]/10 px-1.5 py-1 font-mono text-[8px] text-[#34d399]">+{selected.changePercent.toFixed(2)}%</div>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#0b0e16] p-0.5">
                  {['1m', '3m', '5m', '15m', '1H', '1D'].map(tf => (
                    <button key={tf} onClick={() => setSelectedTimeframe(tf)} className={`rounded-md px-2 py-1 font-mono text-[8px] transition ${selectedTimeframe === tf ? 'bg-white/[0.08] text-white' : 'text-[#657087] hover:text-white'}`}>{tf}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2 font-mono text-[8px] text-[#5f6a80] sm:px-4">
                <div className="flex items-center gap-3"><span>O 54,190</span><span>H 54,328</span><span>L 54,145</span><span className="text-[#dfe3ea]">C 54,265</span></div>
                <div className="hidden items-center gap-3 sm:flex"><span className="text-[#c084fc]">VWAP 54,168</span><span>ATR 146.8</span></div>
              </div>

              <div className="relative h-[500px] overflow-hidden bg-[#090d14]">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 sm:px-4">
                  <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0a0d14]/88 px-2.5 py-1.5 font-mono text-[8px] backdrop-blur-xl shadow-lg">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#34d399] shadow-[0_0_10px_rgba(52,211,153,.7)]" />
                    <span className="text-[#34d399]">BUY</span><span className="text-[#f3f4f6]">82%</span><span className="text-[#515c71]">•</span><span className="text-[#8b95a9]">BOS CONFIRMED</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-[#a78bfa]/15 bg-[#0a0d14]/88 px-2.5 py-1.5 font-mono text-[8px] text-[#c4b5fd] backdrop-blur-xl shadow-lg">
                    <Sparkles className="h-3 w-3" /> MODEL CONFLUENCE
                  </div>
                </div>
                <ShowcaseChart basePrice={selected.ltp} timeframe={selectedTimeframe} showLevels={showLevels} showForecast={showForecast} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-[#090d14] via-[#090d14]/55 to-transparent" />
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-3 rounded-md border border-white/[0.05] bg-[#090d14]/70 px-2 py-1.5 font-mono text-[7px] text-[#59647a] backdrop-blur sm:flex">
                  <span>SCROLL TO ZOOM</span><span>DRAG TO PAN</span><span>CROSSHAIR ACTIVE</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#0b0e16] px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowLevels(v => !v)} className={`toolbar-pill ${showLevels ? 'toolbar-pill-active' : ''}`}><Layers3 className="h-3 w-3" /> Levels</button>
                  <button onClick={() => setShowForecast(v => !v)} className={`toolbar-pill ${showForecast ? 'toolbar-pill-active-blue' : ''}`}><Crosshair className="h-3 w-3" /> Forecast</button>
                  <span className="toolbar-pill"><Activity className="h-3 w-3 text-[#c084fc]" /> VWAP</span>
                </div>
                <div className="font-mono text-[8px] text-[#59647a]">15:25:30 IST · AUTO SCALE</div>
              </div>
            </main>

            <aside className="border-t border-white/[0.06] bg-[#0b0e16] lg:border-l lg:border-t-0">
              <div className="flex border-b border-white/[0.06] font-mono text-[9px]">
                <button onClick={() => setActiveTab('Order')} className={`flex-1 py-3 ${activeTab === 'Order' ? 'border-b border-[#34d399] bg-[#10b981]/[0.04] text-white' : 'text-[#667188]'}`}>ORDER</button>
                <button onClick={() => setActiveTab('Positions')} className={`flex-1 py-3 ${activeTab === 'Positions' ? 'border-b border-[#34d399] bg-[#10b981]/[0.04] text-white' : 'text-[#667188]'}`}>POSITIONS <span className="text-[#34d399]">(2)</span></button>
              </div>

              {activeTab === 'Order' ? (
                <div className="space-y-4 p-4 font-mono">
                  <div className="rounded-xl border border-white/[0.06] bg-[#070a10] p-3">
                    <div className="flex items-center justify-between text-[8px] text-[#667188]"><span>INSTRUMENT</span><span className="text-[#60a5fa]">NSE F&amp;O</span></div>
                    <div className="mt-1.5 text-[11px] font-bold text-[#f3f4f6]">{selectedSymbol}</div>
                    <div className="mt-1 text-[9px] text-[#59647a]">LTP ₹{fmt(selected.ltp)}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[8px] uppercase tracking-[0.14em] text-[#59647a]">Side</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => setOrderSide('Buy')} className={`rounded-lg py-2 text-[9px] font-bold ${orderSide === 'Buy' ? 'bg-[#10b981]/15 text-[#34d399] ring-1 ring-[#10b981]/40' : 'border border-white/[0.06] text-[#657087]'}`}>BUY</button>
                      <button onClick={() => setOrderSide('Sell')} className={`rounded-lg py-2 text-[9px] font-bold ${orderSide === 'Sell' ? 'bg-[#ef4444]/15 text-[#fb7185] ring-1 ring-[#ef4444]/40' : 'border border-white/[0.06] text-[#657087]'}`}>SELL</button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-[8px] text-[#59647a]"><span>QUANTITY</span><span>LOT 15</span></div>
                    <div className="flex items-center gap-2">
                      <input value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))} type="number" className="w-20 rounded-lg border border-white/[0.07] bg-[#070a10] px-2.5 py-2 text-[10px] text-white outline-none focus:border-[#10b981]/50" />
                      <div className="flex gap-1">
                        {[25, 50, 100].map(q => <button key={q} onClick={() => setQuantity(q)} className="rounded-md border border-white/[0.06] px-2 py-1.5 text-[8px] text-[#687187] hover:text-white">+{q}</button>)}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="flex justify-between text-[8px] text-[#59647a]"><span>EST. MARGIN</span><span className="text-[#e5e7eb]">₹1,25,650</span></div>
                    <button onClick={onLaunch} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-black tracking-[0.12em] ${orderSide === 'Buy' ? 'bg-gradient-to-r from-[#10b981] to-[#14b8a6] text-[#04110c]' : 'bg-gradient-to-r from-[#ef4444] to-[#f43f5e] text-white'}`}>
                      <Zap className="h-3.5 w-3.5" /> {orderSide.toUpperCase()} MARKET
                    </button>
                  </div>
                  <div className="rounded-xl border border-[#60a5fa]/15 bg-[#60a5fa]/[0.04] p-3">
                    <div className="flex items-center gap-2 text-[8px] text-[#93c5fd]"><Bell className="h-3 w-3" /> RISK GUARDRAIL</div>
                    <div className="mt-1.5 text-[9px] text-[#7d889d]">Max daily loss <span className="text-[#dfe3ea]">₹10,000</span></div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full w-[22%] rounded-full bg-[#60a5fa]" /></div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05] p-3 font-mono">
                  {POSITIONS_DATA.map(pos => (
                    <div key={pos.id} className="py-3">
                      <div className="flex items-start justify-between gap-2 text-[9px]"><span className="font-bold text-[#e5e7eb]">{pos.symbol}</span><span className={pos.pnl >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'}>{pos.pnl >= 0 ? '+' : '-'}₹{Math.abs(pos.pnl).toFixed(2)}</span></div>
                      <div className="mt-1 flex justify-between text-[8px] text-[#59647a]"><span>{pos.type} · {pos.lots} lots</span><span>₹{pos.ltp.toFixed(2)}</span></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto border-t border-white/[0.06] bg-[#070a10] p-3">
                <div className="flex items-center justify-between font-mono"><span className="text-[8px] text-[#59647a]">TOTAL NET P&amp;L</span><span className="text-[11px] font-bold text-[#34d399]">+₹1,725.00</span></div>
                <div className="mt-2 flex items-center justify-between text-[8px] text-[#59647a]"><span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3 text-[#34d399]" /> Confluence 84%</span><button onClick={onLaunch} className="text-[#60a5fa] hover:text-white">Launch full OS →</button></div>
              </div>
            </aside>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
