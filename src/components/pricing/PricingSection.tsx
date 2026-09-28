import React from 'react';
import { motion } from 'motion/react';
import { Check, Puzzle, Zap, Shield, Cpu } from 'lucide-react';

export const PricingSection: React.FC<{ onSelectPlan?: (planName: string) => void }> = ({ onSelectPlan }) => {
  return (
    <section id="pricing" className="py-28 bg-[var(--tco-surface-2)] border-t border-[#1e2230]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-3 py-1 font-mono text-[11px] text-[var(--tco-muted)] uppercase tracking-wider mb-4">
            OS LICENSING & EXTENSIONS
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--tco-text)] tracking-tight">
            Free OS Core. Expand with Modular Extensions.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[var(--tco-muted)]">
            Simple platform pricing. Your brokerage relationship and broker charges remain separate from TradingCore.
          </p>
        </div>

        {/* Core OS Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
          {/* STARTER OS CORE */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] p-8 flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-xs font-bold text-[var(--tco-muted)] uppercase tracking-wider">
                  OS CORE (STARTER)
                </span>
                <span className="rounded bg-[var(--tco-surface-3)] border border-[#1e2230] px-2.5 py-0.5 font-mono text-[10px] text-[var(--tco-muted)]">
                  LIFETIME FREE
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold text-[var(--tco-text)]">₹0</span>
                <span className="text-xs font-mono text-[var(--tco-muted)]">/ forever</span>
              </div>

              <p className="text-xs text-[var(--tco-muted)] leading-relaxed mb-6">
                Complete browser operating system for discretionary traders connecting 1 broker with standard hotkey capabilities.
              </p>

              <ul className="space-y-3 text-xs font-mono text-[#d1d5db] mb-8">
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[var(--tco-muted)]" /> 1 Connected Broker (Upstox or Fyers)
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Interactive charting workspace
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Hotkey Order Entry (Ctrl+B / Ctrl+S)
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[var(--tco-muted)]" /> Real-time Market Depth (L2) & Watchlist
                </li>
              </ul>
            </div>

            <button
              onClick={() => onSelectPlan && onSelectPlan('Starter')}
              className="w-full rounded-lg border border-[#1e2230] bg-[var(--tco-surface-3)] py-3 text-xs font-bold text-[var(--tco-text)] hover:bg-[var(--tco-hover)] hover:border-[#33384f] transition-all cursor-pointer"
            >
              Launch Free OS Workspace
            </button>
          </motion.div>

          {/* POWER TRADER OS */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative rounded-xl border border-[#33384f] bg-[var(--tco-surface)] p-8 flex flex-col justify-between"
          >
            <div className="absolute -top-3 right-6 rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-3 py-0.5 font-mono text-[10px] font-bold text-[var(--tco-text)] uppercase tracking-wider">
              MOST POPULAR
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-xs font-bold text-[var(--tco-text)] uppercase tracking-wider">
                  POWER TRADER OS
                </span>
                <span className="rounded bg-[var(--tco-surface-3)] border border-[#1e2230] px-2.5 py-0.5 font-mono text-[10px] text-[var(--tco-text)]">
                  FULL SUITE
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold text-[var(--tco-text)]">₹999</span>
                <span className="text-xs font-mono text-[var(--tco-muted)]">/ month</span>
              </div>

              <p className="text-xs text-[var(--tco-muted)] leading-relaxed mb-6">
                For active traders who need a broader workspace, advanced hotkeys, option analytics and risk controls.
              </p>

              <ul className="space-y-3 text-xs font-mono text-[#d1d5db] mb-8">
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#3b82f6]" /> Multiple broker connections as supported integrations expand
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#3b82f6]" /> Multi-Chart Grid (2x2 & 4x1 Layouts)
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#3b82f6]" /> Advanced Hotkey Macro Engine & Splitting
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#3b82f6]" /> Real-time Option Chain & PCR Analytics
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#3b82f6]" /> Automated Daily Max Loss Guardrails
                </li>
              </ul>
            </div>

            <button
              onClick={() => onSelectPlan && onSelectPlan('Power Trader')}
              className="w-full rounded-lg bg-[#3b82f6] py-3 text-xs font-bold text-[var(--tco-surface-2)] hover:bg-[#2563eb] transition-all cursor-pointer"
            >
              Get Power Trader OS
            </button>
          </motion.div>
        </div>

        {/* Extensions & Plugins Section */}
        <div className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] p-6 sm:p-8">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--tco-muted)] mb-2 font-bold">
            <Puzzle className="h-4 w-4 text-[var(--tco-muted)]" />
            <span>OS EXTENSIONS & MARKETPLACE PLUGINS</span>
          </div>
          <h3 className="text-lg font-bold text-[var(--tco-text)] mb-2">
            Customize your workspace with modular extensions.
          </h3>
          <p className="text-xs text-[var(--tco-muted)] leading-relaxed max-w-3xl mb-6">
            Add specialized extensions on top of any core tier as your trading strategies evolve.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-4 flex flex-col justify-between">
              <div>
                <span className="text-[var(--tco-text)] font-bold block mb-1">Scalper Overdrive</span>
                <span className="text-[var(--tco-muted)] text-[11px] block leading-relaxed mb-3">Advanced market-data workflows and depth views as supported by the connected broker.</span>
              </div>
              <div className="pt-2 border-t border-[#1e2230] flex justify-between items-center text-[10px]">
                <span className="text-[var(--tco-muted)]">Pricing TBA</span>
                <span className="text-[var(--tco-muted)] font-semibold">Planned</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-4 flex flex-col justify-between">
              <div>
                <span className="text-[var(--tco-text)] font-bold block mb-1">Market Models</span>
                <span className="text-[var(--tco-muted)] text-[11px] block leading-relaxed mb-3">Institutional VWAP, IV skew, and Delta neutral models.</span>
              </div>
              <div className="pt-2 border-t border-[#1e2230] flex justify-between items-center text-[10px]">
                <span className="text-[var(--tco-muted)]">Pricing TBA</span>
                <span className="text-[var(--tco-muted)] font-semibold">Planned</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-4 flex flex-col justify-between">
              <div>
                <span className="text-[var(--tco-text)] font-bold block mb-1">AI Co-Pilot</span>
                <span className="text-[var(--tco-muted)] text-[11px] block leading-relaxed mb-3">Real-time trade journaling & automated setup scoring.</span>
              </div>
              <div className="pt-2 border-t border-[#1e2230] flex justify-between items-center text-[10px]">
                <span className="text-[var(--tco-muted)]">Pricing TBA</span>
                <span className="text-[var(--tco-muted)] font-semibold">Planned</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1e2230] bg-[var(--tco-surface-2)] p-4 flex flex-col justify-between">
              <div>
                <span className="text-[var(--tco-text)] font-bold block mb-1">CoreSpirit Scripting</span>
                <span className="text-[var(--tco-muted)] text-[11px] block leading-relaxed mb-3">Custom TypeScript automated execution scripts & hooks.</span>
              </div>
              <div className="pt-2 border-t border-[#1e2230] flex justify-between items-center text-[10px]">
                <span className="text-[var(--tco-muted)]">Pricing TBA</span>
                <span className="text-[var(--tco-muted)] font-semibold">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
