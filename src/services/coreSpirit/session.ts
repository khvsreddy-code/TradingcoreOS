import type { CoreSpiritSessionState } from './types';
import {
  resolveSessionCalendarForTimezone,
  sessionWindowForDate,
  type CoreSpiritSessionWindow,
} from './sessionCalendar';

/**
 * Resolve a market phase using exchange-local time and an exchange calendar.
 * NSE and US equities defaults are available; other venues must pass an
 * explicit calendar rather than inheriting another exchange's hours.
 */
export function resolveSession(
  timestamp: number,
  timezone = 'Asia/Kolkata',
  calendar?: CoreSpiritSessionWindow,
): CoreSpiritSessionState {
  const invalid = (zone: string): CoreSpiritSessionState => ({
    id: `invalid:${zone}`, marketDate: '', isOpen: false, phase: 'closed',
  });
  if (!Number.isFinite(timestamp)) return invalid(timezone);

  const selectedCalendar = calendar ?? resolveSessionCalendarForTimezone(timezone);
  const marketTimezone = calendar?.timezone || selectedCalendar?.timezone || timezone;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return invalid(marketTimezone);

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: marketTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value || '';
    const marketDate = `${get('year')}-${get('month')}-${get('day')}`;
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    // No inferred hours for an unsupported exchange; the session is closed
    // until its real market calendar is provided by the host.
    const window = selectedCalendar ? sessionWindowForDate(selectedCalendar, marketDate) : null;
    const phase: CoreSpiritSessionState['phase'] = !window
      ? 'closed'
      : minutes < window.openMinute
        ? 'pre'
        : minutes < window.closeMinute
          ? 'open'
          : 'post';
    return {
      id: `${marketDate}:${marketTimezone}`,
      marketDate, isOpen: phase === 'open', phase,
    };
  } catch {
    return invalid(marketTimezone);
  }
}
