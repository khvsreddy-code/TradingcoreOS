import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { HistoricalCandle, HistoricalDataMetadata, HistoricalQuoteSnapshot } from '../../services/brokers/BrokerAdapter.js';
import { marketDataAutoFixer } from './MarketDataAutoFixer.js';

export const HISTORICAL_MAX_BARS = 5_000;
export const HISTORICAL_RECENT_SESSIONS = 3;
export const HISTORICAL_SOURCE_POLICY = 'nse-first+investiny-history-fallback+fyers-quota-aware-fno-fallback-5000/v4';
const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 15_000;
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
export interface BoundedHistoryPageRange extends RecentHistoryRange {
  requestedBars: number;
  lookbackFloorMs: number | null;
}
export interface FyersRecentResult { bars: unknown[]; quote?: HistoricalQuoteSnapshot | null; status?: Record<string, unknown>; }
export type FyersRecentFetcher = (mapping: HistoricalInstrumentMapping, range: RecentHistoryRange) => Promise<FyersRecentResult>;
export type PreferredHistorySourceFetcher = (mapping: HistoricalInstrumentMapping, timeframe: string, range: BoundedHistoryPageRange) => Promise<unknown[]>;
interface StoredBar extends HistoricalCandle { source: 'nse' | 'investiny' | 'fyers' | 'tvdatafeed'; timestampMs: number; }
interface CacheRecord {
  instrumentId: string; timeframe: string; bars: StoredBar[]; revision: number;
  sourcePolicy: string; sourceStatus: Record<string, unknown>; degraded: boolean;
  expiresAt: number; updatedAt: number; quote?: HistoricalQuoteSnapshot | null;
}
export interface HistoricalLoadResult { bars: HistoricalCandle[]; metadata: HistoricalDataMetadata; quote: HistoricalQuoteSnapshot | null; }
export interface HistoricalLoadRequest {
  instrumentId: string;
  timeframe: string;
  maxBars?: number;
  beforeTimestamp?: number;
  /** FYERS plan history cap for this timeframe; null means no artificial cutoff. */
  historyMaxLookbackYears?: number | null;
  fetchFyersRecent?: FyersRecentFetcher;
  /** Private, authorized NSE historical-data gateway. */
  fetchNseHistory?: PreferredHistorySourceFetcher;
  /** Historical-only Investiny adapter; exact asset mapping is required. */
  fetchInvestinyHistory?: PreferredHistorySourceFetcher;
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

/**
 * Plan-aware page range for one FYERS history request. The route limit is a
 * per-request cap, not proof that the requested dataset is complete. Short
 * timeframe pages estimate a tight date window; daily/weekly/monthly requests
 * respect FYERS' bounded range windows and report incomplete pages to callers.
 */
export function getBoundedHistoryPageRange(
  mapping: Pick<HistoricalInstrumentMapping, 'timezone'>,
  timeframe: string,
  requestedBars: number,
  historyMaxLookbackYears: number | null,
  requestedToMs = Date.now(),
): BoundedHistoryPageRange {
  const targetBars = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(requestedBars) || HISTORICAL_MAX_BARS)));
  const rawTimeframe = String(timeframe || '').trim();
  const normalizedTimeframe = rawTimeframe.toLowerCase();
  const seconds = /^(\d+)s$/.exec(normalizedTimeframe);
  const minutes = /^(\d+)minute$/.exec(normalizedTimeframe);
  const daily = ['day','1day','daily','d','1d'].includes(normalizedTimeframe);
  const weekly = ['week','1week','weekly','w','1w'].includes(normalizedTimeframe);
  const monthly = rawTimeframe === '1M' || rawTimeframe === 'M' || ['month','1month','monthly','m','1mth'].includes(normalizedTimeframe);
  const secondsSize = seconds ? Math.max(1, Number(seconds[1])) : 1;
  const minuteSize = minutes ? Math.max(1, Number(minutes[1])) : 1;
  const barsPerSession = seconds ? (6.25 * 60 * 60) / secondsSize
    : minutes ? (6.25 * 60) / minuteSize
    : weekly ? 0.2
    : monthly ? 1 / 21
    : daily ? 1
    : 6.25 * 60;
  const providerWindowDays = seconds ? 1 : (daily || weekly || monthly) ? 360 : 95;
  const desiredCalendarDays = Math.ceil(targetBars / Math.max(0.01, barsPerSession) * 1.5) + 1;
  const lookbackCalendarDays = Math.max(1, Math.min(providerWindowDays, desiredCalendarDays));
  const nowMs = Date.now();
  const toMs = Math.min(Math.max(1, Number(requestedToMs) || nowMs), nowMs);
  const lookbackFloorMs = historyMaxLookbackYears == null
    ? null
    : nowMs - Math.max(1, Number(historyMaxLookbackYears) || 1) * 365.25 * 86_400_000;
  const candidateFrom = toMs - lookbackCalendarDays * 86_400_000;
  const fromMs = Math.max(candidateFrom, lookbackFloorMs ?? 0);
  const effectiveFrom = Math.min(fromMs, toMs);
  return {
    fromMs: effectiveFrom,
    toMs,
    fromDate: zonedDate(effectiveFrom, mapping.timezone),
    calendarPolicy: 'bounded-bars-page:' + targetBars + '-bars;window:' + lookbackCalendarDays + '-calendar-days',
    requestedBars: targetBars,
    lookbackFloorMs,
  };
}

export function getPreferredHistoryPageRange(mapping: Pick<HistoricalInstrumentMapping, 'timezone'>, timeframe: string, requestedBars: number, requestedToMs = Date.now()): BoundedHistoryPageRange {
  const target = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(requestedBars) || HISTORICAL_MAX_BARS)));
  const raw = String(timeframe || '').trim(), normalized = raw.toLowerCase();
  const monthly = raw === '1M' || raw === 'M' || ['month','1month','monthly','m','1mth'].includes(normalized);
  const weekly = raw.toUpperCase() === '1W' || ['week','1week','weekly','w','1w'].includes(normalized);
  const daily = raw.toUpperCase() === 'D' || raw.toUpperCase() === '1D' || ['day','1day','daily','d','1d'].includes(normalized);
  const seconds = /^(\d+)\s*s$/i.exec(raw);
  const hours = /^(\d+)\s*(?:h|hr|hour|hours)$/i.exec(raw);
  const minutes = /^(\d+)\s*(?:m|min|minute|minutes)?$/i.exec(raw);
  const barsPerSession = seconds ? 22_500 / Math.max(1, Number(seconds[1])) : monthly ? 1/21 : weekly ? 0.2 : daily ? 1 : 375 / Math.max(1, hours ? Number(hours[1])*60 : Number(minutes?.[1] || 1));
  const days = Math.ceil(target / Math.max(0.01, barsPerSession) * 1.5) + 1;
  const now = Date.now(), toMs = Math.min(Math.max(1, Number(requestedToMs) || now), now);
  const fromMs = Math.max(toMs - days * 86_400_000, Date.UTC(1990, 0, 1));
  return { fromMs, toMs, fromDate: zonedDate(fromMs, mapping.timezone), calendarPolicy: 'preferred-source:' + target + '-bars;window:' + Math.ceil((toMs-fromMs)/86_400_000) + '-days;floor:1990-01-01', requestedBars: target, lookbackFloorMs: Date.UTC(1990,0,1) };
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
    if (!old || historicalSourcePriority(source) >= historicalSourcePriority(old.source)) byTime.set(timestampMs, bar);
  }
  return [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}
/** Pure normalization hook used by server contracts and source adapters. */
export function normalizeHistoricalCandles(rows: unknown[], source: StoredBar['source']): StoredBar[] {
  return normalizeRows(rows, source);
}
export function historicalSourcePriority(source: 'nse' | 'investiny' | 'fyers' | 'tvdatafeed'): number {
  switch (source) { case 'nse': return 4; case 'investiny': return 3; case 'fyers': return 2; case 'tvdatafeed': return 1; default: return 0; }
}
function mergeStoredBars(existing: readonly StoredBar[], incoming: readonly StoredBar[]): StoredBar[] {
  const byTime = new Map<number, StoredBar>();
  for (const bar of [...existing, ...incoming]) {
    const old = byTime.get(bar.timestampMs);
    if (!old || historicalSourcePriority(bar.source) >= historicalSourcePriority(old.source)) byTime.set(bar.timestampMs, bar);
  }
  return [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}
function isFnoInstrument(mapping: HistoricalInstrumentMapping): boolean {
  const kind = String(mapping.instrumentType || '').toLowerCase();
  if (/(option|future|derivative|fno|f\s*&\s*o)/.test(kind)) return true;
  const symbol = String(mapping.fyersSymbol || mapping.instrumentId || '');
  return /(?:\d{4,}(?:CE|PE)|FUT(?:URES?)?)$/i.test(symbol)
    || /(?:^|:)NSE_FO:/i.test(symbol) || /(?:^|:)BSE_FO:/i.test(symbol);
}
type ProviderBarsAttempt = { bars: StoredBar[]; status: Record<string, unknown> };
async function fetchProviderBars(
  source: 'nse' | 'investiny', fetcher: PreferredHistorySourceFetcher | undefined,
  mapping: HistoricalInstrumentMapping, timeframe: string, range: BoundedHistoryPageRange,
): Promise<ProviderBarsAttempt> {
  const resource = mapping.instrumentId + ':' + timeframe;
  if (!fetcher) return { bars: [], status: { status: 'not-configured' } };
  if (!(await marketDataAutoFixer.canAttempt(source, 'history', resource))) {
    return { bars: [], status: { status: 'circuit-open', health: marketDataAutoFixer.snapshot(source, 'history', resource)[0] || null } };
  }
  try {
    const raw = await fetcher(mapping, timeframe, range);
    if (!Array.isArray(raw)) throw Object.assign(new Error(source + ' returned an invalid history envelope'), { code: 'INVALID_HISTORY_ENVELOPE' });
    const bars = normalizeRows(raw, source).filter(bar => bar.timestampMs >= range.fromMs && bar.timestampMs <= range.toMs);
    if (!bars.length && raw.length === 0) return { bars: [], status: { status: 'empty', rawCount: 0, validatedCount: 0 } };
    if (!bars.length) throw Object.assign(new Error(source + ' returned no validated candles for the requested range'), { code: 'EMPTY_VALIDATED_HISTORY' });
    const health = await marketDataAutoFixer.recordSuccess(source, 'history', resource);
    return { bars, status: { status: 'ok', rawCount: raw.length, validatedCount: bars.length, health } };
  } catch (error) {
    const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    if (value.code === 'INVESTINY_SYMBOL_UNMAPPED') return { bars: [], status: { status: 'unmapped', error: errorText(error) } };
    const health = await marketDataAutoFixer.recordFailure(source, 'history', resource, error);
    return { bars: [], status: { status: 'error', error: errorText(error), health } };
  }
}

const MAX_PREFERRED_SOURCE_PAGES_PER_REFRESH = 24;
async function fetchPreferredHistoryPages(source: 'nse' | 'investiny', fetcher: PreferredHistorySourceFetcher | undefined, mapping: HistoricalInstrumentMapping, timeframe: string, requestedBars: number, endMs = Date.now()): Promise<ProviderBarsAttempt> {
  const target = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(requestedBars) || HISTORICAL_MAX_BARS)));
  if (!fetcher) return { bars: [], status: { status: 'not-configured', pagesFetched: 0 } };
  const byTime = new Map<number, StoredBar>();
  const pageBudget = Math.min(MAX_PREFERRED_SOURCE_PAGES_PER_REFRESH, Math.max(1, Math.ceil(target / 200) + 1));
  let nextToMs = Math.min(Number(endMs) || Date.now(), Date.now()), pagesFetched = 0, rawCount = 0, failed = false, exhausted = false, lastError: string | undefined;
  while (byTime.size < target && pagesFetched < pageBudget) {
    const pageRange = getPreferredHistoryPageRange(mapping, timeframe, target - byTime.size, nextToMs);
    if (pageRange.toMs <= pageRange.fromMs) { exhausted = true; break; }
    const attempt = await fetchProviderBars(source, fetcher, mapping, timeframe, pageRange);
    pagesFetched += 1;
    rawCount += Number(attempt.status.rawCount || 0);
    if (!attempt.bars.length) {
      failed = ['error','circuit-open'].includes(String(attempt.status.status));
      lastError = typeof attempt.status.error === 'string' ? attempt.status.error : undefined;
      exhausted = !failed;
      break;
    }
    let oldest = Number.POSITIVE_INFINITY;
    for (const bar of attempt.bars) { byTime.set(bar.timestampMs, bar); oldest = Math.min(oldest, bar.timestampMs); }
    if (!Number.isFinite(oldest) || oldest >= nextToMs) { exhausted = true; break; }
    nextToMs = oldest - 1;
    if (oldest <= Date.UTC(1990,0,1)) { exhausted = true; break; }
  }
  const bars = [...byTime.values()].sort((a,b)=>a.timestampMs-b.timestampMs).slice(-target);
  return { bars, status: { status: failed ? (bars.length ? 'partial-error' : 'error') : bars.length >= target ? 'ok' : bars.length ? 'partial' : 'empty', rawCount, validatedCount: bars.length, pagesFetched, pageBudget, requestedBars: target, historyExhausted: exhausted, ...(lastError ? { error: lastError } : {}) } };
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

/**
 * Keep fallback candles usable without pinning routing to the fallback for a
 * full cache TTL. If NSE failed, expire the fallback cache at (or before) its
 * next bounded recovery probe; otherwise a healthy NSE cache uses the normal TTL.
 * This is request-driven recovery: no detached timer or unbounded background poll.
 */
export function historicalFallbackCacheTtlMs(
  activeSource: string,
  nseStatus: Record<string, unknown>,
  now = Date.now(),
): number {
  const status = String(nseStatus.status || '');
  if (!['error', 'partial-error', 'circuit-open'].includes(status)) return CACHE_TTL_MS;
  const rawHealth = nseStatus.health;
  const health = rawHealth && typeof rawHealth === 'object' ? rawHealth as Record<string, unknown> : null;
  const nextProbeAt = Number(health?.nextProbeAt);
  if (!Number.isFinite(nextProbeAt)) return NEGATIVE_CACHE_TTL_MS;
  const remaining = nextProbeAt - now;
  if (remaining <= 0) return NEGATIVE_CACHE_TTL_MS;
  return Math.min(CACHE_TTL_MS, Math.max(1_000, remaining));
}
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

  private withSafeTvFallback(mapping: HistoricalInstrumentMapping): HistoricalInstrumentMapping {
    if (mapping.tvSymbol && mapping.tvExchange) return mapping;
    const builtInIndexMappings: Record<string, { tvSymbol: string; tvExchange: string; exchange: string }> = {
      'NSE:NIFTY50-INDEX': { tvSymbol: 'NIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:NIFTYBANK-INDEX': { tvSymbol: 'BANKNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:FINNIFTY-INDEX': { tvSymbol: 'FINNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'NSE:MIDCPNIFTY-INDEX': { tvSymbol: 'MIDCPNIFTY', tvExchange: 'NSE', exchange: 'NSE' },
      'BSE:SENSEX-INDEX': { tvSymbol: 'SENSEX', tvExchange: 'BSE', exchange: 'BSE' },
    };
    const index = builtInIndexMappings[mapping.fyersSymbol];
    if (index) {
      return {
        ...mapping,
        tvSymbol: mapping.tvSymbol || index.tvSymbol,
        tvExchange: mapping.tvExchange || index.tvExchange,
        instrumentType: mapping.instrumentType === 'unknown' ? 'index' : mapping.instrumentType,
      };
    }
    const equity = /^(NSE|BSE):([A-Z0-9&._-]+)-EQ$/i.exec(mapping.fyersSymbol);
    if (equity) {
      return {
        ...mapping,
        tvSymbol: mapping.tvSymbol || equity[2]!,
        tvExchange: mapping.tvExchange || equity[1]!.toUpperCase(),
        instrumentType: mapping.instrumentType === 'unknown' ? 'equity' : mapping.instrumentType,
      };
    }
    return mapping;
  }

  private async resolveMapping(instrumentId: string): Promise<HistoricalInstrumentMapping> {
    if (this.supabase && !this.mappingTableUnavailable) {
      try {
        const bySymbol = await this.supabase.from(MAPPING_TABLE).select('*').eq('enabled', true).eq('fyers_symbol', instrumentId).maybeSingle();
        if (bySymbol.error) throw bySymbol.error;
        if (bySymbol.data) {
          const mapping = this.mappingFromRow(bySymbol.data as Record<string, unknown>);
          if (mapping.fyersSymbol === instrumentId) return this.withSafeTvFallback(mapping);
        }
        const byId = await this.supabase.from(MAPPING_TABLE).select('*').eq('enabled', true).eq('instrument_id', instrumentId).maybeSingle();
        if (byId.error) throw byId.error;
        if (byId.data) {
          const mapping = this.mappingFromRow(byId.data as Record<string, unknown>);
          if (mapping.instrumentId === instrumentId && mapping.fyersSymbol) return this.withSafeTvFallback(mapping);
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
      if (mapping.enabled && mapping.fyersSymbol === instrumentId) return this.withSafeTvFallback(mapping);
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
            const source = row.source === 'nse' || row.source === 'investiny' || row.source === 'fyers' || row.source === 'tvdatafeed' ? row.source : 'tvdatafeed';
            return normalizeRows([row], source)[0] || null;
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
    const sourceStatus = record.sourceStatus;
    return {
      instrumentId: record.instrumentId, timeframe: record.timeframe, revision: record.revision,
      sourcePolicy: record.sourcePolicy, maxBars: HISTORICAL_MAX_BARS, barCount: selected.length,
      oldestTimestamp: selected[0]?.timestamp || null, newestTimestamp: selected[selected.length - 1]?.timestamp || null,
      cacheHit: false, stale: false, degraded: record.degraded, historyExhausted: false,
      paginationSupported: Boolean(sourceStatus.historyCompleteness && (sourceStatus.historyCompleteness as Record<string, unknown>).paginationSupported),
      historyCompleteness: {
        ...(isRecord(sourceStatus.historyCompleteness) ? sourceStatus.historyCompleteness : { status: 'unknown' }),
        // This is the number returned by this response, not the size of the cached dataset.
        returnedBars: selected.length,
        providerPageLimit: 2_000,
        datasetComplete: false,
        hasMoreHistory: Boolean(sourceStatus.historyCompleteness && (sourceStatus.historyCompleteness as Record<string, unknown>).paginationSupported),
      },
      sourceStatus, ...overrides,
    };
  }

  private async refresh(
    requestedInstrumentId: string,
    timeframe: string,
    mapping: HistoricalInstrumentMapping,
    cached: CacheRecord | null,
    fetchFyersRecent: FyersRecentFetcher | undefined,
    requestedBars: number,
    historyMaxLookbackYears: number | null,
    fetchNseHistory?: PreferredHistorySourceFetcher,
    fetchInvestinyHistory?: PreferredHistorySourceFetcher,
  ): Promise<CacheRecord> {
    const key = cacheKey(mapping.instrumentId, timeframe);
    const existing = inflight.get(key);
    if (existing) return existing;
    const task = (async (): Promise<CacheRecord> => {
      const range = getBoundedHistoryPageRange(mapping, timeframe, requestedBars, historyMaxLookbackYears);
      const sourceRoutingStatus: Record<string, Record<string, unknown>> = {
        nse: { status: fetchNseHistory ? 'pending' : 'not-configured' },
        investiny: { status: fetchInvestinyHistory ? 'pending' : 'not-configured' },
      };
      const preferredTarget = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(requestedBars) || HISTORICAL_MAX_BARS)));
      const nseAttempt = await fetchPreferredHistoryPages('nse', fetchNseHistory, mapping, timeframe, preferredTarget);
      sourceRoutingStatus.nse = nseAttempt.status;
      const writePreferred = async (activeSource: 'nse' | 'investiny', freshBars: StoredBar[], investinyStatus?: Record<string, unknown>) => {
        if (investinyStatus) sourceRoutingStatus.investiny = investinyStatus;
        const merged = mergeStoredBars(cached?.bars || [], freshBars).slice(-HISTORICAL_MAX_BARS);
        const now = Date.now();
        const sourceStatus: Record<string, unknown> = {
          nse: sourceRoutingStatus.nse,
          investiny: sourceRoutingStatus.investiny,
          fyers: { status: 'not-needed', reason: activeSource + ' returned validated history' },
          tvdatafeed: { status: 'not-needed', reason: activeSource + ' returned validated history' },
          cache: { status: cached?.bars.length ? 'merged-with-validated-cache' : 'miss' },
          route: { activeSource, contributingSources: [...new Set(merged.map(bar => bar.source))], capability: 'historical-ohlcv', automaticFailback: true },
          autoFixer: {
            nse: marketDataAutoFixer.snapshot('nse', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
            investiny: marketDataAutoFixer.snapshot('investiny', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
            fyers: marketDataAutoFixer.snapshot('fyers', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
          },
          historyCompleteness: {
            status: merged.length >= preferredTarget ? 'page-target-reached' : 'partial-page',
            requestedBars: preferredTarget, returnedBars: Math.min(merged.length, preferredTarget),
            datasetComplete: false,
            paginationSupported: Boolean(fetchNseHistory || fetchInvestinyHistory || fetchFyersRecent),
            hasMoreHistory: Boolean(fetchNseHistory || fetchInvestinyHistory || fetchFyersRecent),
          },
          calendarPolicy: range.calendarPolicy,
        };
        return this.writeCache({
          instrumentId: mapping.instrumentId || requestedInstrumentId, timeframe, bars: merged,
          revision: cached?.revision || 1, sourcePolicy: HISTORICAL_SOURCE_POLICY, sourceStatus,
          degraded: activeSource !== 'nse' || merged.length < preferredTarget || ['error','partial-error','circuit-open'].includes(String(sourceRoutingStatus.nse.status)),
          expiresAt: now + historicalFallbackCacheTtlMs(activeSource, sourceRoutingStatus.nse, now), updatedAt: now, quote: null,
        });
      };
      const nseBars = nseAttempt.bars;
      const nseMerged = mergeStoredBars(cached?.bars || [], nseBars);
      const isFno = isFnoInstrument(mapping);
      const investinyFallbackStatus: Record<string, unknown> = { status: fetchInvestinyHistory ? 'not-needed' : 'not-configured' };
      if (nseBars.length && (!isFno || nseMerged.length >= preferredTarget)) {
        let selectedBars = nseBars;
        let investinyStatus: Record<string, unknown> = investinyFallbackStatus;
        if (!isFno && fetchInvestinyHistory && nseMerged.length < preferredTarget) {
          const remaining = Math.max(1, preferredTarget - nseMerged.length);
          const investinyAttempt = await fetchPreferredHistoryPages('investiny', fetchInvestinyHistory, mapping, timeframe, remaining, nseBars[0]!.timestampMs - 1);
          investinyStatus = { ...investinyAttempt.status, role: 'older-history-gap-fill' };
          selectedBars = mergeStoredBars(investinyAttempt.bars, selectedBars);
        }
        return writePreferred('nse', selectedBars, investinyStatus);
      }
      sourceRoutingStatus.investiny = isFno ? { status: 'skipped-fno-uses-fyers' } : { status: fetchInvestinyHistory ? 'pending' : 'not-configured' };
      if (!isFno) {
        const investinyAttempt = await fetchPreferredHistoryPages('investiny', fetchInvestinyHistory, mapping, timeframe, preferredTarget);
        sourceRoutingStatus.investiny = investinyAttempt.status;
        if (investinyAttempt.bars.length) return writePreferred('investiny', investinyAttempt.bars);
      }
      const tvConfigured = Boolean(envValue('TVDATAFEED_SERVICE_URL') && envValue('TVDATAFEED_SERVICE_TOKEN'));
      const tvCompatible = Boolean(mapping.tvSymbol && mapping.tvExchange && this.tvContractCompatible(mapping));
      const tvEnabled = tvConfigured && tvCompatible;
      const targetBars = Math.max(1, Math.min(HISTORICAL_MAX_BARS, Math.floor(Number(requestedBars) || HISTORICAL_MAX_BARS)));
      const MAX_FYERS_PAGES_PER_REFRESH = 8;
      const fyersByTime = new Map<number, StoredBar>();
      const fyersPageStats: Array<Record<string, unknown>> = [];
      let quote: HistoricalQuoteSnapshot | null = null;
      let fyersFailed = false;
      let fyersError: string | undefined;
      let pagesFetched = 0;
      let emptyPages = 0;
      let exhaustedByPlan = false;
      let stoppedByEmpty = false;
      let nextToMs = range.toMs;

      // A page is bounded by FYERS' per-resolution date-range ceiling. Walk back
      // only until the chart's requested bar count is met, the plan lookback is
      // exhausted, a source gap is detected, or a conservative per-refresh call
      // budget is reached. Every individual attempt still enters the same Redis gate.
      while (fetchFyersRecent && fyersByTime.size < targetBars && pagesFetched < MAX_FYERS_PAGES_PER_REFRESH) {
        if (range.lookbackFloorMs != null && nextToMs <= range.lookbackFloorMs) {
          exhaustedByPlan = true;
          break;
        }
        const pageRange = pagesFetched === 0
          ? range
          : getBoundedHistoryPageRange(
              mapping,
              timeframe,
              Math.max(1, targetBars - fyersByTime.size),
              historyMaxLookbackYears,
              nextToMs,
            );
        if (pageRange.toMs <= pageRange.fromMs) {
          exhaustedByPlan = range.lookbackFloorMs != null && nextToMs <= range.lookbackFloorMs;
          break;
        }

        pagesFetched += 1;
        try {
          const result = await fetchFyersRecent(mapping, pageRange);
          const rawBars = Array.isArray(result.bars) ? result.bars : [];
          if (!quote && result.quote) quote = result.quote;
          const pageBars = normalizeRows(rawBars, 'fyers').filter(bar =>
            bar.timestampMs >= pageRange.fromMs && bar.timestampMs <= pageRange.toMs,
          );
          for (const bar of pageBars) {
            const previous = fyersByTime.get(bar.timestampMs);
            if (!previous || bar.source === 'fyers') fyersByTime.set(bar.timestampMs, bar);
          }
          fyersPageStats.push({
            page: pagesFetched,
            fromMs: pageRange.fromMs,
            toMs: pageRange.toMs,
            rawCount: rawBars.length,
            validatedCount: pageBars.length,
            ...(isRecord(result.status) ? { providerStatus: result.status } : {}),
          });
          emptyPages = pageBars.length ? 0 : emptyPages + 1;
          if (pageBars.length) {
            const oldestPageBar = pageBars.reduce((oldest, bar) => Math.min(oldest, bar.timestampMs), Number.POSITIVE_INFINITY);
            nextToMs = oldestPageBar - 1;
          } else {
            // No validated bar in this range; advance to the preceding bounded
            // range, then fall back to the alternate feed only if the gap persists.
            nextToMs = pageRange.fromMs - 1;
          }
          if (range.lookbackFloorMs != null && nextToMs <= range.lookbackFloorMs) {
            exhaustedByPlan = true;
            break;
          }
          if (emptyPages >= 2) {
            stoppedByEmpty = true;
            break;
          }
        } catch (error) {
          fyersFailed = true;
          fyersError = errorText(error);
          fyersPageStats.push({
            page: pagesFetched,
            fromMs: pageRange.fromMs,
            toMs: pageRange.toMs,
            status: 'error',
            error: fyersError,
          });
          break;
        }
      }

      const fyersRows: unknown[] = [...fyersByTime.values()]
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .slice(-targetBars);
      const fyersFallbackRequired = !fetchFyersRecent || fyersFailed || fyersRows.length === 0 || exhaustedByPlan || stoppedByEmpty;
      let tvRows: unknown[] = [];
      let tvFailed = false;
      let tvStatus: Record<string, unknown> = {
        status: !tvConfigured ? 'not-configured' : !mapping.tvSymbol || !mapping.tvExchange ? 'unmapped'
          : !tvEnabled ? 'contract-mismatch'
            : fyersFallbackRequired ? 'pending' : fyersRows.length >= targetBars ? 'not-needed-fyers-target-reached' : 'not-needed-fyers-pagination-available',
      };

      // The alternate feed is queried only when FYERS is unavailable, reaches the
      // user's plan lookback, or repeatedly has no validated bars. If a Prime user
      // still has more FYERS history but this request's page budget is exhausted,
      // return explicit partial metadata instead of switching sources unnecessarily.
      if (tvEnabled && fyersFallbackRequired) {
        try {
          tvRows = await this.fetchTvdatafeed(mapping, timeframe);
          tvStatus = { status: tvRows.length ? 'ok' : 'empty', rawCount: tvRows.length };
        } catch (error) {
          tvFailed = true;
          tvStatus = { status: 'error', error: errorText(error) };
        }
      }

      const pageRangeFromMs = fyersPageStats.length
        ? Number(fyersPageStats[fyersPageStats.length - 1]!.fromMs)
        : range.fromMs;
      const pageRangeToMs = fyersPageStats.length
        ? Number(fyersPageStats[0]!.toMs)
        : range.toMs;
      const sourceStatus: Record<string, unknown> = {
        nse: sourceRoutingStatus.nse,
        investiny: sourceRoutingStatus.investiny,
        autoFixer: {
          nse: marketDataAutoFixer.snapshot('nse', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
          investiny: marketDataAutoFixer.snapshot('investiny', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
          fyers: marketDataAutoFixer.snapshot('fyers', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
        },
        fyers: {
          status: fyersRows.length ? fyersFailed ? 'partial-error' : 'ok' : fyersFailed ? 'error' : fetchFyersRecent ? 'empty' : 'unavailable',
          rawCount: fyersPageStats.reduce((sum, page) => sum + Number(page.rawCount || 0), 0),
          validatedCount: fyersRows.length,
          pagesFetched,
          pageBudget: MAX_FYERS_PAGES_PER_REFRESH,
          pages: fyersPageStats,
          ...(fyersError ? { error: fyersError } : {}),
          ...(exhaustedByPlan ? { lookbackExhausted: true } : {}),
        },
        tvdatafeed: tvStatus,
        calendarPolicy: range.calendarPolicy,
        cache: { status: this.supabase && !this.cacheTableUnavailable ? 'durable' : 'memory-fallback' },
      };
      let fyersAll = fyersRows as StoredBar[];
      const dates = sessionDates(fyersAll, mapping.timezone);
      const recentDates = new Set(dates);
      const fyersBars = fyersAll;
      let tvBars = normalizeRows(tvRows, 'tvdatafeed');
      const firstRecentDate = dates[0] || null;
      if (firstRecentDate) {
        // FYERS wins for all sessions its bounded page covers. TV fills only
        // validated older history outside that page and never overwrites it.
        tvBars = tvBars.filter(bar => zonedDate(bar.timestampMs, mapping.timezone) < firstRecentDate);
      }

      // If tvdatafeed is unavailable or returns no validated bars, preserve the
      // older portion of a previously validated dataset for this same, explicitly
      // compatible instrument mapping. Never reuse cached bars from recent Fyers
      // sessions, and never present the fallback as a fresh source response.
      const cachedOlderBars = cached?.bars.length > 0 && tvBars.length === 0 && this.tvContractCompatible(mapping)
        ? cached.bars.filter(bar => !firstRecentDate || zonedDate(bar.timestampMs, mapping.timezone) < firstRecentDate)
        : [];

      const byTime = new Map<number, StoredBar>();
      for (const bar of [...cachedOlderBars, ...tvBars, ...fyersBars, ...nseBars]) {
        const old = byTime.get(bar.timestampMs);
        if (!old || historicalSourcePriority(bar.source) >= historicalSourcePriority(old.source)) {
          byTime.set(bar.timestampMs, bar);
        }
      }
      const merged = [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs).slice(-HISTORICAL_MAX_BARS);
      const pageTarget = Math.min(HISTORICAL_MAX_BARS, requestedBars);
      const targetReached = merged.length >= pageTarget;
      const tvNeededButUnavailable = !targetReached && (!tvEnabled || tvFailed || tvBars.length === 0);
      const degraded = fyersFailed || fyersBars.length === 0 || tvNeededButUnavailable || ['error','partial-error','circuit-open'].includes(String(sourceRoutingStatus.nse.status));
      sourceStatus.fyers = {
        ...(isRecord(sourceStatus.fyers) ? sourceStatus.fyers : {}),
        validatedCount: fyersBars.length,
        sessions: [...recentDates].sort(),
        pageRangeFrom: new Date(range.fromMs).toISOString(),
        pageRangeTo: new Date(range.toMs).toISOString(),
      };
      const paginationAvailable = Boolean(fetchNseHistory || fetchInvestinyHistory || fetchFyersRecent);
      sourceStatus.historyCompleteness = {
        status: targetReached ? 'page-target-reached' : 'partial-page',
        requestedBars: pageTarget,
        returnedBars: Math.min(merged.length, pageTarget),
        fyersReturnedBars: fyersBars.length,
        providerPageLimit: 2_000,
        paginationSupported: paginationAvailable,
        datasetComplete: false,
        hasMoreHistory: paginationAvailable,
        pageRangeFrom: new Date(range.fromMs).toISOString(),
        pageRangeTo: new Date(range.toMs).toISOString(),
        lookbackFloor: range.lookbackFloorMs == null ? null : new Date(range.lookbackFloorMs).toISOString(),
      };
      sourceStatus.tvdatafeed = {
        ...(isRecord(sourceStatus.tvdatafeed) ? sourceStatus.tvdatafeed : {}),
        validatedCount: tvBars.length,
        cachedOlderFallbackCount: cachedOlderBars.length,
        candidateCap: HISTORICAL_MAX_BARS,
        arbitraryEndPaging: Boolean(fetchFyersRecent),
        requestRange: { from: new Date(range.fromMs).toISOString(), to: new Date(range.toMs).toISOString() },
      };
      sourceStatus.noValidatedBars = merged.length === 0;
      const activeSource = nseBars.length ? 'nse'
        : fyersBars.length ? 'fyers'
          : tvBars.length ? 'tvdatafeed'
            : cachedOlderBars.length ? 'cache' : 'none';
      sourceStatus.route = {
        activeSource,
        contributingSources: [...new Set(merged.map(bar => bar.source))],
        capability: 'historical-ohlcv',
        automaticFailback: true,
      };
      let record: CacheRecord = {
        instrumentId: mapping.instrumentId || requestedInstrumentId, timeframe, bars: merged,
        revision: cached?.revision || 1, sourcePolicy: HISTORICAL_SOURCE_POLICY, sourceStatus, degraded,
        expiresAt: Date.now() + historicalFallbackCacheTtlMs(activeSource, sourceRoutingStatus.nse), updatedAt: Date.now(), quote,
      };
      if (!merged.length && cached?.bars.length) {
        const staleRecord: CacheRecord = {
          ...cached,
          sourcePolicy: HISTORICAL_SOURCE_POLICY,
          // Let the breaker probe promptly after its normal cooldown rather than
          // serving stale data for the full successful-cache TTL.
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
          updatedAt: Date.now(),
          sourceStatus: {
            ...sourceStatus,
            staleCacheFallback: true,
            previousSourcePolicy: cached.sourcePolicy,
          },
          degraded: true,
          quote: quote || null,
        };
        // Preserve previously validated candles during a total source outage,
        // including cache records written by the previous source policy.
        return this.writeCache(staleRecord);
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
      const beforeTimestamp = Number(request.beforeTimestamp);
      let older = (cached?.bars || []).filter(bar => bar.timestampMs < beforeTimestamp).sort((a, b) => a.timestampMs - b.timestampMs);
      let pageBars: StoredBar[] = [];
      let responseCacheRecord: CacheRecord | null = cached;
      const previousPagination = isRecord(cached?.sourceStatus.pagination) ? cached.sourceStatus.pagination : {};
      const sameCachedPage = Boolean(cached && cached.expiresAt > Date.now()
        && Number(previousPagination.requestedBeforeTimestamp) === beforeTimestamp
        && (previousPagination.status === 'no-validated-bars-in-page' || previousPagination.status === 'plan-lookback-limit'));
      let paginationStatus = sameCachedPage ? String(previousPagination.status) : 'cache-hit';
      let historyExhausted = sameCachedPage && previousPagination.status === 'plan-lookback-limit' && older.length === 0;
      const historyMaxLookbackYears = request.historyMaxLookbackYears ?? null;
      const paginationAvailable = Boolean(request.fetchNseHistory || request.fetchInvestinyHistory || request.fetchFyersRecent);
      const lookbackFloorMs = historyMaxLookbackYears == null ? null : Date.now() - Math.max(1, Number(historyMaxLookbackYears) || 1) * 365.25 * 86_400_000;
      const oldestCachedMs = older[0]?.timestampMs;
      const pageToMs = Math.min(beforeTimestamp - 1, oldestCachedMs == null ? beforeTimestamp - 1 : oldestCachedMs - 1);

      if (older.length < maxBars && paginationAvailable && !sameCachedPage) {
        if (lookbackFloorMs != null && pageToMs < lookbackFloorMs) {
          historyExhausted = older.length === 0;
          paginationStatus = 'plan-lookback-limit';
        } else if (pageToMs > 0) {
          const range = getBoundedHistoryPageRange(mapping, timeframe, Math.min(2_000, maxBars), historyMaxLookbackYears, pageToMs);
          if (range.fromMs < range.toMs) {
            try {
              let pageSource: 'nse' | 'investiny' | 'fyers' = 'fyers';
              let nsePageStatus: Record<string, unknown> | undefined;
              let investinyPageStatus: Record<string, unknown> | undefined;
              if (request.fetchNseHistory) {
                const attempt = await fetchProviderBars('nse', request.fetchNseHistory, mapping, timeframe, range);
                nsePageStatus = attempt.status;
                if (attempt.bars.length) {
                  pageSource = 'nse';
                  pageBars = attempt.bars.filter(bar => bar.timestampMs < beforeTimestamp);
                }
              }
              if (!isFnoInstrument(mapping) && request.fetchInvestinyHistory && pageBars.length < Math.min(2_000, maxBars)) {
                const hadNsePage = pageBars.some(bar => bar.source === 'nse');
                const attempt = await fetchProviderBars('investiny', request.fetchInvestinyHistory, mapping, timeframe, range);
                investinyPageStatus = { ...attempt.status, role: pageBars.length ? 'page-gap-fill' : 'page-fallback' };
                if (attempt.bars.length) {
                  pageBars = mergeStoredBars(pageBars, attempt.bars.filter(bar =>
                    bar.timestampMs < beforeTimestamp &&
                    bar.timestampMs >= range.fromMs &&
                    bar.timestampMs <= range.toMs,
                  ));
                  if (!hadNsePage && pageBars.some(bar => bar.source === 'investiny')) pageSource = 'investiny';
                }
              }
              if (!pageBars.length && request.fetchFyersRecent) {
                const fetched = await request.fetchFyersRecent(mapping, range);
                pageSource = 'fyers';
                pageBars = normalizeRows(fetched.bars || [], 'fyers').filter(bar =>
                  bar.timestampMs < beforeTimestamp &&
                  bar.timestampMs >= range.fromMs &&
                  bar.timestampMs <= range.toMs,
                );
              }
              const mergedOlder = new Map<number, StoredBar>();
              for (const bar of [...older, ...pageBars]) {
                const existing = mergedOlder.get(bar.timestampMs);
                if (!existing || historicalSourcePriority(bar.source) >= historicalSourcePriority(existing.source)) mergedOlder.set(bar.timestampMs, bar);
              }
              older = [...mergedOlder.values()].sort((a, b) => a.timestampMs - b.timestampMs);
              paginationStatus = pageBars.length ? pageSource + '-page-fetched' : 'no-validated-bars-in-page';

              const currentRecord: CacheRecord = cached || {
                instrumentId: cacheInstrumentId,
                timeframe,
                bars: [],
                revision: 0,
                sourcePolicy: HISTORICAL_SOURCE_POLICY,
                sourceStatus: { cache: { status: 'miss' } },
                degraded: false,
                expiresAt: 0,
                updatedAt: 0,
              };
              const allBars = new Map<number, StoredBar>();
              for (const bar of [...currentRecord.bars, ...pageBars]) {
                const existing = allBars.get(bar.timestampMs);
                if (!existing || historicalSourcePriority(bar.source) >= historicalSourcePriority(existing.source)) allBars.set(bar.timestampMs, bar);
              }
              const combined = [...allBars.values()].sort((a, b) => a.timestampMs - b.timestampMs).slice(-HISTORICAL_MAX_BARS);
              const sourceStatus = {
                ...currentRecord.sourceStatus,
                ...(nsePageStatus ? { nse: nsePageStatus } : {}),
                ...(investinyPageStatus ? { investiny: investinyPageStatus } : {}),
                route: { activeSource: pageBars.length ? pageSource : 'none', capability: 'historical-ohlcv', automaticFailback: true },
                autoFixer: {
                  nse: marketDataAutoFixer.snapshot('nse', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
                  investiny: marketDataAutoFixer.snapshot('investiny', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
                  fyers: marketDataAutoFixer.snapshot('fyers', 'history', mapping.instrumentId + ':' + timeframe)[0] || null,
                },
                fyers: {
                  ...(isRecord(currentRecord.sourceStatus.fyers) ? currentRecord.sourceStatus.fyers : {}),
                  paginationStatus,
                  pageValidatedCount: pageBars.length,
                  pageRangeFrom: new Date(range.fromMs).toISOString(),
                  pageRangeTo: new Date(range.toMs).toISOString(),
                },
                pagination: { status: paginationStatus, requestedBeforeTimestamp: beforeTimestamp, pageValidatedCount: pageBars.length },
                historyCompleteness: {
                  status: pageBars.length >= Math.min(2_000, maxBars) ? 'page-target-reached' : 'partial-page',
                  requestedBars: Math.min(2_000, maxBars),
                  returnedBars: Math.min(maxBars, older.length),
                  pageSource,
                  fyersReturnedBars: pageSource === 'fyers' ? pageBars.length : 0,
                  preferredSourceReturnedBars: pageSource === 'fyers' ? 0 : pageBars.length,
                  providerPageLimit: 2_000,
                  paginationSupported: true,
                  datasetComplete: false,
                  hasMoreHistory: true,
                  pageRangeFrom: new Date(range.fromMs).toISOString(),
                  pageRangeTo: new Date(range.toMs).toISOString(),
                  lookbackFloor: range.lookbackFloorMs == null ? null : new Date(range.lookbackFloorMs).toISOString(),
                },
              };
              responseCacheRecord = await this.writeCache({
                ...currentRecord,
                bars: combined,
                revision: currentRecord.revision || 1,
                sourcePolicy: HISTORICAL_SOURCE_POLICY,
                sourceStatus,
                degraded: currentRecord.degraded || pageBars.length === 0,
                expiresAt: Date.now() + CACHE_TTL_MS,
                updatedAt: Date.now(),
              });
            } catch (error) {
              paginationStatus = 'page-fetch-failed';
              if (!older.length) throw error;
            }
          } else {
            historyExhausted = older.length === 0;
            paginationStatus = 'plan-lookback-limit';
          }
        }
      } else if (!paginationAvailable && older.length < maxBars) {
        paginationStatus = 'cache-only-no-history-provider';
      }

      if (lookbackFloorMs != null && beforeTimestamp <= lookbackFloorMs && older.length === 0) historyExhausted = true;
      const page = older.slice(-maxBars);
      const record: CacheRecord = responseCacheRecord || {
        instrumentId: cacheInstrumentId, timeframe, bars: [], revision: 0, sourcePolicy: HISTORICAL_SOURCE_POLICY,
        sourceStatus: { cache: { status: 'miss' } }, degraded: pageBars.length === 0, expiresAt: 0, updatedAt: 0,
      };
      return {
        bars: toPublicBars(page, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays),
        metadata: this.metadata(record, page, {
          cacheHit: Boolean(cached && pageBars.length === 0),
          stale: Boolean(cached && cached.expiresAt <= Date.now()),
          historyExhausted,
          paginationSupported: paginationAvailable,
          historyCompleteness: {
            status: page.length >= maxBars ? 'page-target-reached' : historyExhausted ? 'plan-lookback-exhausted' : pageBars.length ? 'partial-page' : 'cache-partial-or-no-data',
            requestedBars: maxBars,
            returnedBars: page.length,
            fyersReturnedBars: pageBars.length,
            providerPageLimit: 2_000,
            paginationSupported: paginationAvailable,
            datasetComplete: historyExhausted,
            hasMoreHistory: paginationAvailable && !historyExhausted,
            paginationStatus,
            lookbackFloor: lookbackFloorMs == null ? null : new Date(lookbackFloorMs).toISOString(),
          },
          sourceStatus: {
            ...(record.sourceStatus || {}),
            pagination: { status: paginationStatus, requestedBeforeTimestamp: beforeTimestamp, pageValidatedCount: pageBars.length },
          },
        }),
        quote: null,
      };
    }

    if (cached && cached.expiresAt > Date.now() && cached.sourcePolicy === HISTORICAL_SOURCE_POLICY && !cached.bars.length && cached.sourceStatus.noValidatedBars === true) {
      return {
        bars: [],
        metadata: this.metadata(cached, [], { cacheHit: true, degraded: true, stale: false }),
        quote: cached.quote || null,
      };
    }

    if (cached && cached.expiresAt > Date.now() && cached.sourcePolicy === HISTORICAL_SOURCE_POLICY && cached.bars.length) {
      const completeness = isRecord(cached.sourceStatus.historyCompleteness) ? cached.sourceStatus.historyCompleteness : {};
      const cachedReturnedBars = Math.max(0, Number(completeness.returnedBars) || cached.bars.length);
      const datasetComplete = completeness.datasetComplete === true ||
        completeness.status === 'plan-lookback-exhausted' ||
        (isRecord(cached.sourceStatus.pagination) && cached.sourceStatus.pagination.status === 'plan-lookback-limit');
      const providerConfigured = Boolean(request.fetchNseHistory || request.fetchInvestinyHistory || request.fetchFyersRecent);
      // Only actual returned bars can satisfy the requested history depth. A large
      // requestedBars value alone is not proof that the cache contains that many bars.
      if (cached.bars.length >= maxBars || cachedReturnedBars >= maxBars || datasetComplete || !providerConfigured) {
        const bars = cached.bars.slice(-maxBars);
        const staleFallback = Boolean(cached.sourceStatus.staleCacheFallback);
        return {
          bars: toPublicBars(bars, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays),
          metadata: this.metadata(cached, bars, { cacheHit: true, stale: staleFallback, degraded: cached.degraded || staleFallback }),
          quote: null,
        };
      }
    }

    const key = cacheKey(cacheInstrumentId, timeframe);
    let refreshed: CacheRecord;
    try {
      refreshed = await (inflight.get(key) || this.refresh(
        instrumentId,
        timeframe,
        mapping,
        cached,
        request.fetchFyersRecent,
        maxBars,
        request.historyMaxLookbackYears ?? null,
        request.fetchNseHistory,
        request.fetchInvestinyHistory,
      ));
    } catch (error) {
      if (!cached?.bars.length) throw error;
      const now = Date.now();
      refreshed = await this.writeCache({
        ...cached,
        sourcePolicy: HISTORICAL_SOURCE_POLICY,
        expiresAt: now + NEGATIVE_CACHE_TTL_MS,
        updatedAt: now,
        degraded: true,
        quote: null,
        sourceStatus: { ...cached.sourceStatus, staleCacheFallback: true, refreshError: errorText(error), previousSourcePolicy: cached.sourcePolicy },
      });
    }
    const bars = refreshed.bars.slice(-maxBars), stale = refreshed.expiresAt <= Date.now() || Boolean(refreshed.sourceStatus.staleCacheFallback);
    return {
      bars: toPublicBars(bars, timeframe, mapping.timezone, mapping.sessionClose, mapping.calendarHolidays),
      metadata: this.metadata(refreshed, bars, { stale, degraded: refreshed.degraded || stale }),
      quote: refreshed.quote || null,
    };
  }
}
export const historicalDataService = new HistoricalDataService();
