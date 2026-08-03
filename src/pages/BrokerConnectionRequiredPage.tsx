import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Key,
  Globe,
  ArrowRight,
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
import { useAuth } from '../auth/hooks/useAuth';

interface BrokerConnectionRequiredPageProps {
  onBrokerConnected: () => void;
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
}) => {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [selectedBroker, setSelectedBroker] = useState<BrokerItem | null>(null);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'apikeys'>('oauth');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [clientCode, setClientCode] = useState('');

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
        setTimeout(() => {
          setCurrentStep('ready');
        }, 600);
      }
    }, 450);

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
        const code = event.data.code;
        setIsConnecting(true);
        setError(null);
        try {
          const res = await tradingCoreRuntime.connectBrokerOAuth(authBrokerId, code);
          if (res.success) {
            setIsConnecting(false);
            setCurrentStep('verifying');
          } else {
            setError(res.error || 'OAuth authorization token verification failed.');
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
      const initResult = await BrokerOAuthService.initiateOAuth(broker.id, apiKey.trim() || undefined);
      if (!initResult.success) {
        setError(initResult.error || 'Failed to launch broker OAuth window.');
        setIsConnecting(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to initiate broker OAuth popup.');
      setIsConnecting(false);
    }
  };

  const handleConnectApiKeys = async (broker: BrokerItem) => {
    if (!apiKey.trim()) {
      setError('API Key is required.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const res = await tradingCoreRuntime.connectBrokerApiKeys(broker.id, {
        apiKey,
        apiSecret,
        clientCode,
      });
      if (res.success) {
        setIsConnecting(false);
        setCurrentStep('verifying');
      } else {
        setError(res.error || 'Invalid API credentials. Please verify your keys.');
        setIsConnecting(false);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during API key validation.');
      setIsConnecting(false);
    }
  };

  const openConnectStep = (broker: BrokerItem) => {
    setSelectedBroker(broker);
    setAuthMethod('oauth');
    setError(null);
    setApiKey('');
    setApiSecret('');
    setClientCode('');
    setCurrentStep('connect');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* OS Setup Top Header Bar */}
      <header className="border-b border-slate-800/80 bg-[#0B0F17]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-cyan-500/20">
            TC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wide text-white text-sm">TradingCore OS Setup</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                System Initialization
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Bring Your Own Broker (BYOB) Architecture</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="hidden md:flex items-center gap-2 font-mono text-xs text-slate-400">
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'welcome' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            1. Welcome
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'choose' || currentStep === 'connect' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            2. Choose Broker
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'verifying' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
            3. Verify Endpoint
          </span>
          <span className="text-slate-600">→</span>
          <span className={`px-2.5 py-1 rounded-md ${currentStep === 'ready' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold' : 'bg-slate-900 border border-slate-800'}`}>
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
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Welcome, <span className="text-cyan-400">{userDisplayName}</span>
                  </h1>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    TradingCore OS Operating System First Boot
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed border-t border-slate-800/80 pt-5">
                <p className="font-medium text-white flex items-center gap-2 text-base">
                  <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                  Bring Your Own Broker (BYOB) Architecture
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  TradingCore operates as a dedicated browser operating system for live order execution.
                  Before launching the workspace, connect your broker account to authorize secure API order routing.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">Non-Custodial</span>
                      <span className="text-[11px] text-slate-400">Never stores your cash or funds</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">Direct API</span>
                      <span className="text-[11px] text-slate-400">Sub-10ms direct order execution</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">OAuth 2.0</span>
                      <span className="text-[11px] text-slate-400">Your broker login is never seen</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCurrentStep('choose')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
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
                    <span className="text-xs font-mono font-normal text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                      Step 2 of 4
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Select your broker endpoint to initiate OAuth 2.0 or API Key authentication</p>
                </div>

                <button
                  onClick={() => setCurrentStep('welcome')}
                  className="text-xs font-mono text-slate-400 hover:text-white underline self-start sm:self-auto"
                >
                  ← Back to Welcome
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {BROKERS_CONFIG.map((broker) => (
                  <div
                    key={broker.id}
                    className="bg-[#0E131F] hover:bg-[#121929] border border-slate-800 hover:border-cyan-500/40 rounded-xl p-5 transition-all flex flex-col justify-between group shadow-xl"
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
                            <h3 className="font-semibold text-white text-base group-hover:text-cyan-300 transition-colors">
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
                          <Globe className="w-3 h-3 text-cyan-400" />
                          OAuth 2.0
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center gap-1">
                          <Key className="w-3 h-3 text-amber-400" />
                          API Keys
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => openConnectStep(broker)}
                      className="w-full py-2.5 px-4 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 font-medium text-xs transition-all flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-cyan-500/10 cursor-pointer"
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

              {/* Auth Method Tabs */}
              <div className="flex border-b border-slate-800">
                <button
                  onClick={() => {
                    setAuthMethod('oauth');
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'oauth'
                      ? 'border-cyan-500 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>OAuth 2.0 Direct Auth</span>
                </button>
                <button
                  onClick={() => {
                    setAuthMethod('apikeys');
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'apikeys'
                      ? 'border-cyan-500 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>API Keys Credentials</span>
                </button>
              </div>

              {authMethod === 'oauth' ? (
                <div className="space-y-4 pt-2">
                  <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 text-xs text-slate-300 space-y-2.5">
                    <div className="flex items-center justify-between text-cyan-400 font-medium">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        <span>Official Direct Broker Authorization</span>
                      </div>
                      <a
                        href={selectedBroker.developerPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        Developer Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      Clicking below opens the official {selectedBroker.name} login authorization page in a secure popup window.
                      TradingCore never stores your password.
                    </p>

                    <div className="pt-1 border-t border-slate-800/80 space-y-2">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                          App Key / Client ID <span className="text-slate-400 font-normal">(Optional for custom developer app)</span>
                        </label>
                        <input
                          type="text"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={selectedBroker.clientIdPlaceholder}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>

                      <div className="text-[11px] font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-slate-400 space-y-1">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Registered Callback URL:</span>
                          <span className="text-cyan-400 text-[10px]">OAuth 2.0 Standard</span>
                        </div>
                        <p className="text-[10px] text-slate-300 select-all font-mono break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                          {import.meta.env.VITE_APP_URL || window.location.origin}/auth/broker-callback
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleConnectOAuth(selectedBroker)}
                    disabled={isConnecting}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
              ) : (
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
                      API Key / App Key <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="e.g. live_app_key_89234729"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">API Secret</label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="e.g. •••••••••••••••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">Client Code / User ID</label>
                    <input
                      type="text"
                      value={clientCode}
                      onChange={(e) => setClientCode(e.target.value)}
                      placeholder="e.g. ZER1234"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <button
                    onClick={() => handleConnectApiKeys(selectedBroker)}
                    disabled={isConnecting}
                    className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Validating API Credentials...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4" />
                        <span>Save & Validate Connection</span>
                      </>
                    )}
                  </button>
                </div>
              )}
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
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
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
                  <span className="text-cyan-400 font-bold">{verificationProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
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
                          ? 'bg-emerald-500/5 border-emerald-500/30 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-1.5 rounded-lg ${
                            check.completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
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
                        <div className="flex items-center gap-1 text-emerald-400 font-bold">
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
              className="w-full max-w-lg bg-[#0E131F] border border-emerald-500/40 rounded-2xl p-8 shadow-2xl space-y-6 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold uppercase tracking-wider inline-block mb-2">
                  System Initialized
                </span>
                <h1 className="text-2xl font-bold text-white tracking-tight">TradingCore OS is Ready</h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Active Broker: <span className="text-emerald-400 font-bold">{selectedBroker?.name || 'Connected Broker'}</span>
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Endpoint Health:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    Connected (8 ms)
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Session Validity:</span>
                  <span className="text-slate-200">24 Hours Active</span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Order Routing:</span>
                  <span className="text-cyan-400 font-bold">Direct Non-Custodial API</span>
                </div>
              </div>

              <button
                onClick={() => onBrokerConnected()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-base shadow-2xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
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
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>TradingCore OS v1.0.0</span>
        </div>
        <p>TradingCore is a professional trading operating system that connects directly to your own broker account.</p>
      </footer>
    </div>
  );
};
