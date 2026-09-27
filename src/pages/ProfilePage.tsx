import { ShieldCheck, Activity } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { tradingCoreRuntime } from '../services/runtime/TradingCoreRuntime';
export function ProfilePage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
  return <WorkspaceModuleShell active="/profile" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="Identity & Connectivity" title="Profile" description="Account identity, broker connection state and security controls. Broker secrets remain server-side and are never rendered here."/>
    <main className="p-4 md:p-8 grid gap-4 lg:grid-cols-2"><Panel title="Broker Connection"><div className="flex items-center gap-3"><Activity className="w-5 h-5 text-[#3b82f6]"/><div><div className="font-semibold text-sm">{broker?.name || 'No broker connected'}</div><div className="text-xs text-[#7e889d]">Server-side encrypted session</div></div></div></Panel><Panel title="Security"><div className="flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-[#3b82f6]"/><div className="text-xs text-[#8c93a6] leading-5">OAuth state is short-lived, broker access tokens are encrypted at rest, and live orders require an idempotency key.</div></div></Panel></main>
  </WorkspaceModuleShell>;
}
