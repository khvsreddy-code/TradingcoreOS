/** Canonical cross-product market instrument identity.
 *
 * Broker keys remain transport details. `id` is the stable TradingCore identity;
 * `symbol` is the chart/data-plane symbol accepted by the active workspace.
 */
export type InstrumentType =
  | 'index'
  | 'equity'
  | 'future'
  | 'option'
  | 'commodity'
  | 'currency'
  | 'unknown';

/** Unknown is deliberately retained: missing feed data is not proof of a disconnect. */
export type InstrumentDataStatus =
  | 'live'
  | 'delayed'
  | 'stale'
  | 'disconnected'
  | 'unknown';

export interface Instrument {
  /** Stable identity shared across chart, watchlist, option, order and research adapters. */
  id: string;
  /** Canonical chart/data-plane symbol, not necessarily the broker's instrument key. */
  symbol: string;
  exchange: string;
  instrumentType: InstrumentType;
  underlying?: string;
  /** Exchange-issued identifier used to match the same equity across broker tokens. */
  isin?: string;
  expiry?: string;
  strike?: number;
  optionType?: 'CE' | 'PE';
  lotSize?: number;
  tickSize?: number;
  /** Data/quote provider, e.g. fyers, upstox, yahoo, investiny, replay. */
  provider: string;
  dataStatus: InstrumentDataStatus;
  /** Provider-native identity retained for order/search requests. */
  brokerInstrumentKey?: string;
  /** Human-readable instrument name, kept out of dense watchlist rows. */
  name?: string;
}
