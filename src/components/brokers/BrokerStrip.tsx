import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Zap } from 'lucide-react';

interface BrokerStripProps {
  onSelectBroker?: (brokerName: string) => void;
}

const BROKER_DATA = [
  {
    name: 'Zerodha',
    api: 'Kite Connect API',
    tags: 'OAuth · NSE · F&O',
    latency: '< 10ms',
    color: '#3b82f6',
    initial: 'Z'
  },
  {
    name: 'Dhan',
    api: 'DhanHQ API v2',
    tags: 'OAuth · Multi-Leg',
    latency: '< 12ms',
    color: '#10b981',
    initial: 'ध'
  },
  {
    name: 'Upstox',
    api: 'Developer API v2',
    tags: 'OAuth · GTT Orders',
    latency: '< 15ms',
    color: '#a855f7',
    initial: 'U'
  },
  {
    name: 'Angel One',
    api: 'SmartAPI Engine',
    tags: 'OAuth · WebSocket L2',
    latency: '< 14ms',
    color: '#f97316',
    initial: 'A'
  },
  {
    name: 'Fyers',
    api: 'Fyers API v3',
    tags: 'OAuth · Webhooks',
    latency: '< 11ms',
    color: '#06b6d4',
    initial: 'F'
  }
];

export const BrokerStrip: React.FC<BrokerStripProps> = ({ onSelectBroker }) => {
  return (
    <section id="brokers" className="py-24 bg-[#090a0f] border-t border-[#1e2230]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Section Header */}
        <p className="font-mono text-xs tracking-widest uppercase text-[#8c93a6] font-semibold mb-3">
          SUPPORTED BROKERS & API INTEGRATIONS
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#f3f4f6] tracking-tight mb-3">
          Connect your existing trading account in seconds.
        </h2>
        <p className="text-sm text-[#8c93a6] max-w-xl mx-auto mb-12">
          TradingCore does not touch your capital or hold credentials. Direct official OAuth connection with exchange-approved APIs.
        </p>

        {/* Premium Broker Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-6xl mx-auto"
        >
          {BROKER_DATA.map((broker) => (
            <div
              key={broker.name}
              onClick={() => onSelectBroker && onSelectBroker(broker.name)}
              className="group flex flex-col justify-between rounded-xl border border-[#1e2230] bg-[#0c0e15] p-5 text-left cursor-pointer transition-all hover:border-[#33384f] hover:bg-[#11141d]"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-md flex items-center justify-center font-bold text-xs"
                      style={{ backgroundColor: `${broker.color}15`, color: broker.color, border: `1px solid ${broker.color}30` }}
                    >
                      {broker.initial}
                    </div>
                    <span className="font-bold text-sm text-[#f3f4f6]">{broker.name}</span>
                  </div>
                  <span className="flex h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                </div>

                <div className="font-mono text-xs text-[#d1d5db] font-semibold mb-1">
                  {broker.api}
                </div>

                <div className="font-mono text-[10px] text-[#8c93a6] mb-4">
                  {broker.tags}
                </div>
              </div>

              <div className="pt-3 border-t border-[#1e2230] flex items-center justify-between font-mono text-[10px] text-[#8c93a6]">
                <span>Execution:</span>
                <span className="text-[#f3f4f6] font-semibold">{broker.latency}</span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Security Assurance */}
        <div className="mt-8 flex items-center justify-center gap-2 font-mono text-xs text-[#8c93a6]">
          <ShieldCheck className="h-4 w-4 text-[#8c93a6]" />
          <span>Non-custodial OAuth integration · Zero credential storage · Direct SEBI-registered broker endpoints</span>
        </div>
      </div>
    </section>
  );
};
