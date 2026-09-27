import React from 'react';
import { motion } from 'motion/react';

interface LoadingScreenProps {
  message?: string;
  submessage?: string;
  onRetry?: () => void;
  onContinue?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Checking Session...',
  submessage = 'Initializing TradingCore Operating System',
  onRetry,
  onContinue,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090a0f] p-4 text-[#f3f4f6]">
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-md rounded-xl border border-[#222636] bg-[#11131c] p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[#222636] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#222636] bg-[#090a0f] text-[#3b82f6]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight">TradingCore <span className="text-[#3b82f6]">OS</span></div>
            <div className="text-[10px] font-mono text-[#8c93a6]">Secure Trading Runtime</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2 py-1 font-mono text-[10px] text-[#3b82f6]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3b82f6]" /> LIVE
        </div>
      </div>

      <div className="space-y-3 pt-5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="flex items-center gap-2 font-semibold text-[#3b82f6]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#3b82f6]" />
            {message}
          </span>
          <span className="text-[#8c93a6]">System Init</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#181b28]">
          <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }} className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent opacity-80" />
        </div>
        <p className="pt-1 text-[11px] font-mono leading-relaxed text-[#8c93a6]">{submessage}</p>
      </div>

      <div className="space-y-2 pt-5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-[#181b28]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#181b28] opacity-60" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[#181b28] opacity-40" />
      </div>

      {(onRetry || onContinue) && (
        <div className="flex justify-center gap-3 pt-5">
          {onContinue && <button type="button" onClick={onContinue} className="rounded-lg border border-[#2a3040] px-4 py-2 text-xs font-semibold text-[#c9ceda] hover:bg-[#181b28]">Continue to Landing</button>}
          {onRetry && <button type="button" onClick={onRetry} className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-semibold text-[#06110d] hover:opacity-90">Retry</button>}
        </div>
      )}

      <div className="mt-5 border-t border-[#222636] pt-3 text-center text-[10px] font-mono text-[#8c93a6]">
        Non-Custodial Architecture • Encrypted Session Token
      </div>
    </motion.div>
  </div>
);
