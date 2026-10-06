import { lazy, Suspense } from 'react';
import { LoadingScreen } from '../components/common/LoadingScreen';

const LiveTradingTerminal = lazy(() => import('../LiveTradingTerminal').then((m) => ({ default: m.LiveTradingTerminal })));

export function LiveTradingShell() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading Live Trading..." submessage="Starting the market workspace" />}>
      <LiveTradingTerminal />
    </Suspense>
  );
}
