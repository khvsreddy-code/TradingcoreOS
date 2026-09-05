import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { BrokerConnectionRequiredPage } from './pages/BrokerConnectionRequiredPage';
import { BrokerCallbackPage } from './pages/BrokerCallbackPage';
import { LegalPage } from './pages/LegalPage';
import { LoadingScreen } from './components/common/LoadingScreen';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
// Keep the landing shell small. Heavy workspace modules (especially the chart
// engine) load only when their route is opened, without changing their UI.
const FullWorkspaceView = lazy(() => import('./components/workspace/FullWorkspaceView').then(m => ({ default: m.FullWorkspaceView })));
const ModelsPage = lazy(() => import('./pages/ModelsPage').then(m => ({ default: m.ModelsPage })));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage').then(m => ({ default: m.AutomationsPage })));
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage').then(m => ({ default: m.IndicatorsPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
function AppContent() {
    if (window.location.pathname.startsWith('/auth/broker-callback'))
        return _jsx(BrokerCallbackPage, {});
    if (window.location.pathname === '/privacy')
        return _jsx(LegalPage, { kind: "privacy" });
    if (window.location.pathname === '/terms')
        return _jsx(LegalPage, { kind: "terms" });
    const { user, loading: authLoading, isAuthenticated, authStep } = useAuth();
    const { profile, loading: profileLoading } = useProfile();
    void profile;
    const viewFromPath = (path) => path === '/broker' ? 'broker-connection' : ['/dashboard', '/live', '/models', '/automations', '/indicators', '/portfolio', '/profile'].includes(path) ? 'app' : 'landing';
    const isWorkspaceRoute = (path) => ['/live', '/models', '/automations', '/indicators', '/portfolio', '/profile'].includes(path);
    const [currentView, setCurrentView] = useState(() => viewFromPath(window.location.pathname));
    const initialProtectedEntry = useRef(['/dashboard', '/live', '/models', '/automations', '/indicators', '/portfolio', '/profile'].includes(window.location.pathname));
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [hasConnectedBroker, setHasConnectedBroker] = useState(() => tradingCoreRuntime.hasConnectedBroker());
    const [brokerRestoreReady, setBrokerRestoreReady] = useState(!isAuthenticated);
    const protectedEntry = currentView === 'app' || currentView === 'broker-connection';
    const isSystemInitializing = authLoading || (initialProtectedEntry.current && isAuthenticated && !brokerRestoreReady);
    useEffect(() => {
        let cancelled = false;
        if (authLoading || !isAuthenticated || !user) {
            if (!authLoading && !isAuthenticated && !cancelled)
                setBrokerRestoreReady(true);
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
        if (authLoading)
            return;
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
        if (path !== '/' && !path.startsWith('/auth/'))
            window.history.replaceState({}, '', '/');
        setCurrentView('landing');
    }, [isAuthenticated, user, hasConnectedBroker, brokerRestoreReady, authLoading]);
    // Warm secondary workspace chunks after the live terminal is ready. Navigation
    // stays instant without changing the UI or blocking the first chart paint.
    useEffect(() => {
        if (currentView !== 'app' || !hasConnectedBroker)
            return;
        const timer = window.setTimeout(() => {
            void import('./pages/ModelsPage');
            void import('./pages/AutomationsPage');
            void import('./pages/IndicatorsPage');
            void import('./pages/PortfolioPage');
            void import('./pages/ProfilePage');
        }, 250);
        return () => window.clearTimeout(timer);
    }, [currentView, hasConnectedBroker]);
    const handleOpenAuthModal = () => setIsAuthModalOpen(true);
    const handleCloseAuthModal = () => setIsAuthModalOpen(false);
    const navigate = (path) => {
        if (window.location.pathname !== path)
            window.history.pushState({}, '', path);
        setCurrentView(viewFromPath(path));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const navigateWorkspace = (path) => {
        if (window.location.pathname !== path)
            window.history.pushState({}, '', path);
        setCurrentView('app');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (!tradingCoreRuntime.hasConnectedBroker()) {
            void tradingCoreRuntime.restoreBrokerConnections().then(() => {
                const connected = tradingCoreRuntime.hasConnectedBroker();
                setHasConnectedBroker(connected);
                if (!connected)
                    navigate('/broker');
            });
        }
    };
    const handleLaunchPlatform = async () => {
        if (!isAuthenticated) {
            setIsAuthModalOpen(true);
            return;
        }
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
    const handleNavigateFromMenu = (view) => {
        if (view === 'broker-connection')
            navigate('/broker');
        else if (view === 'workspace' || view === 'app')
            navigate(tradingCoreRuntime.hasConnectedBroker() ? '/live' : '/broker');
        else if (view === 'landing')
            navigate('/');
    };
    if (isSystemInitializing) {
        let loadingMsg = 'Checking Session...';
        let subMsg = 'Verifying your TradingCore login';
        if (authStep === 'connecting') {
            loadingMsg = 'Connecting...';
            subMsg = 'Establishing secure handshake with Google OAuth';
        }
        else if (authStep === 'authenticating') {
            loadingMsg = 'Authenticating...';
            subMsg = 'Verifying identity with Supabase Authentication';
        }
        else if (authStep === 'preparing') {
            loadingMsg = 'Preparing Workspace...';
            subMsg = 'Synchronizing kernel configuration and broker channels';
        }
        else if (protectedEntry && !brokerRestoreReady) {
            loadingMsg = 'Restoring Broker State...';
            subMsg = 'Checking your connected broker sessions securely';
        }
        else if (profileLoading) {
            loadingMsg = 'Loading Profile...';
            subMsg = 'Fetching user preferences and onboarding state';
        }
        return _jsx(LoadingScreen, { message: loadingMsg, submessage: subMsg, onRetry: authLoading ? () => window.location.reload() : undefined, onContinue: !isAuthenticated && !profileLoading ? () => { window.history.replaceState({}, '', '/'); setCurrentView('landing'); } : undefined });
    }
    if (isAuthenticated && user && currentView === 'broker-connection') {
        return _jsx(BrokerConnectionRequiredPage, { onBack: () => navigate('/'), onBrokerConnected: () => { setHasConnectedBroker(true); navigate('/live'); } });
    }
    if (currentView === 'app' && hasConnectedBroker) {
        const workspacePath = isWorkspaceRoute(window.location.pathname) ? window.location.pathname : '/live';
        return _jsxs(Suspense, { fallback: _jsx(LoadingScreen, { message: "Loading Workspace...", submessage: "Preparing trading module" }), children: [workspacePath === '/models' && _jsx(ModelsPage, { onNavigate: navigateWorkspace, onBackToLanding: handleBackToLanding, onBroker: () => navigate('/broker') }), workspacePath === '/automations' && _jsx(AutomationsPage, { onNavigate: navigateWorkspace, onBackToLanding: handleBackToLanding, onBroker: () => navigate('/broker') }), workspacePath === '/indicators' && _jsx(IndicatorsPage, { onNavigate: navigateWorkspace, onBackToLanding: handleBackToLanding, onBroker: () => navigate('/broker') }), workspacePath === '/portfolio' && _jsx(PortfolioPage, { onNavigate: navigateWorkspace, onBackToLanding: handleBackToLanding, onBroker: () => navigate('/broker') }), workspacePath === '/profile' && _jsx(ProfilePage, { onNavigate: navigateWorkspace, onBackToLanding: handleBackToLanding, onBroker: () => navigate('/broker') }), workspacePath === '/live' && _jsx(FullWorkspaceView, { onBackToLanding: handleBackToLanding, onNavigateToBroker: () => navigate('/broker'), onNavigate: navigateWorkspace })] });
    }
    return (_jsxs("div", { className: "min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans selection:bg-[#10b981]/30 selection:text-[#10b981] overflow-x-hidden", children: [_jsx(Navbar, { onOpenAuthModal: handleOpenAuthModal, onLaunchPlatform: handleLaunchPlatform, onNavigate: handleNavigateFromMenu, currentView: currentView }), _jsxs("main", { className: "pt-16", children: [_jsx(Hero, { onLaunch: handleLaunchPlatform }), _jsx(WorkspacePreview, { onLaunch: handleLaunchPlatform }), _jsx(BrokerStrip, { onSelectBroker: () => handleLaunchPlatform() }), _jsx(ArchitectureSection, {}), _jsx(WhyTradingCore, {}), _jsx(FeaturesDeepDive, {}), _jsx(HowItWorks, { onLaunch: handleLaunchPlatform }), _jsx(PricingSection, { onSelectPlan: () => handleLaunchPlatform() }), _jsx(FutureModules, {}), _jsx(FAQSection, {})] }), _jsx(Footer, { onLaunch: handleLaunchPlatform }), _jsx(AuthModalPlaceholder, { isOpen: isAuthModalOpen, onClose: handleCloseAuthModal, onLaunchWorkspace: handleLaunchPlatform })] }));
}
export default function App() { return _jsx(AuthProvider, { children: _jsx(AppContent, {}) }); }
