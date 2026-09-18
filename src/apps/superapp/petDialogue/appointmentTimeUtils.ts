// Strict clinic-device-local date/time construction for the Appointment
// Within 2 Hours dialogue. `public.appointments` stores `date` (a plain
// Postgres `date`) and `start_time` (free-text, confirmed live to always be
// zero-padded 24-hour `HH:mm`, written by the Appointment app's own
// `addMinutes`/slot-generation helpers — see appointment repo
// `src/utils/time.js`) with no timezone column anywhere. Per the approved
// Phase decision, both are interpreted as clinic-device-local wall-clock
// time — never UTC, never `Date.parse`, never a timezone inferred from
// anywhere else.

import { toValidatedDateKey } from './dateUtils';

// `HH:mm` is the only format confirmed live and at the Appointment write
// path; `HH:mm:ss` is additionally accepted since it's a strict superset
// the same regex can validate for free, per the task's explicit allowance.
// No 12-hour AM/PM parsing — not used anywhere in the write path.
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Validates and constructs a clinic-device-local `Date` from a raw
 * `appointments.date` + `appointments.start_time` pair, or returns `null`
 * if either input is missing, malformed, or describes an impossible
 * calendar date/time (e.g. `2026-02-30`, hour `24`). Never throws — every
 * input is type/shape-checked before use, so one malformed appointment row
 * can be skipped by the caller rather than failing the whole evaluation.
 *
 * Deliberately does not use `Date.parse`, `new Date(\`${date}T${time}Z\`)`,
 * or any UTC-based construction: `new Date(year, month - 1, day, hour,
 * minute, second, 0)` is the local-time constructor, and every resulting
 * field is re-read and compared against the input to catch JavaScript's
 * silent rollover (e.g. hour 24 would otherwise roll into the next day).
 */
export function buildClinicDeviceLocalAppointmentStart(date: unknown, startTime: unknown): Date | null {
  if (typeof date !== 'string' || typeof startTime !== 'string') return null;

  const validatedDateKey = toValidatedDateKey(date);
  if (!validatedDateKey) return null;

  const match = TIME_PATTERN.exec(startTime.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(second) || second < 0 || second > 59) return null;

  const [year, month, day] = validatedDateKey.split('-').map(Number);
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

/** Zero-padded `HH:mm:ss` derived from an already-validated local `Date` —
 *  used only to build a canonical dedupe-key component, so `HH:mm` and
 *  `HH:mm:ss` source rows that describe the same instant produce the same
 *  key. Never used for display (see the `Intl.DateTimeFormat` call at the
 *  candidate-building call site for that). */
export function toCanonicalLocalStartTime(start: Date): string {
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  const ss = String(start.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
