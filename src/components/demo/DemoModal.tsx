import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Command, Zap, ArrowRight } from 'lucide-react';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: () => void;
}

export const DemoModal: React.FC<DemoModalProps> = ({ isOpen, onClose, onLaunch }) => {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#090a0f]/85 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#222636] bg-[#0c0e15] p-6 shadow-2xl z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#222636] pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#10b981]/10 text-[#10b981]">
                  <Play className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f3f4f6]">
                    TradingCore OS Walkthrough Demo
                  </h3>
                  <p className="text-xs text-[#8c93a6]">
                    Sub-millisecond execution & TradingView workflow
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8c93a6] hover:bg-[#181b28] hover:text-[#f3f4f6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Video Frame Simulation */}
            <div className="mt-4 rounded-xl border border-[#222636] bg-[#090a0f] p-6 text-center space-y-4">
              <div className="relative aspect-video rounded-lg border border-[#222636] bg-[#11131c] flex flex-col items-center justify-center p-6 space-y-3 overflow-hidden">
                <div className="h-12 w-12 rounded-full bg-[#10b981] flex items-center justify-center text-[#090a0f] font-bold animate-pulse">
                  <Play className="h-6 w-6 fill-current ml-0.5" />
                </div>
                <div className="font-mono text-xs text-[#f3f4f6] font-bold">
                  Interactive Terminal Simulator Ready
                </div>
                <p className="text-[11px] text-[#8c93a6] max-w-md">
                  Experience live candlestick rendering, hotkey placement (Ctrl+B), and on-chart target dragging directly inside the browser window.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-left">
                <div className="rounded border border-[#222636] bg-[#11131c] p-2.5">
                  <span className="text-[#10b981] font-bold block">1. Connect Broker</span>
                  <span className="text-[#8c93a6] text-[10px]">Zerodha / Dhan API</span>
                </div>
                <div className="rounded border border-[#222636] bg-[#11131c] p-2.5">
                  <span className="text-[#3b82f6] font-bold block">2. Set Hotkeys</span>
                  <span className="text-[#8c93a6] text-[10px]">Ctrl+B Buy Market</span>
                </div>
                <div className="rounded border border-[#222636] bg-[#11131c] p-2.5">
                  <span className="text-[#a855f7] font-bold block">3. Drag SL / TP</span>
                  <span className="text-[#8c93a6] text-[10px]">Interactive Lines</span>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="mt-6 flex justify-end gap-3 border-t border-[#222636] pt-4">
              <button
                onClick={onClose}
                className="rounded-lg border border-[#222636] bg-[#11131c] px-4 py-2 text-xs font-semibold text-[#8c93a6] hover:text-[#f3f4f6]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  onLaunch();
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-4 py-2 text-xs font-bold text-[#090a0f] hover:bg-[#059669]"
              >
                Launch Live Demo Workspace
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
