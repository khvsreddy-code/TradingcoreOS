import React from 'react';
import { motion } from 'motion/react';
import { LogIn, Key, Play } from 'lucide-react';

export const HowItWorks: React.FC<{ onLaunch?: () => void }> = ({ onLaunch }) => {
  return (
    <section id="how-it-works" className="py-28 bg-[#090a0f] border-t border-[#1e2230]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[#11131c] px-3 py-1 font-mono text-[11px] text-[#8c93a6] uppercase tracking-wider mb-4">
            3-STEP SETUP
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#f3f4f6] tracking-tight">
            Up and trading in under 60 seconds.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#8c93a6]">
            No complex installations, no .exe downloads, no database setups. Direct browser execution.
          </p>
        </div>

        {/* 3 Steps Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector Line on Desktop */}
          <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-[1px] bg-[#1e2230] z-0" />

          {/* STEP 1 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="relative z-10 flex flex-col items-center text-center p-6 rounded-xl border border-[#1e2230] bg-[#0c0e15]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#11131c] text-[#f3f4f6] border border-[#1e2230] mb-6 font-mono text-base font-bold">
              01
            </div>
            <h3 className="text-base font-bold text-[#f3f4f6]">Sign In with Google</h3>
            <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
              Create your encrypted session securely using Google Auth or email. Your preferences sync across tabs instantly.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#8c93a6]">
              <LogIn className="h-3.5 w-3.5" /> Instant OAuth 2.0
            </div>
          </motion.div>

          {/* STEP 2 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative z-10 flex flex-col items-center text-center p-6 rounded-xl border border-[#1e2230] bg-[#0c0e15]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#11131c] text-[#f3f4f6] border border-[#1e2230] mb-6 font-mono text-base font-bold">
              02
            </div>
            <h3 className="text-base font-bold text-[#f3f4f6]">Connect Your Broker</h3>
            <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
              Authorize Zerodha, Dhan, Upstox, Angel One, or Fyers. Your capital and stock holdings remain safely inside your broker account.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#8c93a6]">
              <Key className="h-3.5 w-3.5" /> Direct Broker API Token
            </div>
          </motion.div>

          {/* STEP 3 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="relative z-10 flex flex-col items-center text-center p-6 rounded-xl border border-[#1e2230] bg-[#0c0e15]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#11131c] text-[#f3f4f6] border border-[#1e2230] mb-6 font-mono text-base font-bold">
              03
            </div>
            <h3 className="text-base font-bold text-[#f3f4f6]">Launch & Execute</h3>
            <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
              Open the TradingCore workspace, set your hotkeys, and trade live TradingView charts with sub-millisecond precision.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#8c93a6]">
              <Play className="h-3.5 w-3.5" /> High-Frequency Ready
            </div>
          </motion.div>
        </div>

        {/* Action Callout */}
        <div className="mt-12 text-center">
          <button
            onClick={onLaunch}
            className="inline-flex items-center gap-2 rounded-lg bg-[#10b981] px-6 py-3 text-xs font-bold text-[#090a0f] hover:bg-[#059669] transition-all cursor-pointer"
          >
            Launch Free Demo Workspace Now
          </button>
        </div>
      </div>
    </section>
  );
};
