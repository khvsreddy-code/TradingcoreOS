export interface BrokerItem {
  id: string;
  name: string;
  apiVersion: string;
  status: 'OAuth Supported' | 'Coming Soon' | 'Beta';
  badgeColor: string;
  tag: string;
  description: string;
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
  },
  {
    id: 'angelone',
    name: 'Angel One',
    apiVersion: 'SmartAPI Engine',
    status: 'OAuth Supported',
    badgeColor: '#f97316',
    tag: 'A',
    description: 'Institutional level SmartAPI tokenized authentication session.',
  },
  {
    id: 'fyers',
    name: 'Fyers',
    apiVersion: 'Fyers API v3',
    status: 'OAuth Supported',
    badgeColor: '#06b6d4',
    tag: 'F',
    description: 'Single sign-on tokenized OAuth 2.0 authentication pipeline.',
  },
  {
    id: 'groww',
    name: 'Groww',
    apiVersion: 'Groww API v1',
    status: 'OAuth Supported',
    badgeColor: '#00d290',
    tag: 'G',
    description: 'Secure tokenized API connection with Groww developer gateway.',
  },
  {
    id: 'icicidirect',
    name: 'ICICI Direct',
    apiVersion: 'Breeze API v2',
    status: 'OAuth Supported',
    badgeColor: '#f43f5e',
    tag: 'I',
    description: 'Direct Breeze REST & WebSocket institutional authentication.',
  },
];
