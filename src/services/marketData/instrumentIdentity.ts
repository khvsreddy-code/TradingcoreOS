import type { Instrument, InstrumentDataStatus, InstrumentType } from '../../types/instrument';

export interface InstrumentIdentityInput {
  id?: string;
  symbol: string;
  provider?: string;
  exchange?: string;
  instrumentType?: string;
  type?: string;
  underlying?: string;
  isin?: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
  lotSize?: number;
  tickSize?: number;
  brokerInstrumentKey?: string;
  dataStatus?: InstrumentDataStatus;
  name?: string;
}

const OPTION_RIGHT = /^(CE|PE|CALL|PUT)$/i;

function safePositive(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizedExpiry(value?: string): string | undefined {
  const raw = String(value ?? '').trim();
  return raw || undefined;
}

export function normalizeOptionType(value?: string): 'CE' | 'PE' | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'CE' || normalized === 'CALL') return 'CE';
  if (normalized === 'PE' || normalized === 'PUT') return 'PE';
  return undefined;
}

export function normalizeInstrumentType(input: Pick<InstrumentIdentityInput, 'symbol' | 'type' | 'instrumentType' | 'expiry' | 'strike' | 'optionType'>): InstrumentType {
  const type = String(input.instrumentType || input.type || '').trim().toLowerCase();
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (OPTION_RIGHT.test(String(input.optionType || '')) || type.includes('option') || type === 'opt'
    || (input.expiry && input.strike != null)) return 'option';
  if (type.includes('future') || type === 'fut' || /(?:^|[-_])FUT(?:URE)?$/i.test(symbol)) return 'future';
  if (type.includes('commodity') || /^(?:MCX|NCDX):/i.test(symbol)) return 'commodity';
  if (type.includes('currency') || /(?:USDINR|EURINR|GBPINR|JPYINR)/i.test(symbol)) return 'currency';
  if (type.includes('index') || /(?:^|[-_])INDEX$/i.test(symbol)
    || /^(?:NIFTY(?:50|BANK)?|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX)(?:$|[-_])/i.test(symbol.replace(/^[A-Z]+:/, ''))) return 'index';
  if (type.includes('equity') || type === 'eq' || type.includes('stock') || /-(?:EQ|BE|SM|ST)$/i.test(symbol)) return 'equity';
  return 'unknown';
}

function resolveExchange(input: InstrumentIdentityInput, symbol: string): string {
  const supplied = String(input.exchange ?? '').trim().toUpperCase();
  if (supplied) return supplied.replace(/_INDEX$|_EQ$|_FO$|_COM$|_CD$/i, '');
  const prefix = /^([A-Z0-9]+):/.exec(symbol)?.[1];
  if (prefix) return prefix.toUpperCase();
  const brokerPrefix = /^([A-Z0-9]+)_(?:INDEX|EQ|FO|COM|CD)\|/i.exec(String(input.brokerInstrumentKey ?? ''))?.[1];
  return brokerPrefix?.toUpperCase() || 'UNKNOWN';
}

function normalizeUnderlying(value: string | undefined, provider: string): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  return canonicalInstrumentKey(provider, raw);
}

/** Stable, provider-neutral instrument identity. */
export function createInstrument(input: InstrumentIdentityInput): Instrument {
  const provider = String(input.provider ?? 'unknown').trim().toLowerCase() || 'unknown';
  const symbol = canonicalInstrumentKey(provider, input.symbol);
  const exchange = resolveExchange(input, symbol);
  const instrumentType = normalizeInstrumentType({ ...input, symbol });
  const expiry = normalizedExpiry(input.expiry);
  const strike = safePositive(input.strike);
  const optionType = normalizeOptionType(input.optionType);
  const underlying = normalizeUnderlying(input.underlying, provider);

  // A fully described option contract is identified by its economic terms, not by
  // a provider-specific token. Other instruments use exchange + canonical symbol.
  const isin = String(input.isin ?? '').trim().toUpperCase() || undefined;
  const identity = instrumentType === 'option' && underlying && expiry && strike !== undefined && optionType
    ? [exchange, 'option', underlying, expiry, String(strike), optionType].join('|')
    : instrumentType === 'future' && underlying && expiry
      ? [exchange, 'future', underlying, expiry].join('|')
      : instrumentType === 'equity' && isin
        ? [exchange, 'equity', 'isin', isin].join('|')
        : [exchange, instrumentType, symbol].join('|');
  const id = `tco-instrument:${encodeURIComponent(identity.toLowerCase())}`;

  return Object.freeze({
    id,
    symbol,
    exchange,
    instrumentType,
    ...(underlying ? { underlying } : {}),
    ...(isin ? { isin } : {}),
    ...(expiry ? { expiry } : {}),
    ...(strike !== undefined ? { strike } : {}),
    ...(optionType ? { optionType } : {}),
    ...(safePositive(input.lotSize) !== undefined ? { lotSize: safePositive(input.lotSize) } : {}),
    ...(safePositive(input.tickSize) !== undefined ? { tickSize: safePositive(input.tickSize) } : {}),
    provider,
    dataStatus: input.dataStatus ?? 'unknown',
    ...(input.brokerInstrumentKey ? { brokerInstrumentKey: String(input.brokerInstrumentKey) } : {}),
    ...(input.name ? { name: String(input.name) } : {}),
  });
}

export function instrumentIdentityKey(instrument: Pick<Instrument, 'id'>): string {
  return String(instrument.id || '').trim();
}


const instrumentsById = new Map<string, Instrument>();
const instrumentIdBySymbol = new Map<string, string>();

/** Register the latest metadata/status snapshot under the stable instrument identity. */
export function registerInstrument(input: InstrumentIdentityInput | Instrument): Instrument {
  const instrument = createInstrument(input);
  instrumentsById.set(instrument.id, instrument);
  instrumentIdBySymbol.set(instrument.symbol.toUpperCase(), instrument.id);
  return instrument;
}

export function getInstrumentById(id: string): Instrument | undefined {
  return instrumentsById.get(String(id ?? '').trim());
}

export function getInstrumentBySymbol(symbol: string): Instrument | undefined {
  const id = instrumentIdBySymbol.get(String(symbol ?? '').trim().toUpperCase());
  return id ? instrumentsById.get(id) : undefined;
}

export const INSTRUMENT_SELECTED_EVENT = 'tradingcore:instrument-selected';

/** Notify workspace modules when the active chart instrument changes. */
export function publishInstrumentSelection(instrument: Instrument): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Instrument>(INSTRUMENT_SELECTED_EVENT, { detail: instrument }));
}


/** FYERS-native symbol spellings are adapted once, at the market identity boundary. */
export function canonicalInstrumentKey(brokerId: string, key: string): string {
  const value = String(key || '').trim();
  const n = value.toLowerCase().replace(/\s+/g, '');
  // Index aliases are normalized before broker-specific logic so FYERS and Upstox
  // resolve the same underlying contract identity.
  if (n === 'nse_index|nifty50' || n === 'nse_index|nifty50index' || n === 'nifty' || n === 'nifty50' || n === 'nifty50index' || n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
  if (n === 'nse_index|niftybank' || n === 'nse_index|banknifty' || n === 'banknifty' || n === 'niftybank' || n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
  if (n === 'nse_index|finnifty' || n === 'nse_index|niftyfinancialservices' || n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
  if (n === 'nse_index|niftymidcapselect' || n === 'nse_index|midcap' || n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
  if (n === 'bse_index|sensex' || n === 'sensex' || n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';
  if (String(brokerId).toLowerCase() !== 'fyers') return value;
  const pipe = value.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if (pipe) {
    const exchange = pipe[1].toUpperCase();
    const segment = pipe[2].toUpperCase();
    const ticker = pipe[3];
    if (segment === 'CM' && !/-(EQ|BE|SM|ST)$/i.test(ticker)) return `${exchange}:${ticker}-EQ`;
    return `${exchange}:${ticker}`;
  }
  if (!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return `NSE:${value}`;
  if (/^NSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  if (/^BSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  return value;
}
