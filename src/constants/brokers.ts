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
    id: 'fyers',
    name: 'Fyers',
    apiVersion: 'Fyers API v3 + OAuth 2.0',
    status: 'OAuth Supported',
    badgeColor: '#06b6d4',
    tag: 'F',
    description: 'Primary broker connection for TradingCore market data, chart history, portfolio, and execution.',
    authUrl: 'https://api-t1.fyers.in/api/v3/generate-authcode',
    developerPortalUrl: 'https://myapi.fyers.in',
    clientIdPlaceholder: 'e.g. FYERS_APP_ID-100',
    isPopular: true,
  },
];
