import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export const BrokerCallbackPage: React.FC = () => {
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      // FYERS v3 returns `code=200` as the HTTP-style success code and
      // puts the actual one-time authorization credential in `auth_code`.
      // Upstox returns its authorization credential in `code`.  Prefer
      // `auth_code` so FYERS never receives the literal value `200`.
      const code =
        searchParams.get('auth_code') ||
        searchParams.get('code') ||
        searchParams.get('request_token');
      const state = searchParams.get('state');
      const paramBrokerId = (searchParams.get('broker') || searchParams.get('broker_id') || '').toLowerCase();

      setBrokerId(paramBrokerId || 'broker');

      if (!code) {
        setStatus('error');
        setErrorMsg('Authorization code missing from broker callback. Start the broker connection again.');
        return;
      }

      try {
        // Do NOT use tradingApi here. This popup is the broker OAuth callback
        // context and may not have the parent TradingCore Supabase session.
        // The server callback is protected by the short-lived encrypted OAuth
        // state, which binds the code to the TradingCore user who initiated it.
        const response = await fetch('/api/auth/broker/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            broker: paramBrokerId || undefined,
            code,
            state,
          }),
        });

        const text = await response.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Broker server returned an invalid response (${response.status}).`);
        }

        if (!response.ok || !data.success) {
          throw new Error(data?.error || `Broker authorization failed (${response.status}).`);
        }

        setStatus('success');

        // The OAuth callback is intentionally a short-lived popup. Notify the
        // opener first, then close this window regardless of whether the
        // browser exposes the opener reference. The parent keeps its own popup
        // handle as an additional safety net.
        const completionMessage = {
          type: 'TRADINGCORE_BROKER_CONNECTED',
          broker: data.broker || paramBrokerId,
          brokerId: data.broker || paramBrokerId,
          state,
          clientCode: data.clientCode,
        };

        try {
          window.opener?.postMessage(completionMessage, window.location.origin);
        } catch (messageError) {
          console.warn('Unable to notify TradingCore opener after broker authorization:', messageError);
        }

        window.setTimeout(() => {
          try {
            window.close();
          } catch (closeError) {
            console.warn('Broker OAuth popup could not close itself:', closeError);
          }
        }, 250);
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err?.message || 'Server connection error during broker token exchange.');
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-[#0E131F] border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/10">
          <ShieldCheck className="w-6 h-6" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">TradingCore OS Broker Authentication</h1>
          <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-wider">
            {brokerId ? `${brokerId} OAuth Authorization` : 'Secure Handshake'}
          </p>
        </div>

        {status === 'exchanging' && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-3">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
            <p className="font-mono text-blue-300">Exchanging Auth Code for Encrypted Access Session...</p>
            <p className="text-[11px] text-slate-400">Performing AES-256-GCM token storage and handshake verification.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 space-y-2">
            <CheckCircle2 className="w-6 h-6 text-blue-400 mx-auto" />
            <p className="font-bold text-sm text-blue-400 font-mono">Authorization Successful!</p>
            <p className="text-[11px] text-slate-300">
              Broker endpoint connected. Closing authorization popup and returning to TradingCore OS...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 space-y-2 font-mono text-left">
            <div className="flex items-center gap-2 text-red-400 font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Authentication Error</span>
            </div>
            <p className="text-slate-300 text-[11px]">{errorMsg}</p>
            <button
              onClick={() => window.close()}
              className="w-full mt-2 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs transition"
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
