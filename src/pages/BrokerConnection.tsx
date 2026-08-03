import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Lock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Key,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../auth/hooks/useAuth';
import { useProfile } from '../auth/hooks/useProfile';
import { useDemoMode } from '../context/DemoModeContext';
import { ErrorCard, ErrorType } from '../components/common/ErrorCard';
import { BrokerAdapterRegistry } from '../services/brokers/adapters';
import { tradingEngine } from '../services/engine/TradingEngine';

interface BrokerConnectionProps {
  onCompleteOnboarding?: () => void;
  onLogout?: () => void;
}

type OnboardingStep = 'METHOD_SELECTION' | 'OAUTH_SELECTION' | 'MANUAL_API_KEYS';

interface ApiFormState {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
}

export const BrokerConnection: React.FC<BrokerConnectionProps> = ({
  onCompleteOnboarding,
  onLogout,
}) => {
  const { user, logout } = useAuth();
  const { updateProfile } = useProfile();
  const { setConnectedBroker, enableDemoMode } = useDemoMode();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('METHOD_SELECTION');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ type: ErrorType; message: string } | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isEnteringDemo, setIsEnteringDemo] = useState(false);

  // Accordion state for API Keys step
  const [expandedBrokerId, setExpandedBrokerId] = useState<string | null>('fyers');

  // Form states for each broker in API Keys step
  const [apiForms, setApiForms] = useState<Record<string, ApiFormState>>({
    fyers: { apiKey: '', apiSecret: '', accessToken: '' },
    zerodha: { apiKey: '', apiSecret: '', accessToken: '' },
    dhan: { apiKey: '', apiSecret: '', accessToken: '' },
    upstox: { apiKey: '', apiSecret: '', accessToken: '' },
    angelone: { apiKey: '', apiSecret: '', accessToken: '' },
    groww: { apiKey: '', apiSecret: '', accessToken: '' },
    icicidirect: { apiKey: '', apiSecret: '', accessToken: '' },
  });

  const [validatingBrokerId, setValidatingBrokerId] = useState<string | null>(null);
  const [validationSuccessId, setValidationSuccessId] = useState<string | null>(null);

  // Broker Adapters list in exact requested order
  const brokerAdapters = BrokerAdapterRegistry.getAllAdapters();

  // Handle OAuth Connection
  const handleConnectOAuth = async (brokerId: string, brokerName: string) => {
    setErrorState(null);
    setConnectingId(brokerId);

    try {
      const res = await tradingEngine.connectBrokerOAuth(brokerId);
      if (!res.success) {
        throw new Error(res.error || 'Connection failed');
      }

      setConnectedId(brokerId);
      setConnectingId(null);
      setIsFinishing(true);

      setConnectedBroker(brokerName);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await updateProfile({ is_onboarded: true });

      if (onCompleteOnboarding) {
        onCompleteOnboarding();
      }
    } catch (err: any) {
      setConnectingId(null);
      setIsFinishing(false);
      setErrorState({
        type: 'broker_unavailable',
        message: `Failed to complete OAuth authentication with ${brokerName}. Please try again.`,
      });
    }
  };

  // Handle Form Input Change
  const handleApiInputChange = (brokerId: string, field: keyof ApiFormState, value: string) => {
    setApiForms((prev) => ({
      ...prev,
      [brokerId]: {
        ...prev[brokerId],
        [field]: value,
      },
    }));
  };

  // Handle Validate API Keys
  const handleValidateApiKeys = async (brokerId: string, brokerName: string) => {
    setErrorState(null);
    setValidatingBrokerId(brokerId);
    setValidationSuccessId(null);

    const form = apiForms[brokerId];
    if (!form.apiKey || !form.apiSecret) {
      setValidatingBrokerId(null);
      setErrorState({
        type: 'invalid_credentials',
        message: `Please enter both API Key and API Secret for ${brokerName}.`,
      });
      return;
    }

    try {
      const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
      if (adapter) {
        const result = await adapter.validateApiKeys(form);
        if (!result.isValid) {
          throw new Error(result.message || 'Invalid API credentials');
        }
      } else {
        await new Promise((res) => setTimeout(res, 800));
      }

      setValidatingBrokerId(null);
      setValidationSuccessId(brokerId);
    } catch (err: any) {
      setValidatingBrokerId(null);
      setErrorState({
        type: 'invalid_credentials',
        message: err.message || `Validation failed for ${brokerName}. Check credentials.`,
      });
    }
  };

  // Handle Save API Keys & Finish
  const handleSaveApiKeys = async (brokerId: string, brokerName: string) => {
    setErrorState(null);
    setConnectingId(brokerId);

    const form = apiForms[brokerId];
    if (!form.apiKey || !form.apiSecret) {
      setConnectingId(null);
      setErrorState({
        type: 'invalid_credentials',
        message: `API Key and API Secret are required to save connection for ${brokerName}.`,
      });
      return;
    }

    try {
      const res = await tradingEngine.connectBrokerApiKeys(brokerId, form);
      if (!res.success) {
        throw new Error(res.error || 'Failed to save credentials');
      }

      setConnectedId(brokerId);
      setConnectingId(null);
      setIsFinishing(true);

      setConnectedBroker(brokerName);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await updateProfile({ is_onboarded: true });

      if (onCompleteOnboarding) {
        onCompleteOnboarding();
      }
    } catch (err: any) {
      setConnectingId(null);
      setIsFinishing(false);
      setErrorState({
        type: 'system_error',
        message: `Failed to save ${brokerName} API credentials. Please try again.`,
      });
    }
  };

  // Handle Skip to Explore Mode
  const handleSkipToExplore = async () => {
    setErrorState(null);
    setIsEnteringDemo(true);

    try {
      enableDemoMode();

      await new Promise((resolve) => setTimeout(resolve, 400));

      await updateProfile({ is_onboarded: true });

      if (onCompleteOnboarding) {
        onCompleteOnboarding();
      }
    } catch (err: any) {
      setIsEnteringDemo(false);
      setErrorState({
        type: 'system_error',
        message: 'Unable to enter Explore Mode. Please try again.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans flex flex-col selection:bg-[#10b981]/20">
      {/* Header */}
      <header className="border-b border-[#222636] bg-[#0c0e15] sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#090a0f] border border-[#222636] text-[#10b981]">
              <svg
                width="18"
                height="18"
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
              <div className="text-sm font-bold tracking-tight text-[#f3f4f6] flex items-center gap-2">
                TradingCore
                <span className="rounded bg-[#10b981]/10 border border-[#10b981]/30 px-1.5 py-0.2 font-mono text-[10px] text-[#10b981] font-semibold">
                  OS
                </span>
              </div>
            </div>
          </div>

          {/* User profile & Explore Without Broker */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkipToExplore}
              disabled={isEnteringDemo || connectingId !== null}
              className="text-xs font-mono text-[#8c93a6] hover:text-[#10b981] transition-colors cursor-pointer px-2.5 py-1.5 rounded bg-[#11131c] border border-[#222636]"
            >
              Explore without Broker
            </button>

            {user && (
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#222636] bg-[#090a0f] px-2.5 py-1 text-xs">
                <span className="text-[#8c93a6] font-mono">{user.email}</span>
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

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {/* Global Security Assurance Strip */}
        <div className="rounded-xl border border-[#222636] bg-[#0c0e15] p-3.5 flex items-center justify-between text-xs font-mono text-[#8c93a6]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#10b981] shrink-0" />
            <span>Non-custodial execution • Zero storage of trading PINs or broker passwords</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[#10b981]">
            <Lock className="h-3 w-3" />
            <span>256-bit AES Encrypted</span>
          </div>
        </div>

        {/* Error Banner if any */}
        {errorState && (
          <ErrorCard
            type={errorState.type}
            message={errorState.message}
            onDismiss={() => setErrorState(null)}
          />
        )}

        {/* Dynamic Views via AnimatePresence */}
        <AnimatePresence mode="wait">
          {/* STEP 1: METHOD_SELECTION */}
          {currentStep === 'METHOD_SELECTION' && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Heading */}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#f3f4f6]">
                  Connect your trading account
                </h1>
                <p className="text-sm text-[#8c93a6] leading-relaxed">
                  Choose how TradingCore should connect to your broker. You can always add more brokers later from Settings.
                </p>
              </div>

              {/* Two Institutional Decision Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Card 1: Connect with Broker Login */}
                <div
                  tabIndex={0}
                  className="group relative flex flex-col justify-between rounded-xl border border-[#222636] bg-[#0c0e15] p-6 transition-all hover:border-[#10b981]/60 hover:bg-[#11131c] focus:outline-none focus:ring-1 focus:ring-[#10b981] shadow-lg cursor-pointer"
                  onClick={() => setCurrentStep('OAUTH_SELECTION')}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#222636] bg-[#11131c] text-[#10b981]">
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <span className="rounded bg-[#10b981]/10 border border-[#10b981]/30 px-2 py-0.5 font-mono text-[10px] text-[#10b981] font-bold">
                        Recommended
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-[#f3f4f6] group-hover:text-[#10b981] transition-colors">
                        Connect with Broker Login
                      </h2>
                      <p className="font-mono text-[11px] text-[#8c93a6]">
                        Uses your broker's secure login. No API Keys required.
                      </p>
                    </div>

                    <p className="text-xs text-[#8c93a6] leading-relaxed">
                      Sign in directly with your broker. TradingCore never stores your broker password. Uses official broker authorization.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#222636]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentStep('OAUTH_SELECTION');
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#10b981] py-2.5 text-xs font-bold text-[#090a0f] hover:bg-[#059669] transition-colors cursor-pointer"
                    >
                      <span>Continue</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card 2: Use Existing API Keys */}
                <div
                  tabIndex={0}
                  className="group relative flex flex-col justify-between rounded-xl border border-[#222636] bg-[#0c0e15] p-6 transition-all hover:border-[#333a52] hover:bg-[#11131c] focus:outline-none focus:ring-1 focus:ring-[#8c93a6] shadow-lg cursor-pointer"
                  onClick={() => setCurrentStep('MANUAL_API_KEYS')}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#222636] bg-[#11131c] text-[#8c93a6]">
                        <Key className="h-5 w-5" />
                      </div>
                      <span className="rounded bg-[#181b28] border border-[#222636] px-2 py-0.5 font-mono text-[10px] text-[#8c93a6] font-semibold">
                        Advanced Users
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-[#f3f4f6]">
                        Use Existing API Keys
                      </h2>
                      <p className="font-mono text-[11px] text-[#8c93a6]">
                        Already have developer credentials? Use your existing API Keys.
                      </p>
                    </div>

                    <p className="text-xs text-[#8c93a6] leading-relaxed">
                      Paste your API Key, Secret and Access Token manually.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#222636]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentStep('MANUAL_API_KEYS');
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#222636] bg-[#11131c] py-2.5 text-xs font-semibold text-[#f3f4f6] hover:bg-[#181b28] transition-colors cursor-pointer"
                    >
                      <span>Use API Keys</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[#8c93a6]" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2A: OAUTH_SELECTION */}
          {currentStep === 'OAUTH_SELECTION' && (
            <motion.div
              key="step2a"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Back Button */}
              <button
                onClick={() => setCurrentStep('METHOD_SELECTION')}
                className="inline-flex items-center gap-2 text-xs font-mono text-[#8c93a6] hover:text-[#f3f4f6] transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to connection method</span>
              </button>

              {/* Title Header */}
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#f3f4f6]">
                  Select Broker
                </h2>
                <p className="text-xs text-[#8c93a6]">
                  Connect via official OAuth login. Select your primary broker below.
                </p>
              </div>

              {/* Compact Premium List Rows (No highlighted badges) */}
              <div className="divide-y divide-[#222636] rounded-xl border border-[#222636] bg-[#0c0e15] overflow-hidden">
                {brokerAdapters.map((adapter) => {
                  const isConnecting = connectingId === adapter.id;
                  const isConnected = connectedId === adapter.id;

                  return (
                    <div
                      key={adapter.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#11131c] transition-colors"
                    >
                      {/* Left side: Icon, Name, Segments */}
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#222636] bg-[#11131c] font-mono text-xs font-bold text-[#f3f4f6]">
                          {adapter.name.charAt(0)}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#f3f4f6]">
                              {adapter.name}
                            </span>
                            <span className="rounded bg-[#181b28] border border-[#222636] px-1.5 py-0.2 font-mono text-[9px] text-[#8c93a6]">
                              OAuth
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#8c93a6]">
                            <span>Supports:</span>
                            {adapter.supportedSegments.map((seg) => (
                              <span
                                key={seg}
                                className="rounded bg-[#090a0f] border border-[#222636] px-1.5 py-0.2 text-[#8c93a6]"
                              >
                                {seg}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Action */}
                      <div className="shrink-0">
                        {isConnected ? (
                          <div className="flex items-center gap-1.5 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 px-4 py-2 text-xs font-semibold text-[#10b981]">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Connected</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleConnectOAuth(adapter.id, adapter.name)}
                            disabled={connectingId !== null || isFinishing}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                              isConnecting
                                ? 'bg-[#181b28] border border-[#222636] text-[#10b981] cursor-wait'
                                : 'bg-[#11131c] border border-[#222636] text-[#f3f4f6] hover:bg-[#10b981] hover:text-[#090a0f] hover:border-[#10b981]'
                            }`}
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#10b981]" />
                                <span>Connecting...</span>
                              </>
                            ) : (
                              <>
                                <span>Connect</span>
                                <ArrowRight className="h-3.5 w-3.5 text-[#8c93a6] group-hover:text-[#090a0f]" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 2B: MANUAL_API_KEYS */}
          {currentStep === 'MANUAL_API_KEYS' && (
            <motion.div
              key="step2b"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Back Button */}
              <button
                onClick={() => setCurrentStep('METHOD_SELECTION')}
                className="inline-flex items-center gap-2 text-xs font-mono text-[#8c93a6] hover:text-[#f3f4f6] transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to connection method</span>
              </button>

              {/* Title Header */}
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#f3f4f6]">
                  Use Existing API Keys
                </h2>
                <p className="text-xs text-[#8c93a6]">
                  Paste developer API credentials for your chosen broker.
                </p>
              </div>

              {/* Accordion per broker */}
              <div className="space-y-3">
                {brokerAdapters.map((adapter) => {
                  const isExpanded = expandedBrokerId === adapter.id;
                  const form = apiForms[adapter.id] || { apiKey: '', apiSecret: '', accessToken: '' };
                  const isValidating = validatingBrokerId === adapter.id;
                  const isValidationSuccess = validationSuccessId === adapter.id;
                  const isSaving = connectingId === adapter.id;

                  return (
                    <div
                      key={adapter.id}
                      className="rounded-xl border border-[#222636] bg-[#0c0e15] overflow-hidden transition-colors"
                    >
                      {/* Accordion Header */}
                      <button
                        onClick={() =>
                          setExpandedBrokerId(isExpanded ? null : adapter.id)
                        }
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-[#11131c] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#222636] bg-[#11131c] font-mono text-xs font-bold text-[#f3f4f6]">
                            {adapter.name.charAt(0)}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-[#f3f4f6]">
                              {adapter.name}
                            </span>
                            <p className="text-[10px] font-mono text-[#8c93a6]">
                              API Key, Secret & Access Token
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[#8c93a6]">
                          {isValidationSuccess && (
                            <span className="text-[10px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/30">
                              Validated
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </button>

                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-[#222636]/60 space-y-4 bg-[#090a0f]/50">
                          {/* Developer portal link & instructions */}
                          <div className="pt-3 pb-1 border-b border-[#222636]/40 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono gap-2 text-[#8c93a6]">
                            <div className="flex items-center gap-2">
                              <span className="text-[#10b981] font-bold">Flow:</span>
                              <span>1. Open Portal</span>
                              <span>→</span>
                              <span>2. Generate Keys</span>
                              <span>→</span>
                              <span>3. Paste Below</span>
                              <span>→</span>
                              <span>4. Validate</span>
                            </div>
                            {adapter.developerPortalUrl && (
                              <a
                                href={adapter.developerPortalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#10b981] hover:underline flex items-center gap-1 font-semibold"
                              >
                                <span>Open {adapter.name} Developer Portal</span>
                                <span>↗</span>
                              </a>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[11px] font-mono text-[#8c93a6] block">
                                API Key
                              </label>
                              <input
                                type="text"
                                value={form.apiKey}
                                onChange={(e) =>
                                  handleApiInputChange(adapter.id, 'apiKey', e.target.value)
                                }
                                placeholder="e.g. app_key_id"
                                className="w-full rounded-lg border border-[#222636] bg-[#11131c] px-3 py-2 text-xs font-mono text-[#f3f4f6] placeholder-[#8c93a6]/50 focus:border-[#10b981] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-mono text-[#8c93a6] block">
                                API Secret
                              </label>
                              <input
                                type="password"
                                value={form.apiSecret}
                                onChange={(e) =>
                                  handleApiInputChange(adapter.id, 'apiSecret', e.target.value)
                                }
                                placeholder="••••••••••••"
                                className="w-full rounded-lg border border-[#222636] bg-[#11131c] px-3 py-2 text-xs font-mono text-[#f3f4f6] placeholder-[#8c93a6]/50 focus:border-[#10b981] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-mono text-[#8c93a6] block">
                                Access Token
                              </label>
                              <input
                                type="text"
                                value={form.accessToken}
                                onChange={(e) =>
                                  handleApiInputChange(adapter.id, 'accessToken', e.target.value)
                                }
                                placeholder="e.g. bearer_token"
                                className="w-full rounded-lg border border-[#222636] bg-[#11131c] px-3 py-2 text-xs font-mono text-[#f3f4f6] placeholder-[#8c93a6]/50 focus:border-[#10b981] focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                              onClick={() => handleValidateApiKeys(adapter.id, adapter.name)}
                              disabled={isValidating || isSaving}
                              className="rounded-lg border border-[#222636] bg-[#11131c] px-4 py-2 text-xs font-mono text-[#f3f4f6] hover:bg-[#181b28] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isValidating ? 'Validating...' : 'Validate'}
                            </button>

                            <button
                              onClick={() => handleSaveApiKeys(adapter.id, adapter.name)}
                              disabled={isSaving || isValidating}
                              className="rounded-lg bg-[#10b981] px-4 py-2 text-xs font-mono font-bold text-[#090a0f] hover:bg-[#059669] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : 'Save & Connect'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222636] bg-[#0c0e15] py-4 text-center text-xs font-mono text-[#8c93a6]">
        TradingCore Kernel OS • Non-Custodial Architecture
      </footer>
    </div>
  );
};

