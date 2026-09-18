// Strict clinic-device-local date/time construction for Appointment Within
// 2 Hours. Mirrors the Gallery reference's own
// features/petDialogue/appointmentTimeUtils.ts approach — reimplemented
// here rather than imported (separate repo, no shared package — see the
// Phase-2A design pass's Option C recommendation), since this repo's own
// `appointments` table has the exact same shape: a plain `date` column and
// a free-text `start_time` column (confirmed live/zero-padded 24-hour
// `HH:mm`, mapped to `startTime` in datastore.supabase.appointments.js),
// with no timezone column anywhere. Both are interpreted as clinic-device-
// local wall-clock time — never UTC, never `Date.parse`, never a timezone
// inferred from anywhere else. This avoids the exact class of bug the
// Inventory repo's own pre-existing `isExpired` code had (parsing a bare
// date string with `new Date(dateString)`, which JavaScript interprets as
// UTC midnight) — see that repo's aiExperience/utils/dateUtils.ts for the
// full explanation of why that pattern is unsafe.

const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Normalizes and calendar-validates a raw `YYYY-MM-DD`-ish date string down
 * to [year, month, day], or `null` if it isn't a real calendar date.
 */
function parseDateParts(rawDate: unknown): [number, number, number] | null {
  if (typeof rawDate !== 'string') return null;
  const key = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return [y, m, d];
}

/**
 * Validates and constructs a clinic-device-local `Date` from a raw
 * `appointments.date` + `appointments.startTime` pair, or returns `null` if
 * either input is missing, malformed, or describes an impossible calendar
 * date/time. Never throws. Deliberately does not use `Date.parse` or any
 * UTC-based construction: `new Date(year, month - 1, day, hour, minute,
 * second, 0)` is the local-time constructor, and every resulting field is
 * re-read and compared against the input to catch JavaScript's silent
 * rollover (e.g. hour 24 would otherwise roll into the next day).
 */
/**
 * Local (never UTC-shifted) `YYYY-MM-DD` calendar key for a `Date` —
 * mirrors App.jsx's own existing `getLocalDateString` helper exactly
 * (manual `getFullYear`/`getMonth`/`getDate` reads, never
 * `toISOString().slice(0, 10)`, which shifts to UTC and can land on the
 * wrong calendar day near midnight in timezones ahead of UTC).
 */
export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes a raw `appointments.date` value down to its `YYYY-MM-DD`
 * calendar key (matching `getLocalDateKey`'s format) for same-day
 * comparison, or `null` if it isn't a real calendar date. Deliberately
 * string-slice-based (never `new Date(rawDate)`), since a bare
 * `YYYY-MM-DD` string parses as UTC midnight in JavaScript and can
 * disagree with local "today" near midnight — the same class of bug
 * documented above for `buildClinicDeviceLocalAppointmentStart`.
 */
export function normalizeDateKey(rawDate: unknown): string | null {
  const parts = parseDateParts(rawDate);
  if (!parts) return null;
  const [year, month, day] = parts;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildClinicDeviceLocalAppointmentStart(date: unknown, startTime: unknown): Date | null {
  const dateParts = parseDateParts(date);
  if (!dateParts) return null;
  if (typeof startTime !== 'string') return null;

  const match = TIME_PATTERN.exec(startTime.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(second) || second < 0 || second > 59) return null;

  const [year, month, day] = dateParts;
  const start = new Date(year, month - 1, day, hour, minute, second, 0);

  const rolledOver =
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day ||
    start.getHours() !== hour ||
    start.getMinutes() !== minute ||
    start.getSeconds() !== second;
  if (rolledOver) return null;

  return start;
}
