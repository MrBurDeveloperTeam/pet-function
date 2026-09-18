// Dialogue-layer-only pool construction for Appointments' Cat Reminder —
// sits alongside selectDialogueCandidate.ts. Deliberately separate from
// aiExperience/resolver/resolveAppointmentInsight.ts (the inline
// PersonalizedInsight banner's resolver), which stays completely untouched
// in behavior and keeps returning exactly one pure business winner.
//
// Confirmed starvation defect this fixes: resolveAppointmentInsight.ts
// reduces Appointment Soon (the one MULTI_RECORD_FAMILY here) to ONE
// winner before Cat's dismissal check ever runs. If that winner gets
// Cat-dismissed but is still within its business eligibility window, the
// next Cat activation resolves the exact same winner again, Cat suppresses
// it again, and a second still-eligible soon appointment is never reached
// — Cat incorrectly falls through to Welcome Back even though e.g. a
// second appointment starting in 90 minutes exists.
//
// Fix: build one ORDERED pool for Appointment Soon (reusing the provider's
// own existing eligibility/sort/candidate-construction verbatim — see
// evaluateAppointmentSoonCandidates), then append the two aggregate
// singletons (Daily Summary, None Today) last, in that same priority
// order resolveAppointmentInsight.ts already uses, each as a single
// fallback entry — neither is exploded into per-record candidates or
// given any new per-record logic, per the audit's own classification.
// selectFirstEligibleDialogueCandidate (selectDialogueCandidate.ts) then
// does one linear scan for the first not-seen/not-dismissed entry —
// equivalent to "first eligible candidate within Appointment Soon, else
// move to Daily Summary, else None Today" purely because the pool is
// concatenated in priority order and the scan is a single left-to-right
// pass.
//
// TIME CONSISTENCY (critical): this function takes the SAME `now` the
// caller already captured for resolveAppointmentInsight.ts's own call in
// the same evaluation cycle — see
// useAppointmentPersonalizedInsight.ts, which captures exactly one
// `new Date()` per useMemo run and passes it to both. This file never
// calls `new Date()` itself, so the Appointment Soon pool can never
// disagree with the inline resolver's own Appointment Soon evaluation
// about which side of the 2-hour-window/minute boundary "now" falls on.
//
// Building this pool is pure/synchronous (same already-projected
// soon/daily/rooms inputs the inline banner uses) — no new Supabase
// query, no browser storage read. Only selectFirstEligibleDialogueCandidate
// (called separately, by the caller, once a userId is known) touches
// sessionStorage/localStorage — this file never does.

import { evaluateAppointmentSoonCandidates, type AppointmentLike } from '../providers/appointmentSoonProvider';
import { evaluateAppointmentDailySummary } from '../providers/appointmentDailySummaryProvider';
import { evaluateNoAppointmentsToday } from '../providers/noAppointmentsTodayProvider';
import type { DailyAppointmentLike, RoomLike } from '../utils/appointmentDailyProjection';
import type { DateRangeLike } from '../utils/appointmentCoverage';
import type { InsightCandidate } from '../contracts/insightCandidate';

/**
 * Ordered pool of every candidate Cat may legitimately choose from, in
 * exact resolveAppointmentInsight.ts family priority order: Appointment
 * Soon > Daily Summary > None Today. `pool[0]` (when no suppression is
 * applied) is always identical to
 * `resolveAppointmentInsight(soonAppointments, dailyAppointments, rooms, dateRange, now)`
 * — same eligibility, same tie-breaks, same candidate construction, just
 * not yet collapsed to one winner.
 *
 * Daily Summary / None Today are appended unconditionally (each gated only
 * by their own existing eligibility — including their shared
 * `isTodayCoveredByDateRange` guard — not by the Appointment Soon pool
 * being empty) so they remain reachable as Cat's fallback even when soon
 * appointments exist but every one of them is already Cat-suppressed.
 * Since None Today's own guard already requires a zero same-day count, it
 * can only ever be non-null when Daily Summary (whose own guard requires a
 * non-zero count) is also null — so appending both unconditionally never
 * produces two simultaneously "eligible" aggregate entries in practice,
 * and never changes either provider's own eligibility decision.
 */
export function buildAppointmentDialoguePool(
  soonAppointments: AppointmentLike[],
  dailyAppointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  dateRange: DateRangeLike | null | undefined,
  now: Date
): InsightCandidate<unknown>[] {
  const pool: InsightCandidate<unknown>[] = [...evaluateAppointmentSoonCandidates(soonAppointments, now)];

  const dailySummary = evaluateAppointmentDailySummary(dailyAppointments, rooms, dateRange, now);
  if (dailySummary) pool.push(dailySummary);

  const noneToday = evaluateNoAppointmentsToday(dailyAppointments, dateRange, now);
  if (noneToday) pool.push(noneToday);

  return pool;
}
