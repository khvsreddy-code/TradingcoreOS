import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, CheckCircle2, ArrowRight, Lock, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/hooks/useAuth';
import { useProfile } from '../auth/hooks/useProfile';
import { BROKERS_CONFIG, BrokerItem } from '../constants/brokers';
import { ErrorCard, ErrorType } from '../components/common/ErrorCard';

interface BrokerConnectionProps {
  onCompleteOnboarding?: () => void;
  onLogout?: () => void;
}

export const BrokerConnection: React.FC<BrokerConnectionProps> = ({
  onCompleteOnboarding,
  onLogout,
}) => {
  const { user, logout } = useAuth();
  const { updateProfile } = useProfile();

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ type: ErrorType; message: string } | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Handle connecting a broker (placeholder OAuth workflow)
  const handleConnectBroker = async (broker: BrokerItem) => {
    setErrorState(null);
    setConnectingId(broker.id);

    try {
      // Simulated OAuth handshake delay (1.2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setConnectedId(broker.id);
      setConnectingId(null);
      setIsFinishing(true);

      // Brief pause before completing onboarding profile update
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Update is_onboarded in Supabase profile
      const success = await updateProfile({ is_onboarded: true });
      if (!success) {
        console.warn('Profile update fallback note: procedure proceed to workspace');
      }

      if (onCompleteOnboarding) {
        onCompleteOnboarding();
      }
    } catch (err: any) {
      setConnectingId(null);
      setIsFinishing(false);
      setErrorState({
        type: 'broker_unavailable',
        message: `Failed to connect with ${broker.name} OAuth gateway. Please try again or choose another broker.`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans flex flex-col selection:bg-[#10b981]/20">
      {/* Institutional Header */}
      <header className="border-b border-[#222636] bg-[#11131c]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Top Left: Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#090a0f] border border-[#222636] text-[#10b981] shadow-inner">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight text-[#f3f4f6] flex items-center gap-2">
                TradingCore
                <span className="rounded bg-[#10b981]/10 border border-[#10b981]/30 px-1.5 py-0.5 font-mono text-[10px] text-[#10b981] font-semibold">
                  OS
                </span>
              </div>
              <p className="text-[10px] text-[#8c93a6] font-mono hidden sm:block">
                Institutional OAuth Gateway
              </p>
            </div>
          </div>

          {/* Top Right: User Avatar & Account Email & Logout */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2.5 rounded-lg border border-[#222636] bg-[#090a0f] px-3 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#1e2230] border border-[#222636]">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="font-mono text-[10px] font-bold text-[#10b981]">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-semibold text-[#f3f4f6] max-w-[140px] truncate">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-[#8c93a6] font-mono max-w-[140px] truncate">
                    {user.email}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={onLogout || logout}
              className="rounded-lg border border-[#222636] bg-[#11131c] px-3 py-1.5 text-xs font-medium text-[#8c93a6] hover:bg-[#181b28] hover:text-[#f3f4f6] transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {/* Step Progress & Title Header */}
        <div className="space-y-3 text-center sm:text-left max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-1 font-mono text-xs font-semibold text-[#10b981]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
            Step 2 of 2 • Onboarding
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#f3f4f6]">
            Connect Your Broker
          </h1>

          <p className="text-sm text-[#8c93a6] leading-relaxed">
            TradingCore never stores your trading credentials. Authentication happens directly with your broker using OAuth.
          </p>
        </div>

        {/* Security Assurance Banner */}
        <div className="rounded-xl border border-[#222636] bg-[#11131c] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-[#10b981] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-[#f3f4f6]">Direct Broker OAuth 2.0</h4>
              <p className="text-[11px] text-[#8c93a6] font-mono mt-0.5">
                Read-only execution scopes. Zero persistence of passwords, PINs, or API secrets on TradingCore servers.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#8c93a6] shrink-0 bg-[#090a0f] px-2.5 py-1 rounded border border-[#222636]">
            <Lock className="h-3 w-3 text-[#10b981]" />
            256-bit Encrypted Session
          </div>
        </div>

        {/* Error State Banner */}
        {errorState && (
          <ErrorCard
            type={errorState.type}
            message={errorState.message}
            onDismiss={() => setErrorState(null)}
          />
        )}

        {/* Broker Grid (Extensible Array of Brokers) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#222636] pb-3">
            <h2 className="text-xs font-bold font-mono tracking-wider text-[#8c93a6] uppercase">
              Supported Indian Brokers ({BROKERS_CONFIG.length})
            </h2>
            <span className="text-[11px] font-mono text-[#10b981]">
              Instant Tokenized Login
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BROKERS_CONFIG.map((broker) => {
              const isConnecting = connectingId === broker.id;
              const isConnected = connectedId === broker.id;

              return (
                <motion.div
                  key={broker.id}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.15 }}
                  className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all bg-[#11131c] ${
                    isConnected
                      ? 'border-[#10b981] bg-[#10b981]/5 shadow-lg'
                      : 'border-[#222636] hover:border-[#33384f]'
                  }`}
                >
                  {/* Top row: Official Logo Placeholder & Status */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      {/* Logo Badge Placeholder */}
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#222636] font-bold text-sm text-[#f3f4f6]"
                          style={{ backgroundColor: '#181b28' }}
                        >
                          <span style={{ color: broker.badgeColor }}>{broker.tag}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#f3f4f6]">{broker.name}</h3>
                            {broker.isPopular && (
                              <span className="rounded bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 px-1.5 py-0.2 text-[9px] font-mono font-semibold">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#8c93a6] font-mono">{broker.apiVersion}</p>
                        </div>
                      </div>

                      {/* OAuth Status Pill */}
                      <span className="rounded bg-[#181b28] border border-[#222636] px-2 py-0.5 font-mono text-[10px] text-[#10b981] font-medium">
                        {broker.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#8c93a6] leading-relaxed font-sans">
                      {broker.description}
                    </p>
                  </div>

                  {/* Connect Button Area */}
                  <div className="mt-5 pt-3 border-t border-[#222636]/60">
                    {isConnected ? (
                      <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 py-2.5 text-xs font-semibold text-[#10b981]">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Connected • Launching...</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectBroker(broker)}
                        disabled={connectingId !== null || isFinishing}
                        className={`group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] ${
                          isConnecting
                            ? 'bg-[#181b28] border border-[#222636] text-[#10b981] cursor-wait'
                            : 'bg-[#181b28] border border-[#222636] text-[#f3f4f6] hover:bg-[#10b981] hover:text-[#090a0f] hover:border-[#10b981]'
                        }`}
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-[#10b981]" />
                            <span>Connecting {broker.name}...</span>
                          </>
                        ) : (
                          <>
                            <span>Connect {broker.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Future Ready Section */}
        <div className="rounded-xl border border-[#222636] bg-[#090a0f] p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono text-[#8c93a6] flex items-center gap-2">
              <ExternalLink className="h-3.5 w-3.5 text-[#10b981]" />
              Need custom broker integration?
            </h3>
            <span className="text-[10px] font-mono text-[#8c93a6]">REST / FIX Protocol Ready</span>
          </div>
          <p className="text-xs text-[#8c93a6]">
            TradingCore's extensible architecture supports adding new broker OAuth gateways modularly without layout adjustments.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222636] bg-[#090a0f] py-4 text-center text-xs font-mono text-[#8c93a6]">
        TradingCore Kernel OS • Non-Custodial Security Protocol
      </footer>
    </div>
  );
};
