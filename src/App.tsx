import React, { useState, useEffect } from 'react';
import { AuthProvider } from './auth/context/AuthContext';
import { useAuth } from './auth/hooks/useAuth';
import { useProfile } from './auth/hooks/useProfile';
import { Navbar } from './components/navigation/Navbar';
import { Hero } from './components/hero/Hero';
import { WorkspacePreview } from './components/workspace/WorkspacePreview';
import { BrokerStrip } from './components/brokers/BrokerStrip';
import { WhyTradingCore } from './components/features/WhyTradingCore';
import { ArchitectureSection } from './components/architecture/ArchitectureSection';
import { FeaturesDeepDive } from './components/features/FeaturesDeepDive';
import { HowItWorks } from './components/howItWorks/HowItWorks';
import { PricingSection } from './components/pricing/PricingSection';
import { FutureModules } from './components/roadmap/FutureModules';
import { FAQSection } from './components/faq/FAQSection';
import { Footer } from './components/footer/Footer';
import { AuthModalPlaceholder } from './components/auth/AuthModalPlaceholder';
import { FullWorkspaceView } from './components/workspace/FullWorkspaceView';
import { ModelsPage } from './pages/ModelsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { IndicatorsPage } from './pages/IndicatorsPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { ProfilePage } from './pages/ProfilePage';
import { WorkspaceRoute } from './components/workspace/WorkspaceModuleShell';
import { BrokerConnectionRequiredPage } from './pages/BrokerConnectionRequiredPage';
import { BrokerCallbackPage } from './pages/BrokerCallbackPage';
import { LegalPage } from './pages/LegalPage';
import { LoadingScreen } from './components/common/LoadingScreen';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

function AppContent() {
  // Check if current route is the OAuth callback popup route
  if (window.location.pathname.startsWith('/auth/broker-callback')) {
    return <BrokerCallbackPage />;
  }
  if (window.location.pathname === '/privacy') return <LegalPage kind="privacy" />;
  if (window.location.pathname === '/terms') return <LegalPage kind="terms" />;

  const { user, loading: authLoading, isAuthenticated, authStep, logout } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const viewFromPath = (path: string): 'landing' | 'app' | 'broker-connection' =>
    path === '/broker' ? 'broker-connection' : ['/dashboard','/live','/models','/automations','/indicators','/portfolio','/profile'].includes(path) ? 'app' : 'landing';
  const isWorkspaceRoute = (path: string): path is WorkspaceRoute => ['/live','/models','/automations','/indicators','/portfolio','/profile'].includes(path);

  const [currentView, setCurrentView] = useState<'landing' | 'app' | 'broker-connection'>(() =>
    viewFromPath(window.location.pathname)
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hasConnectedBroker, setHasConnectedBroker] = useState<boolean>(() =>
    tradingCoreRuntime.hasConnectedBroker()
  );

  const [brokerRestoreLoading, setBrokerRestoreLoading] = useState(true);

  // Public pages must never be blocked by broker/database restoration.
  // Only protected workspace entry waits briefly for broker state.
  const protectedEntry = currentView === 'app' || currentView === 'broker-connection';
  const isSystemInitializing = authLoading || (isAuthenticated && profileLoading) || (protectedEntry && brokerRestoreLoading);

  // Restore only the authenticated user's server-side broker sessions.
  useEffect(() => {
    let cancelled = false;
    if (authLoading || !isAuthenticated || !user) {
      if (!authLoading && !isAuthenticated && !cancelled) setBrokerRestoreLoading(false);
      return;
    }
    setBrokerRestoreLoading(true);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4500));
    Promise.race([tradingCoreRuntime.restoreBrokerConnections(), timeout]).finally(() => {
      if (!cancelled) setBrokerRestoreLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, user?.id]);

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

  // Keep browser Back/Forward and direct URL entry synchronized with the SPA.
  useEffect(() => {
    const handlePopState = () => setCurrentView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Authenticated users can still browse the public landing page. Protected dashboard
  // entry is redirected to broker setup when no broker connection exists.
  useEffect(() => {
    if (isSystemInitializing) return;
    const path = window.location.pathname;

    if (isAuthenticated && user) {
      if ((path === '/dashboard' || isWorkspaceRoute(path)) && !hasConnectedBroker) {
        window.history.replaceState({}, '', '/broker');
        setCurrentView('broker-connection');
        return;
      }
      if (path === '/' || path === '/broker' || path === '/dashboard' || isWorkspaceRoute(path)) {
        setCurrentView(viewFromPath(path));
        return;
      }
      window.history.replaceState({}, '', '/');
      setCurrentView('landing');
      return;
    }

    if (path !== '/' && !path.startsWith('/auth/')) window.history.replaceState({}, '', '/');
    setCurrentView('landing');
  }, [isAuthenticated, user, hasConnectedBroker, isSystemInitializing]);

  const handleOpenAuthModal = () => {
    setIsAuthModalOpen(true);
  };

  const handleCloseAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const navigate = (path: '/broker' | '/dashboard' | '/' | WorkspaceRoute) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setCurrentView(viewFromPath(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateWorkspace = (path: WorkspaceRoute) => {
    if (!tradingCoreRuntime.hasConnectedBroker()) { navigate('/broker'); return; }
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setCurrentView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLaunchPlatform = () => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!tradingCoreRuntime.hasConnectedBroker()) {
      navigate('/broker');
    } else {
      navigate('/live');
    }
  };

  const handleBackToLanding = () => navigate('/');


  const handleNavigateFromMenu = (view: string) => {
    if (view === 'broker-connection') {
      navigate('/broker');
    } else if (view === 'workspace' || view === 'app') {
      if (!tradingCoreRuntime.hasConnectedBroker()) navigate('/broker');
      else navigate('/live');
    } else if (view === 'landing') {
      navigate('/');
    }
  };

  // 1. Initial / Loading State Screen
  if (isSystemInitializing) {
    let loadingMsg = 'Checking Session...';
    let subMsg = 'Verifying your TradingCore login';

    if (authStep === 'connecting') {
      loadingMsg = 'Connecting...';
      subMsg = 'Establishing secure handshake with Google OAuth';
    } else if (authStep === 'authenticating') {
      loadingMsg = 'Authenticating...';
      subMsg = 'Verifying identity with Supabase Authentication';
    } else if (authStep === 'preparing') {
      loadingMsg = 'Preparing Workspace...';
      subMsg = 'Synchronizing kernel configuration and broker channels';
    } else if (brokerRestoreLoading && protectedEntry) {
      loadingMsg = 'Restoring Broker State...';
      subMsg = 'Checking your connected broker sessions securely';
    } else if (profileLoading) {
      loadingMsg = 'Loading Profile...';
      subMsg = 'Fetching user preferences and onboarding state';
    }

    return (
      <LoadingScreen
        message={loadingMsg}
        submessage={subMsg}
        onRetry={authLoading ? () => window.location.reload() : undefined}
        onContinue={!isAuthenticated && !profileLoading ? () => { window.history.replaceState({}, '', '/'); setCurrentView('landing'); } : undefined}
      />
    );
  }

  // 2. Mandatory Broker Connection Flow for Authenticated Users without a Broker
  if (isAuthenticated && user && currentView === 'broker-connection') {
    return (
      <BrokerConnectionRequiredPage
        onBack={() => navigate('/')}
        onBrokerConnected={() => {
          setHasConnectedBroker(true);
          navigate('/live');
        }}
      />
    );
  }

  // 3. Authenticated Full Trading Workspace View (Only accessible if broker is connected)
  if (currentView === 'app' && hasConnectedBroker) {
    const workspacePath = isWorkspaceRoute(window.location.pathname) ? window.location.pathname : '/live';
    if (workspacePath === '/models') return <ModelsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/automations') return <AutomationsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/indicators') return <IndicatorsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/portfolio') return <PortfolioPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/profile') return <ProfilePage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    return <FullWorkspaceView onBackToLanding={handleBackToLanding} onNavigateToBroker={() => navigate('/broker')} onNavigate={navigateWorkspace} />;
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

        {/* 4. SYSTEM ARCHITECTURE */}
        <ArchitectureSection />

        {/* 5. WHY TRADINGCORE */}
        <WhyTradingCore />

        {/* 6. PRECISION FEATURES DEEP DIVE */}
        <FeaturesDeepDive />

        {/* 7. HOW IT WORKS TIMELINE */}
        <HowItWorks onLaunch={handleLaunchPlatform} />

        {/* 8. PRICING ARCHITECTURE */}
        <PricingSection onSelectPlan={() => handleLaunchPlatform()} />

        {/* 9. FUTURE MODULES ROADMAP */}
        <FutureModules />

        {/* 10. FREQUENTLY ASKED QUESTIONS */}
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
