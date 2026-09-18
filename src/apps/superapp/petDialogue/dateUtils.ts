// Centralized date handling for Phase 1A. The Inventory `expiry_date` column
// is a plain Postgres `date` (no time-of-day, no timezone), so comparisons
// here are calendar-date-only by design — not a substitute for real
// timestamp/timezone handling, which is explicitly out of scope until
// appointment/task triggers (P1/P2) are implemented.

export function toCalendarDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a YYYY-MM-DD key into calendar-validated [year, month, day], or
 * `null` if the string isn't shaped like a date OR doesn't correspond to a
 * real calendar day (e.g. "2024-02-30", "2024-13-01"). The JS `Date`
 * constructor silently rolls invalid day/month values over into a
 * different, technically-valid date instead of rejecting them (`new
 * Date(2024, 1, 30)` becomes March 1) — re-reading the constructed date's
 * fields and comparing them against the input is what actually catches
 * that roll-over, so a malformed database value can never silently
 * masquerade as a real, comparable date and produce a P0/P1 candidate.
 */
function parseDateKeyParts(dateKey: string): [number, number, number] | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return [y, m, d];
}

/** Normalizes and calendar-validates a raw date-ish value (e.g. a
 *  possibly-timestamp `expiry_date`/`date` column) down to a trustworthy
 *  YYYY-MM-DD key, or `null` if it isn't a real calendar date. Guards on
 *  `typeof !== 'string'` rather than mere truthiness: a non-string,
 *  non-falsy runtime value (defensive against a malformed row from a
 *  loosely-typed Supabase response) would otherwise reach `.slice()` and
 *  throw, which is never acceptable for a value this function's callers
 *  treat as "just reject it and skip this one row." */
export function toValidatedDateKey(rawDate: string | null | undefined): string | null {
  if (typeof rawDate !== 'string') return null;
  const normalized = rawDate.slice(0, 10);
  return parseDateKeyParts(normalized) ? normalized : null;
}

/**
 * True only when `expiryDate` is strictly before today's calendar date. An
 * item expiring today is not yet treated as expired. Compares normalized,
 * calendar-validated YYYY-MM-DD keys, never locale-formatted strings — a
 * malformed or impossible date (e.g. "2024-02-30") is never treated as
 * expired, it's rejected outright.
 */
export function isExpiredBeforeToday(expiryDate: string | null | undefined, now: Date = new Date()): boolean {
  const validated = toValidatedDateKey(expiryDate);
  if (!validated) return false;
  return validated < toCalendarDateKey(now);
}

/**
 * Adds `days` calendar days to a YYYY-MM-DD key, staying entirely in local
 * calendar-field arithmetic (parse → local Date at midnight → `setDate` →
 * re-read local fields) so month/year rollovers are handled correctly
 * without ever round-tripping through a UTC-interpreted ISO string.
 */
export function addCalendarDaysToDateKey(dateKey: string, days: number): string {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return dateKey;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toCalendarDateKey(date);
}

/**
 * Deterministic integer calendar-day difference between two YYYY-MM-DD keys
 * (toDateKey - fromDateKey). Uses Date.UTC on the parsed y/m/d components
 * purely as a day-counting mechanism — never converts either key back to a
 * local wall-clock time — so it's immune to daylight-saving shifts.
 */
export function daysBetweenDateKeys(fromDateKey: string, toDateKey: string): number {
  const from = parseDateKeyParts(fromDateKey);
  const to = parseDateKeyParts(toDateKey);
  if (!from || !to) return 0;
  const fromUtcMs = Date.UTC(from[0], from[1] - 1, from[2]);
  const toUtcMs = Date.UTC(to[0], to[1] - 1, to[2]);
  return Math.round((toUtcMs - fromUtcMs) / 86_400_000);
}

/**
 * True when `dateKey` falls within [startKey, endKey] inclusive. Pure
 * string comparison of normalized, calendar-validated YYYY-MM-DD keys —
 * never locale-formatted, never Date.parse. A malformed or impossible date
 * is rejected outright rather than being compared lexicographically (which
 * could otherwise place e.g. "2024-02-30" inside a window it doesn't really
 * belong in).
 */
export function isWithinInclusiveDateWindow(
  dateKey: string | null | undefined,
  startKey: string,
  endKey: string
): boolean {
  const validated = toValidatedDateKey(dateKey);
  if (!validated) return false;
  return validated >= startKey && validated <= endKey;
}
