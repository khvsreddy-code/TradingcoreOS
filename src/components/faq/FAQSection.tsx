import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { FAQItem } from '../../types/landing';

const FAQ_DATA: FAQItem[] = [
  {
    category: 'Security',
    question: 'Is TradingCore a broker or a SEBI registered entity?',
    answer: 'No. TradingCore is purely a technology software platform (Operating System). We are NOT a broker, investment advisor, or portfolio manager. All trades are routed directly to your connected SEBI-registered broker (Upstox or Fyers) via official OAuth 2.0 API endpoints.',
  },
  {
    category: 'Security',
    question: 'Are my broker credentials or funds stored on TradingCore servers?',
    answer: 'Never. TradingCore operates on a Bring Your Own Broker (BYOB) architecture. We do not store your passwords, PINs, or funds. Authentication tokens are encrypted on client session and passed directly to your broker APIs.',
  },
  {
    category: 'Execution',
    question: 'How fast is order execution compared to desktop apps?',
    answer: 'Orders placed on TradingCore hit official broker API endpoints in <15ms. Because our web application runs on lightweight WebGL and WebWorkers, UI rendering latency is virtually zero—matching or exceeding desktop software.',
  },
  {
    category: 'Brokers',
    question: 'Which Indian brokers are currently supported?',
    answer: 'We currently support Upstox (Developer API v2) and Fyers (API v3). These are the only broker connections currently supported.',
  },
  {
    category: 'General',
    question: 'Do I need to install any software or extensions?',
    answer: 'No. TradingCore runs 100% inside any standard browser (Chrome, Arc, Safari, Edge, Firefox, Brave) on Windows, macOS, or Linux without downloading .exe or .dmg packages.',
  },
  {
    category: 'General',
    question: 'Can I trade options with hotkeys on mobile devices?',
    answer: 'Yes. While TradingCore is optimized for desktop and multi-monitor setups, our responsive mobile interface supports touch-optimized quick order buttons and live option chain views.',
  },
];

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-28 bg-[#090a0f] border-t border-[#1e2230]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[#11131c] px-3 py-1 font-mono text-[11px] text-[#8c93a6] uppercase tracking-wider mb-4">
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#f3f4f6] tracking-tight">
            Everything you need to know about TradingCore OS.
          </h2>
          <p className="mt-4 text-sm text-[#8c93a6]">
            Transparent answers on security, latency, BYOB architecture, and broker integrations.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3">
          {FAQ_DATA.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-[#1e2230] bg-[#0c0e15] overflow-hidden transition-colors"
              >
                <button
                  onClick={() => toggleAccordion(index)}
                  className="w-full flex items-center justify-between p-5 text-left font-medium text-sm text-[#f3f4f6] hover:bg-[#11131c] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#10b981] cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#8c93a6] font-bold">
                      [{item.category.toUpperCase()}]
                    </span>
                    <span className="font-semibold">{item.question}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#8c93a6] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#f3f4f6]' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 pt-0 text-xs text-[#8c93a6] leading-relaxed border-t border-[#1e2230] font-normal">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
