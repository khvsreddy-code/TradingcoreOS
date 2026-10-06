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

type Props = {
  route: WorkspaceRoute;
  onNavigate: (path: WorkspaceRoute) => void;
  onBroker: () => void;
};

function fallback() {
  return <LoadingScreen message="Loading Workspace..." submessage="Preparing trading module" />;
}

export function TradingWorkspaceShell({ route, onNavigate, onBroker }: Props) {
  const common = {
    onNavigate,
    onBackToLanding: () => onNavigate('/dashboard'),
    onBroker,
  };

  return (
    <Suspense key={route} fallback={fallback()}>
      {route === '/dashboard' && <DashboardPage onNavigate={onNavigate} onBroker={onBroker} />}
      {route === '/models' && <ModelsPage {...common} />}
      {route === '/predictions' && <PredictionCenterPage {...common} />}
      {route === '/automations' && <AutomationsPage {...common} />}
      {route === '/indicators' && <IndicatorsPage {...common} />}
      {route === '/portfolio' && <PortfolioPage {...common} />}
      {route === '/profile' && <ProfilePage {...common} />}
      {route === '/corespirit/docs' && <CoreSpiritDocsPage {...common} />}
      {route === '/corespirit' && <CoreSpiritEditorPage {...common} />}
    </Suspense>
  );
}
