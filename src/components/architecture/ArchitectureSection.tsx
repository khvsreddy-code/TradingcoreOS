import React from 'react';
import { Activity, BarChart3, Cable, LockKeyhole, ShieldCheck } from 'lucide-react';

const layers = [
  { icon: Cable, title: 'Broker boundary', copy: 'Upstox and Fyers connect through official broker authorization and APIs.' },
  { icon: Activity, title: 'Market data', copy: 'Normalized quotes, depth and streaming events feed the workspace without exposing broker credentials.' },
  { icon: BarChart3, title: 'TradingCore workspace', copy: 'Charts, options, portfolio views, models and execution controls share one account context.' },
  { icon: ShieldCheck, title: 'Risk & execution', copy: 'Orders pass through broker-aware validation and your configured risk workflow.' },
];

export const ArchitectureSection: React.FC = () => (
  <section id="architecture" className="border-t border-[#1e2230] bg-[#090a0f] py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <div className="eyebrow mb-4 inline-flex">SYSTEM ARCHITECTURE</div>
          <h2 className="section-title max-w-xl">Your broker stays the broker. TradingCore becomes the workspace above it.</h2>
          <p className="section-copy max-w-xl">TradingCore is designed as a broker-agnostic control layer: your account remains with the broker while TradingCore organizes market data, analysis, risk and execution around it.</p>
          <div className="mt-7 inline-flex items-center gap-2 rounded-lg border border-[#1e2230] bg-[#0c0e15] px-3 py-2 font-mono text-[10px] text-[#8c93a6]"><LockKeyhole className="h-3.5 w-3.5 text-[#10b981]" /> Access tokens encrypted at rest</div>
        </div>

        <div className="rounded-2xl border border-[#1e2230] bg-[#0c0e15] p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between border-b border-[#1e2230] pb-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#596175]">
            <span>TRADINGCORE CONTROL PLANE</span>
            <span className="text-[#10b981]">BROKER-AGNOSTIC</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {layers.map(({ icon: Icon, title, copy }, index) => (
              <div key={title} className="rounded-xl border border-[#1e2230] bg-[#090a0f] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#1e2230] bg-[#11131c] text-[#8c93a6]"><Icon className="h-4 w-4" /></div>
                  <div>
                    <div className="font-mono text-[9px] text-[#596175]">0{index + 1}</div>
                    <h3 className="mt-1 text-sm font-semibold text-[#f3f4f6]">{title}</h3>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#727c91]">{copy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[#293044] bg-[#090a0f] p-4 font-mono text-[9px] text-[#687187]">
            <span className="rounded border border-[#1e2230] px-2 py-1 text-[#d1d5db]">UPSTOX</span>
            <span>↔</span>
            <span className="rounded border border-[#1e2230] px-2 py-1 text-[#d1d5db]">TRADINGCORE OS</span>
            <span>↔</span>
            <span className="rounded border border-[#1e2230] px-2 py-1 text-[#d1d5db]">FYERS</span>
            <span className="basis-full pt-1 text-center">Broker availability and market-data capabilities vary by integration.</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);
