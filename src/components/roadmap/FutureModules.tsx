import React from 'react';
import { motion } from 'motion/react';

const ROADMAP_ITEMS = [
  {
    phase: 'PHASE 02',
    name: 'Marketplace & Extensions',
    details: 'Community indicators, layout templates, hotkey macro presets',
    status: 'Planned',
    statusBg: 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30'
  },
  {
    phase: 'PHASE 03',
    name: 'Scalper Overdrive Engine',
    details: 'Direct binary WebSocket streaming bypassing browser overhead',
    status: 'Coming Soon',
    statusBg: 'bg-[var(--tco-surface-3)] text-[var(--tco-muted)] border-[#1e2230]'
  },
  {
    phase: 'PHASE 04',
    name: 'AI Trading Co-Pilot',
    details: 'Natural language trade journaling & automated risk warnings',
    status: 'Coming Soon',
    statusBg: 'bg-[var(--tco-surface-3)] text-[var(--tco-muted)] border-[#1e2230]'
  },
  {
    phase: 'PHASE 05',
    name: 'Institutional Market Models',
    details: 'Volume Profile, Order Flow Footprint charts & Delta indicators',
    status: 'Coming Soon',
    statusBg: 'bg-[var(--tco-surface-3)] text-[var(--tco-muted)] border-[#1e2230]'
  },
  {
    phase: 'PHASE 06',
    name: 'CoreSpirit Scripting Runtime',
    details: 'TypeScript algorithmic execution running in WebWorkers',
    status: 'In R&D',
    statusBg: 'bg-[var(--tco-surface-3)] text-[var(--tco-muted)] border-[#1e2230]'
  },
  {
    phase: 'PHASE 07',
    name: 'CoreSpirit Strategy Marketplace',
    details: 'Monetize verified algorithmic execution models with revenue share',
    status: 'Planned',
    statusBg: 'bg-[var(--tco-surface-3)] text-[#585e72] border-[#1e2230]'
  }
];

export const FutureModules: React.FC = () => {
  return (
    <section id="future-modules" className="py-28 bg-[var(--tco-surface-2)] border-t border-[#1e2230]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-3 py-1 font-mono text-[11px] text-[var(--tco-muted)] uppercase tracking-wider mb-4">
            PLATFORM ROADMAP
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--tco-text)] tracking-tight">
            Future Modules & Evolution
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[var(--tco-muted)]">
            Our frozen development timeline for upcoming core OS expansions.
          </p>
        </div>

        {/* Clean Linear-style List Layout */}
        <div className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] divide-y divide-[#1e2230]">
          {ROADMAP_ITEMS.map((item, index) => (
            <motion.div
              key={item.phase}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.04 }}
              className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#11141d] transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="font-mono text-xs text-[var(--tco-muted)] shrink-0 font-bold">
                  {item.phase}
                </span>
                <span className="hidden sm:inline text-[#1e2230]">·</span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--tco-text)]">{item.name}</h3>
                  <p className="text-xs text-[var(--tco-muted)] mt-0.5">{item.details}</p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center shrink-0">
                <span className={`font-mono text-[11px] font-semibold px-3 py-1 rounded-full border ${item.statusBg}`}>
                  {item.status}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
