import React, { useState } from 'react';
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
} from 'lucide-react';
import { BROKERS_CONFIG, BrokerItem } from '../constants/brokers';
import { tradingCoreRuntime } from '../services/runtime/TradingCoreRuntime';
import { useAuth } from '../auth/hooks/useAuth';

interface BrokerConnectionRequiredPageProps {
  onBrokerConnected: () => void;
}

export const BrokerConnectionRequiredPage: React.FC<BrokerConnectionRequiredPageProps> = ({
  onBrokerConnected,
}) => {
  const { user, logout } = useAuth();
  const [selectedBroker, setSelectedBroker] = useState<BrokerItem | null>(null);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'apikeys'>('oauth');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Key Form State
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [clientCode, setClientCode] = useState('');

  const handleConnectOAuth = async (broker: BrokerItem) => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await tradingCoreRuntime.connectBrokerOAuth(broker.id);
      if (res.success) {
        onBrokerConnected();
      } else {
        setError(res.error || 'Failed to authenticate with broker via OAuth.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during OAuth connection.');
    } finally {
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
        onBrokerConnected();
      } else {
        setError(res.error || 'Invalid API credentials. Please verify your keys.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during API key validation.');
    } finally {
      setIsConnecting(false);
    }
  };

  const openAuthModal = (broker: BrokerItem) => {
    setSelectedBroker(broker);
    setAuthMethod('oauth');
    setError(null);
    setApiKey('');
    setApiSecret('');
    setClientCode('');
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0F141C]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-cyan-500/20">
            TC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wide text-white">TradingCore OS</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Mandatory Setup
              </span>
            </div>
            <p className="text-xs text-slate-400">Bring Your Own Broker (BYOB) Architecture</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-xs font-mono font-medium text-slate-200">{user.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition flex items-center gap-1.5 border border-slate-700/50"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 flex flex-col items-center">
        {/* Banner / Title Section */}
        <div className="text-center max-w-3xl mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-medium mb-4">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Non-Custodial Order Routing Engine</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Connect Your Broker
          </h1>

          <div className="bg-[#121824] border border-slate-800 rounded-xl p-5 text-left text-sm text-slate-300 space-y-2 leading-relaxed shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
            <p className="font-semibold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              TradingCore is a Bring Your Own Broker platform.
            </p>
            <p className="text-slate-400">
              To start trading, securely connect your existing broker account.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-800/80 text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Never stores your money</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Never holds your funds</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Direct order routing</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supported Brokers Section */}
        <div className="w-full mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Select Supported Broker</h2>
              <p className="text-xs text-slate-400">Choose your broker to initiate OAuth 2.0 or API Key connection</p>
            </div>
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
              7 Supported Integrations
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BROKERS_CONFIG.map((broker) => (
              <div
                key={broker.id}
                className="bg-[#121824] hover:bg-[#161e2e] border border-slate-800/80 hover:border-cyan-500/40 rounded-xl p-5 transition-all flex flex-col justify-between group shadow-lg"
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
                    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-cyan-400" />
                      OAuth 2.0
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                      <Key className="w-3 h-3 text-amber-400" />
                      API Keys
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openAuthModal(broker)}
                  className="w-full py-2.5 px-4 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 font-medium text-xs transition-all flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-cyan-500/10"
                >
                  <span>Connect {broker.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Connect Modal */}
      {selectedBroker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedBroker(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm px-2 py-1 rounded bg-slate-800/50"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-md text-lg"
                style={{ backgroundColor: selectedBroker.badgeColor }}
              >
                {selectedBroker.tag}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Connect {selectedBroker.name}</h3>
                <p className="text-xs text-slate-400">{selectedBroker.apiVersion}</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Auth Method Toggle */}
            <div className="flex border-b border-slate-800 mb-5">
              <button
                onClick={() => {
                  setAuthMethod('oauth');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  authMethod === 'oauth'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>OAuth 2.0 Authorization</span>
              </button>
              <button
                onClick={() => {
                  setAuthMethod('apikeys');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
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
              <div className="space-y-4">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-medium">
                    <Zap className="w-4 h-4" />
                    <span>Direct Secure OAuth Redirect</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    You will authorize TradingCore directly through {selectedBroker.name}'s official sign-in portal.
                    TradingCore never sees or stores your broker login password.
                  </p>
                </div>

                <button
                  onClick={() => handleConnectOAuth(selectedBroker)}
                  disabled={isConnecting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating with {selectedBroker.name}...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      <span>Authenticate with {selectedBroker.name}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">API Secret</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="e.g. •••••••••••••••••••••"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Client Code / User ID</label>
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
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validating Keys...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>Save & Connect Broker</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
