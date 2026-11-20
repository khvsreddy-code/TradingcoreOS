export type ChartSpecialSession = Readonly<{
  date: string;
  openMinute: number;
  closeMinute: number;
}>;

export type ChartSessionCalendar = Readonly<{
  exchange: string;
  timezone: string;
  sessionOpenMinute: number;
  sessionCloseMinute: number;
  calendarHolidays: readonly string[];
  calendarComplete: boolean;
  specialSessions: readonly ChartSpecialSession[];
  observedAt: number;
}>;

const calendars = new Map<string, ChartSessionCalendar>();
const MAX_SESSION_CALENDARS = 128;
const SESSION_CALENDAR_TTL_MS = 60 * 60_000;

function minuteOfDay(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1440) return value;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return fallback;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return Number.isInteger(minute) && minute >= 0 && minute <= 1440 ? minute : fallback;
}

/** Store server-resolved exchange session metadata beside the chart's canonical history. */
export function setChartSessionCalendar(symbol: string, raw: unknown): void {
  const key = String(symbol || '').trim().toUpperCase();
  if (!key || !raw || typeof raw !== 'object') return;
  const value = raw as Record<string, unknown>;
  const sessionOpenMinute = minuteOfDay(value.sessionOpen ?? value.openMinute, 9 * 60 + 15);
  const sessionCloseMinute = minuteOfDay(value.sessionClose ?? value.closeMinute, 15 * 60 + 30);
  if (sessionCloseMinute <= sessionOpenMinute) return;

  const calendarHolidays = Array.isArray(value.calendarHolidays)
    ? [...new Set(value.calendarHolidays.map(String).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    : [];
  const specialSessions: ChartSpecialSession[] = Array.isArray(value.specialSessions)
    ? value.specialSessions.flatMap(entry => {
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        const date = String(item.date || '');
        const openMinute = minuteOfDay(item.openMinute ?? item.open_minute, -1);
        const closeMinute = minuteOfDay(item.closeMinute ?? item.close_minute, -1);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || openMinute < 0 || closeMinute <= openMinute) return [];
        return [{ date, openMinute, closeMinute }];
      })
    : [];

  calendars.delete(key);
  calendars.set(key, {
    exchange: String(value.exchange || key.split(':')[0] || 'UNKNOWN').toUpperCase(),
    timezone: String(value.timezone || 'Asia/Kolkata'),
    sessionOpenMinute,
    sessionCloseMinute,
    calendarHolidays,
    calendarComplete: value.calendarComplete === true,
    specialSessions,
    observedAt: Date.now(),
  });
  while (calendars.size > MAX_SESSION_CALENDARS) {
    const oldest = calendars.keys().next().value;
    if (oldest === undefined) break;
    calendars.delete(oldest);
  }
}

export function getChartSessionCalendar(symbol: string): ChartSessionCalendar | undefined {
  const key = String(symbol || '').trim().toUpperCase();
  const value = calendars.get(key);
  if (!value) return undefined;
  if (Date.now() - value.observedAt > SESSION_CALENDAR_TTL_MS) {
    calendars.delete(key);
    return undefined;
  }
  calendars.delete(key);
  calendars.set(key, value);
  return value;
}
