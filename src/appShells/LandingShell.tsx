import { lazy, Suspense } from 'react';
import { LoadingScreen } from '../components/common/LoadingScreen';

const LandingPage = lazy(() => import('../pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const AuthModalPlaceholder = lazy(() => import('../components/auth/AuthModalPlaceholder').then((m) => ({ default: m.AuthModalPlaceholder })));

type Props = {
  isAuthModalOpen: boolean;
  onOpenAuthModal: () => void;
  onCloseAuthModal: () => void;
  onLaunchPlatform: () => void;
  onNavigate: (view: string) => void;
  currentView: 'landing' | 'app' | 'broker-connection' | 'workspace';
};

export function LandingShell(props: Props) {
  return (
    <>
      <Suspense fallback={<LoadingScreen message="Loading TradingCore..." submessage="Preparing the public workspace" />}>
        <LandingPage
          onOpenAuthModal={props.onOpenAuthModal}
          onLaunchPlatform={props.onLaunchPlatform}
          onNavigate={props.onNavigate}
          currentView={props.currentView}
        />
      </Suspense>
      {props.isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModalPlaceholder
            isOpen={props.isAuthModalOpen}
            onClose={props.onCloseAuthModal}
            onLaunchWorkspace={props.onLaunchPlatform}
          />
        </Suspense>
      )}
    </>
  );
}
