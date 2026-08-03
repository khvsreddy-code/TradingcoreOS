import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, ArrowRight, X } from 'lucide-react';

interface BrokerRequiredModalProps {
  isOpen: boolean;
  message?: string;
  onClose: () => void;
  onConnectBroker: () => void;
}

export const BrokerRequiredModal: React.FC<BrokerRequiredModalProps> = ({
  isOpen,
  message = 'Connect a broker to execute live trades.',
  onClose,
  onConnectBroker,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md rounded-2xl border border-[#222636] bg-[#0c0e15] p-6 shadow-2xl space-y-6 relative"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 rounded-lg p-1 text-[#8c93a6] hover:bg-[#181b28] hover:text-[#f3f4f6] transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Icon & Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f59e0b]">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1 pr-6">
                <h3 className="text-lg font-bold text-[#f3f4f6]">
                  Broker Connection Required
                </h3>
                <p className="text-xs font-mono text-[#8c93a6]">
                  Institutional Live Execution Protocol
                </p>
              </div>
            </div>

            {/* Main Alert Message */}
            <div className="rounded-xl border border-[#222636] bg-[#090a0f] p-4 text-sm font-medium text-[#e5e7eb] leading-relaxed">
              {message}
            </div>

            <p className="text-xs text-[#8c93a6] leading-relaxed">
              You are currently viewing the workspace in <span className="text-[#10b981] font-mono font-semibold">Demo Mode</span>. Real-time order placement to Indian exchanges (NSE/BSE) requires an active broker session token.
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-[#222636] bg-[#11131c] py-2.5 text-xs font-semibold text-[#8c93a6] hover:bg-[#181b28] hover:text-[#f3f4f6] transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  onClose();
                  onConnectBroker();
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#10b981] py-2.5 text-xs font-bold text-[#090a0f] hover:bg-[#059669] transition-colors cursor-pointer shadow-lg shadow-[#10b981]/20"
              >
                <span>Connect Broker</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
