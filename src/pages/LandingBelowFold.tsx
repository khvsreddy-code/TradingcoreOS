import { lazy, Suspense } from 'react';
import { Activity, Layers3, ShieldCheck, Wallet } from 'lucide-react';

const FAQSection = lazy(() => import('../components/faq/FAQSection').then(m => ({ default: m.FAQSection })));
const Footer = lazy(() => import('../components/footer/Footer').then(m => ({ default: m.Footer })));

const modules = [
  { icon: Activity, title: 'Market workspace', copy: 'Charts, watchlists and market-data context.' },
  { icon: Layers3, title: 'CoreSpirit', copy: 'Native indicators and script authoring.' },
  { icon: ShieldCheck, title: 'Options & risk', copy: 'Options analysis and broker-aware order workflows.' },
  { icon: Wallet, title: 'Portfolio & workflows', copy: 'Positions, models and automation modules.' },
];

export function LandingBelowFold({ onLaunchPlatform }: { onLaunchPlatform: () => void }) {
  return (
    <>
      <section id="workspace-modules" className="border-t border-[#1e2230] bg-[var(--tco-surface-2)] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow mb-3 inline-flex">ONE WORKSPACE · DISTINCT MODULES</div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--tco-text)] sm:text-3xl">The tools you need. Without the extra noise.</h2>
            </div>
            <a href="/explore/indicators" className="inline-flex items-center gap-2 text-xs font-semibold text-[#93c5fd] transition-colors hover:text-white">
              Explore CoreSpirit <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="rounded-xl border border-[#1e2230] bg-[var(--tco-surface)] p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2230] bg-[var(--tco-surface-3)] text-[#93c5fd]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--tco-text)]">{title}</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-[var(--tco-muted)]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="access-model-title" className="border-t border-[#1e2230] bg-[var(--tco-bg)] py-12">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 sm:px-8 md:grid-cols-[0.7fr_1.3fr] md:items-center lg:px-10">
          <div>
            <div className="eyebrow mb-2 inline-flex">CLEAR ACCESS BOUNDARIES</div>
            <h2 id="access-model-title" className="text-xl font-bold text-[var(--tco-text)]">Know what is connected.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="font-mono text-[9px] font-semibold text-[var(--tco-text)]">01 · WORKSPACE</div>
              <p className="mt-1.5 text-[10px] leading-4 text-[var(--tco-muted)]">Sign in is required to enter the private workspace.</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="font-mono text-[9px] font-semibold text-[var(--tco-text)]">02 · BROKER</div>
              <p className="mt-1.5 text-[10px] leading-4 text-[var(--tco-muted)]">Broker-backed account and order features require authorization.</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="font-mono text-[9px] font-semibold text-[var(--tco-text)]">03 · PREVIEW</div>
              <p className="mt-1.5 text-[10px] leading-4 text-[var(--tco-muted)]">Landing-page values are illustrative, not live market data.</p>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}><FAQSection /></Suspense>
      <Suspense fallback={null}><Footer onLaunch={onLaunchPlatform} /></Suspense>
    </>
  );
}
