import React from 'react';
import { motion } from 'motion/react';

interface LoadingScreenProps {
  message?: string;
  submessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Checking Session...',
  submessage = 'Initializing TradingCore Operating System',
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090a0f] p-4 text-[#f3f4f6]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-xl border border-[#222636] bg-[#11131c] p-6 shadow-2xl space-y-6"
      >
        {/* Top Branding Skeleton */}
        <div className="flex items-center justify-between border-b border-[#222636] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#090a0f] border border-[#222636] text-[#10b981]">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-[#f3f4f6]">
                TradingCore <span className="text-[#10b981]">OS</span>
              </div>
              <div className="text-[10px] font-mono text-[#8c93a6]">Secure Kernel v2.4</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[#10b981]/30 bg-[#10b981]/10 px-2 py-1 font-mono text-[10px] text-[#10b981]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
            LIVE
          </div>
        </div>

        {/* Skeleton Card Bodies (NO SPINNERS) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#10b981] font-semibold flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#10b981] animate-ping" />
              {message}
            </span>
            <span className="text-[#8c93a6]">System Init</span>
          </div>

          {/* Animated Shimmer Bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#181b28]">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                ease: 'easeInOut',
              }}
              className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#10b981] to-transparent opacity-80"
            />
          </div>

          <p className="text-[11px] text-[#8c93a6] font-mono leading-relaxed pt-1">
            {submessage}
          </p>
        </div>

        {/* Modular Skeleton Blocks */}
        <div className="space-y-2 pt-2">
          <div className="h-3 w-3/4 rounded bg-[#181b28] animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-[#181b28] animate-pulse opacity-60" />
          <div className="h-3 w-5/6 rounded bg-[#181b28] animate-pulse opacity-40" />
        </div>

        {/* Footer Security Badge */}
        <div className="border-t border-[#222636] pt-3 text-center text-[10px] font-mono text-[#8c93a6]">
          Non-Custodial Architecture • Encrypted Session Token
        </div>
      </motion.div>
    </div>
  );
};
