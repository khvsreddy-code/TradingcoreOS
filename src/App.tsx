import React, { useState, useEffect } from 'react';
import { AuthProvider } from './auth/context/AuthContext';
import { useAuth } from './auth/hooks/useAuth';
import { useProfile } from './auth/hooks/useProfile';
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
import { FullWorkspaceView } from './components/workspace/FullWorkspaceView';
import { BrokerConnectionRequiredPage } from './pages/BrokerConnectionRequiredPage';
import { LoadingScreen } from './components/common/LoadingScreen';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

function AppContent() {
  const { user, loading: authLoading, isAuthenticated, authStep, logout } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [currentView, setCurrentView] = useState<'landing' | 'app' | 'broker-connection'>('landing');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hasConnectedBroker, setHasConnectedBroker] = useState<boolean>(() =>
    tradingCoreRuntime.hasConnectedBroker()
  );

  const isSystemInitializing = authLoading || profileLoading;

  // Sync broker connection state on runtime events
  useEffect(() => {
    const checkBroker = () => {
      setHasConnectedBroker(tradingCoreRuntime.hasConnectedBroker());
    };
    checkBroker();
    const unsub1 = tradingCoreRuntime.on('BROKER_CONNECTED', checkBroker);
    const unsub2 = tradingCoreRuntime.on('BROKER_DISCONNECTED', checkBroker);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Persistence & Route Protection Effect
  useEffect(() => {
    if (!isSystemInitializing) {
      if (isAuthenticated && user) {
        if (!hasConnectedBroker) {
          setCurrentView('broker-connection');
        } else if (currentView === 'landing' && window.location.hash === '#app') {
          setCurrentView('app');
        }
      } else {
        if (currentView === 'app' || currentView === 'broker-connection') {
          setCurrentView('landing');
        }
      }
    }
  }, [isAuthenticated, user, hasConnectedBroker, isSystemInitializing, currentView]);

  const handleOpenAuthModal = () => {
    setIsAuthModalOpen(true);
  };

  const handleCloseAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const handleLaunchPlatform = () => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!tradingCoreRuntime.hasConnectedBroker()) {
      setCurrentView('broker-connection');
    } else {
      setCurrentView('app');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToLanding = () => {
    setCurrentView('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateFromMenu = (view: string) => {
    if (view === 'broker-connection') {
      setCurrentView('broker-connection');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (view === 'workspace' || view === 'app') {
      if (!tradingCoreRuntime.hasConnectedBroker()) {
        setCurrentView('broker-connection');
      } else {
        setCurrentView('app');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (view === 'landing') {
      setCurrentView('landing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 1. Initial / Loading State Screen
  if (isSystemInitializing) {
    let loadingMsg = 'Checking Session...';
    let subMsg = 'Restoring encrypted OAuth token & user profile';

    if (authStep === 'connecting') {
      loadingMsg = 'Connecting...';
      subMsg = 'Establishing secure handshake with Google OAuth';
    } else if (authStep === 'authenticating') {
      loadingMsg = 'Authenticating...';
      subMsg = 'Verifying identity with Supabase Authentication';
    } else if (authStep === 'preparing') {
      loadingMsg = 'Preparing Workspace...';
      subMsg = 'Synchronizing kernel configuration and broker channels';
    } else if (profileLoading) {
      loadingMsg = 'Loading Profile...';
      subMsg = 'Fetching user preferences and onboarding state';
    }

    return <LoadingScreen message={loadingMsg} submessage={subMsg} />;
  }

  // 2. Mandatory Broker Connection Flow for Authenticated Users without a Broker
  if (isAuthenticated && user && (!hasConnectedBroker || currentView === 'broker-connection')) {
    return (
      <BrokerConnectionRequiredPage
        onBrokerConnected={() => {
          setHasConnectedBroker(true);
          setCurrentView('app');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  // 3. Authenticated Full Trading Workspace View (Only accessible if broker is connected)
  if (currentView === 'app' && hasConnectedBroker) {
    return (
      <FullWorkspaceView
        onBackToLanding={handleBackToLanding}
        onNavigateToBroker={() => handleNavigateFromMenu('broker-connection')}
      />
    );
  }

  // 4. Landing Page
  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans selection:bg-[#10b981]/30 selection:text-[#10b981] overflow-x-hidden">
      {/* NAVIGATION BAR */}
      <Navbar
        onOpenAuthModal={handleOpenAuthModal}
        onLaunchPlatform={handleLaunchPlatform}
        onNavigate={handleNavigateFromMenu}
        currentView={currentView}
      />

      {/* MAIN SCROLLING EXPERIENCE */}
      <main className="pt-16">
        {/* 1. HERO SECTION */}
        <Hero
          onLaunch={handleLaunchPlatform}
        />

        {/* 2. WORKSPACE PREVIEW */}
        <WorkspacePreview onLaunch={handleLaunchPlatform} />

        {/* 3. SUPPORTED BROKERS STRIP */}
        <BrokerStrip onSelectBroker={() => handleLaunchPlatform()} />

        {/* 4. WHY TRADINGCORE */}
        <WhyTradingCore />

        {/* 5. PRECISION FEATURES DEEP DIVE */}
        <FeaturesDeepDive />

        {/* 6. HOW IT WORKS TIMELINE */}
        <HowItWorks onLaunch={handleLaunchPlatform} />

        {/* 7. PRICING ARCHITECTURE */}
        <PricingSection onSelectPlan={() => handleLaunchPlatform()} />

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
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
