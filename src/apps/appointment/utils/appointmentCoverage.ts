// Determines whether the currently-loaded `appointments` fetch window
// actually covers local "today". This reads App.jsx's own `dateRange`
// state — the exact same `{ start, end }` object useDataStore.js passes to
// `DataStore.getAppointments(activeClinicId, dateRange.start, dateRange.end)`
// (see src/hooks/useDataStore.js) — rather than independently
// recomputing a window from `currentDate`. That keeps this rule correct
// even if the fetch window's size (currently: previous-month start
// through next-month end, see App.jsx's dateRange effect) changes later,
// since it always asks the real source of truth instead of a second,
// potentially-drifting guess.
//
// Required because "0 appointment rows for today" is only a meaningful
// claim if today's date was actually inside the fetched range. If the
// user has navigated the calendar far away, `appointments` simply won't
// contain today's rows at all — treating that as "no appointments today"
// would be a false claim. See appointmentDailySummaryProvider.ts /
// noAppointmentsTodayProvider.ts, both of which gate on this before
// evaluating anything.
//
// CALENDAR-DATE inclusion, not clock-instant comparison: `dateRange.start`
// / `dateRange.end` are `Date#toISOString()` output (see App.jsx's
// dateRange effect: `startOfMonth(...).toISOString()` /
// `endOfMonth(...).toISOString()`) — i.e. absolute instants, not bare
// date strings. Comparing `now.getTime()` directly against
// `Date.parse(dateRange.end)` (that instant's own midnight) was WRONG:
// during the daytime on the last day of the range, "now" (mid-day) would
// already be past that midnight instant, incorrectly reporting the range
// as not covering that entire day. The actual question is "is today's
// LOCAL CALENDAR DATE within [startDate, endDate] inclusive", not "is
// this exact millisecond within [startInstant, endInstant]" — appointment
// TIME rules (Appointment Soon, Room In Use) are clock-instant rules;
// loaded-DATA coverage is a calendar-date-range rule, and the two must
// stay separate. Each ISO instant is converted back to a `Date` and read
// through `getLocalDateKey` (local `getFullYear`/`getMonth`/`getDate` —
// never a UTC string slice) to recover the exact local calendar date that
// instant was originally constructed from, then compared as
// `YYYY-MM-DD` string keys (safe to compare lexicographically since
// zero-padded).

import { getLocalDateKey } from './appointmentTime';

export interface DateRangeLike {
  start?: unknown;
  end?: unknown;
}

export function isTodayCoveredByDateRange(
  dateRange: DateRangeLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dateRange) return false;
  const { start, end } = dateRange;
  if (typeof start !== 'string' || typeof end !== 'string') return false;

  const startInstant = new Date(start);
  const endInstant = new Date(end);
  if (Number.isNaN(startInstant.getTime()) || Number.isNaN(endInstant.getTime())) return false;

  const startKey = getLocalDateKey(startInstant);
  const endKey = getLocalDateKey(endInstant);
  const todayKey = getLocalDateKey(now);

  return startKey <= todayKey && todayKey <= endKey;
}
