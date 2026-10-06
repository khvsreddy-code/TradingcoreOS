import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Globe,
  ArrowRight,
  ArrowLeft,
  LogOut,
  RefreshCw,
  Cpu,
  UserCheck,
  Wallet,
  PieChart,
  ListOrdered,
  Check,
  Activity,
  Layers,
} from 'lucide-react';
import { BROKERS_CONFIG, BrokerItem } from '../constants/brokers';
import { tradingCoreRuntime } from '../services/runtime/TradingCoreRuntime';
import { BrokerOAuthService } from '../services/oauth/BrokerOAuthService';
import { PopupManager } from '../services/oauth/PopupManager';
import { useAuth } from '../auth/hooks/useAuth';

interface BrokerConnectionRequiredPageProps {
  onBrokerConnected: () => void;
  onBack: () => void;
}

type SetupStep = 'welcome' | 'choose' | 'connect' | 'verifying' | 'ready';

interface VerificationCheck {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  completed: boolean;
}

export const BrokerConnectionRequiredPage: React.FC<BrokerConnectionRequiredPageProps> = ({
  onBrokerConnected,
  onBack,
}) => {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<SetupStep>('choose');
  const [selectedBroker, setSelectedBroker] = useState<BrokerItem | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Verification Sequence State
  const [checks, setChecks] = useState<VerificationCheck[]>([
    { id: 'profile', label: 'Fetching Profile', sublabel: 'Validating exchange segment permissions & user ID', icon: UserCheck, completed: false },
    { id: 'funds', label: 'Fetching Funds & Margin', sublabel: 'Reading cash balance, collateral & exposure limits', icon: Wallet, completed: false },
    { id: 'holdings', label: 'Fetching Holdings', sublabel: 'Synchronizing Demat portfolio balances', icon: PieChart, completed: false },
    { id: 'positions', label: 'Fetching Positions', sublabel: 'Loading active intraday & overnight positions', icon: Layers, completed: false },
    { id: 'orders', label: 'Fetching Orders', sublabel: 'Synchronizing order book & execution logs', icon: ListOrdered, completed: false },
  ]);
  const [verificationProgress, setVerificationProgress] = useState(0);

  // User Display Name
  const userDisplayName = user?.email
    ? user.email.split('@')[0]
    : 'Trader';

  // Run Animated Verification Sequence when in 'verifying' step
  useEffect(() => {
    if (currentStep !== 'verifying') return;

    let checkIndex = 0;
    const interval = setInterval(() => {
      if (checkIndex < checks.length) {
        setChecks((prev) =>
          prev.map((c, idx) => (idx === checkIndex ? { ...c, completed: true } : c))
        );
        checkIndex++;
        setVerificationProgress(Math.round((checkIndex / checks.length) * 100));
      } else {
        clearInterval(interval);
        setCurrentStep('ready');
      }
    }, 90);

    return () => clearInterval(interval);
  }, [currentStep]);

  // OAuth Popup Message Listener
  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (
        event.data &&
        (event.data.type === 'TRADINGCORE_BROKER_CONNECTED' || event.data.type === 'TRADINGCORE_BROKER_OAUTH_SUCCESS')
      ) {
        const authBrokerId = event.data.broker || event.data.brokerId;
        setIsConnecting(true);
        setError(null);
        // The callback normally closes itself. Close the parent-owned popup
        // handle as a safety net so the browser can never leave the OAuth
        // window sitting on a TradingCore route.
        PopupManager.closePopup();
        try {
          // The popup callback already exchanged and encrypted the broker token.
          // Re-running five broker verification calls here was the main source of
          // the long post-login pause. Confirm the persisted session with one
          // authenticated session lookup instead.
          await tradingCoreRuntime.restoreBrokerConnections();
          const connected = tradingCoreRuntime.getAllConnections().some((connection) =>
            connection.brokerId.toLowerCase() === String(authBrokerId || '').toLowerCase()
          );
          if (connected) {
            setIsConnecting(false);
            setCurrentStep('verifying');
          } else {
            setError('Broker authorization completed, but the TradingCore session could not be restored yet.');
            setIsConnecting(false);
          }
        } catch (err: any) {
          setError(err?.message || 'Error processing broker authorization message.');
          setIsConnecting(false);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleConnectOAuth = async (broker: BrokerItem) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Initiate OAuth authorization using BrokerOAuthService & PopupManager
      const initResult = await BrokerOAuthService.initiateOAuth(broker.id);
      if (!initResult.success) {
        setError(initResult.error || 'Failed to launch broker OAuth window.');
        setIsConnecting(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to initiate broker OAuth popup.');
      setIsConnecting(false);
    }
  };

  const openConnectStep = (broker: BrokerItem) => {
    setSelectedBroker(broker);
    setError(null);
    setCurrentStep('connect');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200">
      {/* OS Setup Top Header Bar */}
      <header className="border-b border-slate-800/80 bg-[#0B0F17]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-blue-600 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-blue-500/20">
            TC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wide text-white text-sm">TradingCore OS Setup</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                System Initialization
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Bring Your Own Broker (BYOB) Architecture</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="hidden md:flex items-center gap-2 font-mono text-xs text-slate-400">
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'welcome' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            1. Welcome
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'choose' || currentStep === 'connect' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            2. Choose Broker
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'verifying' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            3. Verify Endpoint
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'ready' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            4. Ready
          </span>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block font-mono text-xs">
              <p className="text-slate-400">User</p>
              <p className="font-medium text-slate-200">{user.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition flex items-center gap-1.5 border border-slate-800"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Setup Step Content Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {/* STEP 1: WELCOME & OS ARCHITECTURE EXPLANATION */}
          {currentStep === 'welcome' && (
            <motion.div
              key="step-welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl bg-[#0E131F] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Welcome, <span className="text-blue-400">{userDisplayName}</span>
                  </h1>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    TradingCore OS Operating System First Boot
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed border-t border-slate-800/80 pt-5">
                <p className="font-medium text-white flex items-center gap-2 text-base">
                  <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  Bring Your Own Broker (BYOB) Architecture
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  TradingCore operates as a dedicated browser operating system for live order execution.
                  Before launching the workspace, connect your broker account to authorize secure API order routing.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">Non-Custodial</span>
                      <span className="text-[11px] text-slate-400">Never stores your cash or funds</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">Direct API</span>
                      <span className="text-[11px] text-slate-400">Direct broker API routing from your account</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">OAuth 2.0</span>
                      <span className="text-[11px] text-slate-400">Your broker login is never seen</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCurrentStep('choose')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Select Your Broker to Begin Setup</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: CHOOSE YOUR BROKER */}
          {currentStep === 'choose' && (
            <motion.div
              key="step-choose"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Choose Your Broker</span>
                    <span className="text-xs font-mono font-normal text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                      Broker selection
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Connect your Fyers account to continue into the live trading workspace.</p>
                </div>

                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs font-mono text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white self-start sm:self-auto"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to TradingCore
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
                {BROKERS_CONFIG.map((broker) => (
                  <div
                    key={broker.id}
                    className="bg-[#0E131F] hover:bg-[#121929] border border-slate-800 hover:border-blue-500/40 rounded-xl p-5 transition-all flex flex-col justify-between group shadow-xl"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-md text-base"
                            style={{ backgroundColor: broker.badgeColor }}
                          >
                            {broker.tag}
                          </div>
                          <div>
                            <h3 className="font-semibold text-white text-base group-hover:text-blue-300 transition-colors">
                              {broker.name}
                            </h3>
                            <p className="text-[11px] font-mono text-slate-400">{broker.apiVersion}</p>
                          </div>
                        </div>
                        {broker.isPopular && (
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Popular
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        {broker.description}
                      </p>

                      <div className="flex items-center gap-2 mb-4 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-blue-400" />
                          OAuth 2.0
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => openConnectStep(broker)}
                      className="w-full py-2.5 px-4 rounded-lg bg-blue-500/10 hover:bg-blue-500 hover:text-slate-950 text-blue-400 border border-blue-500/30 hover:border-blue-400 font-medium text-xs transition-all flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-blue-500/10 cursor-pointer"
                    >
                      <span>Connect {broker.name}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 3: CONNECT / AUTHENTICATE FORM */}
          {currentStep === 'connect' && selectedBroker && (
            <motion.div
              key="step-connect"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-lg bg-[#0E131F] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-md text-lg"
                    style={{ backgroundColor: selectedBroker.badgeColor }}
                  >
                    {selectedBroker.tag}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Connecting {selectedBroker.name}</h3>
                    <p className="text-xs font-mono text-slate-400">{selectedBroker.apiVersion}</p>
                  </div>
                </div>

                <button
                  onClick={() => setCurrentStep('choose')}
                  className="text-xs font-mono text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-900 border border-slate-800"
                >
                  Change Broker
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Direct OAuth 2.0 broker authorization */}
              <div className="space-y-4 pt-2">
                  <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 text-xs text-slate-300 space-y-2.5">
                    <div className="flex items-center gap-2 text-blue-400 font-medium">
                      <Zap className="w-4 h-4" />
                      <span>Official Direct Broker Authorization</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      Clicking below opens the official {selectedBroker.name} login authorization page in a secure popup window.
                      TradingCore never stores your password.
                    </p>

                    <div className="pt-1 border-t border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-slate-400 space-y-1">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Registered Callback URL:</span>
                          <span className="text-blue-400 text-[10px]">OAuth 2.0 Standard</span>
                        </div>
                        <p className="text-[10px] text-slate-300 select-all font-mono break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                          {window.location.origin}/auth/broker-callback
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleConnectOAuth(selectedBroker)}
                    disabled={isConnecting}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Connecting to {selectedBroker.name}...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        <span>Authenticate & Authorize {selectedBroker.name}</span>
                      </>
      
                    )}
                  </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: ANIMATED VERIFICATION SEQUENCE */}
          {currentStep === 'verifying' && (
            <motion.div
              key="step-verifying"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-xl bg-[#0E131F] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Initializing {selectedBroker?.name || 'Broker'} Endpoint</h2>
                  <p className="text-xs font-mono text-slate-400">Fetching portfolio, margin & permission metadata</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>System Verification Progress</span>
                  <span className="text-blue-400 font-bold">{verificationProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${verificationProgress}%` }}
                  />
                </div>
              </div>

              {/* Sequential Terminal Checks */}
              <div className="space-y-3 font-mono text-xs">
                {checks.map((check) => {
                  const IconComp = check.icon;
                  return (
                    <div
                      key={check.id}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                        check.completed
                          ? 'bg-blue-500/5 border-blue-500/30 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-1.5 rounded-lg ${
                            check.completed ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{check.label}</p>
                          <p className="text-[11px] text-slate-400">{check.sublabel}</p>
                        </div>
                      </div>

                      {check.completed ? (
                        <div className="flex items-center gap-1 text-blue-400 font-bold">
                          <Check className="w-4 h-4" />
                          <span>OK</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 animate-pulse">Syncing...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 5: TRADINGCORE OS READY STATE */}
          {currentStep === 'ready' && (
            <motion.div
              key="step-ready"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-lg bg-[#0E131F] border border-blue-500/40 rounded-2xl p-8 shadow-2xl space-y-6 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto shadow-xl shadow-blue-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold uppercase tracking-wider inline-block mb-2">
                  System Initialized
                </span>
                <h1 className="text-2xl font-bold text-white tracking-tight">TradingCore OS is Ready</h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Active Broker: <span className="text-blue-400 font-bold">{selectedBroker?.name || 'Connected Broker'}</span>
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Endpoint Health:</span>
                  <span className="text-blue-400 font-bold flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    Endpoint verified
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Session Validity:</span>
                  <span className="text-slate-200">Session active</span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Order Routing:</span>
                  <span className="text-blue-400 font-bold">Direct Non-Custodial API</span>
                </div>
              </div>

              <button
                onClick={() => onBrokerConnected()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-slate-950 font-bold text-base shadow-2xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Setup Footer */}
      <footer className="border-t border-slate-800/60 bg-[#0B0F17]/80 py-4 px-6 text-center text-xs font-mono text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
          <span>TradingCore OS · Broker setup</span>
        </div>
        <p>TradingCore is a professional trading operating system that connects directly to your own broker account.</p>
      </footer>
    </div>
  );
};
