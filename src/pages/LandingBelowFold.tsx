import { lazy, Suspense } from 'react';

const WorkspacePreview = lazy(() => import('../components/workspace/WorkspacePreview').then(m => ({ default: m.WorkspacePreview })));
const BrokerStrip = lazy(() => import('../components/brokers/BrokerStrip').then(m => ({ default: m.BrokerStrip })));
const WhyTradingCore = lazy(() => import('../components/features/WhyTradingCore').then(m => ({ default: m.WhyTradingCore })));
const ArchitectureSection = lazy(() => import('../components/architecture/ArchitectureSection').then(m => ({ default: m.ArchitectureSection })));
const FeaturesDeepDive = lazy(() => import('../components/features/FeaturesDeepDive').then(m => ({ default: m.FeaturesDeepDive })));
const HowItWorks = lazy(() => import('../components/howItWorks/HowItWorks').then(m => ({ default: m.HowItWorks })));
const PricingSection = lazy(() => import('../components/pricing/PricingSection').then(m => ({ default: m.PricingSection })));
const FutureModules = lazy(() => import('../components/roadmap/FutureModules').then(m => ({ default: m.FutureModules })));
const FAQSection = lazy(() => import('../components/faq/FAQSection').then(m => ({ default: m.FAQSection })));
const Footer = lazy(() => import('../components/footer/Footer').then(m => ({ default: m.Footer })));

export function LandingBelowFold({ onLaunchPlatform }: { onLaunchPlatform: () => void }) {
  return (
    <>
      <Suspense fallback={null}><WorkspacePreview onLaunch={onLaunchPlatform} /></Suspense>
      <Suspense fallback={null}><BrokerStrip onSelectBroker={onLaunchPlatform} /></Suspense>
      <Suspense fallback={null}><ArchitectureSection /></Suspense>
      <Suspense fallback={null}><WhyTradingCore /></Suspense>
      <Suspense fallback={null}><FeaturesDeepDive /></Suspense>
      <Suspense fallback={null}><HowItWorks onLaunch={onLaunchPlatform} /></Suspense>
      <Suspense fallback={null}><PricingSection onSelectPlan={onLaunchPlatform} /></Suspense>
      <Suspense fallback={null}><FutureModules /></Suspense>
      <Suspense fallback={null}><FAQSection /></Suspense>
      <Suspense fallback={null}><Footer onLaunch={onLaunchPlatform} /></Suspense>
    </>
  );
}
