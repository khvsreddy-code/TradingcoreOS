export const CORE_SPIRIT_SESSION_CALENDAR_VERSION = 2 as const;

export type CoreSpiritSessionWindow = Readonly<{
  id: string;
  timezone: string;
  openMinute: number;
  closeMinute: number;
  phases?: ReadonlyArray<{ id: string; startMinute: number; endMinute: number }>;
  holidayDates?: ReadonlyArray<string>;
  specialSessions?: ReadonlyArray<{ date: string; openMinute: number; closeMinute: number }>;
}>;

export const CORE_SPIRIT_SESSION_CALENDARS: Readonly<Record<string, CoreSpiritSessionWindow>> = Object.freeze({
  NSE_EQUITIES: Object.freeze({
    id: 'NSE_EQUITIES', timezone: 'Asia/Kolkata',
    openMinute: 9 * 60 + 15, closeMinute: 15 * 60 + 30,
  }),
  US_EQUITIES: Object.freeze({
    id: 'US_EQUITIES', timezone: 'America/New_York',
    openMinute: 9 * 60 + 30, closeMinute: 16 * 60,
  }),
});

export function resolveSessionCalendar(calendarId = 'NSE_EQUITIES'): CoreSpiritSessionWindow {
  return CORE_SPIRIT_SESSION_CALENDARS[calendarId] ?? CORE_SPIRIT_SESSION_CALENDARS.NSE_EQUITIES!;
}

/** Resolve built-in exchange sessions; other venues must supply their own calendar. */
export function resolveSessionCalendarForTimezone(timezone = 'Asia/Kolkata'): CoreSpiritSessionWindow | undefined {
  const normalized = String(timezone ?? '').trim().toLowerCase();
  if (normalized === 'america/new_york' || normalized === 'us/eastern' || normalized === 'est5edt') {
    return resolveSessionCalendar('US_EQUITIES');
  }
  if (normalized === 'asia/kolkata' || normalized === 'ist') {
    return resolveSessionCalendar('NSE_EQUITIES');
  }
  return undefined;
}

function isValidIsoDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
}

function isValidWindow(openMinute: number, closeMinute: number): boolean {
  return Number.isInteger(openMinute) && Number.isInteger(closeMinute) &&
    openMinute >= 0 && openMinute < 1440 && closeMinute > openMinute && closeMinute <= 1440;
}

export function isSessionTradingDay(calendar: CoreSpiritSessionWindow, isoDate: string): boolean {
  if (!isValidIsoDate(isoDate)) return false;
  const day = new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6 && !calendar.holidayDates?.includes(isoDate);
}

/**
 * Special sessions are checked before weekday/holiday closure so a valid
 * exchange-authorized exception can open a weekend or otherwise-closed date.
 */
export function sessionWindowForDate(
  calendar: CoreSpiritSessionWindow,
  isoDate: string,
): { openMinute: number; closeMinute: number } | null {
  if (!isValidIsoDate(isoDate)) return null;
  const special = calendar.specialSessions?.find(item => item.date === isoDate);
  if (special) {
    return isValidWindow(special.openMinute, special.closeMinute)
      ? { openMinute: special.openMinute, closeMinute: special.closeMinute }
      : null;
  }
  if (!isSessionTradingDay(calendar, isoDate) ||
      !isValidWindow(calendar.openMinute, calendar.closeMinute)) return null;
  return { openMinute: calendar.openMinute, closeMinute: calendar.closeMinute };
}
