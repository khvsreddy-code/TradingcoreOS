import { Component, lazy, Suspense, useState, useEffect, useRef, type ReactNode } from 'react';
import { AuthProvider } from './auth/context/AuthContext';
import { useAuth } from './auth/hooks/useAuth';
import { useProfile } from './auth/hooks/useProfile';
import type { WorkspaceRoute } from './components/workspace/WorkspaceModuleShellTypes';
import { WORKSPACE_ROUTES, isWorkspaceRoute } from './routing/appRoutes';
import { LoadingScreen } from './components/common/LoadingScreen';
import { LandingShell } from './appShells/LandingShell';
import { TradingWorkspaceShell } from './appShells/TradingWorkspaceShell';
import { LiveTradingShell } from './appShells/LiveTradingShell';
import { ThemeProvider } from './theme/ThemeContext';
import { loadTradingCoreRuntime } from './services/runtime/tradingCoreRuntimeLoader';
import type { TradingCoreRuntimeApi } from './services/runtime/tradingCoreRuntimeLoader';

const BrokerConnectionRequiredPage = lazy(() => import('./pages/BrokerConnectionRequiredPage').then(m => ({ default: m.BrokerConnectionRequiredPage })));
const BrokerCallbackPage = lazy(() => import('./pages/BrokerCallbackPage').then(m => ({ default: m.BrokerCallbackPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const IndicatorExplorePage = lazy(() => import('./pages/IndicatorExplorePage').then(m => ({ default: m.IndicatorExplorePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

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

    let cancelled = false;
    setBrokerRestoreReady(false);

    // Do not mark broker restoration ready merely because the runtime module has
    // loaded. On a hard refresh the runtime is created before its async server
    // session restore finishes; publishing "ready" at that point can render
    // /live with an empty in-memory broker map and send the user to /broker.
    void loadTradingCoreRuntime()
      .then(async (nextRuntime) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        try {
          await nextRuntime.restoreBrokerConnections();
        } catch {
          // The UI remains deterministic: no broker is assumed connected when
          // the server-side restore could not be completed.
        }
        if (!cancelled) {
          setHasConnectedBroker(nextRuntime.hasConnectedBroker());
          setBrokerRestoreReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasConnectedBroker(false);
          setBrokerRestoreReady(true);
        }
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id, publicIndicatorRoute, protectedEntry]);

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
            // The broker setup screen is a real route. Once OAuth verification
            // completes, the Launch Workspace action must advance the app shell
            // to the command center rather than leaving the user on /broker.
            setHasConnectedBroker(true);
            navigate('/dashboard');
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
          {workspacePath === '/live'
            ? hasConnectedBroker
              ? <LiveTradingShell />
              : <BrokerConnectionRequiredPage
                  onBack={() => navigate('/dashboard')}
                  onBrokerConnected={() => {
                    setHasConnectedBroker(true);
                    navigate('/live');
                  }}
                />
            : <TradingWorkspaceShell
                route={workspacePath}
                onNavigate={navigateWorkspace}
                onBroker={() => navigate('/broker')}
              />}
        </Suspense>
      </RouteErrorBoundary>
    );
  }

  return (
    <LandingShell
      isAuthModalOpen={isAuthModalOpen}
      onOpenAuthModal={() => setIsAuthModalOpen(true)}
      onCloseAuthModal={() => setIsAuthModalOpen(false)}
      onLaunchPlatform={handleLaunchPlatform}
      onNavigate={handleNavigateFromMenu}
      currentView={currentView}
    />
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
