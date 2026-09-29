import React from 'react';
import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';

export type ErrorType =
  | 'network'
  | 'broker_unavailable'
  | 'oauth_cancelled'
  | 'supabase_offline'
  | 'session_expired'
  | 'generic';

interface ErrorCardProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const ERROR_PRESETS: Record<ErrorType, { title: string; defaultMessage: string }> = {
  network: {
    title: 'Network Connection Lost',
    defaultMessage: 'Unable to reach TradingCore servers. Please check your internet connection.',
  },
  broker_unavailable: {
    title: 'Broker Gateway Offline',
    defaultMessage: 'The selected broker OAuth portal is currently under maintenance or unreachable.',
  },
  oauth_cancelled: {
    title: 'OAuth Authorization Cancelled',
    defaultMessage: 'Sign-in request was closed or cancelled. Please try connecting again.',
  },
  supabase_offline: {
    title: 'Authentication Service Offline',
    defaultMessage: 'Supabase cluster connection timed out or credentials are not configured.',
  },
  session_expired: {
    title: 'Session Expired',
    defaultMessage: 'Your authentication token has expired. Please sign in again to continue.',
  },
  generic: {
    title: 'Operation Failed',
    defaultMessage: 'An unexpected error occurred. Please try again or contact support.',
  },
};

export const ErrorCard: React.FC<ErrorCardProps> = ({
  type = 'generic',
  title,
  message,
  onRetry,
  onDismiss,
}) => {
  const preset = ERROR_PRESETS[type] || ERROR_PRESETS.generic;
  const displayTitle = title || preset.title;
  const displayMessage = message || preset.defaultMessage;

  return (
    <div className="rounded-xl border border-[#ef4444]/30 bg-[#12080a] p-4 text-xs text-[#fca5a5] shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[#ef4444] shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-[#f87171] tracking-tight">{displayTitle}</h4>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-[var(--tco-muted)] hover:text-[var(--tco-text)] transition-colors p-1"
                aria-label="Dismiss error"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-[#fca5a5]/90 leading-relaxed font-mono text-[11px]">{displayMessage}</p>

          {onRetry && (
            <div className="pt-2">
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#f87171] hover:bg-[#ef4444]/20 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry Action</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
