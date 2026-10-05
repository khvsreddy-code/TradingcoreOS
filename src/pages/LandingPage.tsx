import { Navbar } from '../components/navigation/Navbar';
import { Hero } from '../components/hero/Hero';
import { WorkspacePreview } from '../components/workspace/WorkspacePreview';
import { BrokerStrip } from '../components/brokers/BrokerStrip';
import { WhyTradingCore } from '../components/features/WhyTradingCore';
import { ArchitectureSection } from '../components/architecture/ArchitectureSection';
import { FeaturesDeepDive } from '../components/features/FeaturesDeepDive';
import { HowItWorks } from '../components/howItWorks/HowItWorks';
import { PricingSection } from '../components/pricing/PricingSection';
import { FutureModules } from '../components/roadmap/FutureModules';
import { FAQSection } from '../components/faq/FAQSection';
import { Footer } from '../components/footer/Footer';
import type { NavbarProps } from '../types/navigation';

export function LandingPage({
  onOpenAuthModal,
  onLaunchPlatform,
  onNavigate,
  currentView,
}: Pick<NavbarProps, 'onOpenAuthModal' | 'onLaunchPlatform' | 'onNavigate' | 'currentView'>) {
  return (
    <div className="min-h-screen bg-[var(--tco-surface-2)] text-[var(--tco-text)] font-sans selection:bg-[#3b82f6]/30 selection:text-[#3b82f6] overflow-x-hidden">
      <Navbar
        onOpenAuthModal={onOpenAuthModal}
        onLaunchPlatform={onLaunchPlatform}
        onNavigate={onNavigate}
        currentView={currentView}
      />
      <main className="pt-16">
        <Hero onLaunch={onLaunchPlatform} />
        <WorkspacePreview onLaunch={onLaunchPlatform} />
        <BrokerStrip onSelectBroker={onLaunchPlatform} />
        <ArchitectureSection />
        <WhyTradingCore />
        <FeaturesDeepDive />
        <HowItWorks onLaunch={onLaunchPlatform} />
        <PricingSection onSelectPlan={onLaunchPlatform} />
        <FutureModules />
        <FAQSection />
      </main>
      <Footer onLaunch={onLaunchPlatform} />
    </div>
  );
}
