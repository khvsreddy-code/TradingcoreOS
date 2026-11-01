import { createHash } from 'node:crypto';

/**
 * FYERS quota belongs to the broker account, not to a TradingCore login and
 * never to a rotating access token. If the account code is unavailable, use
 * the configured FYERS application identity as a conservative shared fallback.
 */
export function resolveFyersQuotaIdentity(
  clientCode?: string | null,
  applicationId: string = String(process.env.FYERS_CLIENT_ID || ''),
): string {
  const account = String(clientCode || '').trim().toUpperCase();
  const app = String(applicationId || '').trim().toUpperCase();
  const scope = account ? 'account:' + account : app ? 'application:' + app : '';
  if (!scope) {
    throw Object.assign(new Error('Stable FYERS account or application identity is required for quota enforcement.'), {
      status: 503,
      code: 'BROKER_IDENTITY_REQUIRED',
    });
  }
  return 'fyers:' + createHash('sha256')
    .update('tradingcore:fyers-quota:v2:')
    .update(scope)
    .digest('hex');
}
