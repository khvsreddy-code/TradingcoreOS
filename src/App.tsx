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
  if (window.location.pathname.startsWith('/auth/broker-callback')) return <BrokerCallbackPage />;
  if (window.location.pathname === '/privacy') return <LegalPage kind="privacy" />;
  if (window.location.pathname === '/terms') return <LegalPage kind="terms" />;

  const { user, loading: authLoading, isAuthenticated, authStep } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const viewFromPath = (path: string): 'landing' | 'app' | 'broker-connection' =>
    path === '/broker' ? 'broker-connection' : ['/dashboard','/live','/models','/automations','/indicators','/portfolio','/profile'].includes(path) ? 'app' : 'landing';
  const isWorkspaceRoute = (path: string): path is WorkspaceRoute => ['/live','/models','/automations','/indicators','/portfolio','/profile'].includes(path);

  const [currentView, setCurrentView] = useState<'landing' | 'app' | 'broker-connection'>(() => viewFromPath(window.location.pathname));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hasConnectedBroker, setHasConnectedBroker] = useState<boolean>(() => tradingCoreRuntime.hasConnectedBroker());
  const [brokerRestoreReady, setBrokerRestoreReady] = useState(!isAuthenticated);
  const protectedEntry = currentView === 'app' || currentView === 'broker-connection';
  const isSystemInitializing = authLoading || (protectedEntry && isAuthenticated && !brokerRestoreReady);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !isAuthenticated || !user) {
      if (!authLoading && !isAuthenticated && !cancelled) setBrokerRestoreReady(true);
      return;
    }
    setBrokerRestoreReady(false);
    void tradingCoreRuntime.restoreBrokerConnections().finally(() => {
      if (!cancelled) {
        setHasConnectedBroker(tradingCoreRuntime.hasConnectedBroker());
        setBrokerRestoreReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    const checkBroker = () => setHasConnectedBroker(tradingCoreRuntime.hasConnectedBroker());
    checkBroker();
    const unsub1 = tradingCoreRuntime.on('BROKER_CONNECTED', checkBroker);
    const unsub2 = tradingCoreRuntime.on('BROKER_DISCONNECTED', checkBroker);
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    const handlePopState = () => setCurrentView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const path = window.location.pathname;
    if (isAuthenticated && user) {
      if (brokerRestoreReady && (path === '/dashboard' || isWorkspaceRoute(path)) && !hasConnectedBroker) {
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
  }, [isAuthenticated, user, hasConnectedBroker, brokerRestoreReady, authLoading]);

  const handleOpenAuthModal = () => setIsAuthModalOpen(true);
  const handleCloseAuthModal = () => setIsAuthModalOpen(false);

  const navigate = (path: '/broker' | '/dashboard' | '/' | WorkspaceRoute) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setCurrentView(viewFromPath(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigation must never wait for broker REST/database calls. The destination shell
  // renders immediately; broker restoration is already running globally and only the
  // protected-entry guard redirects to /broker when no connected session exists.
  const navigateWorkspace = (path: WorkspaceRoute) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setCurrentView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!tradingCoreRuntime.hasConnectedBroker()) {
      void tradingCoreRuntime.restoreBrokerConnections().then(() => {
        const connected = tradingCoreRuntime.hasConnectedBroker();
        setHasConnectedBroker(connected);
        if (!connected) navigate('/broker');
      });
    }
  };

  const handleLaunchPlatform = async () => {
    if (!isAuthenticated) { setIsAuthModalOpen(true); return; }
    if (!tradingCoreRuntime.hasConnectedBroker()) {
      void tradingCoreRuntime.restoreBrokerConnections().then(() => {
        const connected = tradingCoreRuntime.hasConnectedBroker();
        setHasConnectedBroker(connected);
        navigate(connected ? '/live' : '/broker');
      });
      navigate('/live');
      return;
    }
    navigate('/live');
  };

  const handleBackToLanding = () => navigate('/');
  const handleNavigateFromMenu = (view: string) => {
    if (view === 'broker-connection') navigate('/broker');
    else if (view === 'workspace' || view === 'app') navigate(tradingCoreRuntime.hasConnectedBroker() ? '/live' : '/broker');
    else if (view === 'landing') navigate('/');
  };

  if (isSystemInitializing) {
    let loadingMsg = 'Checking Session...'; let subMsg = 'Verifying your TradingCore login';
    if (authStep === 'connecting') { loadingMsg = 'Connecting...'; subMsg = 'Establishing secure handshake with Google OAuth'; }
    else if (authStep === 'authenticating') { loadingMsg = 'Authenticating...'; subMsg = 'Verifying identity with Supabase Authentication'; }
    else if (authStep === 'preparing') { loadingMsg = 'Preparing Workspace...'; subMsg = 'Synchronizing kernel configuration and broker channels'; }
    else if (protectedEntry && !brokerRestoreReady) { loadingMsg = 'Restoring Broker State...'; subMsg = 'Checking your connected broker sessions securely'; }
    else if (profileLoading) { loadingMsg = 'Loading Profile...'; subMsg = 'Fetching user preferences and onboarding state'; }
    return <LoadingScreen message={loadingMsg} submessage={subMsg} onRetry={authLoading ? () => window.location.reload() : undefined} onContinue={!isAuthenticated && !profileLoading ? () => { window.history.replaceState({}, '', '/'); setCurrentView('landing'); } : undefined} />;
  }

  if (isAuthenticated && user && currentView === 'broker-connection') {
    return <BrokerConnectionRequiredPage onBack={() => navigate('/')} onBrokerConnected={() => { setHasConnectedBroker(true); navigate('/live'); }} />;
  }

  if (currentView === 'app' && hasConnectedBroker) {
    const workspacePath = isWorkspaceRoute(window.location.pathname) ? window.location.pathname : '/live';
    if (workspacePath === '/models') return <ModelsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/automations') return <AutomationsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/indicators') return <IndicatorsPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/portfolio') return <PortfolioPage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    if (workspacePath === '/profile') return <ProfilePage onNavigate={navigateWorkspace} onBackToLanding={handleBackToLanding} onBroker={() => navigate('/broker')} />;
    return <FullWorkspaceView onBackToLanding={handleBackToLanding} onNavigateToBroker={() => navigate('/broker')} onNavigate={navigateWorkspace} />;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans selection:bg-[#10b981]/30 selection:text-[#10b981] overflow-x-hidden">
      <Navbar onOpenAuthModal={handleOpenAuthModal} onLaunchPlatform={handleLaunchPlatform} onNavigate={handleNavigateFromMenu} currentView={currentView} />
      <main className="pt-16"><Hero onLaunch={handleLaunchPlatform}/><WorkspacePreview onLaunch={handleLaunchPlatform}/><BrokerStrip onSelectBroker={() => handleLaunchPlatform()}/><ArchitectureSection/><WhyTradingCore/><FeaturesDeepDive/><HowItWorks onLaunch={handleLaunchPlatform}/><PricingSection onSelectPlan={() => handleLaunchPlatform()}/><FutureModules/><FAQSection/></main>
      <Footer onLaunch={handleLaunchPlatform}/>
      <AuthModalPlaceholder isOpen={isAuthModalOpen} onClose={handleCloseAuthModal} onLaunchWorkspace={handleLaunchPlatform}/>
    </div>
  );
}

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }
