import { useEffect, useState } from 'react';
import { Activity, Radio } from 'lucide-react';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { BrokerConnectionInfo } from '../../services/brokers/BrokerManager';

export function BrokerRuntimeSwitcher({ onConnect }: { onConnect?: (brokerId: string) => void }) {
  const [connections, setConnections] = useState<BrokerConnectionInfo[]>(() => tradingCoreRuntime.getAllConnections());
  const [primary, setPrimary] = useState<string>(() => String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId || '').toLowerCase());
  const refresh = () => {
    setConnections(tradingCoreRuntime.getAllConnections());
    setPrimary(String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId || '').toLowerCase());
  };

  useEffect(() => {
    refresh();
    const offPrimary = tradingCoreRuntime.on('STATUS_CHANGED', refresh);
    const offConnected = tradingCoreRuntime.on('BROKER_CONNECTED', refresh);
    const offDisconnected = tradingCoreRuntime.on('BROKER_DISCONNECTED', refresh);
    return () => { offPrimary(); offConnected(); offDisconnected(); };
  }, []);

  const connectionFor = (brokerId: string) => connections.find(c => c.brokerId.toLowerCase() === brokerId);
  const switchBroker = (brokerId: string) => {
    const connection = connectionFor(brokerId);
    if (!connection || connection.status !== 'Connected') {
      onConnect?.(brokerId);
      return;
    }
    if (tradingCoreRuntime.switchActiveBroker(brokerId)) refresh();
  };

  return (
    <div className="border-b border-[var(--tco-border)] bg-[var(--tco-surface)] px-3 py-1.5">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--tco-dim)] whitespace-nowrap">
          <Radio className="w-3 h-3" /> Broker Route
        </div>
        <div className="flex items-center gap-1.5">
          {(['fyers', 'upstox'] as const).map((brokerId) => {
            const connection = connectionFor(brokerId);
            const connected = connection?.status === 'Connected';
            const active = primary === brokerId;
            const label = brokerId === 'fyers' ? 'FYERS' : 'UPSTOX';
            return (
              <button
                key={brokerId}
                onClick={() => switchBroker(brokerId)}
                title={connected ? `Switch live route to ${label}` : `Connect ${label}`}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-[9px] font-mono font-bold transition-colors ${active && connected ? 'border-[#3b82f6]/50 bg-[#3b82f6]/10 text-[#3b82f6]' : connected ? 'border-[var(--tco-border)] text-[#d1d5db] hover:border-[#3b82f6]/40 hover:text-white' : 'border-[var(--tco-border)] text-[var(--tco-dim)] hover:border-[var(--tco-dim)] hover:text-[#d1d5db]'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#3b82f6]' : 'bg-[var(--tco-slate)]'}`} />
                {label}
                {active && connected && <span className="text-[8px]">ACTIVE</span>}
                {!connected && <span className="text-[8px]">CONNECT</span>}
              </button>
            );
          })}
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-[var(--tco-dim)]">
          <Activity className="w-3 h-3" /> {primary ? primary.toUpperCase() : 'NO ROUTE'}
        </div>
      </div>
    </div>
  );
}
