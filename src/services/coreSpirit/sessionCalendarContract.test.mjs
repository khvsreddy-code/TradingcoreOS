import assert from 'node:assert/strict';
import { resolveSession } from './session.ts';
import { sessionWindowForDate } from './sessionCalendar.ts';
import { createCoreSpiritExecutionFrame } from './executionContext.ts';

const phase = (iso, timezone, calendar) =>
  resolveSession(Date.parse(iso), timezone, calendar).phase;

// NSE: 09:14 IST pre-market; 09:15 open; 15:30 is the close boundary.
assert.equal(phase('2026-10-30T03:44:00.000Z', 'Asia/Kolkata'), 'pre');
assert.equal(phase('2026-10-30T03:45:00.000Z', 'Asia/Kolkata'), 'open');
assert.equal(phase('2026-10-30T10:00:00.000Z', 'Asia/Kolkata'), 'post');
assert.equal(phase('2026-10-31T04:00:00.000Z', 'Asia/Kolkata'), 'closed',
  'weekends must be reported as closed');

// US equities: 09:30-16:00 America/New_York; Intl applies daylight-saving offsets.
assert.equal(phase('2026-11-02T14:30:00.000Z', 'America/New_York'), 'open');
assert.equal(phase('2026-11-02T21:00:00.000Z', 'America/New_York'), 'post');
assert.equal(phase('2026-07-06T13:30:00.000Z', 'America/New_York'), 'open');

// Host-supplied exchange holiday and exceptional Sunday session.
const customCalendar = {
  id: 'NSE_TEST', timezone: 'Asia/Kolkata', openMinute: 600, closeMinute: 900,
  holidayDates: ['2026-11-02'],
  specialSessions: [{ date: '2026-11-01', openMinute: 1080, closeMinute: 1140 }],
};
assert.equal(sessionWindowForDate(customCalendar, '2026-11-02'), null,
  'an exchange holiday must have no regular session');
assert.deepEqual(sessionWindowForDate(customCalendar, '2026-11-01'),
  { openMinute: 1080, closeMinute: 1140 },
  'an explicit exceptional session must override weekend closure');
assert.equal(phase('2026-11-02T04:30:00.000Z', 'Asia/Kolkata', customCalendar), 'closed');
assert.equal(phase('2026-11-01T13:00:00.000Z', 'Asia/Kolkata', customCalendar), 'open');
assert.equal(phase('2026-11-01T13:30:00.000Z', 'Asia/Kolkata', customCalendar), 'post');

const frame = createCoreSpiritExecutionFrame({
  timestamp: Date.parse('2026-11-01T13:00:00.000Z'),
  barIndex: 0, symbol: 'NIFTY', timeframe: '5m', timezone: 'Asia/Kolkata',
  mode: 'historical', isRealtime: false, isConfirmed: true, isNewBar: true,
  revision: 0, isFirst: true, isLast: true, sessionCalendar: customCalendar,
});
assert.equal(frame.session.phase, 'open',
  'the exchange calendar must flow through the execution-frame boundary');
assert.equal(frame.session.isOpen, true);
assert.equal(resolveSession(Number.NaN).phase, 'closed',
  'invalid timestamps must fail closed');
assert.equal(resolveSession(Date.parse('2026-11-02T14:30:00.000Z'), 'Europe/London').phase, 'closed',
  'unknown venues must fail closed until an exchange calendar is supplied');
console.log('CORESPIRIT_SESSION_CALENDAR_OK');
