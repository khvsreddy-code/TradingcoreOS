import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Play, Zap, LineChart, Shield, Globe } from 'lucide-react';

interface HeroProps {
  onLaunch: () => void;
  onOpenDemo: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onLaunch, onOpenDemo }) => {
  return (
    <section className="relative pt-16 pb-6 overflow-hidden bg-[#090a0f]">
      {/* Background Subtle Geometry Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e223015_1px,transparent_1px),linear-gradient(to_bottom,#1e223015_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Eyebrow Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[#11131c] px-3.5 py-1 font-mono text-[11px] font-medium tracking-widest text-[#8c93a6] uppercase mb-6"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
          <span>BROWSER-BASED TRADING OPERATING SYSTEM</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#f3f4f6] max-w-3xl leading-[1.08]"
        >
          The Browser OS<br />
          <span className="text-[#8c93a6] font-normal">for Professional Traders.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 font-mono text-base sm:text-lg text-[#d1d5db] tracking-wide max-w-xl"
        >
          One workspace. Every broker. Zero downloads.
        </motion.p>

        {/* Primary & Secondary CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
        >
          <button
            onClick={onLaunch}
            className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#10b981] px-6 py-3 text-sm font-bold text-[#090a0f] transition-all hover:bg-[#059669] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] cursor-pointer"
          >
            Connect Broker
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>

          <button
            onClick={onOpenDemo}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#222636] bg-[#11131c] px-6 py-3 text-sm font-medium text-[#f3f4f6] transition-all hover:border-[#33384f] hover:bg-[#181b28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] cursor-pointer"
          >
            Watch Demo
            <Play className="h-3.5 w-3.5 fill-current text-[#8c93a6]" />
          </button>
        </motion.div>

        {/* Feature Strip (Neutralized Icons) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-4xl"
        >
          <div className="flex items-center gap-2.5 rounded-lg border border-[#1e2230] bg-[#0c0e15] p-3 text-left">
            <Zap className="h-4 w-4 text-[#8c93a6] shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-[#f3f4f6]">Sub-10ms Speed</h3>
              <p className="text-[10px] font-mono text-[#8c93a6]">Hotkey execution</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-[#1e2230] bg-[#0c0e15] p-3 text-left">
            <LineChart className="h-4 w-4 text-[#8c93a6] shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-[#f3f4f6]">TradingView Engine</h3>
              <p className="text-[10px] font-mono text-[#8c93a6]">On-chart order lines</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-[#1e2230] bg-[#0c0e15] p-3 text-left">
            <Shield className="h-4 w-4 text-[#8c93a6] shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-[#f3f4f6]">Bring Your Broker</h3>
              <p className="text-[10px] font-mono text-[#8c93a6]">Zerodha, Dhan, Upstox</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-[#1e2230] bg-[#0c0e15] p-3 text-left">
            <Globe className="h-4 w-4 text-[#8c93a6] shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-[#f3f4f6]">100% In Browser</h3>
              <p className="text-[10px] font-mono text-[#8c93a6]">Zero installation</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
