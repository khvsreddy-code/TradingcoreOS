import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface BrokerStripProps {
  onSelectBroker?: (brokerName: string) => void;
}

const BROKER_DATA = [
  { name: 'Fyers', api: 'Fyers API v3 + OAuth 2.0', tags: 'OAuth · REST · WebSocket', latency: 'Primary route', color: '#3b82f6', initial: 'F' },
];

export const BrokerStrip: React.FC<BrokerStripProps> = ({ onSelectBroker }) => (
  <section id="brokers" className="py-24 bg-[var(--tco-surface-2)] border-t border-[#1e2230]">
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
      <p className="font-mono text-xs tracking-widest uppercase text-[var(--tco-muted)] font-semibold mb-3">SUPPORTED BROKERS</p>
      <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--tco-text)] tracking-tight mb-3">One broker connection. One market-data path.</h2>
      <p className="text-sm text-[var(--tco-muted)] max-w-2xl mx-auto mb-12">TradingCore uses Fyers as the single broker route for market data, portfolio and execution.</p>
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }} className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
        {BROKER_DATA.map((broker) => (
          <button key={broker.name} onClick={() => onSelectBroker?.(broker.name)} className="group rounded-2xl border border-[#1e2230] bg-[var(--tco-surface)] p-6 text-left transition-all hover:border-[#3b4257] hover:bg-[#11141d]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center font-bold" style={{ backgroundColor: `${broker.color}18`, color: broker.color, border: `1px solid ${broker.color}35` }}>{broker.initial}</div>
                <div><span className="block font-bold text-base text-[var(--tco-text)]">{broker.name}</span><span className="font-mono text-[10px] text-[var(--tco-muted)]">{broker.api}</span></div>
              </div>
              <ArrowRight className="h-4 w-4 text-[var(--tco-dim)] group-hover:text-[var(--tco-text)] transition-transform group-hover:translate-x-1" />
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[#9aa3b5]">
              <span className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-2 py-1">{broker.tags}</span>
              <span className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-2 py-1">{broker.latency}</span>
            </div>
          </button>
        ))}
      </motion.div>
      <div className="mt-8 flex items-center justify-center gap-2 font-mono text-xs text-[var(--tco-muted)]"><ShieldCheck className="h-4 w-4" /><span>Non-custodial connection flow · official broker authorization</span><Zap className="h-4 w-4 ml-2" /></div>
    </div>
  </section>
);
