import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, ArrowRight } from 'lucide-react';

interface AuthModalPlaceholderProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchWorkspace?: () => void;
}

export const AuthModalPlaceholder: React.FC<AuthModalPlaceholderProps> = ({
  isOpen,
  onClose,
  onLaunchWorkspace,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          id="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-[#090a0f]/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-[#222636] bg-[#11131c] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#222636] pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#10b981]/10 text-[#10b981]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2
                    id="auth-modal-title"
                    className="text-base font-semibold text-[#f3f4f6]"
                  >
                    Sign In to TradingCore
                  </h2>
                  <p className="text-xs text-[#8c93a6]">
                    Browser Trading Operating System
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8c93a6] transition-colors hover:bg-[#181b28] hover:text-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                aria-label="Close authentication modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-6 space-y-4">
              {/* Google Auth Button */}
              <button
                onClick={() => {
                  onClose();
                  if (onLaunchWorkspace) onLaunchWorkspace();
                }}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#222636] bg-[#181b28] px-4 py-3 text-sm font-medium text-[#f3f4f6] transition-all hover:border-[#33384f] hover:bg-[#222636] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12s.7 2.3 1.9 4.7l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#222636]" />
                </div>
                <span className="relative bg-[#11131c] px-3 font-mono text-[11px] uppercase tracking-wider text-[#8c93a6]">
                  Bring Your Own Broker (BYOB)
                </span>
              </div>

              {/* Broker API Quick Selector */}
              <div className="grid grid-cols-2 gap-2">
                {['Zerodha', 'Dhan', 'Upstox', 'Angel One', 'Fyers'].map(
                  (broker) => (
                    <button
                      key={broker}
                      onClick={() => {
                        onClose();
                        if (onLaunchWorkspace) onLaunchWorkspace();
                      }}
                      className="flex items-center justify-between rounded-lg border border-[#222636] bg-[#090a0f] px-3 py-2.5 text-left text-xs text-[#8c93a6] transition-colors hover:border-[#10b981]/50 hover:bg-[#181b28] hover:text-[#f3f4f6]"
                    >
                      <span className="font-medium">{broker}</span>
                      <span className="font-mono text-[10px] text-[#10b981]">
                        OAuth
                      </span>
                    </button>
                  )
                )}
              </div>

              {/* Direct Launch Option */}
              <button
                onClick={() => {
                  onClose();
                  if (onLaunchWorkspace) onLaunchWorkspace();
                }}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#10b981] px-4 py-2.5 text-sm font-semibold text-[#090a0f] transition-all hover:bg-[#059669] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
              >
                Launch Demo Workspace
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Footer Notice */}
            <div className="mt-6 border-t border-[#222636] pt-4 text-center font-mono text-[11px] text-[#8c93a6]">
              Encrypted Session · Official Broker APIs Only
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
