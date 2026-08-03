import React, { useState } from 'react';
import { Navbar } from './components/navigation/Navbar';
import { Hero } from './components/hero/Hero';
import { WorkspacePreview } from './components/workspace/WorkspacePreview';
import { BrokerStrip } from './components/brokers/BrokerStrip';
import { WhyTradingCore } from './components/features/WhyTradingCore';
import { FeaturesDeepDive } from './components/features/FeaturesDeepDive';
import { HowItWorks } from './components/howItWorks/HowItWorks';
import { PricingSection } from './components/pricing/PricingSection';
import { FutureModules } from './components/roadmap/FutureModules';
import { FAQSection } from './components/faq/FAQSection';
import { Footer } from './components/footer/Footer';
import { AuthModalPlaceholder } from './components/auth/AuthModalPlaceholder';
import { DemoModal } from './components/demo/DemoModal';
import { FullWorkspaceView } from './components/workspace/FullWorkspaceView';

export default function App() {
  const [currentView, setCurrentView] = useState<'landing' | 'app'>('landing');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  const handleOpenAuthModal = () => {
    setIsAuthModalOpen(true);
  };

  const handleCloseAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const handleOpenDemoModal = () => {
    setIsDemoModalOpen(true);
  };

  const handleCloseDemoModal = () => {
    setIsDemoModalOpen(false);
  };

  const handleLaunchPlatform = () => {
    setCurrentView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToLanding = () => {
    setCurrentView('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (currentView === 'app') {
    return <FullWorkspaceView onBackToLanding={handleBackToLanding} />;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans selection:bg-[#10b981]/30 selection:text-[#10b981] overflow-x-hidden">
      {/* NAVIGATION BAR */}
      <Navbar
        onOpenAuthModal={handleOpenAuthModal}
        onLaunchPlatform={handleLaunchPlatform}
        currentView={currentView}
      />

      {/* MAIN SCROLLING EXPERIENCE */}
      <main className="pt-16">
        {/* 1. HERO SECTION */}
        <Hero
          onLaunch={handleLaunchPlatform}
          onOpenDemo={handleOpenDemoModal}
        />

        {/* 2. WORKSPACE PREVIEW (ENLARGED CENTERPIECE) */}
        <WorkspacePreview onLaunch={handleLaunchPlatform} />

        {/* 3. SUPPORTED BROKERS STRIP */}
        <BrokerStrip onSelectBroker={() => handleOpenAuthModal()} />

        {/* 4. WHY TRADINGCORE (BENTO GRID) */}
        <WhyTradingCore />

        {/* 5. PRECISION FEATURES DEEP DIVE */}
        <FeaturesDeepDive />

        {/* 6. HOW IT WORKS TIMELINE */}
        <HowItWorks onLaunch={handleLaunchPlatform} />

        {/* 7. PRICING ARCHITECTURE */}
        <PricingSection onSelectPlan={() => handleOpenAuthModal()} />

        {/* 8. FUTURE MODULES ROADMAP */}
        <FutureModules />

        {/* 9. FREQUENTLY ASKED QUESTIONS */}
        <FAQSection />
      </main>

      {/* 10. INSTITUTIONAL FOOTER */}
      <Footer onLaunch={handleLaunchPlatform} />

      {/* AUTHENTICATION & BROKER OAUTH MODAL */}
      <AuthModalPlaceholder
        isOpen={isAuthModalOpen}
        onClose={handleCloseAuthModal}
        onLaunchWorkspace={handleLaunchPlatform}
      />

      {/* DEMO VIDEO & TERMINAL WALKTHROUGH MODAL */}
      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={handleCloseDemoModal}
        onLaunch={handleLaunchPlatform}
      />
    </div>
  );
}
