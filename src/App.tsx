import { Component, lazy, Suspense, useState, useEffect, useRef, type ReactNode } from 'react';
import { AuthProvider } from './auth/context/AuthContext';
import { useAuth } from './auth/hooks/useAuth';
import { useProfile } from './auth/hooks/useProfile';
import type { WorkspaceRoute } from './components/workspace/WorkspaceModuleShellTypes';
import { WORKSPACE_ROUTES, isWorkspaceRoute } from './routing/appRoutes';
import { LoadingScreen } from './components/common/LoadingScreen';
import { ThemeProvider } from './theme/ThemeContext';
import { loadTradingCoreRuntime } from './services/runtime/tradingCoreRuntimeLoader';
import type { TradingCoreRuntimeApi } from './services/runtime/tradingCoreRuntimeLoader';

const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const AuthModalPlaceholder = lazy(() => import('./components/auth/AuthModalPlaceholder').then(m => ({ default: m.AuthModalPlaceholder })));
const BrokerConnectionRequiredPage = lazy(() => import('./pages/BrokerConnectionRequiredPage').then(m => ({ default: m.BrokerConnectionRequiredPage })));
const BrokerCallbackPage = lazy(() => import('./pages/BrokerCallbackPage').then(m => ({ default: m.BrokerCallbackPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const LiveTradingTerminal = lazy(() => import('./LiveTradingTerminal').then(m => ({ default: m.LiveTradingTerminal })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PredictionCenterPage = lazy(() => import('./pages/PredictionCenterPage').then(m => ({ default: m.PredictionCenterPage })));
const ModelsPage = lazy(() => import('./pages/ModelsPage').then(m => ({ default: m.ModelsPage })));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage').then(m => ({ default: m.AutomationsPage })));
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage').then(m => ({ default: m.IndicatorsPage })));
const IndicatorExplorePage = lazy(() => import('./pages/IndicatorExplorePage').then(m => ({ default: m.IndicatorExplorePage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const CoreSpiritEditorPage = lazy(() => import('./pages/CoreSpiritEditorPage').then(m => ({ default: m.CoreSpiritEditorPage })));
const CoreSpiritDocsPage = lazy(() => import('./pages/CoreSpiritDocsPage').then(m => ({ default: m.CoreSpiritDocsPage })));

const workspacePaths = WORKSPACE_ROUTES;

const viewFromPath = (path: string): 'landing' | 'login' | 'app' | 'broker-connection' =>
  path === '/broker' ? 'broker-connection' :
  path === '/login' ? 'login' :
  (path === '/' || path === '/landing') ? 'landing' :
  isWorkspaceRoute(path) ? 'app' : 'landing';

type RouteErrorBoundaryProps = { children: ReactNode; onHome: () => void };

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[var(--tco-bg)] p-8 text-[var(--tco-text)]">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#3b2530] bg-[var(--tco-surface)] p-6">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[#ef4444]">Workspace route error</div>
          <h1 className="mt-2 text-xl font-bold">This module could not be loaded.</h1>
          <p className="mt-2 text-xs leading-5 text-[var(--tco-muted)]">{this.state.error.message || 'Unknown runtime error'}</p>
          <button
            type="button"
            onClick={this.props.onHome}
            className="mt-5 rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-[var(--tco-surface-2)]"
          >
            Back to Command Center
          </button>
        </div>
      </div>
    );
  }
}

function pathnameIsPublicIndicator(path: string) {
  return path === '/explore/indicators' || path.startsWith('/explore/indicators/');
}

function pathnameIsPublicScript(path: string) {
  return path === '/explore/scripts' || path.startsWith('/explore/scripts/');
}

function routeFallback(message = 'Loading Workspace...', submessage = 'Preparing trading module') {
  return <LoadingScreen message={message} submessage={submessage} />;
}

function AppContent() {
  const { user, loading: authLoading, isAuthenticated, authStep } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  void profile;

  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [routeErrorReset, setRouteErrorReset] = useState(0);
  const publicIndicatorRoute = pathnameIsPublicIndicator(pathname) || pathnameIsPublicScript(pathname);
  const initialProtectedEntry = useRef(workspacePaths.includes(window.location.pathname as WorkspaceRoute));
  const [runtime, setRuntime] = useState<TradingCoreRuntimeApi | null>(null);
  const [hasConnectedBroker, setHasConnectedBroker] = useState(false);
  const [brokerRestoreReady, setBrokerRestoreReady] = useState(() => !isAuthenticated || !initialProtectedEntry.current);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const currentView = viewFromPath(pathname);
  const protectedEntry = currentView === 'app' || currentView === 'broker-connection';
  const isSystemInitializing = authLoading || (initialProtectedEntry.current && isAuthenticated && !brokerRestoreReady);

  useEffect(() => {
    const pop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || publicIndicatorRoute || !protectedEntry) return;
    if (runtime) {
      setBrokerRestoreReady(true);
      return;
    }

    let cancelled = false;
    setBrokerRestoreReady(false);

    void loadTradingCoreRuntime()
      .then(async (nextRuntime) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        try { await nextRuntime.restoreBrokerConnections(); } catch {}
        if (!cancelled) {
          setHasConnectedBroker(nextRuntime.hasConnectedBroker());
          setBrokerRestoreReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setBrokerRestoreReady(true);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id, publicIndicatorRoute, protectedEntry, runtime]);

  useEffect(() => {
    if (!runtime) return;
    const check = () => setHasConnectedBroker(runtime.hasConnectedBroker());
    check();
    const onConnected = runtime.on('BROKER_CONNECTED', check);
    const onDisconnected = runtime.on('BROKER_DISCONNECTED', check);
    return () => { onConnected(); onDisconnected(); };
  }, [runtime]);

  useEffect(() => {
    const isBrokerCallbackRoute = pathname.startsWith('/auth/broker-callback');
    if (publicIndicatorRoute || isBrokerCallbackRoute) return;
    if (authLoading || (initialProtectedEntry.current && !brokerRestoreReady)) return;

    if (isAuthenticated && user) {
      if (pathname === '/login' || pathname === '/' || pathname === '/landing') {
        window.history.replaceState({}, '', '/dashboard');
        setPathname('/dashboard');
        return;
      }
      if (pathname === '/broker' || isWorkspaceRoute(pathname)) return;
      window.history.replaceState({}, '', '/dashboard');
      setPathname('/dashboard');
      return;
    }

    if (pathname !== '/' && pathname !== '/landing' && pathname !== '/login' && !pathname.startsWith('/auth/')) {
      window.history.replaceState({}, '', '/login');
      setPathname('/login');
    }
  }, [isAuthenticated, user, pathname, brokerRestoreReady, authLoading, publicIndicatorRoute]);

  const navigate = (path: '/broker' | '/' | '/landing' | '/login' | WorkspaceRoute) => {
    if (window.location.pathname === path) {
      setPathname(path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    window.history.pushState({}, '', path);
    setPathname(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const navigateWorkspace = (path: WorkspaceRoute) => {
    if (path === '/live' && runtime && !runtime.hasConnectedBroker()) {
      navigate('/broker');
      return;
    }
    navigate(path);
  };

  const handleLaunchPlatform = () => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    navigate('/dashboard');
  };

  const handleNavigateFromMenu = (view: string) => {
    if (view === 'broker-connection') navigate('/broker');
    else if (view === 'workspace' || view === 'app') navigate('/dashboard');
    else if (view === 'landing') navigate('/landing');
    else if (view === 'login') navigate('/login');
  };

  if (window.location.pathname.startsWith('/auth/broker-callback')) {
    return <Suspense fallback={routeFallback('Loading callback...', 'Finalizing broker authorization')}><BrokerCallbackPage /></Suspense>;
  }

  if (window.location.pathname === '/privacy') {
    return <Suspense fallback={routeFallback('Loading legal page...', 'Preparing TradingCore information')}><LegalPage kind="privacy" /></Suspense>;
  }

  if (window.location.pathname === '/terms') {
    return <Suspense fallback={routeFallback('Loading legal page...', 'Preparing TradingCore information')}><LegalPage kind="terms" /></Suspense>;
  }

  if (publicIndicatorRoute) {
    return (
      <Suspense fallback={routeFallback('Loading Indicator Explore...', 'Preparing public CoreSpirit catalog')}>
        <IndicatorExplorePage />
      </Suspense>
    );
  }

  if (isSystemInitializing) {
    let loadingMsg = 'Checking Session...';
    let subMsg = 'Verifying your TradingCore login';
    if (authStep === 'connecting') { loadingMsg = 'Connecting...'; subMsg = 'Establishing secure handshake with Google OAuth'; }
    else if (authStep === 'authenticating') { loadingMsg = 'Authenticating...'; subMsg = 'Verifying identity with Supabase Authentication'; }
    else if (authStep === 'preparing') { loadingMsg = 'Preparing Workspace...'; subMsg = 'Synchronizing kernel configuration and broker channels'; }
    else if (protectedEntry && !brokerRestoreReady) { loadingMsg = 'Restoring Broker State...'; subMsg = 'Checking your connected broker sessions securely'; }
    else if (profileLoading) { loadingMsg = 'Loading Profile...'; subMsg = 'Fetching user preferences and onboarding state'; }

    return (
      <LoadingScreen
        message={loadingMsg}
        submessage={subMsg}
        onRetry={authLoading ? () => window.location.reload() : undefined}
        onContinue={!isAuthenticated && !profileLoading ? () => navigate('/') : undefined}
      />
    );
  }

  if (currentView === 'login') {
    const handleLoginSuccess = async () => {
      try {
        const nextRuntime = await loadTradingCoreRuntime();
        setRuntime(nextRuntime);
        await nextRuntime.restoreBrokerConnections().catch(() => undefined);
        const connected = nextRuntime.hasConnectedBroker();
        setHasConnectedBroker(connected);
        setBrokerRestoreReady(true);
        navigate(connected ? '/dashboard' : '/broker');
      } catch {
        navigate('/dashboard');
      }
    };

    return (
      <Suspense fallback={routeFallback('Loading Sign In...', 'Preparing secure authentication')}>
        <LoginPage
          onBack={() => navigate('/landing')}
          onSuccess={() => { void handleLoginSuccess(); }}
        />
      </Suspense>
    );
  }

  if (isAuthenticated && user && currentView === 'broker-connection') {
    return (
      <Suspense fallback={routeFallback('Loading Broker Connection...', 'Preparing secure broker authorization')}>
        <BrokerConnectionRequiredPage
          onBack={() => navigate('/dashboard')}
          onBrokerConnected={() => {
            // Completing broker OAuth is intentionally NOT a navigation event.
            // Stay on /broker so the user can inspect the ready state and
            // explicitly launch the workspace.
            setHasConnectedBroker(true);
          }}
        />
      </Suspense>
    );
  }

  if (currentView === 'app') {
    const workspacePath: WorkspaceRoute = isWorkspaceRoute(pathname) ? pathname : '/dashboard';
    return (
      <RouteErrorBoundary
        key={workspacePath + ':' + routeErrorReset}
        onHome={() => {
          setRouteErrorReset(v => v + 1);
          navigate('/dashboard');
        }}
      >
        <Suspense key={workspacePath} fallback={routeFallback()}>
          {workspacePath === '/dashboard' && <DashboardPage onNavigate={navigateWorkspace} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/models' && <ModelsPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/predictions' && <PredictionCenterPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/automations' && <AutomationsPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/indicators' && <IndicatorsPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/portfolio' && <PortfolioPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/profile' && <ProfilePage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/corespirit/docs' && <CoreSpiritDocsPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/corespirit' && <CoreSpiritEditorPage onNavigate={navigateWorkspace} onBackToLanding={() => navigate('/dashboard')} onBroker={() => navigate('/broker')} />}
          {workspacePath === '/live' && (
            hasConnectedBroker
              ? <LiveTradingTerminal />
              : <BrokerConnectionRequiredPage
                  onBack={() => navigate('/dashboard')}
                  onBrokerConnected={() => {
                    setHasConnectedBroker(true);
                    navigate('/live');
                  }}
                />
          )}
        </Suspense>
      </RouteErrorBoundary>
    );
  }

  return (
    <>
      <Suspense fallback={routeFallback('Loading TradingCore...', 'Preparing the public workspace')}>
        <LandingPage
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLaunchPlatform={handleLaunchPlatform}
          onNavigate={handleNavigateFromMenu}
          currentView={currentView}
        />
      </Suspense>
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModalPlaceholder
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onLaunchWorkspace={handleLaunchPlatform}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
