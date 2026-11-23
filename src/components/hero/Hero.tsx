import React from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowUpRight, ShieldCheck, Zap } from 'lucide-react';

interface HeroProps {
  onLaunch: () => void;
}

const sampleWatchlist = [
  { symbol: 'NIFTY 50', price: '24,175.65', change: '+0.35%' },
  { symbol: 'BANKNIFTY', price: '54,212.40', change: '+0.61%' },
  { symbol: 'FINNIFTY', price: '26,108.20', change: '+0.18%' },
];

export const Hero: React.FC<HeroProps> = ({ onLaunch }) => (
  <section id="workspace-entry" className="relative overflow-hidden pb-16 pt-12 sm:pb-20 sm:pt-16">
    <div className="hero-grid pointer-events-none absolute inset-0" />
    <div className="hero-orb hero-orb-a pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full" />
    <div className="hero-orb hero-orb-b pointer-events-none absolute right-0 top-0 h-[34rem] w-[34rem] rounded-full" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/40 to-transparent" />

    <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
      <div className="grid items-center gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:gap-12">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="eyebrow mb-5 inline-flex items-center gap-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" />
            MARKET WORKSPACE · ANALYSIS · EXECUTION · RESEARCH
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="hero-title"
          >
            Your entire trading workflow.
            <span className="hero-gradient-text"> One workspace.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mt-5 max-w-xl text-base leading-7 text-[#aeb4c4] sm:text-lg"
          >
            Charts, market structure, options analysis, risk and CoreSpirit tools — organized around the broker account you choose to connect.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <button onClick={onLaunch} className="premium-button premium-button-primary group">
              Open workspace
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <a href="/explore/indicators" className="premium-button premium-button-secondary group">
              Explore CoreSpirit
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.24 }}
            className="mt-4 max-w-xl text-[11px] leading-5 text-[#778197]"
          >
            Sign in to enter. Broker authorization is a separate step for broker-backed market data, account information and order workflows.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.28 }}
            className="mt-8 flex flex-wrap gap-x-5 gap-y-3 border-t border-[#1e2230]/80 pt-5 text-[11px] text-[#8791a5]"
          >
            <span className="inline-flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#60a5fa]" /> Market workspace</span>
            <span className="inline-flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-[#60a5fa]" /> CoreSpirit research</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#60a5fa]" /> Broker-controlled execution</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.99 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-w-0"
          aria-label="Illustrative TradingCore workspace preview. Sample values only; no live market connection or order execution."
        >
          <div className="product-glow pointer-events-none absolute -inset-8 rounded-[2.5rem]" />
          <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.09] bg-[#0a0d14]/95 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
            <div className="flex h-10 items-center gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]/70" />
              </div>
              <div className="flex h-6 min-w-0 flex-1 items-center rounded-md border border-white/[0.06] bg-[var(--tco-surface-2)] px-3 font-mono text-[9px] text-[#687187]">
                TradingCore / workspace
              </div>
              <span className="shrink-0 rounded border border-[#60a5fa]/25 bg-[#60a5fa]/[0.08] px-2 py-1 font-mono text-[8px] font-semibold tracking-wide text-[#93c5fd]">
                ILLUSTRATIVE PREVIEW
              </span>
            </div>

            <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-3 sm:px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[11px] font-black text-[#60a5fa]">TC</div>
                <div>
                  <div className="text-[10px] font-bold text-[var(--tco-text)]">TradingCore OS</div>
                  <div className="font-mono text-[8px] text-[#687187]">NIFTY 50 · 5m · SAMPLE SERIES</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d6a85b]/20 bg-[#d6a85b]/[0.06] px-2 py-1 font-mono text-[8px] text-[#d8b77d]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d6a85b]" />
                NOT CONNECTED
              </span>
            </div>

            <div className="grid grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[142px_minmax(0,1fr)_156px]">
              <aside className="border-r border-white/[0.06] bg-[#0b0e16]">
                <div className="border-b border-white/[0.05] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#6f7a90]">Watchlist · sample</div>
                {sampleWatchlist.map((item, index) => (
                  <div key={item.symbol} className={`border-b border-white/[0.04] px-2.5 py-3 font-mono ${index === 0 ? 'bg-[#3b82f6]/[0.07]' : ''}`}>
                    <div className="text-[8px] font-semibold text-[#dfe3eb]">{item.symbol}</div>
                    <div className="mt-1 text-[8px] text-[#8791a5]">{item.price}</div>
                    <div className="mt-0.5 text-[8px] text-[#60a5fa]">{item.change}</div>
                  </div>
                ))}
              </aside>

              <div className="relative min-h-[280px] min-w-0 overflow-hidden bg-[#0b1422] sm:min-h-[340px]">
                <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:38px_38px]" />
                <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2 font-mono text-[8px] text-[#778197]">
                  <span>ILLUSTRATIVE MARKET VIEW</span>
                  <span className="text-[#93c5fd]">VWAP · STRUCTURE</span>
                </div>
                <svg viewBox="0 0 600 250" preserveAspectRatio="none" className="absolute inset-x-0 top-10 h-[78%] w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="heroSampleArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#60a5fa" stopOpacity=".2" />
                      <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M18 214 L18 194 L66 183 L105 189 L146 163 L190 176 L230 142 L270 151 L310 118 L350 132 L390 96 L430 108 L470 72 L510 83 L565 48 L565 214 Z" fill="url(#heroSampleArea)" />
                  <path d="M18 194 L66 183 L105 189 L146 163 L190 176 L230 142 L270 151 L310 118 L350 132 L390 96 L430 108 L470 72 L510 83 L565 48" fill="none" stroke="#60a5fa" strokeWidth="2.4" />
                  <path d="M18 174 C120 162 180 170 270 144 S430 126 565 108" fill="none" stroke="#c084fc" strokeWidth="1.2" strokeDasharray="5 6" opacity=".7" />
                  {[72, 148, 224, 300, 376, 452, 528].map((x, index) => (
                    <line key={x} x1={x} x2={x} y1={80 + (index % 3) * 15} y2={205 - (index % 2) * 10} stroke="#dbeafe" strokeWidth="1" opacity=".18" />
                  ))}
                </svg>
                <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-[#090d14]/90 px-2.5 py-2 font-mono text-[8px] text-[#9aa4b8] backdrop-blur">
                  <span className="text-[#93c5fd]">VWAP</span>
                  <span className="text-[#596579]">·</span>
                  <span>MARKET STRUCTURE</span>
                  <span className="text-[#596579]">·</span>
                  <span>VOLUME</span>
                </div>
              </div>

              <aside className="col-span-2 border-t border-white/[0.06] bg-[var(--tco-surface-2)] sm:col-span-1 sm:border-l sm:border-t-0">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-3 font-mono text-[8px]">
                  <span className="text-[#aeb7c8]">ORDER TICKET</span>
                  <span className="text-[#d8b77d]">PREVIEW ONLY</span>
                </div>
                <div className="space-y-3 p-3 font-mono">
                  <div>
                    <div className="text-[8px] text-[#727e94]">INSTRUMENT · SAMPLE</div>
                    <div className="mt-1 text-[10px] font-bold text-[var(--tco-text)]">NIFTY 50</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] bg-[var(--tco-bg)] p-1 text-center text-[8px]">
                    <span className="rounded bg-[#60a5fa]/10 py-2 text-[#93c5fd]">BUY</span>
                    <span className="py-2 text-[#758096]">SELL</span>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--tco-bg)] p-2.5">
                    <div className="flex justify-between text-[8px] text-[#7d879b]"><span>Quantity</span><span className="text-[#cbd2df]">25 · sample</span></div>
                    <div className="mt-2 flex justify-between text-[8px] text-[#7d879b]"><span>Order type</span><span className="text-[#cbd2df]">Market</span></div>
                  </div>
                  <button type="button" disabled aria-label="Orders are disabled in the illustrative preview" className="w-full cursor-not-allowed rounded-lg border border-white/[0.08] bg-white/[0.035] py-2.5 text-[8px] font-bold tracking-wide text-[#7d879b]">
                    ORDERS DISABLED IN PREVIEW
                  </button>
                  <p className="text-[8px] leading-4 text-[#778197]">No broker session. Nothing is sent and no order can be placed here.</p>
                </div>
              </aside>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#090d14] px-3 py-2.5 sm:px-4">
              <span className="font-mono text-[8px] text-[#7d879b]">SAMPLE VALUES · NOT A LIVE MARKET FEED</span>
              <span className="font-mono text-[8px] text-[#7d879b]">LIVE DATA REQUIRES BROKER AUTHORIZATION</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);
