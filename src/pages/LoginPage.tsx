import React from 'react';
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/hooks/useAuth';

interface LoginPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onBack, onSuccess }) => {
  const { login, authStep, error, clearError, isAuthenticated } = useAuth();
  const loading = ['connecting', 'authenticating', 'preparing'].includes(authStep);

  React.useEffect(() => {
    if (isAuthenticated) onSuccess();
  }, [isAuthenticated, onSuccess]);

  const signIn = async () => {
    clearError();
    const result = await login();
    if (!result.error && isAuthenticated) onSuccess();
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] flex flex-col">
      <header className="h-14 border-b border-white/[0.06] bg-[#070a10]/90 flex items-center px-5">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-xs text-[#9aa3b4] hover:text-white">
          <ArrowLeft size={15} /> Back to Landing
        </button>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <section className="w-full max-w-md rounded-2xl border border-[#222636] bg-[#0d1017] p-7 shadow-2xl">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#222636] bg-[#090a0f] text-[#3b82f6] font-bold">TC</div>
          <div className="mt-6 text-[9px] font-mono uppercase tracking-[.22em] text-[#3b82f6]">TradingCore OS · Secure Access</div>
          <h1 className="mt-2 text-2xl font-bold">Sign in to TradingCore</h1>
          <p className="mt-2 text-sm leading-6 text-[#7e889d]">Access your saved workspace, broker connections, layouts, indicators, models and trading tools.</p>

          {error && (
            <div className="mt-5 rounded-lg border border-[#ef4444]/30 bg-[#160c0e] p-3 text-xs text-[#fca5a5]">
              <div className="font-semibold text-[#f87171]">Authentication failed</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-[#3b82f6] px-4 py-3 text-sm font-semibold text-[#090a0f] disabled:opacity-60"
          >
            {loading ? <><Loader2 size={17} className="animate-spin" /> {authStep === 'connecting' ? 'Connecting...' : authStep === 'authenticating' ? 'Authenticating...' : 'Preparing workspace...'}</> : <>Continue with Google <ArrowRight size={17} /></>}
          </button>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#222636] bg-[#090c12] p-3 text-[11px] leading-5 text-[#7e889d]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#3b82f6]" />
            <span>Broker credentials and capital remain with your broker. TradingCore uses authenticated sessions to connect your workspace.</span>
          </div>

          <div className="mt-5 border-t border-[#222636] pt-4 text-center text-[10px] text-[#64748b]">
            By continuing, you agree to the TradingCore Terms and Privacy Policy.
          </div>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
