import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Activity,
  Zap,
  Radio,
  Unlink,
  ExternalLink,
  Edit2,
  Check,
  Building2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import {
  tradingCoreRuntime,
} from '../../services/runtime/TradingCoreRuntime';
import { BrokerConnectionInfo } from '../../services/brokers/BrokerManager';
import { BrokerCapabilities } from '../../services/brokers/BrokerAdapter';

interface BrokerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToConnect?: () => void;
}

export const BrokerSettingsModal: React.FC<BrokerSettingsModalProps> = ({
  isOpen,
  onClose,
  onNavigateToConnect,
}) => {
  const [connections, setConnections] = useState<BrokerConnectionInfo[]>([]);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [pings, setPings] = useState<Record<string, number>>({});
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);

  const reloadConnections = () => {
    const all = tradingCoreRuntime.getAllConnections();
    setConnections(all);
    if (all.length > 0 && !selectedBrokerId) {
      setSelectedBrokerId(all[0].brokerId);
    }
  };

  useEffect(() => {
    if (isOpen) {
      reloadConnections();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSetPrimary = (brokerId: string) => {
    tradingCoreRuntime.switchActiveBroker(brokerId);
    reloadConnections();
  };

  const handleRename = (brokerId: string) => {
    if (tempName.trim()) {
      tradingCoreRuntime.renameConnection(brokerId, tempName.trim());
      setIsEditingName(null);
      reloadConnections();
    }
  };

  const handleTestConnectivity = async (brokerId: string) => {
    setIsTesting((prev) => ({ ...prev, [brokerId]: true }));
    const res = await tradingCoreRuntime.testConnectivity(brokerId);
    setPings((prev) => ({ ...prev, [brokerId]: res.latencyMs }));
    setIsTesting((prev) => ({ ...prev, [brokerId]: false }));
    reloadConnections();
  };

  const handleRefreshSession = async (brokerId: string) => {
    await tradingCoreRuntime.refreshSession(brokerId);
    reloadConnections();
  };

  const handleSyncPortfolio = async () => {
    setIsSyncing(true);
    await tradingCoreRuntime.syncPortfolio();
    setIsSyncing(false);
    reloadConnections();
  };

  const handleDisconnect = async (brokerId: string) => {
    try {
      await tradingCoreRuntime.disconnectBroker(brokerId);
      reloadConnections();
    } catch (error: any) {
      console.error('Failed to disconnect broker:', error);
    }
  };

  const activeConnectionInfo = connections.find((c) => c.brokerId === selectedBrokerId) || connections[0];
  const activeAdapter = activeConnectionInfo?.adapter;
  const capabilities: BrokerCapabilities | undefined = activeAdapter?.capabilities;

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
            Connected
          </span>
        );
      case 'Refreshing Session':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Refreshing
          </span>
        );
      case 'Authentication Required':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30">
            <AlertCircle className="h-3 w-3" />
            Auth Required
          </span>
        );
      case 'Syncing Portfolio':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Syncing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--tco-muted)]/10 text-[var(--tco-muted)] border border-[var(--tco-border)]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="w-full max-w-4xl rounded-2xl border border-[var(--tco-border)] bg-[var(--tco-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--tco-border)] flex items-center justify-between bg-[var(--tco-surface-3)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[#3b82f6]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--tco-text)]">
                Broker Runtime Settings
              </h2>
              <p className="text-xs font-mono text-[var(--tco-muted)]">
                Manage active broker endpoints, capabilities & connection health
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncPortfolio}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-hover)] text-xs font-mono text-[var(--tco-text)] hover:bg-[var(--tco-border)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#3b82f6] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync All'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--tco-muted)] hover:text-[var(--tco-text)] hover:bg-[var(--tco-border)] transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#222636] flex-1 overflow-y-auto">
          {/* Left Column: Connected Brokers */}
          <div className="md:col-span-5 p-5 space-y-4 bg-[var(--tco-surface-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[var(--tco-muted)] uppercase tracking-wider font-bold">
                Connected Brokers ({connections.length})
              </span>
              {onNavigateToConnect && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToConnect();
                  }}
                  className="flex items-center gap-1 text-xs font-mono text-[#3b82f6] hover:underline cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Connect New</span>
                </button>
              )}
            </div>

            {connections.length === 0 ? (
              <div className="p-6 border border-dashed border-[var(--tco-border)] rounded-xl text-center space-y-3 bg-[var(--tco-surface)]">
                <Radio className="h-8 w-8 text-[var(--tco-muted)] mx-auto" />
                <div>
                  <p className="text-xs font-bold text-[var(--tco-text)]">No Brokers Connected</p>
                  <p className="text-[11px] font-mono text-[var(--tco-muted)] mt-0.5">
                    Connect your broker account to authorize live execution.
                  </p>
                </div>
                {onNavigateToConnect && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToConnect();
                    }}
                    className="w-full py-2 rounded-lg bg-[#3b82f6] text-xs font-bold text-[var(--tco-surface-2)] hover:bg-[#2563eb] transition-colors cursor-pointer"
                  >
                    Connect Broker Now
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => {
                  const isSelected = selectedBrokerId === conn.brokerId;
                  const isEditing = isEditingName === conn.brokerId;

                  return (
                    <div
                      key={conn.brokerId}
                      onClick={() => setSelectedBrokerId(conn.brokerId)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 ${
                        isSelected
                          ? 'border-[#3b82f6]/50 bg-[var(--tco-surface-3)]'
                          : 'border-[var(--tco-border)] bg-[var(--tco-surface)] hover:border-[#33384f]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                className="px-2 py-0.5 text-xs font-mono bg-[var(--tco-hover)] border border-[#3b82f6] rounded text-[var(--tco-text)] focus:outline-none"
                              />
                              <button
                                onClick={() => handleRename(conn.brokerId)}
                                className="p-1 text-[#3b82f6] hover:text-[#2563eb]"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-[var(--tco-text)]">
                                {conn.nickname || conn.name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsEditingName(conn.brokerId);
                                  setTempName(conn.nickname || conn.name);
                                }}
                                className="text-[var(--tco-muted)] hover:text-[var(--tco-text)]"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {conn.isPrimary && (
                            <span className="px-1.5 py-0.2 rounded bg-[#3b82f6]/20 text-[#3b82f6] text-[9px] font-mono font-bold border border-[#3b82f6]/30">
                              PRIMARY
                            </span>
                          )}
                        </div>

                        {renderStatusBadge(conn.status)}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--tco-muted)]">
                        <span>Broker: {conn.name}</span>
                        <span>
                          Latency:{' '}
                          <span className="text-[#3b82f6] font-bold">
                            {(pings[conn.brokerId] ?? conn.latencyMs) != null ? `${pings[conn.brokerId] ?? conn.latencyMs} ms` : '—'}
                          </span>
                        </span>
                      </div>

                      {/* Action buttons inside card */}
                      <div className="pt-2 border-t border-[var(--tco-border)]/60 flex items-center justify-between text-xs font-mono">
                        {!conn.isPrimary ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetPrimary(conn.brokerId);
                            }}
                            className="text-[#3b82f6] hover:underline text-[11px]"
                          >
                            Set Primary
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--tco-muted)]">Active Route</span>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestConnectivity(conn.brokerId);
                            }}
                            disabled={isTesting[conn.brokerId]}
                            className="text-[var(--tco-muted)] hover:text-[var(--tco-text)] text-[11px] flex items-center gap-1"
                          >
                            <Activity className="h-3 w-3" />
                            <span>Ping</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDisconnect(conn.brokerId);
                            }}
                            className="text-[#ef4444] hover:underline text-[11px] flex items-center gap-1"
                          >
                            <Unlink className="h-3 w-3" />
                            <span>Disconnect</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Broker Details & Capability Matrix */}
          <div className="md:col-span-7 p-6 space-y-6 bg-[var(--tco-surface)]">
            {activeConnectionInfo ? (
              <>
                <div className="p-4 rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-3)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[var(--tco-text)]">
                        {activeConnectionInfo.nickname || activeConnectionInfo.name}
                      </h3>
                      <p className="text-xs font-mono text-[var(--tco-muted)]">
                        Adapter ID: {activeConnectionInfo.brokerId}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRefreshSession(activeConnectionInfo.brokerId)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-hover)] text-xs font-mono text-[#3b82f6] hover:bg-[var(--tco-border)] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Refresh Session</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono pt-2 border-t border-[var(--tco-border)]">
                    <div>
                      <span className="text-[var(--tco-muted)] block text-[10px]">Status</span>
                      <span className="text-[var(--tco-text)] font-bold">{activeConnectionInfo.status}</span>
                    </div>
                    <div>
                      <span className="text-[var(--tco-muted)] block text-[10px]">Last Synced</span>
                      <span className="text-[var(--tco-text)]">
                        {activeConnectionInfo.lastSyncedAt
                          ? new Date(activeConnectionInfo.lastSyncedAt).toLocaleTimeString()
                          : 'Just now'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--tco-muted)] block text-[10px]">Token Expiry</span>
                      <span className="text-[#3b82f6]">24h Active</span>
                    </div>
                  </div>

                  {activeAdapter?.developerPortalUrl && (
                    <div className="pt-2 border-t border-[var(--tco-border)] flex items-center justify-between text-xs font-mono">
                      <span className="text-[var(--tco-muted)]">Official API Documentation:</span>
                      <a
                        href={activeAdapter.developerPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#3b82f6] hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>Portal</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Permissions Grant */}
                <div className="space-y-2">
                  <span className="text-xs font-mono text-[var(--tco-muted)] uppercase tracking-wider font-bold">
                    Granted API Permissions
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(activeConnectionInfo.permissions || ['Read Portfolio', 'Execute Orders', 'WebSocket Stream']).map(
                      (p) => (
                        <span
                          key={p}
                          className="px-2.5 py-1 rounded-lg bg-[var(--tco-hover)] border border-[var(--tco-border)] text-xs font-mono text-[var(--tco-text)] flex items-center gap-1.5"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-[#3b82f6]" />
                          <span>{p}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Capability Matrix */}
                <div className="space-y-3">
                  <span className="text-xs font-mono text-[var(--tco-muted)] uppercase tracking-wider font-bold">
                    Broker Capabilities Matrix
                  </span>

                  {capabilities ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs">
                      {[
                        { label: 'Equity Trading', supported: capabilities.supportsEquity },
                        { label: 'F&O Derivatives', supported: capabilities.supportsFO },
                        { label: 'Commodities', supported: capabilities.supportsCommodity },
                        { label: 'Currency Pairs', supported: capabilities.supportsCurrency },
                        { label: 'Options Chain', supported: capabilities.supportsOptions },
                        { label: 'Basket Orders', supported: capabilities.supportsBasketOrders },
                        { label: 'GTT Trigger Orders', supported: capabilities.supportsGTT },
                        { label: 'WebSocket Stream', supported: capabilities.supportsWebSocket },
                        { label: 'Historical Data', supported: capabilities.supportsHistoricalData },
                        { label: 'Order Modify', supported: capabilities.supportsOrderModification },
                        { label: 'Order Cancel', supported: capabilities.supportsOrderCancellation },
                        { label: 'Bracket Orders', supported: capabilities.supportsBracketOrders },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`p-2.5 rounded-lg border flex items-center justify-between ${
                            item.supported
                              ? 'bg-[#3b82f6]/5 border-[#3b82f6]/20 text-[var(--tco-text)]'
                              : 'bg-[var(--tco-hover)]/40 border-[var(--tco-border)] text-[var(--tco-muted)] opacity-60'
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.supported ? (
                            <CheckCircle2 className="h-4 w-4 text-[#3b82f6]" />
                          ) : (
                            <X className="h-4 w-4 text-[var(--tco-muted)]" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-mono text-[var(--tco-muted)]">
                      No capability metadata available for this adapter.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <Building2 className="h-10 w-10 text-[var(--tco-muted)]" />
                <p className="text-sm font-bold text-[var(--tco-text)]">Select a broker from the left list</p>
                <p className="text-xs font-mono text-[var(--tco-muted)] max-w-sm">
                  View real-time connection status, API ping times, token expiration, and feature capabilities.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--tco-border)] bg-[var(--tco-surface-3)] flex items-center justify-between text-xs font-mono text-[var(--tco-muted)]">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[#3b82f6]" />
            <span>TradingCore OS Runtime</span>
          </div>
          <span>Non-custodial direct broker integration</span>
        </div>
      </div>
    </div>
  );
};
