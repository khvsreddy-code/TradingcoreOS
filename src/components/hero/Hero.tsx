import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Activity,
  ChevronRight,
} from 'lucide-react';

interface HeroProps {
  onLaunch: () => void;
}

const candles = [
  { x: 54, o: 116, c: 108, h: 101, l: 122 },
  { x: 92, o: 110, c: 116, h: 106, l: 122 },
  { x: 130, o: 114, c: 98, h: 94, l: 119 },
  { x: 168, o: 99, c: 91, h: 86, l: 104 },
  { x: 206, o: 92, c: 101, h: 87, l: 106 },
  { x: 244, o: 102, c: 82, h: 77, l: 106 },
  { x: 282, o: 83, c: 88, h: 78, l: 94 },
  { x: 320, o: 89, c: 68, h: 62, l: 93 },
  { x: 358, o: 70, c: 76, h: 65, l: 81 },
  { x: 396, o: 77, c: 58, h: 53, l: 81 },
  { x: 434, o: 59, c: 63, h: 51, l: 67 },
  { x: 472, o: 64, c: 45, h: 39, l: 69 },
  { x: 510, o: 47, c: 53, h: 42, l: 58 },
  { x: 548, o: 54, c: 34, h: 28, l: 59 },
];

export const Hero: React.FC<HeroProps> = ({ onLaunch }) => {
  return (
    <section className="relative overflow-hidden pb-24 pt-14 sm:pb-28 sm:pt-20">
      <div className="hero-grid pointer-events-none absolute inset-0" />
      <div className="hero-orb hero-orb-a pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full" />
      <div className="hero-orb hero-orb-b pointer-events-none absolute right-0 top-0 h-[34rem] w-[34rem] rounded-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/40 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="eyebrow mb-6 inline-flex items-center gap-2"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3b82f6]/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3b82f6]" />
              </span>
              BROWSER-BASED TRADING OPERATING SYSTEM
              <span className="font-mono text-[8px] text-[#596175]">NSE / BSE</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="hero-title"
            >
              Your broker.
              <span className="hero-gradient-text"> Your trading OS.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.13 }}
              className="mt-6 max-w-xl text-base leading-8 text-[#aeb4c4] sm:text-lg"
            >
              TradingCore brings charts, broker execution, options, portfolio views, analytics and risk controls into one browser-native workspace built around your connected account.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
            >
              <button onClick={onLaunch} className="premium-button premium-button-primary group">
                Connect broker & start
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <a href="#workspace-preview" className="premium-button premium-button-secondary group">
                See the workspace
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.28 }}
              className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#7f879b]"
            >
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#3b82f6]" /> OAuth broker authorization</span>
              <span className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-[#60a5fa]" /> Browser-native execution</span>
              <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-[#c084fc]" /> Live market workspace</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.34 }}
              className="mt-10 grid max-w-xl grid-cols-3 border-y border-[#1e2230]/80 py-4"
            >
              {[
                ['01', 'Connect', 'Your broker account'],
                ['02', 'Analyze', 'Models + structure'],
                ['03', 'Execute', 'Orders + risk'],
              ].map(([n, title, copy]) => (
                <div key={n} className="pr-4 last:pr-0">
                  <div className="font-mono text-[9px] tracking-[0.18em] text-[#596175]">{n}</div>
                  <div className="mt-1 text-sm font-semibold text-[#f3f4f6]">{title}</div>
                  <div className="mt-1 text-[10px] leading-4 text-[#687187]">{copy}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 28, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="product-glow pointer-events-none absolute -inset-10 rounded-[3rem]" />
            <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.09] bg-[#0a0d14]/95 shadow-[0_35px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <div className="flex h-11 items-center gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]/70" />
                </div>
                <div className="flex h-6 flex-1 items-center rounded-md border border-white/[0.06] bg-[#0b0e15] px-3 font-mono text-[9px] text-[#5d667a]">
                  tradingcoreos.vercel.app / workspace
                </div>
                <div className="hidden items-center gap-1.5 font-mono text-[9px] text-[#6f7890] sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" /> DEMO PREVIEW
                </div>
              </div>

              <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-xs font-black text-[#3b82f6]">TC</div>
                  <div>
                    <div className="text-[11px] font-bold text-[#f3f4f6]">TradingCore OS</div>
                    <div className="font-mono text-[8px] text-[#687187]">NIFTY 50 · NSE · 5m</div>
                  </div>
                </div>
                <div className="hidden gap-5 font-mono text-[9px] text-[#657087] md:flex">
                  <span className="text-[#3b82f6]">AUTOMATIONS</span><span>MODELS</span><span>INDICATORS</span><span>PORTFOLIO</span>
                </div>
              </div>

              <div className="grid grid-cols-[148px_1fr_170px] bg-[#0b1422]">
                <div className="border-r border-white/[0.06]">
                  <div className="border-b border-white/[0.06] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.16em] text-[#69748a]">Watchlist</div>
                  {[
                    ['NIFTY 50', '24,175.65', '+0.35%'],
                    ['BANKNIFTY', '54,212.40', '+0.61%'],
                    ['FINNIFTY', '26,108.20', '+0.18%'],
                    ['RELIANCE', '1,411.90', '-0.22%'],
                    ['HDFCBANK', '1,942.50', '+0.44%'],
                  ].map(([name, price, chg], i) => (
                    <div key={name} className={`border-b border-white/[0.04] px-3 py-2.5 font-mono ${i === 0 ? 'bg-[#3b82f6]/[0.07]' : ''}`}>
                      <div className="flex justify-between text-[9px]">
                        <span className="font-semibold text-[#dfe3eb]">{name}</span>
                        <span className={chg.startsWith('-') ? 'text-[#fb7185]' : 'text-[#60a5fa]'}>{chg}</span>
                      </div>
                      <div className="mt-1 text-[9px] text-[#747e93]">{price}</div>
                    </div>
                  ))}
                </div>

                <div className="relative min-h-[350px] overflow-hidden">
                  <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:42px_42px]" />
                  <div className="absolute left-3 right-3 top-3 flex items-center justify-between font-mono text-[8px] text-[#667086]">
                    <span>O 24,091 · H 24,212 · L 24,040 · <b className="text-[#f3f4f6]">C 24,175</b></span>
                    <span className="text-[#60a5fa]">+84.80</span>
                  </div>
                  <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="absolute inset-x-0 top-10 h-52 w-full">
                    <defs>
                      <linearGradient id="heroArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#3b82f6" stopOpacity=".22" />
                        <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M30 135 L30 116 L80 110 L120 115 L160 92 L200 101 L240 78 L280 88 L320 65 L360 72 L400 48 L440 57 L480 35 L520 43 L565 22 L565 135 Z" fill="url(#heroArea)" />
                    <path d="M30 116 L80 110 L120 115 L160 92 L200 101 L240 78 L280 88 L320 65 L360 72 L400 48 L440 57 L480 35 L520 43 L565 22" fill="none" stroke="#60a5fa" strokeWidth="2.2" />
                    <line x1="25" x2="575" y1="78" y2="78" stroke="#a78bfa" strokeDasharray="5 5" opacity=".7" />
                    {candles.slice(5).map((c, i) => (
                      <line key={i} x1={c.x} x2={c.x} y1={c.h} y2={c.l} stroke="#dbeafe" strokeWidth="1" opacity=".45" />
                    ))}
                  </svg>
                  <div className="absolute left-[56%] top-[35%] rounded-md border border-[#a78bfa]/30 bg-[#111522]/90 px-2 py-1 font-mono text-[8px] text-[#d8b4fe] shadow-lg">VWAP 24,148</div>
                  <div className="absolute right-3 top-[42%] rounded bg-[#3b82f6] px-2 py-1 font-mono text-[8px] font-bold text-[#06100c] shadow-[0_0_18px_rgba(59,130,246,.25)]">24,175.65</div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg border border-white/[0.07] bg-[#0b0e16]/90 px-3 py-2 font-mono text-[8px] text-[#8b95aa] backdrop-blur">
                    <span className="text-[#60a5fa]">BUY 82%</span><span className="text-[#525c70]">•</span><span>BOS CONFIRMED</span><span className="text-[#525c70]">•</span><span>RR 2.8</span>
                  </div>
                </div>

                <div className="border-l border-[#222636] bg-[#090a0f]">
                  <div className="flex border-b border-white/[0.06] font-mono text-[8px]">
                    <span className="flex-1 border-b border-[#3b82f6] bg-[#3b82f6]/[0.05] py-2 text-center text-[#f3f4f6]">ORDER</span>
                    <span className="flex-1 py-2 text-center text-[#69748a]">POSITIONS</span>
                  </div>
                  <div className="space-y-3 p-3 font-mono">
                    <div className="text-[8px] uppercase tracking-[0.14em] text-[#69748a]">NIFTY 50</div>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] bg-[#0b0e15] p-1">
                      <div className="rounded bg-[#3b82f6]/15 py-1.5 text-center text-[9px] font-bold text-[#60a5fa]">BUY</div>
                      <div className="py-1.5 text-center text-[9px] text-[#69748a]">SELL</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-[#0b0e15] p-2.5">
                      <div className="flex justify-between text-[8px] text-[#69748a]"><span>Qty</span><span className="text-[#e5e7eb]">25</span></div>
                      <div className="mt-2 flex justify-between text-[8px] text-[#69748a]"><span>Margin</span><span className="text-[#e5e7eb]">₹1.25L</span></div>
                    </div>
                    <div className="rounded-lg bg-[#3b82f6] py-2 text-center text-[8px] font-black tracking-wider text-[#06100c]">BUY MARKET</div>
                    <div className="border-t border-white/[0.06] pt-3">
                      <div className="flex justify-between text-[8px]"><span className="text-[#69748a]">Net P&amp;L</span><span className="text-[#60a5fa]">+₹1,725</span></div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa]" /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-5 -left-5 hidden rounded-xl border border-white/[0.08] bg-[#10203a]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:block"
            >
              <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#687187]">Signal engine</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-bold text-[#f3f4f6]"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Bullish confluence <span className="font-mono text-[#60a5fa]">84%</span></div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 7, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -right-4 top-20 hidden rounded-xl border border-white/[0.08] bg-[#10203a]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:block"
            >
              <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#687187]">Execution</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-bold text-[#f3f4f6]"><span className="h-2 w-2 rounded-full bg-[#60a5fa]" /> Broker connected</div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
