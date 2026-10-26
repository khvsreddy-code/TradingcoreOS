import { lazy, Suspense } from 'react';
import { LoadingScreen } from '../components/common/LoadingScreen';
import type { WorkspaceRoute } from '../components/workspace/WorkspaceModuleShellTypes';

const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ModelsPage = lazy(() => import('../pages/ModelsPage').then((m) => ({ default: m.ModelsPage })));
const PredictionCenterPage = lazy(() => import('../pages/PredictionCenterPage').then((m) => ({ default: m.PredictionCenterPage })));
const AutomationsPage = lazy(() => import('../pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })));
const IndicatorsPage = lazy(() => import('../pages/IndicatorsPage').then((m) => ({ default: m.IndicatorsPage })));
const PortfolioPage = lazy(() => import('../pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const CoreSpiritDocsPage = lazy(() => import('../pages/CoreSpiritDocsPage').then((m) => ({ default: m.CoreSpiritDocsPage })));
const CoreSpiritEditorPage = lazy(() => import('../pages/CoreSpiritEditorPage').then((m) => ({ default: m.CoreSpiritEditorPage })));
const MarketNewsPage = lazy(() => import('../pages/MarketNewsPage').then((m) => ({ default: m.MarketNewsPage })));

type Props = {
  route: WorkspaceRoute;
  onNavigate: (path: WorkspaceRoute) => void;
  onBroker: () => void;
};

const ROUTE_LOADING_COPY: Readonly<Record<WorkspaceRoute, { message: string; submessage: string }>> = {
  '/dashboard': { message: 'Loading command center…', submessage: 'Preparing account, portfolio and risk summaries' },
  '/live': { message: 'Loading live terminal…', submessage: 'Preparing the Vela chart workspace and market-data connection' },
  '/models': { message: 'Loading model research…', submessage: 'Loading model artifacts and evaluation tools on demand' },
  '/predictions': { message: 'Loading prediction research…', submessage: 'Preparing forecast and evaluation views' },
  '/automations': { message: 'Loading automation workspace…', submessage: 'Preparing workflows and signal controls' },
  '/indicators': { message: 'Loading indicator workspace…', submessage: 'Preparing the indicator catalog and authoring tools' },
  '/portfolio': { message: 'Loading portfolio…', submessage: 'Retrieving account positions and portfolio state' },
  '/profile': { message: 'Loading profile…', submessage: 'Preparing account preferences' },
  '/corespirit': { message: 'Loading CoreSpirit IDE…', submessage: 'Loading the editor, compiler diagnostics and runtime inspector' },
  '/corespirit/docs': { message: 'Loading CoreSpirit documentation…', submessage: 'Preparing language, runtime and research references' },
  '/news': { message: 'Loading Market News…', submessage: 'Fetching attributed headlines from the existing news feed' },
};

function fallback(route: WorkspaceRoute) {
  const copy = ROUTE_LOADING_COPY[route];
  return <LoadingScreen message={copy.message} submessage={copy.submessage} />;
}

export function TradingWorkspaceShell({ route, onNavigate, onBroker }: Props) {
  const common = {
    onNavigate,
    onBackToLanding: () => onNavigate('/dashboard'),
    onBroker,
  };

  return (
    <Suspense key={route} fallback={fallback(route)}>
      {route === '/dashboard' && <DashboardPage onNavigate={onNavigate} onBroker={onBroker} />}
      {route === '/models' && <ModelsPage {...common} />}
      {route === '/predictions' && <PredictionCenterPage {...common} />}
      {route === '/automations' && <AutomationsPage {...common} />}
      {route === '/indicators' && <IndicatorsPage {...common} />}
      {route === '/portfolio' && <PortfolioPage {...common} />}
      {route === '/profile' && <ProfilePage {...common} />}
      {route === '/corespirit/docs' && <CoreSpiritDocsPage {...common} />}
      {route === '/corespirit' && <CoreSpiritEditorPage {...common} />}
      {route === '/news' && <MarketNewsPage {...common} />}
    </Suspense>
  );
}
