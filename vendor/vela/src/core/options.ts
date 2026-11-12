import type { OHLCV } from './model/ohlcv';
import type { VisibleRangePreset } from './visible-range';
import type { VisibleRange } from './ports/IChartRenderer';
import type { InputValue } from './model/inputs';
import type { IChartRenderer } from './ports/IChartRenderer';
import type { DrawingsOption } from './drawings/toolbar';
import type { LocalizationOptions } from './i18n/types';
import type { ThemeSettings, UiTheme } from '@luxalgo/vela-ui/theme';

/** A registered data-provider name (any string; matched case-insensitively). */
export type ProviderName = string;

/**
 * Which trading session the chart shows, on markets that have one: `regular` = RTH
 * (09:30â€“16:00 for US equities), `extended` = ETH (pre/post-market included). The
 * provider owns the actual filtering â€” the flag rides every data request. Meaningless
 * (and ignored end-to-end) on continuous markets like crypto.
 */
export type MarketSession = 'regular' | 'extended';

/** Narrow an untrusted string (persisted document, URL param) to a {@link MarketSession}. */
export const normalizeSession = (v: unknown): MarketSession | undefined => (v === 'regular' || v === 'extended' ? v : undefined);

/** How the chart obtains its candles. */
export interface MarketConfig {
    /** The market's symbol. A bare ticker (`'BTCUSDT'`) resolves against the registered
     *  providers in DECLARATION order (first one whose index lists it); an
     *  `EXCHANGE:` prefix (`'coinbase:BTC-USD'`, case-insensitive) pins the¶»§q«^