/**
 * The countdown-to-bar-close chip's text for a bar opened at `barOpen` on a `barMs`
 * cadence, as seen at wall-clock `now`; `null` once the bar has closed (the chip
 * disappears until the next bar arrives instead of sitting at `00:00`).
 *
 * The remaining time is rounded UP so the chip agrees with a clock that shows whole
 * seconds: at `hh:mm:54.500` the clock reads `:54`, which implies 6 s to the minute,
 * and the chip reads `00:06` — flooring would read `00:05` for that whole second.
 */
export function countdownText(barOpen: number, barMs: number, now: number): string | null {
    if (!(barMs > 0)) return null;
    const remaining = barOpen + barMs - now;
    if (remaining <= 0) return null;
    return formatCountdown(remaining);
}

/** `MM:SS` (or `H:MM:SS` past an hour) for the ms remaining until the bar closes, rounded up. */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const pad = (v: number): string => String(v).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * FYERS/Indian-exchange countdown policy. Candles are UTC epoch milliseconds,
 * but eligibility is evaluated against the exchange's Asia/Kolkata session clock.
 * The final intraday bar is capped at the regular-session close, even when its
 * nominal timeframe would extend beyond 15:30 IST.
 */
// NSE cash-equity holidays published for calendar year 2026. Keep this
// exchange calendar explicit and versionable; do not infer a trading day from
// weekday alone. Future years should be loaded from the broker/exchange calendar.
const NSE_EQUITY_HOLIDAYS_2026 = new Set([
    '2026-01-15', '2026-01-26', '2026-03-03', '2026-03-26',
    '2026-03-31', '2026-04-03', '2026-04-14', '2026-05-01',
    '2026-05-28', '2026-06-26', '2026-09-14', '2026-10-02',
    '2026-10-20', '2026-11-10', '2026-11-24', '2026-12-25',
]);

export const INDIA_MARKET_SESSION = Object.freeze({
    timeZone: 'Asia/Kolkata',
    openMinute: 9 * 60 + 15,
    closeMinute: 15 * 60 + 30,
    weekdaysOnly: true,
});

type CountdownSessionPolicy = Readonly<{
    timeZone: string;
    openMinute: number;
    closeMinute: number;
    weekdaysOnly?: boolean;
}>;

function zonedClockParts(epochMs: number, timeZone: string): Record<string, string> | null {
    if (!Number.isFinite(epochMs)) return null;
    try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        return Object.fromEntries(formatter.formatToParts(new Date(epochMs))
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value] as const));
    } catch {
        return null;
    }
}

/** Countdown capped to an actual intraday exchange session; returns null outside it. */
export function indiaSessionCountdownText(barOpen: number, barMs: number, now: number): string | null {
    const policy: CountdownSessionPolicy = INDIA_MARKET_SESSION;
    if (!(barMs > 0) || !Number.isFinite(barOpen) || !Number.isFinite(now) || barMs >= 24 * 60 * 60 * 1000) return null;
    const current = zonedClockParts(now, policy.timeZone);
    const bar = zonedClockParts(barOpen, policy.timeZone);
    if (!current || !bar) return null;

    const currentDay = `${current.year}-${current.month}-${current.day}`;
    const barDay = `${bar.year}-${bar.month}-${bar.day}`;
    if (currentDay !== barDay) return null;
    if (policy.weekdaysOnly && ['Sat', 'Sun'].includes(current.weekday ?? '')) return null;
    if (NSE_EQUITY_HOLIDAYS_2026.has(currentDay)) return null;

    const currentMinute = Number(current.hour) * 60 + Number(current.minute);
    const barMinute = Number(bar.hour) * 60 + Number(bar.minute);
    if (!Number.isFinite(currentMinute) || !Number.isFinite(barMinute)) return null;
    if (currentMinute < policy.openMinute || currentMinute >= policy.closeMinute) return null;
    if (barMinute < policy.openMinute || barMinute >= policy.closeMinute || barOpen > now) return null;

    const closeParts = { year: Number(current.year), month: Number(current.month), day: Number(current.day) };
    // India Standard Time is UTC+05:30 year-round. Build the session close in UTC
    // explicitly instead of parsing a local-time string using the browser's zone.
    const sessionCloseMs = Date.UTC(closeParts.year, closeParts.month - 1, closeParts.day, 15, 30) - (5 * 60 + 30) * 60_000;
    const barCloseMs = Math.min(barOpen + barMs, sessionCloseMs);
    const remaining = barCloseMs - now;
    if (remaining <= 0) return null;
    return formatCountdown(remaining);
}
