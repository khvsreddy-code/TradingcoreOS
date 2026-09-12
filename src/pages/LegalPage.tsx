import React from 'react';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

type Props = { kind: 'privacy' | 'terms' };

export function LegalPage({ kind }: Props) {
  const privacy = kind === 'privacy';
  return (
    <div className="min-h-screen bg-[#070a10] text-[#f3f4f6] font-sans">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070a10]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[#34d399] transition-colors">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#10b981]/30 bg-[#10b981]/10 text-[10px] font-black text-[#34d399]">TC</span>
            TradingCore OS
          </a>
          <a href="/" className="inline-flex items-center gap-2 rounded-lg border border-[#222636] bg-[#11131c] px-3 py-2 text-xs font-mono text-[#9aa3b5] hover:border-[#3a4358] hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="eyebrow mb-5 inline-flex items-center gap-2">
          {privacy ? <ShieldCheck className="h-3.5 w-3.5 text-[#34d399]" /> : <FileText className="h-3.5 w-3.5 text-[#60a5fa]" />}
          TRADINGCORE · {privacy ? 'PRIVACY' : 'TERMS'}
        </div>
        <h1 className="section-title">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="mt-4 text-sm leading-7 text-[#8c93a6]">Last updated September 1, 2026. This page is a product-policy placeholder and should be reviewed by qualified legal counsel before public launch.</p>

        {privacy ? (
          <div className="mt-10 space-y-8 text-sm leading-7 text-[#aeb4c4]">
            <section><h2 className="mb-2 text-lg font-semibold text-white">1. What TradingCore handles</h2><p>TradingCore processes account information required to authenticate you and broker connection data required to provide the connected-account experience. Broker access tokens are protected server-side and are not intended to be exposed to the browser.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">2. Broker connections</h2><p>TradingCore connects to your own broker account through the broker's authorization flow. TradingCore is not the broker, does not hold customer funds, and does not become the custodian of your securities.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">3. Security</h2><p>Connection state and sensitive broker session material are designed to be encrypted at rest. Access controls, retention, incident response and production monitoring should be reviewed continuously as the platform evolves.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">4. Data retention</h2><p>Retention periods, deletion workflows, analytics processing and user rights must be finalized in the production privacy program before launch.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">5. Contact</h2><p>Use the support contact published with the production release for privacy requests or account questions.</p></section>
          </div>
        ) : (
          <div className="mt-10 space-y-8 text-sm leading-7 text-[#aeb4c4]">
            <section><h2 className="mb-2 text-lg font-semibold text-white">1. Software only</h2><p>TradingCore is software for market analysis, account connectivity and order interaction. It is not a broker, investment adviser or portfolio manager.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">2. Your broker account</h2><p>You remain responsible for your broker account, credentials, orders, positions and investment decisions. Broker availability, exchange availability and API behavior can affect the service.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">3. Trading risk</h2><p>Trading equities, futures and options involves substantial risk. Nothing in TradingCore's interface or analytics is a guarantee of profit or performance.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">4. Service availability</h2><p>Market data, broker APIs and internet connectivity can fail or become delayed. Production service-level commitments should be defined separately from this product page.</p></section>
            <section><h2 className="mb-2 text-lg font-semibold text-white">5. Acceptance</h2><p>The final public terms, governing law, liability provisions, billing terms and dispute process must be reviewed and published before paid service launch.</p></section>
          </div>
        )}
      </main>
    </div>
  );
}
