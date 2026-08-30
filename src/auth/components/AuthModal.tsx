import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { login, authStep, error, clearError, isAuthenticated } = useAuth();

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

  // Close modal automatically if user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      if (onSuccess) onSuccess();
      onClose();
    }
  }, [isAuthenticated, isOpen, onClose, onSuccess]);

  const handleGoogleSignIn = async () => {
    clearError();
    const result = await login();
    if (!result.error && onSuccess) {
      // If OAuth redirect triggers window location change, it won't execute further
    }
  };

  const getStepText = () => {
    switch (authStep) {
      case 'connecting':
        return 'Connecting...';
      case 'authenticating':
        return 'Authenticating...';
      case 'preparing':
        return 'Preparing Workspace...';
      default:
        return null;
    }
  };

  const stepText = getStepText();
  const isLoading = authStep === 'connecting' || authStep === 'authenticating' || authStep === 'preparing';

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
            {/* Header Close Button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[#8c93a6] transition-colors hover:bg-[#181b28] hover:text-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] cursor-pointer"
              aria-label="Close authentication modal"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Layout Order:
                1. TradingCore Logo
                2. Welcome to TradingCore
                3. Sign in with Google
                4. Security Notice
                5. Terms & Privacy
            */}

            {/* 1. TradingCore Logo */}
            <div className="flex flex-col items-center text-center pt-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#090a0f] border border-[#222636] text-[#10b981] shadow-inner mb-4">
                <svg
                  width="24"
                  height="24"
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

              {/* 2. Welcome Title & Subtitle */}
              <h2
                id="auth-modal-title"
                className="text-xl font-extrabold text-[#f3f4f6] tracking-tight"
              >
                Welcome to TradingCore
              </h2>
              <p className="mt-1 text-xs text-[#8c93a6] font-mono">
                Browser Trading Operating System
              </p>
            </div>

            {/* Inline Error Card */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-lg border border-[#ef4444]/30 bg-[#12080a] p-3 text-xs text-[#fca5a5] flex items-start gap-2.5"
              >
                <AlertTriangle className="h-4 w-4 text-[#ef4444] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#f87171]">Authentication Failed</p>
                  <p className="text-[11px] leading-relaxed text-[#fca5a5]/90">{error}</p>
                </div>
              </motion.div>
            )}

            {/* 3. Sign in with Google */}
            <div className="mt-6 space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className={`flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] cursor-pointer ${
                  isLoading
                    ? 'border-[#222636] bg-[#181b28] text-[#8c93a6] cursor-not-allowed opacity-80'
                    : 'border-[#222636] bg-[#181b28] text-[#f3f4f6] hover:border-[#33384f] hover:bg-[#222636]'
                }`}
              >
                {isLoading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 font-mono text-xs text-[#10b981]"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-[#10b981]" />
                    <span>{stepText}</span>
                  </motion.div>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
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
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>

              {/* 4. Security Notice */}
              <div className="rounded-lg border border-[#222636] bg-[#090a0f] p-3.5 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#10b981] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#8c93a6] leading-relaxed">
                  <span className="font-semibold text-[#f3f4f6]">Non-Custodial Architecture:</span> TradingCore never stores your broker credentials or capital. Session is tokenized via encrypted Google OAuth.
                </div>
              </div>
            </div>

            {/* 5. Terms & Privacy */}
            <div className="mt-6 border-t border-[#222636] pt-4 text-center font-mono text-[10px] text-[#8c93a6] space-x-1">
              <span>By signing in, you agree to TradingCore's</span>
              <a href="#terms" className="text-[#f3f4f6] underline hover:text-[#10b981] transition-colors">
                Terms of Service
              </a>
              <span>&</span>
              <a href="#privacy" className="text-[#f3f4f6] underline hover:text-[#10b981] transition-colors">
                Privacy Policy
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
