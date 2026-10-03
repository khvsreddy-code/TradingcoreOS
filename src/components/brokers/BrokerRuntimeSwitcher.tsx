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
    return (
    <div className="border-b border-[var(--tco-border)] bg-[var(--tco-surface)] px-3 py-1.5">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--tco-dim)] whitespace-nowrap">
          <Radio className="w-3 h-3" /> Broker Route
        </div>
        <button
          type="button"
          onClick={() => switchBroker('fyers')}
          title={connectionFor('fyers')?.status === 'Connected' ? 'Switch live route to FYERS' : 'Connect FYERS'}
          className="flex items-center gap-1.5 rounded-md border border-[var(--tco-border)] px-3 py-1 text-[9px] font-mono font-bold transition-colors hover:border-[#3b82f6]/40 hover:text-white"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${connectionFor('fyers')?.status === 'Connected' ? 'bg-[#3b82f6]' : 'bg-[var(--tco-slate)]'}`} />
          FYERS
          {connectionFor('fyers')?.status === 'Connected' && primary === 'fyers' ? ' ACTIVE' : ''}
          {connectionFor('fyers')?.status !== 'Connected' ? ' CONNECT' : ''}
        </button>
        <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-[var(--tco-dim)]">
          <Activity className="w-3 h-3" /> {primary === 'fyers' ? 'FYERS' : 'NO ROUTE'}
        </div>
      </div>
    </div>
  );
}

