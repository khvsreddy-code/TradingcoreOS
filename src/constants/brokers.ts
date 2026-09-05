export interface BrokerItem {
  id: string;
  name: string;
  apiVersion: string;
  status: 'OAuth Supported' | 'Coming Soon' | 'Beta';
  badgeColor: string;
  tag: string;
  description: string;
  authUrl: string;
  developerPortalUrl: string;
  clientIdPlaceholder: string;
  isPopular?: boolean;
}

export const BROKERS_CONFIG: BrokerItem[] = [
  {
    id: 'upstox',
    name: 'Upstox',
    apiVersion: 'OAuth 2.0 + API v3',
    status: 'OAuth Supported',
    badgeColor: '#a855f7',
    tag: 'U',
    description: 'Primary live execution and market-data route with REST + WebSocket streaming.',
    authUrl: 'https://api.upstox.com/v2/login/authorization/dialog',
    developerPortalUrl: 'https://upstox.com/developer/api-documentation',
    clientIdPlaceholder: 'e.g. your Upstox client ID',
    isPopular: true,
  },
  {
    id: 'fyers',
    name: 'Fyers',
    apiVersion: 'Fyers API v3 + OAuth 2.0',
    status: 'OAuth Supported',
    badgeColor: '#06b6d4',
    tag: 'F',
    description: 'Direct OAuth connection for Fyers accounts, with TradingCore keeping the broker boundary isolated.',
    authUrl: 'https://api-t1.fyers.in/api/v3/generate-authcode',
    developerPortalUrl: 'https://myapi.fyers.in',
    clientIdPlaceholder: 'e.g. FYERS_APP_ID-100',
  },
];
