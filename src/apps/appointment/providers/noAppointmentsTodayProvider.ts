// Pure evaluator for the "nothing scheduled today" state. Reuses the same
// shared today-state computation as appointmentDailySummaryProvider.ts
// (../utils/appointmentDailyState.ts) so the eligible-count rule can
// never independently drift between the two providers.
//
// Gated on `isTodayCoveredByDateRange` exactly like Daily Summary: an
// uncovered fetch window means today's count is UNKNOWN, not zero — this
// must return `null`, never a false "no appointments" claim. See
// ../utils/appointmentCoverage.ts.

import { computeAppointmentDailyState } from '../utils/appointmentDailyState';
import { isTodayCoveredByDateRange, type DateRangeLike } from '../utils/appointmentCoverage';
import type { DailyAppointmentLike } from '../utils/appointmentDailyProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface NoAppointmentsTodayFacts {
  date: string;
  count: 0;
}

const MESSAGE = 'You have no appointments scheduled for today.';

export function evaluateNoAppointmentsToday(
  dailyAppointments: DailyAppointmentLike[],
  dateRange: DateRangeLike | null | undefined,
  now: Date = new Date()
): InsightCandidate<NoAppointmentsTodayFacts> | null {
  if (!isTodayCoveredByDateRange(dateRange, now)) return null;

  // Rooms are irrelevant to a zero-count result (no eligible appointments
  // means no room can be occupied either), so an empty rooms list is
  // passed — occupancy is simply never computed in that branch.
  const state = computeAppointmentDailyState(dailyAppointments, [], now);
  if (state.count !== 0) return null; // handled instead by appointmentDailySummaryProvider.ts

  const facts: NoAppointmentsTodayFacts = { date: state.date, count: 0 };

  return {
    app: 'appointments',
    triggerId: 'appointment_none_today',
    priority: 'INFO',
    facts,
    messageTemplate: MESSAGE,
    message: MESSAGE,
    // No action: the user is already on the calendar surface, and no
    // "create appointment" flow is part of this approved feature scope.
    dedupeKey: `appointment_none_today:${state.date}`,
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
