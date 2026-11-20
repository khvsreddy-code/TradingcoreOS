import assert from 'node:assert/strict';
import { getChartSessionCalendar, setChartSessionCalendar } from './sessionCalendarStore.ts';

setChartSessionCalendar('NSE:NIFTY50-INDEX', {
  exchange: 'NSE',
  timezone: 'Asia/Kolkata',
  sessionOpen: '09:15',
  sessionClose: '15:30',
  calendarHolidays: ['2026-11-18', 'invalid-date', '2026-11-18'],
  calendarComplete: true,
  specialSessions: [
    { date: '2026-11-21', openMinute: 555, closeMinute: 750 },
    { date: 'bad-date', openMinute: 555, closeMinute: 750 },
    { date: '2026-11-22', openMinute: 750, closeMinute: 555 },
  ],
});
const nse = getChartSessionCalendar('nse:nifty50-index');
assert.ok(nse, 'configured chart calendar is available through a case-insensitive instrument key');
assert.equal(nse.exchange, 'NSE');
assert.equal(nse.timezone, 'Asia/Kolkata');
assert.equal(nse.sessionOpenMinute, 555);
assert.equal(nse.sessionCloseMinute, 930);
assert.deepEqual(nse.calendarHolidays, ['2026-11-18']);
assert.equal(nse.calendarComplete, true);
assert.deepEqual(nse.specialSessions, [{ date: '2026-11-21', openMinute: 555, closeMinute: 750 }]);

setChartSessionCalendar('BSE:SENSEX-INDEX', {
  exchange: 'BSE',
  sessionOpen: '09:15',
  sessionClose: '15:30',
});
const bse = getChartSessionCalendar('BSE:SENSEX-INDEX');
assert.equal(bse?.exchange, 'BSE');
assert.deepEqual(bse?.calendarHolidays, []);
assert.deepEqual(bse?.specialSessions, []);
assert.equal(getChartSessionCalendar('NSE:UNKNOWN'), undefined);
setChartSessionCalendar('', { exchange: 'NSE' });
assert.equal(getChartSessionCalendar(''), undefined);

console.log('CHART_SESSION_CALENDAR_STORE_OK');
