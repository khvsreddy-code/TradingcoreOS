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
    id: 'zerodha',
    name: 'Zerodha',
    apiVersion: 'Kite Connect API v3',
    status: 'OAuth Supported',
    badgeColor: '#3b82f6',
    tag: 'Z',
    description: 'Direct OAuth 2.0 integration with Kite Connect server engine.',
    authUrl: 'https://kite.zerodha.com/connect/login?v=3',
    developerPortalUrl: 'https://kite.trade',
    clientIdPlaceholder: 'e.g. your_api_key_kite3',
    isPopular: true,
  },
  {
    id: 'dhan',
    name: 'Dhan',
    apiVersion: 'DhanHQ API v2',
    status: 'OAuth Supported',
    badgeColor: '#10b981',
    tag: 'D',
    description: 'Ultra low-latency order routing via DhanHQ OAuth gateway.',
    authUrl: 'https://auth.dhan.co/oauth/authorize',
    developerPortalUrl: 'https://dhanhq.co',
    clientIdPlaceholder: 'e.g. client_id_dhan_102',
    isPopular: true,
  },
  {
    id: 'upstox',
    name: 'Upstox',
    apiVersion: 'Upstox Developer API v2',
    status: 'OAuth Supported',
    badgeColor: '#a855f7',
    tag: 'U',
    description: 'Full REST & WebSocket streaming OAuth session authorization.',
    authUrl: 'https://api.upstox.com/v2/login/authorization/dialog',
    developerPortalUrl: 'https://upstox.com/developer/api-documentation',
    clientIdPlaceholder: 'e.g. 7d8f9a2e-3b4c-5d6e',
  },
  {
    id: 'angelone',
    name: 'Angel One',
    apiVersion: 'SmartAPI Engine',
    status: 'OAuth Supported',
    badgeColor: '#f97316',
    tag: 'A',
    description: 'Institutional level SmartAPI tokenized authentication session.',
    authUrl: 'https://smartapi.angelone.in/publisher-login',
    developerPortalUrl: 'https://smartapi.angelone.in',
    clientIdPlaceholder: 'e.g. smartapi_app_key',
  },
  {
    id: 'fyers',
    name: 'Fyers',
    apiVersion: 'Fyers API v3',
    status: 'OAuth Supported',
    badgeColor: '#06b6d4',
    tag: 'F',
    description: 'Single sign-on tokenized OAuth 2.0 authentication pipeline.',
    authUrl: 'https://api-v3.fyers.in/api/v3/generate-authcode',
    developerPortalUrl: 'https://myapi.fyers.in',
    clientIdPlaceholder: 'e.g. FYERS_APP_ID-100',
  },
  {
    id: 'groww',
    name: 'Groww',
    apiVersion: 'Groww API v1',
    status: 'OAuth Supported',
    badgeColor: '#00d290',
    tag: 'G',
    description: 'Secure tokenized API connection with Groww developer gateway.',
    authUrl: 'https://groww.in/developer/login',
    developerPortalUrl: 'https://groww.in/developer',
    clientIdPlaceholder: 'e.g. groww_client_id_99',
  },
  {
    id: 'icicidirect',
    name: 'ICICI Direct',
    apiVersion: 'Breeze API v2',
    status: 'OAuth Supported',
    badgeColor: '#f43f5e',
    tag: 'I',
    description: 'Direct Breeze REST & WebSocket institutional authentication.',
    authUrl: 'https://api.icicidirect.com/apiDirect/login',
    developerPortalUrl: 'https://api.icicidirect.in',
    clientIdPlaceholder: 'e.g. Breeze_App_Key_402',
  },
];
