import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { HistoricalCandle, HistoricalDataMetadata, HistoricalQuoteSnapshot } from '../../services/brokers/BrokerAdapter.js';

export const HISTORICAL_MAX_BARS = 5_000;
export const HISTORICAL_RECENT_SESSIONS = 3;
export const HISTORICAL_SOURCE_POLICY = 'fyers-three-sessions+tvdatafeed-older-5000/v1';
const CACHE_TTL_MS = 60_000;
const SOURCE_TIMEOUT_MS = 10_000;
const CACHE_TABLE = 'historical_dataset_cache';
const MAPPING_TABLE = 'historical_instrument_mappings';

export interface HistoricalInstrumentMapping {
  instrumentId: string; fyersSymbol: string; tvSymbol?: string; tvExchange?: string;
  exchange: string; instrumentType: string; contractExpiry?: string | null;
  contractIdentity?: string | null; tvContractIdentity?: string | null; tvFutContract?: number | null;
  timezone: string; sessionOpen: string; sessionClose: string; adjustmentPolicy: string;
  fyersAdjustmentPolicy: string; tvAdjustmentPolicy: string;
  calendarHolidays: string[]; calendarComplete: boolean; enabled: boolean;
}
export interface RecentHistoryRange { fromMs: number; toMs: number; fromDate: string; calendarPolicy: string; }
export interface FyersRecentResult { bars: unknown[]; quote?: HistoricalQuoteSnapshot | null; status?: Record<string, unknown>; }
export type FyersRecentFetcher = (mapping: HistoricalInstrumentMapping, range: RecentHistoryRange) => Promise<FyersRecentResult>;
interface StoredBar extends HistoricalCandle { source: 'fyers' | 'tvdatafeed'; timestampMs: number; }
interface CacheRecord {
  instrumentId: string; timeframe: string; bars: StoredBar[]; revision: number;
  sourcePolicy: string; sourceStatus: Record<string, unknown>; degraded: boolean;
  expiresAt: number; updatedAt: number; quote?: HistoricalQuoteSnapshot | null;
}
export interface HistoricalLoadResult { bars: HistoricalCandle[]; metadata: HistoricalDataMetadata; quote: HistoricalQuoteSnapshot | null; }
export interface HistoricalLoadRequest {
  instrumentId: string; timeframe: string; maxBars?: number; beforeTimestamp?: number; fetchFyersRecent?: FyersRecentFetcher;
}

const memoryCache = new Map<string, CacheRecord>();
const inflight = new Map<string, Promise<CacheRecord>>();
function envValue(name: string): string { return String(process.env[name] || '').trim(); }
function parseMap(raw: string): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function asText(value: unknown, fallback = ''): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function validTimezone(value: string): string {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date()); return value; } catch { return 'Asia/Kolkata'; }
}
function zonedDate(timestampMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: validTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestampMs));
  const v: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') v[part.type] = part.value;
  return v.year + '-' + v.month + '-' + v.day;
}
function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! - 1, 12)).toISOString().slice(0, 10);
}
function localDateTimeToEpoch(date: string, time: string, timezone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour || 0, minute || 0);
  let guess = target;
  const zone = validTimezone(timezone);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const v: Record<string, number> = {};
    for (const part of parts) if (part.type !== 'literal') v[part.type] = Number(part.value);
    guess += target - Date.UTC(v.year!, v.month! - 1, v.day!, v.hour!, v.minute!);
  }
  return guess;
}

/** Count three configured weekday sessions; otherwise request a safe ten-day window and keep the last three observed sessions. */
export function getRecentHistoryRequestRange(
  mapping: Pick<HistoricalInstrumentMapping, 'timezone' | 'sessionOpen' | 'calendarHolidays' | 'calendarComplete'>,
  now = new Date(),
): RecentHistoryRange {
  const timezone = validTimezone(mapping.timezone);
  const today = zonedDate(now.getTime(), timezone);
  const localClockParts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const localClockValues: Record<string, string> = {};
  for (const part of localClockParts) if (part.type !== 'literal') localClockValues[part.type] = part.value;
  const nowMinutes = Number(localClockValues.hour || 0) * 60 + Number(localClockValues.minute || 0);
  const sessionOpenParts = (mapping.sessionOpen || '09:15').split(':').map(Number);
  const beforeSessionOpen = nowMinutes < (sessionOpenParts[0] || 0) * 60 + (sessionOpenParts[1] || 0);
  const holidays = new Set(mapping.calendarHolidays || []);
  let firstSessionDate = beforeSessionOpen ? previousDate(today) : today;
  let calendarPolicy = 'observed-sessions-fallback-10-calendar-days';
  if (mapping.calendarComplete === true) {
    let cursor = firstSessionDate, seen = 0;
    for (let walked = 0; walked < 370 && seen < HISTORICAL_RECENT_SESSIONS; walked += 1) {
      const dow = new Date(cursor + 'T12:00:00Z').getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidays.has(cursor)) { seen += 1; firstSessionDate = cursor; }
      cursor = previousDate(cursor);
    }
    if (seen === HISTORICAL_RECENT_SESSIONS) calendarPolicy = 'configured-weekday-calendar+holiday-list';
    else firstSessionDate = previousDate(today);
  } else {
    firstSessionDate = today;
    for (let i = 0; i < 10; i += 1) firstSessionDate = previousDate(firstSessionDate);
  }
  return {
    // Midnight includes daily bars stamped at 00:00 on the third session date.
    fromMs: localDateTimeToEpoch(firstSessionDate, '00:00', timezone),
    toMs: now.getTime(), fromDate: firstSessionDate, calendarPolicy,
  };
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}
function rowParts(row: unknown): { time: unknown; open: unknown; high: unknown; low: unknown; close: unknown; volume: unknown } | null {
  if (Array.isArray(row) && row.length >= 5) return { time: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5] };
  if (!row || typeof row !== 'object') return null;
  const v = row as Record<string, unknown>;
  if (v.liveSeed === true || v.isQuote === true) return null;
  return { time: v.timestamp ?? v.time ?? v.datetime, open: v.open ?? v.Open, high: v.high ?? v.High, low: v.low ?? v.Low, close: v.close ?? v.Close, volume: v.volume ?? v.Volume ?? 0 };
}
function normalizeRows(rows: unknown[], source: StoredBar['source']): StoredBar[] {
  const byTime = new Map<number, StoredBar>();
  for (const raw of rows || []) {
    const row = rowParts(raw);
    if (!row) continue;
    const timestampMs = parseTimestamp(row.time);
    const open = Number(row.open), high = Number(row.high), low = Number(row.low), close = Number(row.close);
    // Missing volume is valid for feeds that do not publish it; an explicitly
    // malformed volume is not. Never silently turn corrupt source data into a
    // plausible zero-volume candle used by indicators or model training.
    const hasVolume = row.volume != null && row.volume !== '';
    const parsedVolume = hasVolume ? Number(row.volume) : 0;
    if (hasVolume && !Number.isFinite(parsedVolume)) continue;
    const volume = parsedVolume;
    if (!Number.isFinite(timestampMs) || timestampMs <= 0 || ![open, high, low, close].every(Number.isFinite) ||
        volume < 0 || high < low || high < Math.max(open, close) || low > Math.min(open, close)) continue;
    const bar: StoredBar = { timestamp: new Date(timestampMs).toISOString(), timestampMs, open, high, low, close, volume, source };
    const old = byTime.get(timestampMs);
    if (!old || (source === 'fyers' && old.source !== 'fyers')) byTime.set(timestampMs, bar);
  }
  return [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}
/** Pure normalization hook used by server contracts and source adapters. */
export function normalizeHistoricalCandles(rows: unknown[], source: 'fyers' | 'tvdatafeed'): StoredBar[] {
  return normalizeRows(rows, source);
}
function sessionDates(bars: StoredBar[], timezone: string): string[] { return [...new Set(bars.map(b => zonedDate(b.timestampMs, timezone)))].sort(); }
function dateOffset(date: string, offsetDays: number): string {
  return new Date(Date.parse(date + 'T12:00:00Z') + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function isTradingDate(date: string, holidays: readonly string[]): boolean {
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.includes(date);
}

/** Compute the earliest availability of a completed OHLCV bar, not its candle-open time. */
function historicalBarAvailableAt(
  timestampMs: number,
  timeframe: string,
  timezone: string,
  sessionClose: string,
  holidays: readonly string[],
): number | undefined {
  const raw = String(timeframe || '').trim();
  const seconds = /^(\d+)\s*S$/i.exec(raw);
  if (seconds) return timestampMs + Number(seconds[1]) * 1000;

  const minutes = /^(\d+)\s*(?:m|min|minute|minutes)?$/i.exec(raw);
  if (minutes) {
    const size = Number(minutes[1]);
    if (size >= 1 && size <= 24 * 60) return timestampMs + size * 60_000;
  }
  const minuteWords = /^(\d+)\s*(?:minute|minutes)$/i.exec(raw);
  if (minuteWords) return timestampMs + Number(minuteWords[1]) * 60_000;

  const localDate = zonedDate(timestampMs, timezone);
  let closeDate = localDate;
  if (['W', '1W', 'week', 'weekly'].includes(raw)) {
    const dow = new Date(localDate + 'T12:00:00Z').getUTCDay();
    const toFriday = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
    closeDate = dateOffset(localDate, toFriday);
  } else if (['M', '1M', 'month', 'monthly'].includes(raw)) {
    const [year, month] = localDate.split('-').map(Number);
    closeDate = new Date(Date.UTC(year!, month!, 0, 12)).toISOString().slice(0, 10);
  } else if (!['D', '1D', 'day', 'daily', '1day', '1d'].includes(raw)) {
    return undefined;
  }
  // Weekly/monthly candles can end before a weekend or a configured exchange holiday.
  for (let walked = 0; walked < 8 && !isTradingDate(closeDate, holidays); walked += 1) {
    closeDate = dateOffset(closeDate, -1);
  }
  return localDateTimeToEpoch(closeDate, sessionClose || '15:30', timezone);
}

function toPublicBars(
  bars: StoredBar[],
  timeframe: string,
  timezone: string,
  sessionClose: string,
  holidays: readonly string[],
): HistoricalCandle[] {
  return bars.map(({ source, timestampMs, ...bar }) => {
    const availableAt = historicalBarAvailableAt(timestampMs, timeframe, timezone, sessionClose, holidays);
    return {
      ...bar,
      source,
      phase: 'historical',
      confirmed: true,
      ...(availableAt !== undefined && Number.isFinite(availableAt)
        ? { availableAt: new Date(availableAt).toISOString() }
        : {}),
    };
  });
}
function cacheKey(instrumentId: string, timeframe: string): string { return instrumentId + ':' + timeframe; }
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'source error');
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function isMissingTableError(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null;
  const code = String(value?.code || '');
  const message = String(value?.message || error || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(message);
}

export class HistoricalDataService {
  private readonly supabase: SupabaseClient | null;
  private cacheTableUnavailable = false;
  private mappingTableUnavailable = false;

  constructor() {
    const url = envValue('SUPABASE_URL');
    const key = envValue('SUPABASE_SERVICE_ROLE_KEY') || envValue('SUPABASE_SECRET_KEY');
    this.supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  private mappingFromRow(row: Record<string, unknown>): HistoricalInstrumentMapping {
    const instrumentId = asText(row.instrument_id), fyersSymbol = asText(row.fyers_symbol);
    return {
      instrumentId, fyersSymbol,
      tvSymbol: asText(row.tv_symbol) || undefined, tvExchange: asText(row.tv_exchange) || undefined,
      exchange: asText(row.exchange, fyersSymbol.split(':')[0] || 'NSE'),
      instrumentType: asText(row.instrument_type, 'unknown').toLowerCase(),
      contractExpiry: asText(row.contract_expiry) || null,
      contractIdentity: asText(row.contract_identity) || null,
      tvContractIdentity: asText(row.tv_contract_identity) || null,
      tvFutContract: row.tv_fut_contract != null && row.tv_fut_contract !== '' && Number.isInteger(Number(row.tv_fut_contract)) ? Number(row.tv_fut_contract) : null,
      timezone: validTimezone(asText(row.timezone, 'Asia/Kolkata')),
      sessionOpen: asText(row.session_open, '09:15'), sessionClose: asText(row.session_close, '15:30'),
      adjustmentPolicy: asText(row.adjustment_policy, 'none'),
      fyersAdjustmentPolicy: asText(row.fyers_adjustment_policy, asText(row.adjustment_policy, 'none')),
      tvAdjustmentPolicy: asText(row.tv_adjustment_policy, asText(row.adjustment_policy, 'none')),
      calendarHolidays: Array.isArray(row.calendar_holidays) ? row.calendar_holidays.map(String).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)) : [],
      calendarComplete: row.calendar_complete === true, enabled: row.enabled !== false,
    };
  }

  private async resolveMapping(instrumentId: string): Promise<HistoricalInstrumentMapping> {
    if (this.supabase && !this.mappingTableUnavailable) {
      try {
        const bySymbol = await this.supabase.from(MAPPING_TABLE).select('*').eq('enabled', true).eq('fyers_symbol', instrumentId).maybeSingle();
        if (bySymbol.error) throw bySymbol.error;
        if (bySymbol.data) {
          const mapping = this.mappingFromRow(bySymbol.data as Record<string, unknown>);
          if (mapping.fyersSymbol === instrumentId) return mapping;
        }
        const byId = await this.supabase.from(MAPPING_TABLE).select('*').eq('enabled', true).eq('instrument_id', instrumentId).maybeSingle();
        if (byId.error) throw byId.error;
        if (byId.data) {
          const mapping = this.mappingFromRow(byId.data as Record<string, unknown>);
          if (mapping.instrumentId === instrumentId && mapping.fyersSymbol) return mapping;
        }
      } catch (error) {
        if (isMissingTableError(error)) this.mappingTableUnavailable = true;
      }
    }

    const configured = parseMap(envValue('TVDATAFEED_SYMBOL_MAP'))[instrumentId];
    if (configured) {
      const mapping = this.mappingFromRow({
        instrument_id: configured.instrumentId ?? configured.instrument_id ?? instrumentId,
        fyers_symbol: configured.fyersSymbol ?? configured.fyers_symbol ?? instrumentId,
        tv_symbol: configured.tvSymbol ?? configured.tv_symbol, tv_exchange: configured.tvExchange ?? configured.tv_exchange,
        exchange: configured.exchange, instrument_type: configured.instrumentType ?? configured.instrument_type,
        contract_expiry: configured.contractExpiry ?? configured.contract_expiry,
        contract_identity: configured.contractIdentity ?? configured.contract_identity,
        tv_contract_identity: configured.tvContractIdentity ?? configured.tv_contract_identity,
        tv_fut_contract: configured.tvFutContract ?? configured.tv_fut_contract,
        timezone: configured.timezone, session_open: configured.sessionOpen ?? configured.session_open,
        session_close: configured.sessionClose ?? configured.session_close,
        adjustment_policy: configured.adjustmentPolicy ?? configured.adjustment_policy,
        fyers_adjustment_policy: configured.fyersAdjustmentPolicy ?? configured.fyers_adjustment_policy,
        tv_adjustment_policy: configured.tvAdjustmentPolicy ?? configured.tv_adjustment_policy,
        calendar_holidays: configured.calendarHolidays ?? configured.calendar_holidays,
        calendar_complete: configured.calendarComplete ?? configured.calendar_complete, enabled: configured.enabled,
      });
      if (mapping.enabled && mapping.fyersSymbol === instrumentId) return mapping;
    }

    // These five broad Indian cash indices have stable, unambiguous TradingView symbols.
    // Their history can be sourced without an administrator-managed mapping row; derivatives
    // deliberately stay on the explicit-map path because expiry/contract identity must match.
    const builtInIndexMappings: Record<string, { tvSymbol: string; tvExchange: string; exchange: string }> = {
      'NSE:NIFTY50-INDEX': { tvSymbol: 'NIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:NIFTYBANK-INDEX': { tvSymbol: 'BANKNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:FINNIFTY-INDEX': { tvSymbol: 'FINNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:MIDCPNIFTY-INDEX': { tvSymbol: 'MIDCPNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'BSE:SENSEX-INDEX': { tvSymbol: 'SENSEX', tvExchange: 'BSE', exchange: 'BSE' },
    };
    const builtInIndex = builtInIndexMappings[instrumentId];
    if (builtInIndex) {
      return {
        instrumentId, fyersSymbol: instrumentId, ...builtInIndex, instrumentType: 'index',
        timezone: 'Asia/Kolkata', sessionOpen: '09:15', sessionClose: '15:30',
        adjustmentPolicy: 'none', fyersAdjustmentPolicy: 'none', tvAdjustmentPolicy: 'none',
        calendarHolidays: [], calendarComplete: false, enabled: true,
      };
    }

    // FYERS's standard cash-equity suffix has a deterministic TradingView cash symbol.
    // Use that mapping for any active NSE/BSE equity without requiring per-ticker rows.
    // Do not apply this shortcut to BE/SM/ST series, indices, futures, options or spreads:
    // those require explicit source mappings and, for derivatives, matching contract identity.
    const cashEquity = /^(NSE|BSE):([A-Z0-9&._-]+)-EQ$/i.exec(instrumentId);
    if (cashEquity) {
      const exchange = cashEquity[1]!.toUpperCase();
      const tvSymbol = cashEquity[2]!;
      return {
        instrumentId, fyersSymbol: instrumentId, exchange, instrumentType: 'equity',
        tvSymbol, tvExchange: exchange,
        timezone: 'Asia/Kolkata', sessionOpen: '09:15', sessionClose: '15:30',
        adjustmentPolicy: 'none', fyersAdjustmentPolicy: 'none', tvAdjustmentPolicy: 'none',
        calendarHolidays: [], calendarComplete: false, enabled: true,
      };
    }

    return {
      instrumentId, fyersSymbol: instrumentId, exchange: instrumentId.includes(':') ? instrumentId.split(':')[0]! : 'NSE',
      instrumentType: /-INDEX$/i.test(instrumentId) ? 'index' : 'unknown',
      timezone: 'Asia/Kolkata', sessionOpen: '09:15', sessionClose: '15:30',
      adjustmentPolicy: 'none', fyersAdjustmentPolicy: 'none', tvAdjustmentPolicy: 'none',
      calendarHolidays: [], calendarComplete: false, enabled: true,
    };
  }

  private tvContractCompatible(mapping: HistoricalInstrumentMapping): boolean {
    if (!mapping.tvSymbol || !mapping.tvExchange) return false;
    // Never merge independently adjusted price histories without a source-specific
    // adjustment transform; this implementation only merges matching policies.
    if (mapping.fyersAdjustmentPolicy !== mapping.tvAdjustmentPolicy) return false;
    const derivative = ['future', 'futures', 'option', 'options'].includes(mapping.instrumentType);
    if (!derivative) return true;
    const fyersIdentity = mapping.contractIdentity || mapping.contractExpiry || '';
    return Boolean(fyersIdentity && mapping.tvContractIdentity && fyersIdentity === mapping.tvContractIdentity);
  }

  private async fetchTvdatafeed(mapping: HistoricalInstrumentMapping, timeframe: string): Promise<unknown[]> {
    const baseUrl = envValue('TVDATAFEED_SERVICE_URL').replace(/\/+$/, '');
    const token = envValue('TVDATAFEED_SERVICE_TOKEN');
    if (!baseUrl || !token || !this.tvContractCompatible(mapping)) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
    try {
      const response = await fetch(baseUrl + '/v1/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          instrument_id: mapping.instrumentId, symbol: mapping.tvSymbol, exchange: mapping.tvExchange,
          timeframe, max_bars: HISTORICAL_MAX_BARS, timezone: mapping.timezone,
          session_open: mapping.sessionOpen, fut_contract: mapping.tvFutContract,
        }), signal: controller.signal,
      });
      if (!response.ok) throw new Error('tvdatafeed service returned HTTP ' + response.status);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.bars)) throw new Error('tvdatafeed returned an invalid OHLCV envelope');
      return payload.bars;
    } finally { clearTimeout(timer); }
  }

  private async readCache(instrumentId: string, timeframe: string): Promise<CacheRecord | null> {
    const key = cacheKey(instrumentId, timeframe);
    const local = memoryCache.get(key) || null;
    if (local && local.expiresAt > Date.now()) {
      memoryCache.delete(key); memoryCache.set(key, local); return local;
    }
    if (this.supabase && !this.cacheTableUnavailable) {
      try {
        const result = await this.supabase.from(CACHE_TABLE).select('instrument_id,timeframe,bars,revision,source_policy,source_status,degraded,expires_at,updated_at')
          .eq('instrument_id', instrumentId).eq('timeframe', timeframe).maybeSingle();
        if (result.error) throw result.error;
        if (result.data && Array.isArray(result.data.bars)) {
          const bars = (result.data.bars as unknown[]).map((row) => {
            if (!isRecord(row)) return null;
            return normalizeRows([row], row.source === 'fyers' ? 'fyers' : 'tvdatafeed')[0] || null;
          }).filter((bar): bar is StoredBar => bar !== null).slice(-HISTORICAL_MAX_BARS);
          const updatedAt = Date.parse(String(result.data.updated_at || ''));
          const expiresAt = Date.parse(String(result.data.expires_at || ''));
          const record: CacheRecord = {
            instrumentId, timeframe, bars, revision: Number(result.data.revision) || 1,
            sourcePolicy: asText(result.data.source_policy, HISTORICAL_SOURCE_POLICY),
            sourceStatus: isRecord(result.data.source_status) ? result.data.source_status : {},
            degraded: result.data.degraded === true, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
            expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0, quote: null,
          };
          if (!local || record.updatedAt >= local.updatedAt) { memoryCache.set(key, record); this.trimMemoryCache(); return record; }
        }
      } catch (error) { if (isMissingTableError(error)) this.cacheTableUnavailable = true; }
    }
    return local;
  }

  private async writeCache(record: CacheRecord): Promise<CacheRecord> {
    const key = cacheKey(record.instrumentId, record.timeframe), previous = memoryCache.get(key);
    const next: CacheRecord = {
      ...record,
      revision: previous ? previous.revision + (JSON.stringify(previous.bars) !== JSON.stringify(record.bars) || previous.sourcePolicy !== record.sourcePolicy ? 1 : 0) : Math.max(1, record.revision || 1),
      updatedAt: Date.now(),
    };
    if (this.supabase && !this.cacheTableUnavailable) {
      try {
        const result = await this.supabase.from(CACHE_TABLE).upsert({
          instrument_id: next.instrumentId, timeframe: next.timeframe, bars: next.bars,
          bar_count: next.bars.length,
          oldest_timestamp: next.bars[0]?.timestamp || null,
          newest_timestamp: next.bars[next.bars.length - 1]?.timestamp || null,
          revision: next.revision, source_policy: next.sourcePolicy, source_status: next.sourceStatus,
          degraded: next.degraded, expires_at: new Date(next.expiresAt).toISOString(), updated_at: new Date(next.updatedAt).toISOString(),
        }, { onConflict: 'instrument_id,timeframe' }).select('revision,updated_at').maybeSingle();
        if (result.error) throw result.error;
        if (result.data) {
          next.revision = Number(result.data.revision) || next.revision;
          const updatedAt = Date.parse(String(result.data.updated_at || ''));
          if (Number.isFinite(updatedAt)) next.updatedAt = updatedAt;
        }
      } catch (error) { if (isMissingTableError(error)) this.cacheTableUnavailable = true; }
    }
    memoryCache.set(key, next); this.trimMemoryCache(); return next;
  }

  private trimMemoryCache(): void {
    while (memoryCache.size > 128) { const oldest = memoryCache.keys().next().value; if (!oldest) break; memoryCache.delete(oldest); }
  }

  private metadata(record: CacheRecord, bars: StoredBar[], overrides: Partial<HistoricalDataMetadata> = {}): HistoricalDataMetadata {
    const selected = bars.slice(-HISTORICAL_MAX_BARS);
    return {
      instrumentId: record.instrumentId, timeframe: record.timeframe, revision: record.revision,
      sourcePolicy: record.sourcePolicy, maxBars: HISTORICAL_MAX_BARS, barCount: selected.length,
      oldestTimestamp: selected[0]?.timestamp || null, newestTimestamp: selected[selected.length - 1]?.timestamp || null,
      cacheHit: false, stale: false, degraded: record.degraded, historyExhausted: false,
      paginationSupported: false, sourceStatus: record.sourceStatus, ...overrides,
    };
  }

  private async refresh(
    requestedInstrumentId: string, timeframe: string, mapping: HistoricalInstrumentMapping,
    cached: CacheRecord | null, fetchFyersRecent?: FyersRecentFetcher,
  ): Promise<CacheRecord> {
    const key = cacheKey(mapping.instrumentId, timeframe);
    const existing = inflight.get(key);
    if (existing) return existing;
    const task = (async (): Promise<CacheRecord> => {
      const range = getRecentHistoryRequestRange(mapping);
      const tvConfigured = Boolean(envValue('TVDATAFEED_SERVICE_URL') && envValue('TVDATAFEED_SERVICE_TOKEN'));
      const tvEnabled = tvConfigured && this.tvContractCompatible(mapping);
      const sourceStatus: Record<string, unknown> = {
        fyers: { status: fetchFyersRecent ? 'pending' : 'unavailable' },
        tvdatafeed: { status: !tvConfigured ? 'not-configured' : !mapping.tvSymbol || !mapping.tvExchange ? 'unmapped' : !tvEnabled ? 'contract-mismatch' : 'pending' },
        calendarPolicy: range.calendarPolicy,
        cache: { status: this.supabase && !this.cacheTableUnavailable ? 'durable' : 'memory-fallback' },
      };
      const fyersTask: Promise<FyersRecentResult> = fetchFyersRecent
        ? fetchFyersRecent(mapping, range) : Promise.reject(new Error('Fyers history unavailable for this request'));
      const tvTask: Promise<unknown[]> = tvEnabled ? this.fetchTvdatafeed(mapping, timeframe) : Promise.resolve([]);
      const [f, t] = await Promise.allSettled([fyersTask, tvTask]);
      let fyersRows: unknown[] = [], tvRows: unknown[] = [], quote: HistoricalQuoteSnapshot | null = null;
      let fyersFailed = false, tvFailed = false;
      if (f.status === 'fulfilled') {
        fyersRows = f.value.bars || []; quote = f.value.quote || null;
        sourceStatus.fyers = { status: fyersRows.length ? 'ok' : 'empty', rawCount: fyersRows.length, ...(f.value.status || {}) };
      } else {
        fyersFailed = true; sourceStatus.fyers = { status: 'error', error: errorText(f.reason) };
      }
      if (t.status === 'fulfilled') {
        tvRows = t.value;
        if (tvEnabled) sourceStatus.tvdatafeed = { status: tvRows.length ? 'ok' : 'empty', rawCount: tvRows.length };
      } else {
        tvFailed = true; sourceStatus.tvdatafeed = { status: 'error', error: errorText(t.reason) };
      }

      const fyersAll = normalizeRows(fyersRows, 'fyers');
      const dates = sessionDates(fyersAll, mapping.timezone);
      const recentDates = new Set(dates.slice(-HISTORICAL_RECENT_SESSIONS));
      const fyersBars = fyersAll.filter(bar => recentDates.has(zonedDate(bar.timestampMs, mapping.timezone)));
      let tvBars = normalizeRows(tvRows, 'tvdatafeed');
      const firstRecentDate = recentDates.size ? [...recentDates].sort()[0]! : null;
      if (firstRecentDate) {
        // Fyers owns the observed recent sessions, even when tvdatafeed returned
        // a row at a timestamp that Fyers did not include.
        tvBars = tvBars.filter(bar => zonedDate(bar.timestampMs, mapping.timezone) < firstRecentDate);
      }

      // If tvdatafeed is unavailable or returns no validated bars, preserve the
      // older portion of a previously validated dataset for this same, explicitly
      // compatible instrument mapping. Never reuse cached bars from recent Fyers
      // sessions, and never present the fallback as a fresh source response.
      const cachedOlderBars = cached?.sourcePolicy === HISTORICAL_SOURCE_POLICY &&
        cached.bars.length > 0 && tvBars.length === 0 && this.tvContractCompatible(mapping)
        ? cached.bars.filter(bar => !firstRecentDate || zonedDate(bar.timestampMs, mapping.timezone) < firstRecentDate)
        : [];

      const byTime = new Map<number, StoredBar>();
      for (const bar of [...cachedOlderBars, ...tvBars, ...fyersBars]) {
        const old = byTime.get(bar.timestampMs);
        if (!old || (bar.source === 'fyers' && old.source !== 'fyers') ||
            (bar.source === 'tvdatafeed' && old.source === 'tvdatafeed' && !cachedOlderBars.includes(old))) {
          byTime.set(bar.timestampMs, bar);
        }
      }
      const merged = [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs).slice(-HISTORICAL_MAX_BARS);
      const degraded = fyersFailed || fyersBars.length === 0 || !tvEnabled || tvFailed || tvBars.length === 0;
      sourceStatus.fyers = { ...(isRecord(sourceStatus.fyers) ? sourceStatus.fyers : {}), validatedCount: fyersBars.length, sessions: [...recentDates].sort() };
      sourceStatus.tvdatafeed = {
        ...(isRecord(sourceStatus.tvdatafeed) ? sourceStatus.tvdatafeed : {}),
        validatedCount: tvBars.length,
        cachedOlderFallbackCount: cachedOlderBars.length,
        candidateCap: HISTORICAL_MAX_BARS,
        arbitraryEndPaging: false,
      };
      let record: CacheRecord = {
        instrumentId: mapping.instrumentId || requestedInstrumentId, timeframe, bars: merged,
        revision: cached?.revision || 1, sourcePolicy: HISTORICAL_SOURCE_POLICY, sourceStatus, degraded,
        expiresAt: Date.now() + CACHE_TTL_MS, updatedAt: Date.now(), quote,
      };
      if (!merged.length && cached?.bars.length && cached.sourcePolicy === HISTORICAL_SOURCE_POLICY) {
        return {
          ...cached,
          expiresAt: Date.now(),
          sourceStatus: { ...sourceStatus, staleCacheFallback: true },
          degraded: true,
          quote: quote || null,
        };
      }
      record = await this.writeCache(record);
      return record;
    })().finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  }

  async load(request: HistoricalLoadRequest): Promise<HistoricalLoadResult> {
    const instrumentId = asText(request.instrumentId), timeframe = asText(request.timeframe);
    const maxBars = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(request.maxBars) || HISTORICAL_MAX_BARS)));
    if (!instrumentId || !timeframe) throw new Error('instrumentId and timeframe are required');
    const mapping = await this.resolveMapping(instrumentId);
    const cacheInstrumentId = mapping.instrumentId || instrumentId;
    const cached = await this.readCache(cacheInstrumentId, timeframe);

    if (request.beforeTimestamp != null) {
      const older = (cached?.bars || []).filter(bar => bar.timestampMs < Number(request.beforeTimestamp)).slice(-maxBars);
      const record: CacheRecord = cached || {
        instrumentId: cacheInstrumentId, timeframe, bars: [], revision: 0, sourcePolicy: HISTORICAL_SOURCE_POLICY,
        sourceStatus: { cache: { status: 'miss' } }, degraded: false, expiresAt: 0, updatedAt: 0,
      };
      return {
        bars: toPublicBars(older, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays),
        metadata: this.metadata(record, older, {
          cacheHit: Boolean(cached), stale: Boolean(cached && cached.expiresAt <= Date.now()),
          historyExhausted: older.length === 0, paginationSupported: false,
          sourceStatus: { ...record.sourceStatus, pagination: { status: 'bounded-cache-only', reason: 'tvdatafeed has no arbitrary historical end timestamp' } },
        }),
        quote: null,
      };
    }

    if (cached && cached.expiresAt > Date.now() && cached.sourcePolicy === HISTORICAL_SOURCE_POLICY && cached.bars.length) {
      const bars = cached.bars.slice(-maxBars);
      return { bars: toPublicBars(bars, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays), metadata: this.metadata(cached, bars, { cacheHit: true }), quote: null };
    }

    const key = cacheKey(cacheInstrumentId, timeframe);
    let refreshed: CacheRecord;
    try {
      refreshed = await (inflight.get(key) || this.refresh(instrumentId, timeframe, mapping, cached, request.fetchFyersRecent));
    } catch (error) {
      if (!cached?.bars.length) throw error;
      refreshed = { ...cached, expiresAt: Date.now(), degraded: true, quote: null, sourceStatus: { ...cached.sourceStatus, refreshError: errorText(error) } };
    }
    const bars = refreshed.bars.slice(-maxBars), stale = refreshed.expiresAt <= Date.now();
    return {
      bars: toPublicBars(bars, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays),
      metadata: this.metadata(refreshed, bars, { stale, degraded: refreshed.degraded || stale }),
      quote: refreshed.quote || null,
    };
  }
}
export const historicalDataService = new HistoricalDataService();
