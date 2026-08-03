import React from 'react';

export const Footer: React.FC<{ onLaunch?: () => void }> = ({ onLaunch }) => {
  return (
    <footer className="bg-[#06070a] border-t border-[#1e2230] pt-16 pb-12 text-[#8c93a6]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Directory Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-12 border-b border-[#1e2230]">
          {/* Col 1: Platform */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold text-[#f3f4f6] uppercase tracking-wider">
              Platform
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li><a href="#why-tradingcore" className="hover:text-[#f3f4f6] transition-colors">Why TradingCore</a></li>
              <li><a href="#workspace-preview" className="hover:text-[#f3f4f6] transition-colors">Workspace Preview</a></li>
              <li><a href="#brokers" className="hover:text-[#f3f4f6] transition-colors">BYOB Integration</a></li>
              <li><a href="#how-it-works" className="hover:text-[#f3f4f6] transition-colors">3-Step Setup</a></li>
              <li><a href="#pricing" className="hover:text-[#f3f4f6] transition-colors">OS Licensing</a></li>
            </ul>
          </div>

          {/* Col 2: Supported Brokers */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold text-[#f3f4f6] uppercase tracking-wider">
              Supported Brokers
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li><span className="text-[#d1d5db]">Zerodha (Kite Connect)</span></li>
              <li><span className="text-[#d1d5db]">Dhan (DhanHQ API)</span></li>
              <li><span className="text-[#d1d5db]">Upstox (Developer API)</span></li>
              <li><span className="text-[#d1d5db]">Angel One (SmartAPI)</span></li>
              <li><span className="text-[#d1d5db]">Fyers (API v3)</span></li>
            </ul>
          </div>

          {/* Col 3: Modules & Roadmap */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold text-[#f3f4f6] uppercase tracking-wider">
              Future Modules
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li><a href="#future-modules" className="hover:text-[#f3f4f6] transition-colors">Marketplace</a></li>
              <li><a href="#future-modules" className="hover:text-[#f3f4f6] transition-colors">Scalper Overdrive</a></li>
              <li><a href="#future-modules" className="hover:text-[#f3f4f6] transition-colors">AI Co-Pilot</a></li>
              <li><a href="#future-modules" className="hover:text-[#f3f4f6] transition-colors">CoreSpirit Runtime</a></li>
            </ul>
          </div>

          {/* Col 4: Trust & Legal */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold text-[#f3f4f6] uppercase tracking-wider">
              Legal & Security
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li><a href="#faq" className="hover:text-[#f3f4f6] transition-colors">FAQ & Security</a></li>
              <li><span className="hover:text-[#f3f4f6] cursor-pointer">Privacy Policy</span></li>
              <li><span className="hover:text-[#f3f4f6] cursor-pointer">Terms of Service</span></li>
              <li><span className="hover:text-[#f3f4f6] cursor-pointer">OAuth Protocol</span></li>
            </ul>
          </div>
        </div>

        {/* SEBI Compliance & Risk Disclaimer */}
        <div className="py-8 border-b border-[#1e2230] space-y-3 text-[11px] leading-relaxed text-[#8c93a6]">
          <p className="font-mono text-[#d1d5db]">
            <strong>REGULATORY NOTICE:</strong> TradingCore is a software application and browser operating system. TradingCore is <strong>NOT</strong> a broker, investment advisor, or portfolio manager, and is not registered with SEBI.
          </p>
          <p>
            Trading financial derivatives (Options & Futures) carries risk of loss. According to SEBI studies, 9 out of 10 individual traders in equity Futures and Options segment incurred net losses. Ensure you understand risk disclosure documents provided by your SEBI registered broker before trading.
          </p>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#11131c] border border-[#1e2230] text-[#10b981] font-bold text-xs">
              TC
            </div>
            <span className="text-[#f3f4f6] font-bold">TradingCore OS</span>
            <span>© {new Date().getFullYear()} TradingCore Inc. All rights reserved.</span>
          </div>

          {/* Live Status Indicator */}
          <div className="flex items-center gap-2 rounded-full border border-[#1e2230] bg-[#0c0e15] px-3 py-1 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            <span className="text-[#f3f4f6]">Broker APIs Operational</span>
            <span className="text-[#8c93a6]">· Latency &lt;14ms</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
