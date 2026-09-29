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
    answer: 'TradingCore does not store your broker password, trading PIN, or funds. Broker access tokens required for supported integrations are encrypted at rest on the server and are never exposed to the browser.',
  },
  {
    category: 'Execution',
    question: 'How fast is order execution compared to desktop apps?',
    answer: 'TradingCore sends orders through the official API of your connected broker. Actual execution time depends on your broker, network path, exchange conditions and order type, so we do not promise a fixed latency number.',
  },
  {
    category: 'Brokers',
    question: 'Which Indian brokers are currently supported?',
    answer: 'We currently support Upstox and Fyers. Upstox uses OAuth 2.0 for authorization, while its current V3 endpoints are used where available for trading and market data; some portfolio endpoints remain V2. Fyers is integrated through API v3. These are the only broker connections currently supported.',
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
    <section id="faq" className="py-28 bg-[var(--tco-surface-2)] border-t border-[#1e2230]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-3 py-1 font-mono text-[11px] text-[var(--tco-muted)] uppercase tracking-wider mb-4">
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--tco-text)] tracking-tight">
            Everything you need to know about TradingCore OS.
          </h2>
          <p className="mt-4 text-sm text-[var(--tco-muted)]">
            Transparent answers on security, broker integrations, execution latency, and the BYOB architecture.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3">
          {FAQ_DATA.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] overflow-hidden transition-colors"
              >
                <button
                  onClick={() => toggleAccordion(index)}
                  className="w-full flex items-center justify-between p-5 text-left font-medium text-sm text-[var(--tco-text)] hover:bg-[var(--tco-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6] cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[var(--tco-muted)] font-bold">
                      [{item.category.toUpperCase()}]
                    </span>
                    <span className="font-semibold">{item.question}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[var(--tco-muted)] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[var(--tco-text)]' : ''
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
                      <div className="p-5 pt-0 text-xs text-[var(--tco-muted)] leading-relaxed border-t border-[#1e2230] font-normal">
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
