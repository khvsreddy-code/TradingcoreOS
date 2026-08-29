import React from 'react';
import { motion } from 'motion/react';
import { Command, Layers, ShieldCheck } from 'lucide-react';

export const WhyTradingCore: React.FC = () => {
  return (
    <section id="why-tradingcore" className="py-28 bg-[#090a0f] border-t border-[#1e2230]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[#11131c] px-3 py-1 font-mono text-[11px] text-[#8c93a6] uppercase tracking-wider mb-4">
            ARCHITECTURAL ADVANTAGE
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#f3f4f6] tracking-tight">
            Built for traders who have outgrown standard web terminals.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#8c93a6] leading-relaxed">
            TradingCore eliminates the lag between thought and execution by decoupling UI rendering from broker API feeds to deliver instant browser responsiveness.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-6 flex flex-col justify-between hover:border-[#33384f] transition-all"
          >
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#11131c] text-[#8c93a6] border border-[#1e2230] mb-4">
                <Command className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-[#f3f4f6]">Sub-10ms Keyboard Engine</h3>
              <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
                Place Market/Limit orders, modify Stop Losses, cancel pending orders, or flatten positions instantly using customized hotkeys without touching your mouse.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1e2230] font-mono text-[11px] text-[#8c93a6] flex items-center justify-between">
              <span>Ctrl+B (Buy Market)</span>
              <span>Ctrl+Shift+C (Cancel)</span>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-6 flex flex-col justify-between hover:border-[#33384f] transition-all"
          >
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#11131c] text-[#8c93a6] border border-[#1e2230] mb-4">
                <Layers className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-[#f3f4f6]">Interactive On-Chart Orders</h3>
              <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
                Drag and drop your Target and Stop Loss lines directly on live charts. View entry prices, risk-reward ratios, and unrealized P&L in real time.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1e2230] font-mono text-[11px] text-[#8c93a6] flex items-center justify-between">
              <span>Visual SL/TP Dragging</span>
              <span>100+ Indicators</span>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-6 flex flex-col justify-between hover:border-[#33384f] transition-all"
          >
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#11131c] text-[#8c93a6] border border-[#1e2230] mb-4">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-[#f3f4f6]">Zero-Installation BYOB</h3>
              <p className="mt-2 text-xs text-[#8c93a6] leading-relaxed">
                Bring Your Own Broker. Connect Upstox or Fyers safely via direct API keys or OAuth token without downloading desktop installers.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1e2230] font-mono text-[11px] text-[#8c93a6] flex items-center justify-between">
              <span>End-to-End Encryption</span>
              <span>Non-Custodial</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
