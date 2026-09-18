// Aggregate "today at a glance" candidate — Today Appointment Count and
// Room In Use are internal facts composed into this ONE candidate, never
// separate competing landing banners (see the contract's
// InsightTriggerId doc). Pure evaluator over already-projected,
// already-minimized inputs (../utils/appointmentDailyProjection.ts) —
// same "no new Supabase query" rule as appointmentSoonProvider.ts.
//
// Gated on `isTodayCoveredByDateRange`: if the currently-loaded
// `appointments` fetch window doesn't include today, this returns `null`
// rather than fabricating a count from data that was never loaded — see
// ../utils/appointmentCoverage.ts.
//
// STRICT PRIVACY: facts contain only date/count/room-occupancy numbers —
// no appointment id, no patient data, no staff/dentist/treatment
// identity. Room identity (id/name only) is the one piece of
// non-appointment operational data included, since Room In Use is
// meaningless without it.

import { computeAppointmentDailyState } from '../utils/appointmentDailyState';
import { isTodayCoveredByDateRange, type DateRangeLike } from '../utils/appointmentCoverage';
import type { DailyAppointmentLike, RoomLike } from '../utils/appointmentDailyProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface AppointmentDailySummaryFacts {
  date: string;
  appointmentCount: number;
  occupiedRoomCount: number;
  /** Present only when exactly one room is currently occupied AND its
   *  real display name was resolvable from the loaded rooms projection —
   *  never a fabricated placeholder. Omitted (not `undefined`-valued)
   *  when zero/multiple rooms are occupied, OR when exactly one is
   *  occupied but its room row is missing (see buildMessage below for
   *  that case's wording, which falls back to a count-only sentence). */
  occupiedRoomName?: string;
}

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** `singleKnownRoomName` is only meaningful when `occupiedRoomCount === 1`
 *  — `null` there means that one room's name couldn't be resolved (room
 *  row missing from the loaded projection), which still produces a
 *  truthful count-only sentence rather than a fabricated name. */
function buildMessage(count: number, occupiedRoomCount: number, singleKnownRoomName: string | null): string {
  const base = `You have ${pluralize(count, 'appointment')} today.`;
  if (occupiedRoomCount === 0) return base;
  if (occupiedRoomCount === 1) {
    return singleKnownRoomName
      ? `${base} ${singleKnownRoomName} is currently in use.`
      : `${base} 1 room is currently in use.`;
  }
  return `${base} ${pluralize(occupiedRoomCount, 'room')} are currently in use.`;
}

export function evaluateAppointmentDailySummary(
  dailyAppointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  dateRange: DateRangeLike | null | undefined,
  now: Date = new Date()
): InsightCandidate<AppointmentDailySummaryFacts> | null {
  if (!isTodayCoveredByDateRange(dateRange, now)) return null;

  const state = computeAppointmentDailyState(dailyAppointments, rooms, now);
  if (state.count === 0) return null; // handled instead by noAppointmentsTodayProvider.ts

  const occupiedRoomCount = state.occupiedRooms.length;
  const singleKnownRoomName = occupiedRoomCount === 1 ? state.occupiedRooms[0].roomName : null;

  const facts: AppointmentDailySummaryFacts = {
    date: state.date,
    appointmentCount: state.count,
    occupiedRoomCount,
    ...(singleKnownRoomName ? { occupiedRoomName: singleKnownRoomName } : {}),
  };

  return {
    app: 'appointments',
    triggerId: 'appointment_daily_summary',
    priority: 'MEDIUM',
    facts,
    messageTemplate: 'You have {appointmentCount} appointments today.',
    message: buildMessage(state.count, occupiedRoomCount, singleKnownRoomName),
    // No action: the user is already on the calendar surface this
    // candidate renders on — nothing further to navigate to.
    dedupeKey: `appointment_daily_summary:${state.date}`,
    // No single backing record — this is an aggregate over today's
    // appointments, matching the contract's nullable sourceRecordId.
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
