import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Grid, Command, BarChart3, ShieldAlert, Check } from 'lucide-react';

export const FeaturesDeepDive: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState<'multiChart' | 'hotkeys' | 'optionChain' | 'risk'>('multiChart');

  return (
    <section id="features" className="py-28 bg-[var(--tco-surface-2)] border-t border-[#1e2230]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-3 py-1 font-mono text-[11px] text-[var(--tco-muted)] uppercase tracking-wider mb-4">
            PRECISION FEATURE MATRIX
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--tco-text)] tracking-tight">
            Engineered for active discretionary traders.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[var(--tco-muted)]">
            Every module is crafted to reduce operational friction and maximize situational awareness during volatile market hours.
          </p>
        </div>

        {/* Feature Selector Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {[
            { id: 'multiChart', label: 'Multi-Chart Grid Layouts', icon: Grid },
            { id: 'hotkeys', label: 'Hotkey Execution Engine', icon: Command },
            { id: 'optionChain', label: 'Option Chain & OI Ratios', icon: BarChart3 },
            { id: 'risk', label: 'Automated Risk Guardrails', icon: ShieldAlert },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeFeature === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveFeature(item.id as any)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#33384f] bg-[var(--tco-surface-3)] text-[var(--tco-text)] font-bold'
                    : 'border-[#1e2230] bg-[var(--tco-surface)] text-[var(--tco-muted)] hover:text-[var(--tco-text)] hover:border-[#33384f]'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-[var(--tco-text)]' : 'text-[var(--tco-muted)]'}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Feature Display Container */}
        <div className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] p-6 sm:p-8 min-h-[380px] flex flex-col justify-between">
          {activeFeature === 'multiChart' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
            >
              <div className="space-y-4">
                <span className="font-mono text-xs text-[var(--tco-muted)] font-bold">[MODULE 01]</span>
                <h3 className="text-2xl font-bold text-[var(--tco-text)]">
                  Synchronized 2x2 & 4x1 Multi-Chart Windows
                </h3>
                <p className="text-sm text-[var(--tco-muted)] leading-relaxed">
                  Monitor NIFTY, BANKNIFTY, FINNIFTY and stock options simultaneously. Synchronize crosshair movements, timeframes, and drawings across all active chart panes in real time.
                </p>
                <ul className="space-y-2 text-xs font-mono text-[#d1d5db]">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Independent or linked symbol tickers
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> One-click layout switching (1x1, 2x1, 2x2, 3x2)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> High-performance interactive chart rendering
                  </li>
                </ul>
              </div>

              {/* Visual Mockup representation */}
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-3 font-mono text-[10px]">
                {['NIFTY 50 · 5m', 'BANKNIFTY · 5m', 'RELIANCE · 15m', 'HDFCBANK · 1m'].map((chart, i) => (
                  <div key={i} className="rounded border border-[#1e2230] bg-[var(--tco-surface-3)] p-3 min-h-[110px] flex flex-col justify-between">
                    <div className="flex justify-between text-[var(--tco-muted)]">
                      <span className="font-bold text-[var(--tco-text)]">{chart}</span>
                      <span className="text-[#3b82f6]">+0.85%</span>
                    </div>
                    <svg className="w-full h-10" viewBox="0 0 100 30">
                      <path
                        d="M0,20 Q25,5 50,18 T100,5"
                        fill="none"
                        stroke={i % 2 === 0 ? '#3b82f6' : '#3b82f6'}
                        strokeWidth="2"
                      />
                    </svg>
                    <div className="flex justify-between text-[9px] text-[var(--tco-muted)]">
                      <span>LTP: ₹22,124</span>
                      <span>Vol: 1.2M</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeFeature === 'hotkeys' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
            >
              <div className="space-y-4">
                <span className="font-mono text-xs text-[var(--tco-muted)] font-bold">[MODULE 02]</span>
                <h3 className="text-2xl font-bold text-[var(--tco-text)]">
                  Full Keyboard Dominance & Macro Triggers
                </h3>
                <p className="text-sm text-[var(--tco-muted)] leading-relaxed">
                  Never miss an entry waiting for a mouse click. Trigger market orders, split lot sizing, or emergency position flattens from the keyboard without leaving the chart.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded border border-[#1e2230] bg-[var(--tco-surface-3)] p-2.5">
                    <span className="text-[#3b82f6] font-bold block">Ctrl + Enter</span>
                    <span className="text-[var(--tco-muted)] text-[11px]">Submit Active Order</span>
                  </div>
                  <div className="rounded border border-[#1e2230] bg-[var(--tco-surface-3)] p-2.5">
                    <span className="text-[#ef4444] font-bold block">Shift + Esc</span>
                    <span className="text-[var(--tco-muted)] text-[11px]">Flatten All Positions</span>
                  </div>
                  <div className="rounded border border-[#1e2230] bg-[var(--tco-surface-3)] p-2.5">
                    <span className="text-[#3b82f6] font-bold block">Ctrl + B</span>
                    <span className="text-[var(--tco-muted)] text-[11px]">Quick Buy Market</span>
                  </div>
                  <div className="rounded border border-[#1e2230] bg-[var(--tco-surface-3)] p-2.5">
                    <span className="text-[#f59e0b] font-bold block">Ctrl + S</span>
                    <span className="text-[var(--tco-muted)] text-[11px]">Quick Sell Market</span>
                  </div>
                </div>
              </div>

              {/* Hotkey Console Preview */}
              <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-4 font-mono text-xs text-[var(--tco-muted)] space-y-2">
                <div className="flex items-center justify-between border-b border-[#1e2230] pb-2 text-[11px] text-[var(--tco-text)]">
                  <span>HOTKEY TELEMETRY LOG</span>
                  <span className="text-[#3b82f6]">SYSTEM ACTIVE</span>
                </div>
                <div className="text-[11px] space-y-1">
                  <p className="text-[#3b82f6]">15:24:01.002 [HOTKEY] Ctrl+B executed -&gt; BUY 25 BANKNIFTY 47500 CE @ 312.45</p>
                  <p className="text-[#3b82f6]">15:24:01.018 [BROKER API] Broker response received</p>
                  <p className="text-[#d1d5db]">15:24:05.110 [SL TRAIL] Dragged Stop Loss to 47000.00</p>
                  <p className="text-[var(--tco-muted)]">15:25:00.000 [SYSTEM] Waiting for key combination...</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeFeature === 'optionChain' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
            >
              <div className="space-y-4">
                <span className="font-mono text-xs text-[var(--tco-muted)] font-bold">[MODULE 03]</span>
                <h3 className="text-2xl font-bold text-[var(--tco-text)]">
                  Real-time Option Chain & PCR Analysis
                </h3>
                <p className="text-sm text-[var(--tco-muted)] leading-relaxed">
                  Analyze Call vs Put Open Interest (OI), delta, gamma, and IV skew for NIFTY & BANKNIFTY options with auto-calculated Put-Call Ratios (PCR).
                </p>
                <ul className="space-y-2 text-xs font-mono text-[#d1d5db]">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Max Pain & Heavy OI Strike Highlighting
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> One-click Option Buying / Selling directly from chain
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Multi-leg Straddle & Strangle Strategy Builder
                  </li>
                </ul>
              </div>

              {/* Option Chain Snippet */}
              <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-3 font-mono text-[10px]">
                <div className="grid grid-cols-7 py-1 text-[var(--tco-muted)] uppercase tracking-wider border-b border-[#1e2230]">
                  <span>CALL OI</span>
                  <span>CALL LTP</span>
                  <span>DELTA</span>
                  <span className="text-center font-bold text-[var(--tco-text)]">STRIKE</span>
                  <span>DELTA</span>
                  <span>PUT LTP</span>
                  <span>PUT OI</span>
                </div>
                {[
                  { callOi: '42.5L', callLtp: 420.5, strike: 47200, putLtp: 110.2, putOi: '18.2L' },
                  { callOi: '58.1L', callLtp: 312.45, strike: 47300, putLtp: 186.3, putOi: '32.4L', isAtMoney: true },
                  { callOi: '22.0L', callLtp: 210.8, strike: 47400, putLtp: 295.1, putOi: '64.8L' },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-7 py-2 border-b border-[#1e2230]/40 items-center ${
                      row.isAtMoney ? 'bg-[var(--tco-hover)] text-[var(--tco-text)] font-bold' : 'text-[var(--tco-muted)]'
                    }`}
                  >
                    <span className="text-[#3b82f6]">{row.callOi}</span>
                    <span className="text-[var(--tco-text)]">₹{row.callLtp}</span>
                    <span>0.52</span>
                    <span className="text-center text-[#3b82f6] font-bold">{row.strike}</span>
                    <span>-0.48</span>
                    <span className="text-[var(--tco-text)]">₹{row.putLtp}</span>
                    <span className="text-[#ef4444]">{row.putOi}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeFeature === 'risk' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
            >
              <div className="space-y-4">
                <span className="font-mono text-xs text-[var(--tco-muted)] font-bold">[MODULE 04]</span>
                <h3 className="text-2xl font-bold text-[var(--tco-text)]">
                  Automated Daily Max Loss Guardrails
                </h3>
                <p className="text-sm text-[var(--tco-muted)] leading-relaxed">
                  Protect your capital from over-trading and emotional drawdowns. Set hard daily loss limits that automatically lock order placement for the rest of the session.
                </p>
                <ul className="space-y-2 text-xs font-mono text-[#d1d5db]">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Custom Daily Drawdown Threshold (e.g. ₹5,000)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Emergency Kill-Switch with mandatory cooling period
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Hard Stop Loss auto-injection on every filled order
                  </li>
                </ul>
              </div>

              {/* Risk Alert Panel */}
              <div className="rounded-lg border border-[#ef4444]/30 bg-[#12080a] p-5 font-mono text-xs space-y-3">
                <div className="flex items-center gap-2 text-[#ef4444] font-bold">
                  <ShieldAlert className="h-5 w-5" />
                  <span>RISK GUARDRAIL ACTIVE</span>
                </div>
                <p className="text-xs text-[#d1d5db] leading-relaxed">
                  Daily Loss Limit set to <strong className="text-[var(--tco-text)]">₹10,000.00</strong>. Current Unrealized P&L is <strong className="text-[#3b82f6]">+₹1,725.00</strong>. System will auto-square-off if P&L reaches -₹10,000.00.
                </p>
                <div className="w-full bg-[#1e2230] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#3b82f6] h-full w-[20%]" />
                </div>
                <span className="text-[10px] text-[var(--tco-muted)] block text-right">0% Drawdown Limit Reached</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
};
