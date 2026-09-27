import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
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
import { WorkspaceRoute } from './components/workspace/WorkspaceModuleShell';
import { BrokerConnectionRequiredPage } from './pages/BrokerConnectionRequiredPage';
import { BrokerCallbackPage } from './pages/BrokerCallbackPage';
import { LegalPage } from './pages/LegalPage';
import { LoadingScreen } from './components/common/LoadingScreen';
import { BrokerRuntimeSwitcher } from './components/brokers/BrokerRuntimeSwitcher';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

const LiveTradingTerminalV5 = lazy(async () => {
  try {
    const m = await import('./LiveTradingTerminalV5');
    if (!m || typeof m.LiveTradingTerminalV5 !== 'function') throw new Error('Live trading module export is unavailable');
    return { default: m.LiveTradingTerminalV5 };
  } catch (error) {
    console.error('[TradingCore] LiveTradingTerminalV5 module load failed:', error);
    const fallback = await import('./LiveTradingTerminalV4');
    return { default: fallback.LiveTradingTerminalV4 };
  }
});
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ModelsPage = lazy(() => import('./pages/PredictionCenterPage').then(m => ({ default: m.PredictionCenterPage })));
const PredictionCenterPage = lazy(() => import('./pages/PredictionCenterPage').then(m => ({ default: m.PredictionCenterPage })));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage').then(m => ({ default: m.AutomationsPage })));
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage').then(m => ({ default: m.IndicatorsPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const CoreSpiritEditorPage = lazy(() => import('./pages/CoreSpiritEditorPage').then(m => ({ default: m.CoreSpiritEditorPage })));

const workspacePaths: WorkspaceRoute[] = ['/dashboard','/live','/models','/predictions','/automations','/indicators','/portfolio','/profile','/corespirit'];
const isWorkspaceRoute = (path: string): path is WorkspaceRoute => workspacePaths.includes(path as WorkspaceRoute);
const viewFromPath = (path: string): 'landing' | 'login' | 'app' | 'broker-connection' =>
  path === '/broker' ? 'broker-connection' :
  path === '/login' ? 'login' :
  (path === '/' || path === '/landing') ? 'landing' :
  isWorkspaceRoute(path) ? 'app' : 'landing';

class LiveModuleBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    console.error('[TradingCore] Live V5 module failed; falling back to stable V4 workspace:', this.state.error);
    return <FallbackLiveWorkspace />;
  }
}
const FallbackLiveWorkspace = React.lazy(() => import('./LiveTradingTerminalV4').then(m => ({ default: m.LiveTradingTerminalV4 })));

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { if (!this.state.error) return this.props.children; return <div className="min-h-screen bg-[#080a0f] p-8 text-[#f3f4f6]"><div className="mx-auto max-w-xl rounded-2xl border border-[#3b2530] bg-[#0c0e15] p-6"><div className="text-[9px] font-mono uppercase tracking-widest text-[#ef4444]">Workspace route error</div><h1 className="mt-2 text-xl font-bold">This module could not be loaded.</h1><p className="mt-2 text-xs leading-5 text-[#8c93a6]">{this.state.error.message || 'Unknown runtime error'}</p><button type="button" onClick={this.props.onHome} className="mt-5 rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-[#06101f]">Back to Command Center</button></div></div>; }
}
function AppContent() {
  if (window.location.pathname.startsWith('/auth/broker-callback')) return <BrokerCallbackPage />;
  if (window.location.pathname === '/privacy') return <LegalPage kind="privacy" />;
  if (window.location.pathname === '/terms') return <LegalPage kind="terms" />;
  const { user, loading: authLoading, isAuthenticated, authStep } = useAuth(); const { profile, loading: profileLoading } = useProfile(); void profile;
  const [pathname, setPathname] = useState(() => window.location.pathname); const [hasConnectedBroker, setHasConnectedBroker] = useState<boolean>(() => tradingCoreRuntime.hasConnectedBroker()); const [brokerRestoreReady, setBrokerRestoreReady] = useState(!isAuthenticated); const [isAuthModalOpen, setIsAuthModalOpen] = useState(false); const initialProtectedEntry = useRef(workspacePaths.includes(window.location.pathname as WorkspaceRoute)); const currentView = viewFromPath(pathname); const protectedEntry = currentView === 'app' || currentView === 'broker-connection'; const isSystemInitializing = authLoading || (initialProtectedEntry.current && isAuthenticated && !brokerRestoreReady);
  useEffect(() => { const pop=()=>setPathname(window.location.pathname); window.addEventListener('popstate',pop); return()=>window.removeEventListener('popstate',pop); },[]);
  useEffect(() => { let cancelled=false; if(authLoading||!isAuthenticated||!user){if(!authLoading&&!isAuthenticated&&!cancelled)setBrokerRestoreReady(true);return;} setBrokerRestoreReady(false); void tradingCoreRuntime.restoreBrokerConnections().finally(()=>{if(!cancelled){setHasConnectedBroker(tradingCoreRuntime.hasConnectedBroker());setBrokerRestoreReady(true);}}); return()=>{cancelled=true;}; },[authLoading,isAuthenticated,user?.id]);
  useEffect(() => { const check=()=>setHasConnectedBroker(tradingCoreRuntime.hasConnectedBroker()); check(); const a=tradingCoreRuntime.on('BROKER_CONNECTED',check),b=tradingCoreRuntime.on('BROKER_DISCONNECTED',check); return()=>{a();b();}; },[]);
  useEffect(() => {
    if (authLoading || !brokerRestoreReady) return;
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
  }, [isAuthenticated,user,pathname,brokerRestoreReady,authLoading]);
  const navigate=(path:'/broker'|'/'|'/landing'|'/login'|WorkspaceRoute)=>{if(window.location.pathname===path){setPathname(path);window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0,behavior:'auto'});return;}window.history.pushState({},'',path);setPathname(path);window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0,behavior:'auto'});}; const navigateWorkspace=(path:WorkspaceRoute)=>{if(path==='/live'&&!tradingCoreRuntime.hasConnectedBroker()){navigate('/broker');return;}navigate(path);}; const handleLaunchPlatform=()=>{if(!isAuthenticated){setIsAuthModalOpen(true);return;}navigate('/dashboard');}; const handleNavigateFromMenu=(view:string)=>{
    if(view==='broker-connection')navigate('/broker');
    else if(view==='workspace'||view==='app')navigate('/dashboard');
    else if(view==='landing')navigate('/landing');
    else if(view==='login')navigate('/login');
  };
  if(isSystemInitializing){let loadingMsg='Checking Session...',subMsg='Verifying your TradingCore login';if(authStep==='connecting'){loadingMsg='Connecting...';subMsg='Establishing secure handshake with Google OAuth';}else if(authStep==='authenticating'){loadingMsg='Authenticating...';subMsg='Verifying identity with Supabase Authentication';}else if(authStep==='preparing'){loadingMsg='Preparing Workspace...';subMsg='Synchronizing kernel configuration and broker channels';}else if(protectedEntry&&!brokerRestoreReady){loadingMsg='Restoring Broker State...';subMsg='Checking your connected broker sessions securely';}else if(profileLoading){loadingMsg='Loading Profile...';subMsg='Fetching user preferences and onboarding state';}return <LoadingScreen message={loadingMsg} submessage={subMsg} onRetry={authLoading?()=>window.location.reload():undefined} onContinue={!isAuthenticated&&!profileLoading?()=>navigate('/'):undefined}/>;}
  if(currentView==='login'){
    return <Suspense fallback={<LoadingScreen message="Loading Sign In..." submessage="Preparing secure authentication" />}>
      <LoginPage onBack={()=>navigate('/landing')} onSuccess={()=>navigate(tradingCoreRuntime.hasConnectedBroker()?'/dashboard':'/broker')} />
    </Suspense>;
  }
  if(isAuthenticated&&user&&currentView==='broker-connection')return <BrokerConnectionRequiredPage onBack={()=>navigate('/dashboard')} onBrokerConnected={()=>{setHasConnectedBroker(true);navigate('/dashboard');}}/>;
  if(currentView==='app'){const workspacePath:WorkspaceRoute=isWorkspaceRoute(pathname)?pathname:'/dashboard';return <RouteErrorBoundary onHome={()=>navigate('/dashboard')}><Suspense key={workspacePath} fallback={<LoadingScreen message="Loading Workspace..." submessage="Preparing trading module" />}>{workspacePath==='/dashboard'&&<DashboardPage onNavigate={navigateWorkspace} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/models'&&<ModelsPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/predictions'&&<PredictionCenterPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/automations'&&<AutomationsPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/indicators'&&<IndicatorsPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/portfolio'&&<PortfolioPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/profile'&&<ProfilePage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/corespirit'&&<CoreSpiritEditorPage onNavigate={navigateWorkspace} onBackToLanding={()=>navigate('/dashboard')} onBroker={()=>navigate('/broker')}/>} {workspacePath==='/live'&&(hasConnectedBroker?<><BrokerRuntimeSwitcher onConnect={()=>navigate('/broker')}/><LiveModuleBoundary><LiveTradingTerminalV5/></LiveModuleBoundary></>:<BrokerConnectionRequiredPage onBack={()=>navigate('/dashboard')} onBrokerConnected={()=>{setHasConnectedBroker(true);navigate('/live');}}/>)}</Suspense></RouteErrorBoundary>}
  return <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans selection:bg-[#3b82f6]/30 selection:text-[#3b82f6] overflow-x-hidden"><Navbar onOpenAuthModal={()=>setIsAuthModalOpen(true)} onLaunchPlatform={handleLaunchPlatform} onNavigate={handleNavigateFromMenu} currentView={currentView}/><main className="pt-16"><Hero onLaunch={handleLaunchPlatform}/><WorkspacePreview onLaunch={handleLaunchPlatform}/><BrokerStrip onSelectBroker={handleLaunchPlatform}/><ArchitectureSection/><WhyTradingCore/><FeaturesDeepDive/><HowItWorks onLaunch={handleLaunchPlatform}/><PricingSection onSelectPlan={handleLaunchPlatform}/><FutureModules/><FAQSection/></main><Footer onLaunch={handleLaunchPlatform}/><AuthModalPlaceholder isOpen={isAuthModalOpen} onClose={()=>setIsAuthModalOpen(false)} onLaunchWorkspace={handleLaunchPlatform}/></div>;
}
export default function App(){return <AuthProvider><AppContent/></AuthProvider>}
